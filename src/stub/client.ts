import type { StubScript } from "../schema/scenario";
import type { StubRequestRecord } from "./store";

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
    await fetch(`${this.baseUrl}/__stub/reset`, { method: "POST" });
  }

  async loadScript(script: StubScript): Promise<void> {
    await fetch(`${this.baseUrl}/__stub/script`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(script),
    });
  }

  async getRequests(): Promise<{ requests: StubRequestRecord[]; unmatchedCount: number }> {
    const res = await fetch(`${this.baseUrl}/__stub/requests`);
    return (await res.json()) as { requests: StubRequestRecord[]; unmatchedCount: number };
  }
}
