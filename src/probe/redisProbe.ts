import Redis from "ioredis";
import type { RedisProbeSchema, RedisKeyRecord } from "../schema/scenario";
import type { z } from "zod";

export interface RedisProbeConfig {
  host?: string;
  port?: number;
  password?: string;
  prefix?: string;
  defaultDb?: number;
}

export type RedisProbe = z.infer<typeof RedisProbeSchema>;

export class RedisProbeService {
  private host: string;
  private port: number;
  private password?: string;
  private prefix: string;
  private clients: Map<number, Redis> = new Map();

  constructor(config: RedisProbeConfig = {}) {
    this.host = config.host || process.env.REDIS_HOST || "127.0.0.1";
    this.port = config.port || Number(process.env.REDIS_PORT || 63799);
    this.password = config.password || process.env.REDIS_PASSWORD || undefined;
    this.prefix = config.prefix || process.env.REDIS_PREFIX || "hub_recording:";
  }

  private getClient(db: number): Redis {
    if (!this.clients.has(db)) {
      const client = new Redis({
        host: this.host,
        port: this.port,
        password: this.password,
        db,
        lazyConnect: true,
      });
      this.clients.set(db, client);
    }
    return this.clients.get(db)!;
  }

  /**
   * Capture keys defined by probe rules
   */
  async capture(probe?: RedisProbe): Promise<Record<string, RedisKeyRecord | null>> {
    if (!probe || !probe.keys || probe.keys.length === 0) {
      return {};
    }

    const state: Record<string, RedisKeyRecord | null> = {};

    for (const rule of probe.keys) {
      const db = rule.db ?? 1;
      const client = this.getClient(db);
      if (client.status === "wait") {
        await client.connect();
      }

      // Prepend prefix to pattern if not already prefixed
      const patternWithPrefix = rule.pattern.startsWith(this.prefix)
        ? rule.pattern
        : `${this.prefix}${rule.pattern}`;

      // Search keys matching pattern
      const matchedKeys = await client.keys(patternWithPrefix);

      if (matchedKeys.length === 0 && !rule.pattern.includes("*")) {
        // If it was an exact key query and not found
        state[rule.pattern] = null;
      }

      for (const fullKey of matchedKeys) {
        const unprefixedKey = fullKey.startsWith(this.prefix)
          ? fullKey.slice(this.prefix.length)
          : fullKey;

        const type = await client.type(fullKey);
        const ttl = await client.ttl(fullKey);

        let value: any = null;
        if (type === "string") {
          const rawVal = await client.get(fullKey);
          try {
            value = rawVal ? JSON.parse(rawVal) : rawVal;
          } catch {
            value = rawVal;
          }
        } else if (type === "hash") {
          value = await client.hgetall(fullKey);
        } else if (type === "list") {
          value = await client.lrange(fullKey, 0, -1);
        } else if (type === "set") {
          value = await client.smembers(fullKey);
        } else if (type === "zset") {
          value = await (client as any).zrange(fullKey, 0, -1, "WITHSCORES");
        }

        state[unprefixedKey] = {
          key: unprefixedKey,
          db,
          type,
          value,
          ttl,
          ttlTolerance: rule.ttlToleranceSeconds ?? 30,
        };
      }
    }

    return state;
  }

  async close(): Promise<void> {
    for (const client of this.clients.values()) {
      client.disconnect();
    }
    this.clients.clear();
  }
}
