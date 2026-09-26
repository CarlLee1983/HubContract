import { expect, it } from "bun:test";
import { selectTarget } from "../src/target/selectTarget";
import { LegacyTargetAdapter } from "../src/target/legacyAdapter";

const localUrl = "http://localhost:8084";

it("does not select Legacy for an alternate HUBCONTRACT_BASE_URL without --target", () => {
  const selected = selectTarget({ baseUrl: "http://stationhub-next:3000", legacyPort: 8084 });
  expect(selected.targetUrl).toBe("http://stationhub-next:3000");
  expect(selected.targetAdapter).toBeUndefined();
});

it("does not select Legacy for an alternate --target", () => {
  const selected = selectTarget({ baseUrl: localUrl, target: "http://stationhub-next:3000", legacyPort: 8084 });
  expect(selected.targetUrl).toBe("http://stationhub-next:3000");
  expect(selected.targetAdapter).toBeUndefined();
});

it("selects Legacy only for the local default target or an explicit local adapter", () => {
  expect(selectTarget({ baseUrl: localUrl, legacyPort: 8084 }).targetAdapter)
    .toBeInstanceOf(LegacyTargetAdapter);
  expect(selectTarget({ baseUrl: localUrl, target: localUrl, legacyPort: 8084 }).targetAdapter)
    .toBeUndefined();
  expect(selectTarget({ baseUrl: localUrl, adapter: "legacy", legacyPort: 8084 }).targetAdapter)
    .toBeInstanceOf(LegacyTargetAdapter);
});

it("rejects a Legacy adapter paired with a nonlocal target", () => {
  expect(() => selectTarget({ baseUrl: "http://stationhub-next:3000", adapter: "legacy", legacyPort: 8084 }))
    .toThrow("Legacy adapter requires the local recording target");
  expect(() => selectTarget({ baseUrl: localUrl, target: "http://localhost:8080", adapter: "legacy", legacyPort: 8084 }))
    .toThrow("Legacy adapter requires the local recording target");
});

it("rejects unknown adapter names", () => {
  expect(() => selectTarget({ baseUrl: localUrl, adapter: "next", legacyPort: 8084 }))
    .toThrow("Unknown target adapter");
});
