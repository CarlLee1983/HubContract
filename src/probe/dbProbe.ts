import mysql from "mysql2/promise";
import type { DbProbeSchema } from "../schema/scenario";
import type { z } from "zod";
import { config } from "../config";

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

  constructor(dbConfig: DbConfig = {}) {
    this.pool = mysql.createPool({
      host: dbConfig.host || config.db.host,
      port: dbConfig.port || config.db.port,
      user: dbConfig.user || config.db.user,
      password: dbConfig.password || config.db.password,
      database: dbConfig.database || config.db.database,
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
