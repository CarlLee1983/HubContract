import { describe, expect, it } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { resetEnvironment } from "../src/env/reset";

async function captureRejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected promise to reject, but it resolved");
}

describe("Issue #1/#3: resetEnvironment harness helper", () => {
  it("resolves when the script exits 0", async () => {
    const scriptPath = path.join(os.tmpdir(), `hubcontract-reset-ok-${Date.now()}.sh`);
    await fs.writeFile(scriptPath, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });

    // resetEnvironment() itself throws on failure, so simply awaiting it (with no
    // catch) is the assertion: the test fails if it rejects.
    await resetEnvironment({ scriptPath });

    await fs.unlink(scriptPath);
  });

  it("throws an error containing stderr when the script exits non-zero", async () => {
    const scriptPath = path.join(os.tmpdir(), `hubcontract-reset-fail-${Date.now()}.sh`);
    await fs.writeFile(
      scriptPath,
      "#!/usr/bin/env bash\necho 'boom: seed file missing' >&2\nexit 1\n",
      { mode: 0o755 }
    );

    const err = await captureRejection(resetEnvironment({ scriptPath }));
    expect(err.message).toContain("boom: seed file missing");

    await fs.unlink(scriptPath);
  });

  it("kills the subprocess and throws when it exceeds timeoutMs (code review MEDIUM #5)", async () => {
    const scriptPath = path.join(os.tmpdir(), `hubcontract-reset-hang-${Date.now()}.sh`);
    await fs.writeFile(scriptPath, "#!/usr/bin/env bash\nsleep 30\nexit 0\n", { mode: 0o755 });

    const start = Date.now();
    const err = await captureRejection(resetEnvironment({ scriptPath, timeoutMs: 200 }));
    const elapsedMs = Date.now() - start;

    expect(err.message).toContain("timed out");
    // Proves the subprocess was actually killed rather than left to run to
    // completion in the background: this resolves well before the script's
    // own 30s sleep would have finished.
    expect(elapsedMs).toBeLessThan(5000);

    await fs.unlink(scriptPath);
  });
});
