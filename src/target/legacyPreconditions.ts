import Redis from "ioredis";
import { config } from "../config";
import type { ScenarioPreconditions } from "../schema/scenario";
import type { PreconditionAdapter } from "../runner";

/** Recording-only setup for the pinned Legacy cache configuration. */
export class LegacyPreconditionAdapter implements PreconditionAdapter {
  private redis: Redis;

  constructor(options: { host?: string; port?: number; prefix?: string } = {}) {
    this.redis = new Redis({
      host: options.host ?? config.redis.host,
      port: options.port ?? config.redis.port,
      db: 1, // Legacy's cache.lock_connection uses the default Redis connection.
      lazyConnect: true,
    });
    this.prefix = options.prefix ?? config.redis.prefix;
  }

  private prefix: string;

  async apply(preconditions: ScenarioPreconditions): Promise<void> {
    if (!preconditions.smsLock) return;
    if (this.redis.status === "wait") await this.redis.connect();

    // config/cache.php derives this prefix from APP_NAME=StationHubLegacy in
    // docker/.env.recording. The scenario only names the national phone number.
    const key = `${this.prefix}stationhublegacy_cache_:sms_${preconditions.smsLock.nationalNumber}`;
    const result = await this.redis.set(key, "synthetic_contract_lock_owner", "EX", 10, "NX");
    if (result !== "OK") throw new Error(`Legacy SMS lock precondition already exists for ${preconditions.smsLock.nationalNumber}`);
  }

  async close(): Promise<void> {
    this.redis.disconnect();
  }
}
