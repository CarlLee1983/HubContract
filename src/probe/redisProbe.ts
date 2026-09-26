import Redis from "ioredis";
import type { RedisProbeSchema, RedisKeyRecord } from "../schema/scenario";
import type { z } from "zod";
import { config } from "../config";

export interface RedisProbeConfig {
  host?: string;
  port?: number;
  password?: string;
  prefix?: string;
}

type RedisValueReader = (client: Redis, key: string) => Promise<unknown>;

const valueReaders: Record<string, RedisValueReader> = {
  string: async (client, key) => {
    const rawVal = await client.get(key);
    try {
      return rawVal ? JSON.parse(rawVal) : rawVal;
    } catch {
      return rawVal;
    }
  },
  hash: (client, key) => client.hgetall(key),
  list: (client, key) => client.lrange(key, 0, -1),
  set: (client, key) => client.smembers(key),
  zset: (client, key) => client.zrange(key, 0, "-1", "WITHSCORES"),
};

export type RedisProbe = z.infer<typeof RedisProbeSchema>;

export class RedisProbeService {
  private host: string;
  private port: number;
  private password?: string;
  private prefix: string;
  private clients: Map<number, Redis> = new Map();

  constructor(redisConfig: RedisProbeConfig = {}) {
    this.host = redisConfig.host || config.redis.host;
    this.port = redisConfig.port || config.redis.port;
    this.password = redisConfig.password || config.redis.password;
    this.prefix = redisConfig.prefix || config.redis.prefix;
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
      const db = rule.db;
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
        const readValue = valueReaders[type];
        const value = readValue ? await readValue(client, fullKey) : null;

        state[unprefixedKey] = {
          key: unprefixedKey,
          db,
          type,
          value,
          ttl,
          ttlTolerance: rule.ttlToleranceSeconds,
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
