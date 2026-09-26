import path from "path";

export interface TargetAdapter {
  triggerSchedule(name: string): Promise<void>;
}

// Scenario names are target-neutral. Only this adapter knows the Legacy CLI.
const COMMANDS: Record<string, string> = { "remittance.retry": "remittance:retry" };

export class LegacyTargetAdapter implements TargetAdapter {
  constructor(private readonly run: (argv: string[]) => Promise<void> = runCommand) {}

  async triggerSchedule(name: string): Promise<void> {
    const command = COMMANDS[name];
    if (!command) throw new Error(`Unsupported Legacy schedule: ${name}`);
    await this.run(["docker", "compose", "exec", "-T", "legacy-app", "php", "artisan", command]);
  }
}

export async function runCommand(argv: string[], timeoutMs = 60000): Promise<void> {
  const proc = Bun.spawn(argv, {
    cwd: path.join(import.meta.dir, "../.."),
    stdout: "pipe",
    stderr: "pipe",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (proc.signalCode !== null) {
    throw new Error(`Legacy schedule timed out after ${timeoutMs}ms (${proc.signalCode})`);
  }
  if (exitCode !== 0) {
    throw new Error(`Legacy schedule failed (exit ${exitCode}): ${stderr || stdout}`);
  }
}
