import mysql from "mysql2/promise";
import type { DbProbeSchema } from "../schema/scenario";
import type { z } from "zod";

export interface DbConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}

export type DbProbe = z.infer<typeof DbProbeSchema>;

export class MariaDbProbe {
  private pool: mysql.Pool;

  constructor(config: DbConfig = {}) {
    this.pool = mysql.createPool({
      host: config.host || process.env.DB_HOST || "127.0.0.1",
      port: config.port || Number(process.env.DB_PORT || 33066),
      user: config.user || process.env.DB_USER || "recording_user",
      password: config.password || process.env.DB_PASSWORD || "recording_pass",
      database: config.database || process.env.DB_DATABASE || "stationhub_recording",
      dateStrings: true,
      waitForConnections: true,
      connectionLimit: 5,
    });
  }

  /**
   * Execute all probe queries and return structured state map
   */
  async capture(probe?: DbProbe): Promise<Record<string, any>> {
    if (!probe || !probe.queries || probe.queries.length === 0) {
      return {};
    }

    const state: Record<string, any> = {};
    for (const q of probe.queries) {
      const [rows] = await this.pool.execute(q.sql, q.params);
      state[q.name] = rows;
    }
    return state;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
