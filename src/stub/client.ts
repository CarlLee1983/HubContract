import type { StubRequestRecord, StubScript } from "../schema/scenario";

/**
 * HTTP client for the stub's `/__stub/*` control API (Issue #8), used by
 * ContractRunner to load a scenario's script and read back what the target
 * under test actually sent before comparing/recording layer3_outboundCalls.
 */
export class StubClient {
  constructor(private baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async reset(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/__stub/reset`, { method: "POST" });
    await assertOk(res, "POST /__stub/reset");
  }

  async loadScript(script: StubScript): Promise<void> {
    const res = await fetch(`${this.baseUrl}/__stub/script`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(script),
    });
    await assertOk(res, "PUT /__stub/script");
  }

  async getRequests(): Promise<{ requests: StubRequestRecord[]; unmatchedCount: number }> {
    const res = await fetch(`${this.baseUrl}/__stub/requests`);
    await assertOk(res, "GET /__stub/requests");
    return (await res.json()) as { requests: StubRequestRecord[]; unmatchedCount: number };
  }
}

/**
 * Code review Standards #7: a non-2xx from the stub's control API must never
 * be swallowed — the caller (ContractRunner) has no other way to notice that,
 * say, the script it thought it loaded was actually rejected as invalid.
 */
async function assertOk(res: Response, label: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text();
  throw new Error(`Stub control API ${label} failed: HTTP ${res.status} ${body}`);
}
