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
    if (!preconditions.smsLock && !preconditions.walletLock) return;
    if (this.redis.status === "wait") await this.redis.connect();

    if (preconditions.smsLock) {
      // config/cache.php derives this prefix from APP_NAME=StationHubLegacy in
      // docker/.env.recording. The scenario only names the national phone number.
      const key = `${this.prefix}stationhublegacy_cache_:sms_${preconditions.smsLock.nationalNumber}`;
      const result = await this.redis.set(key, "synthetic_contract_lock_owner", "EX", 10, "NX");
      if (result !== "OK") throw new Error(`Legacy SMS lock precondition already exists for ${preconditions.smsLock.nationalNumber}`);
    }

    if (preconditions.walletLock) {
      const { account, stationCode, currency } = preconditions.walletLock;
      const key = `${this.prefix}game_to_main_wallet_sync:${await this.userId(account, stationCode)}_${currency}`;
      const result = await this.redis.set(key, "synthetic_contract_lock_owner", "EX", 30, "NX");
      if (result !== "OK") throw new Error(`Legacy wallet lock precondition already exists for ${account}/${currency}`);
    }
  }

  private async userId(account: string, stationCode: string): Promise<number> {
    // Resolve the synthetic fixture's user by domain identity so the scenario
    // remains independent of the selected seed's numeric IDs.
    const { createConnection } = await import("mysql2/promise");
    const connection = await createConnection(config.db);
    try {
      const [rows] = await connection.query<import("mysql2").RowDataPacket[]>(
        "SELECT u.id FROM users u JOIN stations s ON s.id = u.station_id WHERE u.account = ? AND s.code = ? LIMIT 1",
        [account, stationCode]
      );
      if (!rows[0]) throw new Error(`Wallet lock user not found: ${account}/${stationCode}`);
      return Number(rows[0].id);
    } finally {
      await connection.end();
    }
  }

  async close(): Promise<void> {
    this.redis.disconnect();
  }
}
