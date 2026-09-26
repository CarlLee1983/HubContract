import { describe, expect, it } from "bun:test";

describe("CLI queue adapter selection", () => {
  it("requires an adapter when the default target comes from HUBCONTRACT_BASE_URL", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/cli.ts", "-m", "verify", "-s", "scenarios/wallet/deposit-queued-sync.json"],
      {
        cwd: new URL("..", import.meta.url).pathname,
        env: { ...process.env, HUBCONTRACT_BASE_URL: "http://next.example:9090" },
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("needs --queue-drain-adapter");
  });
});
