import { describe, expect, it } from "bun:test";
import { MongoClient, ObjectId } from "mongodb";
import { MongoProbeService } from "../src/probe/mongoProbe";

function fakeClient(collections: Record<string, Record<string, unknown>[]>) {
  let connections = 0;
  let closes = 0;
  const client = {
    async connect() { connections += 1; },
    async close() { closes += 1; },
    db() {
      return {
        listCollections() {
          return { async toArray() { return Object.keys(collections).map((name) => ({ name })); } };
        },
        collection(name: string) {
          return {
            find(_filter: unknown, options?: { projection?: { _id: number } }) {
              return {
                async toArray() {
                  const rows = collections[name] ?? [];
                  return options?.projection ? rows.map(({ _id }) => ({ _id })) : rows;
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as MongoClient, counts: () => ({ connections, closes }) };
}

describe("MongoProbeService", () => {
  it("captures only inserted httplog documents, including a newly created collection", async () => {
    const oldId = new ObjectId("000000000000000000000001");
    const newId = new ObjectId("000000000000000000000002");
    const collections: Record<string, Record<string, unknown>[]> = {
      httplog_api: [{ _id: oldId, event: "existing" }],
      unrelated: [{ _id: newId, event: "ignore" }],
    };
    const fake = fakeClient(collections);
    const service = new MongoProbeService({}, fake.client);
    const probe = { pattern: "httplog_*" };
    const before = await service.snapshot(probe);

    collections.httplog_api.push({
      _id: newId,
      event: "inserted",
      nested: { when: new Date("2024-01-02T03:04:05Z"), ref: new ObjectId() },
    });
    collections.httplog_worker = [{ _id: new ObjectId(), event: "worker" }];

    expect(await service.captureNew(probe, before)).toEqual({
      httplog_api: [{ event: "inserted", nested: { ref: "<objectId>", when: "<timestamp>" } }],
      httplog_worker: [{ event: "worker" }],
    });
    await service.close();
    expect(fake.counts()).toEqual({ connections: 1, closes: 1 });
  });

  it("uses explicit collections and stable document ordering", async () => {
    const collections = {
      httplog_api: [
        { _id: new ObjectId("000000000000000000000002"), event: "z" },
        { _id: new ObjectId("000000000000000000000001"), event: "a" },
      ],
      httplog_other: [{ _id: new ObjectId(), event: "ignored" }],
    };
    const service = new MongoProbeService({}, fakeClient(collections).client);
    expect(await service.captureNew({ collections: ["httplog_api"] }, {})).toEqual({
      httplog_api: [{ event: "a" }, { event: "z" }],
    });
    await service.close();
  });

  it("rejects collection selection outside httplog and leaves an absent probe empty", async () => {
    const fake = fakeClient({});
    const service = new MongoProbeService({}, fake.client);
    expect(await service.snapshot()).toEqual({});
    expect(await service.captureNew(undefined, {})).toEqual({});
    await expect(service.snapshot({ collections: ["users"] })).rejects.toThrow("httplog_*");
    await expect(service.snapshot({ pattern: "*" })).rejects.toThrow("httplog_*");
    expect(fake.counts().connections).toBe(0);
  });
});
