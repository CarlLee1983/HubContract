import { expect } from "bun:test";
import { compareRedisState } from "../../src/comparator/comparator";
import type { Fixture } from "../../src/schema/scenario";

/** Compare a fresh recording with its golden fixture, allowing only declared Redis TTL drift. */
export function expectRecordedFixture(actual: Fixture, golden: Fixture): void {
  const { layer4_sharedResources: actualShared, ...actualOther } = actual;
  const { layer4_sharedResources: goldenShared, ...goldenOther } = golden;

  expect(actualOther).toEqual(goldenOther);
  expect(actualShared?.mongo).toEqual(goldenShared?.mongo);
  expect(compareRedisState(actualShared?.redis?.before ?? {}, goldenShared?.redis?.before ?? {}, "before")).toEqual([]);
  expect(compareRedisState(actualShared?.redis?.after ?? {}, goldenShared?.redis?.after ?? {}, "after")).toEqual([]);
}
