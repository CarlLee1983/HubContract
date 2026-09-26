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

  try {
    await waitUntilHealthy(containerName, options.healthTimeoutMs ?? 60000);
    const port = await resolveHostPort(containerName);
    return await fn({
      containerName,
      host: "127.0.0.1",
      port,
      user: "root",
      password: ROOT_PASSWORD,
      database: DATABASE,
    });
  } finally {
    // 不管上面成功或丟例外，一定清掉，不留孤兒容器。
    await runCommand(["docker", "stop", containerName]);
  }
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
