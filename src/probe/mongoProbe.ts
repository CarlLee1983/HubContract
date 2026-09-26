import { BSON, MongoClient, ObjectId } from "mongodb";

export interface MongoProbeConfig {
  host?: string;
  port?: number;
  database?: string;
}

/** Collection names are an explicit allowlist, or a glob such as httplog_*. */
export interface MongoProbe {
  collections?: string[];
  pattern?: string;
}

export type MongoSnapshot = Record<string, string[]>;
export type MongoJson = null | boolean | number | string | MongoJson[] | { [key: string]: MongoJson };
export type MongoCapture = Record<string, Record<string, MongoJson>[]>;

function normalize(value: unknown): MongoJson {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof ObjectId) return "<objectId>";
  if (value instanceof Date) return "<timestamp>";
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    // EJSON keeps less common BSON values (Decimal128, Binary, Long, etc.) JSON safe.
    if ("_bsontype" in value) return normalize(BSON.EJSON.serialize(value));
    const result: Record<string, MongoJson> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) result[key] = normalize(entry);
    }
    return result;
  }
  throw new Error(`Unsupported Mongo document value: ${typeof value}`);
}

function idKey(id: unknown): string {
  // Canonical EJSON preserves BSON type distinctions in snapshot identity.
  return BSON.EJSON.stringify(id, { relaxed: false });
}

function validateProbe(probe?: MongoProbe): void {
  for (const name of probe?.collections ?? []) {
    if (!/^httplog_[\w-]+$/.test(name)) {
      throw new Error(`Mongo probe collection must be httplog_*: ${name}`);
    }
  }
  if (probe?.pattern && !/^httplog_[\w*\-]+$/.test(probe.pattern)) {
    throw new Error(`Mongo probe pattern must be httplog_*: ${probe.pattern}`);
  }
}

function patternRegex(pattern: string): RegExp {
  // validateProbe allows only word characters, hyphens, and '*' wildcards.
  return new RegExp(`^${pattern.replaceAll("*", ".*")}$`);
}

export class MongoProbeService {
  private readonly client: MongoClient;
  private readonly database: string;
  private connected = false;

  constructor(mongoConfig: MongoProbeConfig = {}, client?: MongoClient) {
    const host = mongoConfig.host ?? process.env.MONGO_HOST ?? "127.0.0.1";
    const port = mongoConfig.port ?? Number(process.env.MONGO_PORT ?? 27018);
    this.database = mongoConfig.database ?? process.env.MONGO_DATABASE ?? "stationhub_recording";
    this.client = client ?? new MongoClient(`mongodb://${host}:${port}`);
  }

  private async selectedCollections(probe: MongoProbe): Promise<string[]> {
    const names = new Set(probe.collections ?? []);
    if (probe.pattern) {
      const matches = patternRegex(probe.pattern);
      const existing = await this.client.db(this.database).listCollections({}, { nameOnly: true }).toArray();
      for (const { name } of existing) {
        if (name.startsWith("httplog_") && matches.test(name)) names.add(name);
      }
    }
    return [...names].sort();
  }

  private async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  async snapshot(probe?: MongoProbe): Promise<MongoSnapshot> {
    validateProbe(probe);
    if (!probe?.collections?.length && !probe?.pattern) return {};
    await this.connect();
    const snapshot: MongoSnapshot = {};
    for (const name of await this.selectedCollections(probe)) {
      const documents = await this.client.db(this.database).collection(name).find({}, { projection: { _id: 1 } }).toArray();
      snapshot[name] = documents.map((document) => idKey(document._id)).sort();
    }
    return snapshot;
  }

  async captureNew(probe: MongoProbe | undefined, before: MongoSnapshot): Promise<MongoCapture> {
    validateProbe(probe);
    if (!probe?.collections?.length && !probe?.pattern) return {};
    await this.connect();
    const capture: MongoCapture = {};
    for (const name of await this.selectedCollections(probe)) {
      const priorIds = new Set(before[name] ?? []);
      const documents = await this.client.db(this.database).collection(name).find({}).toArray();
      const added = documents
        .filter((document) => !priorIds.has(idKey(document._id)))
        .map((document) => {
          const { _id, ...fields } = document;
          return normalize(fields) as Record<string, MongoJson>;
        })
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      capture[name] = added;
    }
    return capture;
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}
