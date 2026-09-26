import Redis from "ioredis";
import { config } from "../config";
import type { ScenarioPreconditions } from "../schema/scenario";
import type { PreconditionAdapter } from "../runner";

/** Recording-only setup for the pinned Legacy cache configuration. */
export class LegacyPreconditionAdapter implements PreconditionAdapter {
  private redis: Redis;

  constructor(options: { host?: string; port?: number; password?: string; prefix?: string } = {}) {
    this.redis = new Redis({
      host: options.host ?? config.redis.host,
      port: options.port ?? config.redis.port,
      password: options.password ?? config.redis.password,
      db: 1, // Legacy's cache.lock_connection uses the default Redis connection.
      lazyConnect: true,
    });
    this.prefix = options.prefix ?? config.redis.prefix;
  }

  private prefix: string;

  async apply(preconditions: ScenarioPreconditions): Promise<void> {
    if (preconditions.smsLock) {
      if (this.redis.status === "wait") await this.redis.connect();

      // config/cache.php derives this prefix from APP_NAME=StationHubLegacy in
      // docker/.env.recording. The scenario only names the national phone number.
      const key = `${this.prefix}stationhublegacy_cache_:sms_${preconditions.smsLock.nationalNumber}`;
      const result = await this.redis.set(key, "synthetic_contract_lock_owner", "EX", 10, "NX");
      if (result !== "OK") throw new Error(`Legacy SMS lock precondition already exists for ${preconditions.smsLock.nationalNumber}`);
    }

    if (preconditions.mcpMaintenance) {
      const { platform, duration, reason } = preconditions.mcpMaintenance;
      const response = await fetch(`http://localhost:${config.legacyPort}/mcp/platform-maintenance/${encodeURIComponent(platform)}`, {
        method: "POST",
        headers: {
          Host: "localhost:8080",
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Station-Mcp-Secret": "synthetic_mcp_secret_for_contract_testing_only_9f3a1c",
        },
        body: JSON.stringify({ duration, reason }),
      });
      if (!response.ok) {
        throw new Error(`Legacy MCP maintenance precondition failed: HTTP ${response.status}`);
      }
    }
  }

  async close(): Promise<void> {
    this.redis.disconnect();
  }
}
