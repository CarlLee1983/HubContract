import { describe, expect, it } from "bun:test";

describe("CLI queue adapter selection", () => {
  it("requires an adapter for a selected nonqueued scenario on another target", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/cli.ts", "-m", "verify", "-s", "scenarios/sms/index.json", "-t", "http://next.example:9090"],
      {
        cwd: new URL("..", import.meta.url).pathname,
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("needs --queue-drain-adapter");
  });

  it("does not require an adapter when no scenarios are selected", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/cli.ts", "-m", "verify", "-s", "scenarios/sms/index.json", "--tag", "no-match", "-t", "http://next.example:9090"],
      {
        cwd: new URL("..", import.meta.url).pathname,
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain("0 total");
    expect(stderr).not.toContain("needs --queue-drain-adapter");
  });

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
