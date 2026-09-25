import { describe, expect, it, afterAll } from "bun:test";
import { MariaDbProbe } from "../src/probe/dbProbe";

describe("MariaDbProbe", () => {
  const probe = new MariaDbProbe();

  afterAll(async () => {
    await probe.close();
  });

  it("should capture state of deposit_records by trade_no", async () => {
    const state = await probe.capture({
      queries: [
        {
          name: "deposit_record",
          sql: "SELECT no, trade_no, amount, status FROM deposit_records WHERE trade_no = ? AND deleted_at IS NULL",
          params: ["TRADE_DEP_001"],
        },
      ],
    });

    expect(state.deposit_record).toBeDefined();
    expect(state.deposit_record.length).toBe(1);
    expect(state.deposit_record[0].no).toBe("DE_SYNTHETIC_001");
    expect(state.deposit_record[0].trade_no).toBe("TRADE_DEP_001");
    expect(state.deposit_record[0].status).toBe("completed");
    expect(Number(state.deposit_record[0].amount)).toBe(100);
  });
});
