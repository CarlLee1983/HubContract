import Redis from "ioredis";
import { config } from "../config";

export interface QueueDrainConfig {
  host?: string;
  port?: number;
  password?: string;
  prefix?: string;
  db?: number;
}

export interface QueueState {
  pending: number;
  reserved: number;
  delayed: number;
}

export interface QueueDrain {
  waitForIdle(queues: string[], timeoutMs: number, pollIntervalMs?: number): Promise<void>;
  close(): Promise<void>;
}

/** Reads Laravel Redis queue metadata, including reservations held by workers. */
export class RedisQueueDrain implements QueueDrain {
  private client: Redis;
  private prefix: string;

  constructor(options: QueueDrainConfig = {}) {
    this.client = new Redis({
      host: options.host ?? config.redis.host,
      port: options.port ?? config.redis.port,
      password: options.password ?? config.redis.password,
      db: options.db ?? Number(process.env.REDIS_DB ?? 1),
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    this.prefix = options.prefix ?? config.redis.prefix;
  }

  async readState(queue: string): Promise<QueueState> {
    if (this.client.status === "wait") await this.client.connect();
    const key = `${this.prefix}queues:${queue}`;
    const [pending, reserved, delayed] = await Promise.all([
      this.client.llen(key),
      this.client.zcard(`${key}:reserved`),
      this.client.zcard(`${key}:delayed`),
    ]);
    return { pending, reserved, delayed };
  }

  async waitForIdle(queues: string[], timeoutMs: number, pollIntervalMs = 100): Promise<void> {
    if (!queues.length) return;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || pollIntervalMs <= 0) {
      throw new Error("Queue drain requires positive timeout and poll interval");
    }
    const deadline = Date.now() + timeoutMs;
    let idlePolls = 0;
    let lastStates: Record<string, QueueState> = {};
    while (true) {
      const entries = await Promise.all(queues.map(async (queue) => [queue, await this.readState(queue)] as const));
      lastStates = Object.fromEntries(entries);
      const idle = entries.every(([, state]) => state.pending === 0 && state.reserved === 0 && state.delayed === 0);
      idlePolls = idle ? idlePolls + 1 : 0;
      if (idlePolls >= 2) return;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`Queue drain timed out after ${timeoutMs}ms: ${JSON.stringify(lastStates)}`);
      }
      await Bun.sleep(Math.min(pollIntervalMs, remaining));
    }
  }

  async close(): Promise<void> {
    this.client.disconnect();
  }
}
