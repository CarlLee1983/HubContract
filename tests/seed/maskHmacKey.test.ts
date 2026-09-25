import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { maskValue } from "../../src/seed/maskValue";

// 這個檔案故意不 import "./testEnv"：要驗證「沒設 MASK_HMAC_KEY 就大聲失敗」，
// 必須確保這裡看到的環境是「真的沒設」，而不是被其他測試檔案的 side effect 蓋過去。

describe("Issue #13 code review：MASK_HMAC_KEY 缺值必須大聲失敗", () => {
  const original = process.env.MASK_HMAC_KEY;

  beforeEach(() => {
    delete process.env.MASK_HMAC_KEY;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MASK_HMAC_KEY;
    } else {
      process.env.MASK_HMAC_KEY = original;
    }
  });

  it("MASK_HMAC_KEY 未設定時，maskValue 拋出明確錯誤而不是靜默用預設值", () => {
    expect(() => maskValue("account", "anything")).toThrow(/MASK_HMAC_KEY/);
  });
});
