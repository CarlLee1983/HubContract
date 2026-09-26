import { randomUUID } from "node:crypto";

/**
 * Issue #13（第三輪 code review 決議）：遮罩腳本的「解析」交給真正的 MariaDB，
 * 不再自己寫 SQL parser——起一個拋棄式容器，把快照載進去，在資料庫裡面遮罩，
 * 再用 `mysqldump` 匯出。這個檔案只負責容器生命週期：啟動、等待健康、跑完
 * （不管成功或失敗）一定清掉，不會留下孤兒容器。
 *
 * image/tag 跟 `docker-compose.yml` 的 `mariadb` service 釘死同一版本，容器
 * 名稱與連接埠都跟錄製環境分開，兩者可以同時存在、互不影響。
 */
const MARIADB_IMAGE = "mariadb:10.11.6";
const ROOT_PASSWORD = "mask_disposable_pass";
const DATABASE = "mask_scratch";

export interface DisposableMariaDb {
  readonly containerName: string;
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database: string;
}

interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

async function runCommand(cmd: readonly string[]): Promise<CommandResult> {
  const proc = Bun.spawn([...cmd], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

/**
 * 第四輪 code review 決議：SIGTERM/SIGINT 中斷腳本時，`finally` 區塊的清理
 * 一定要有機會跑到，不然會留下一個裝著未遮罩資料的容器。用一個模組層級的
 * 集合追蹤目前正在跑的容器，signal handler 只註冊一次（多次呼叫
 * `withDisposableMariaDb` 不會疊加），收到訊號時把所有還在追蹤的容器都停掉
 * 再結束行程。
 */
const activeContainers = new Set<string>();
let signalHandlersRegistered = false;

function registerSignalHandlersOnce(): void {
  if (signalHandlersRegistered) return;
  signalHandlersRegistered = true;

  const handleSignal = (signal: NodeJS.Signals) => {
    void (async () => {
      for (const containerName of activeContainers) {
        try {
          await runCommand(["docker", "stop", containerName]);
        } catch {
          // 行程都要因為訊號結束了，這裡盡力而為就好；真的清不掉的話，容器
          // 名稱有固定的 hubcontract_mask_ 前綴，方便事後手動 docker stop。
        }
      }
      process.exit(signal === "SIGINT" ? 130 : 143);
    })();
  };

  process.on("SIGTERM", handleSignal);
  process.on("SIGINT", handleSignal);
}

async function waitUntilHealthy(containerName: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { stdout } = await runCommand(["docker", "inspect", "--format", "{{.State.Health.Status}}", containerName]);
    if (stdout.trim() === "healthy") return;
    await Bun.sleep(500);
  }
  throw new Error(`拋棄式 MariaDB 容器 ${containerName} 在 ${timeoutMs}ms 內沒有變成 healthy，放棄等待。`);
}

async function resolveHostPort(containerName: string): Promise<number> {
  const { stdout, stderr, exitCode } = await runCommand(["docker", "port", containerName, "3306/tcp"]);
  if (exitCode !== 0) {
    throw new Error(`查詢拋棄式 MariaDB 容器 ${containerName} 的對外連接埠失敗：${stderr}`);
  }
  // 輸出格式類似 "127.0.0.1:54321"（可能有多行，取最後一段冒號後的數字）。
  const match = /:(\d+)\s*$/.exec(stdout.trim());
  if (!match) {
    throw new Error(`無法從 'docker port' 輸出解析連接埠：${stdout}`);
  }
  return Number(match[1]);
}

export interface DisposableMariaDbOptions {
  /** 等待容器變成 healthy 的逾時（ms）。預設 60 秒。 */
  healthTimeoutMs?: number;
}

/**
 * 起一個拋棄式 MariaDB 容器，執行 `fn`，跑完（無論成功或丟例外）一定
 * `docker stop`（容器用 `--rm` 啟動，stop 後自動移除）。
 */
export async function withDisposableMariaDb<T>(
  fn: (db: DisposableMariaDb) => Promise<T>,
  options: DisposableMariaDbOptions = {}
): Promise<T> {
  registerSignalHandlersOnce();

  const containerName = `hubcontract_mask_${Date.now()}_${randomUUID().slice(0, 8)}`;

  const startResult = await runCommand([
    "docker",
    "run",
    "-d",
    "--rm",
    "--name",
    containerName,
    "-e",
    `MYSQL_ROOT_PASSWORD=${ROOT_PASSWORD}`,
    "-e",
    `MYSQL_DATABASE=${DATABASE}`,
    "-p",
    "127.0.0.1::3306",
    "--health-cmd",
    "healthcheck.sh --connect --innodb_initialized",
    "--health-interval",
    "2s",
    "--health-timeout",
    "2s",
    "--health-retries",
    "30",
    MARIADB_IMAGE,
  ]);

  if (startResult.exitCode !== 0) {
    throw new Error(`啟動拋棄式 MariaDB 容器失敗：${startResult.stderr}`);
  }

  activeContainers.add(containerName);

  let result: T;
  try {
    await waitUntilHealthy(containerName, options.healthTimeoutMs ?? 60000);
    const port = await resolveHostPort(containerName);
    result = await fn({
      containerName,
      host: "127.0.0.1",
      port,
      user: "root",
      password: ROOT_PASSWORD,
      database: DATABASE,
    });
  } catch (err) {
    // `fn` 本身失敗了：清理容器，但不能讓清理的錯誤蓋掉真正的失敗原因——
    // 拋出前先盡力清理，清理失敗就記錄下來（不吞，但也不能取代原始錯誤）。
    activeContainers.delete(containerName);
    const stopResult = await runCommand(["docker", "stop", containerName]);
    if (stopResult.exitCode !== 0) {
      console.error(
        `[HubContract] 警告：清理拋棄式 MariaDB 容器 ${containerName} 失敗（docker stop）：${stopResult.stderr}`
      );
    }
    throw err;
  }

  // `fn` 成功了：清理失敗這時候就是唯一的問題，必須讓呼叫端知道，不能吞掉
  // （第四輪 code review 決議）——容器用 `--rm` 啟動，`docker stop` 成功後會
  // 自動移除，不需要另外呼叫 `docker rm`。
  activeContainers.delete(containerName);
  const stopResult = await runCommand(["docker", "stop", containerName]);
  if (stopResult.exitCode !== 0) {
    throw new Error(`清理拋棄式 MariaDB 容器 ${containerName} 失敗（docker stop）：${stopResult.stderr}`);
  }

  return result;
}

/**
 * 把 SQL 位元組（可能是 mysqldump 快照）匯入容器內的資料庫。直接把原始 bytes
 * 灌進 `mariadb` CLI 的 stdin，不在 Node/Bun 這邊解析或改寫任何 SQL 語法。
 */
export async function loadSqlBytes(db: DisposableMariaDb, sql: Uint8Array): Promise<void> {
  const proc = Bun.spawn(
    ["docker", "exec", "-i", db.containerName, "mariadb", `-u${db.user}`, `-p${db.password}`, db.database],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" }
  );
  proc.stdin.write(sql);
  await proc.stdin.end();
  const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) {
    throw new Error(`載入 SQL 到拋棄式 MariaDB 容器失敗：${stderr}`);
  }
}

/**
 * 固定參數的 `mysqldump`——同一份資料庫內容，重跑一定要輸出逐位元組相同的
 * 結果（已用兩次連續 dump 手動驗證過，見 PR 說明）：
 * - `--no-create-info`：schema 以凍結的 `seeds/mysql-schema.sql` 為準，這裡只
 *   要 DML。
 * - `--complete-insert`：每句 INSERT 都帶明確欄位列表，測試站實際欄位順序跟
 *   凍結 schema 不一樣時，MySQL 靠欄位名稱對齊值，不會塞錯欄位。
 * - `--skip-dump-date`、`--skip-comments`：拿掉會隨時間變動或純裝飾用的輸出。
 * - `--order-by-primary`：資料列順序決定性，不受儲存引擎內部順序影響。
 * - `--hex-blob`：二進位資料用固定的十六進位表示法，不受 client 字元集影響。
 * - `--skip-extended-insert`：一個 row 一句 INSERT，方便人工 diff。
 * - `--single-transaction`：一致性讀取快照，不鎖表。
 * - `--skip-add-locks`：拋棄式容器沒有並發寫入，不需要 `LOCK/UNLOCK TABLES`。
 * - `--skip-triggers`：就算 `assertNoUserDefinedObjects` 這道檢查本身有漏洞，
 *   trigger 定義本身也不該出現在輸出裡（trigger body 可能夾帶敏感的表名/邏輯，
 *   而且遮罩後的資料庫已經不代表 trigger 原本要保護的不變量）。routines/
 *   events 預設本來就不會被 `mysqldump` 匯出（沒有 `--routines`/`--events`
 *   就不會），不需要另外加 flag。
 */
const MYSQLDUMP_ARGS = [
  "--no-create-info",
  "--complete-insert",
  "--skip-dump-date",
  "--skip-comments",
  "--order-by-primary",
  "--hex-blob",
  "--skip-extended-insert",
  "--single-transaction",
  "--skip-add-locks",
  "--skip-triggers",
] as const;

/** 用固定參數的 `mysqldump` 匯出容器內資料庫目前的內容。 */
export async function dumpDatabase(db: DisposableMariaDb): Promise<Buffer> {
  const proc = Bun.spawn(
    ["docker", "exec", db.containerName, "mysqldump", `-u${db.user}`, `-p${db.password}`, ...MYSQLDUMP_ARGS, db.database],
    { stdout: "pipe", stderr: "pipe" }
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`mysqldump 匯出拋棄式 MariaDB 容器失敗：${stderr}`);
  }
  return Buffer.from(stdout);
}
