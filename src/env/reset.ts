import path from "path";
import { config } from "../config";

export interface ResetOptions {
  /** Override the reset script path (mainly for tests). Defaults to scripts/env-reset.sh. */
  scriptPath?: string;
  /** Override the timeout (ms). Defaults to config.resetTimeoutMs. */
  timeoutMs?: number;
}

/**
 * Resets the recording environment (MariaDB schema + synthetic seeds, Redis FLUSHALL,
 * Mongo drop) back to a fixed baseline by shelling out to scripts/env-reset.sh.
 *
 * This lives outside ContractRunner on purpose (see Issue #1/#3): the runner only
 * knows about a base URL and must stay usable against any target (including
 * StationHubNext, which may reset itself differently). Reset is a harness-level
 * concern, invoked by integration tests and by the CLI before record/verify.
 *
 * If the script doesn't finish within `timeoutMs`, the subprocess is killed
 * (Bun.spawn's `timeout`/`killSignal`, not the test runner's own timeout) and this
 * throws — a silently-orphaned reset process must never be mistaken for success.
 */
export async function resetEnvironment(options: ResetOptions = {}): Promise<void> {
  const scriptPath =
    options.scriptPath ?? path.join(import.meta.dir, "../../scripts/env-reset.sh");
  const timeoutMs = options.timeoutMs ?? config.resetTimeoutMs;

  const proc = Bun.spawn([scriptPath], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });

  // Wait for exit first, then read stderr with a short grace period. Reading
  // stderr concurrently with `proc.exited` (via Promise.all) can hang forever
  // after a SIGKILL on this Bun version — the pipe doesn't reliably emit EOF —
  // so it must never be awaited unbounded on the kill path.
  const exitCode = await proc.exited;
  const stderr = await Promise.race([
    new Response(proc.stderr).text(),
    new Promise<string>((resolve) => setTimeout(() => resolve(""), 500)),
  ]);

  // Note: Subprocess.killed is true for *any* exited process (including a clean
  // exit 0), despite its name — it does not mean "was killed by us". The signal
  // that Bun's `timeout`/`killSignal` option actually sends is the reliable signal.
  if (proc.signalCode !== null) {
    throw new Error(
      `env-reset.sh timed out after ${timeoutMs}ms and was killed (${proc.signalCode}). stderr so far: ${stderr}`
    );
  }

  if (exitCode !== 0) {
    throw new Error(`env-reset.sh failed with exit code ${exitCode}: ${stderr}`);
  }
}
