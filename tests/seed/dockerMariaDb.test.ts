import "./testEnv";
import { describe, expect, it } from "bun:test";
import { withDisposableMariaDb } from "../../src/seed/dockerMariaDb";
import { RUNS_AGAINST_RECORDING_ENV } from "../helpers/integrationGate";

async function dockerPsNames(): Promise<string[]> {
  const proc = Bun.spawn(["docker", "ps", "-a", "--format", "{{.Names}}"], { stdout: "pipe" });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out.split("\n").filter(Boolean);
}

/**
 * Issue #13（第四輪 code review 決議）：容器清理不能被吞——`fn` 失敗時容器還是
 * 要被清掉，且原始錯誤要能傳出去；`fn` 成功時如果清理本身失敗，那個失敗必須
 * 讓呼叫端看得到，不能默默當作整體成功。
 */
describe.skipIf(!RUNS_AGAINST_RECORDING_ENV)("Issue #13：withDisposableMariaDb 容器清理", () => {
  it(
    "fn 丟例外時，容器還是會被清掉，且原始錯誤會被原樣拋出（不會被清理過程蓋掉）",
    async () => {
      let capturedContainerName = "";

      await expect(
        withDisposableMariaDb(async (db) => {
          capturedContainerName = db.containerName;
          throw new Error("boom: fn 本身的錯誤");
        })
      ).rejects.toThrow("boom: fn 本身的錯誤");

      const names = await dockerPsNames();
      expect(names).not.toContain(capturedContainerName);
    },
    30000
  );

  it(
    "fn 成功但容器已經被外部搶先停掉時，清理失敗會被回報成 throw，不會被吞掉",
    async () => {
      await expect(
        withDisposableMariaDb(async (db) => {
          // 模擬容器在 fn 執行期間已經被(例如)另一個行程弄掉了：這裡直接把它
          // 停掉，讓 withDisposableMariaDb 自己那次「清理用」的 docker stop
          // 失敗（容器已經不存在）。
          await Bun.spawn(["docker", "stop", db.containerName], { stdout: "pipe", stderr: "pipe" }).exited;
          return "fn 本身回傳成功";
        })
      ).rejects.toThrow(/清理拋棄式 MariaDB 容器.*失敗/s);
    },
    30000
  );
});
