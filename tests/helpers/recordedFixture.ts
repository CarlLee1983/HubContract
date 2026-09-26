import { expect } from "bun:test";
import { compareRedisState } from "../../src/comparator/comparator";
import type { Fixture } from "../../src/schema/scenario";

/** Compare a fresh recording with its golden fixture, allowing only declared Redis TTL drift. */
export function expectRecordedFixture(actual: Fixture, golden: Fixture): void {
  const { layer4_sharedResources: actualShared, redisCheckpoints: actualCheckpoints, ...actualOther } = actual;
  const { layer4_sharedResources: goldenShared, redisCheckpoints: goldenCheckpoints, ...goldenOther } = golden;

  expect(actualOther).toEqual(goldenOther);
  expect(Object.keys(actualCheckpoints ?? {}).sort()).toEqual(Object.keys(goldenCheckpoints ?? {}).sort());
  for (const step of Object.keys(goldenCheckpoints ?? {})) {
    expect(compareRedisState(actualCheckpoints?.[step] ?? {}, goldenCheckpoints?.[step] ?? {}, `checkpoint:${step}`)).toEqual([]);
  }
  expect(actualShared?.mongo).toEqual(goldenShared?.mongo);
  expect(compareRedisState(actualShared?.redis?.before ?? {}, goldenShared?.redis?.before ?? {}, "before")).toEqual([]);
  expect(compareRedisState(actualShared?.redis?.after ?? {}, goldenShared?.redis?.after ?? {}, "after")).toEqual([]);
}
