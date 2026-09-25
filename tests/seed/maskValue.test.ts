import { describe, expect, it } from "bun:test";
import { maskValue } from "../../src/seed/maskValue";

describe("Issue #13：maskValue 決定性合成值", () => {
  it("同一類別、同一原值，重複呼叫永遠得到相同結果", () => {
    const a = maskValue("account", "real_user_account_123");
    const b = maskValue("account", "real_user_account_123");
    expect(a).toBe(b);
  });

  it("同一原值即使類別不同，也不會等於原值本身", () => {
    for (const category of ["secret_key", "account", "phone", "name"] as const) {
      const masked = maskValue(category, "0912345678");
      expect(masked).not.toBe("0912345678");
    }
  });

  it("不同原值在同一類別下（極高機率）得到不同合成值", () => {
    const a = maskValue("account", "alice");
    const b = maskValue("account", "bob");
    expect(a).not.toBe(b);
  });

  it("secret_key 遮罩後仍是字串，且不含原始 secret_key", () => {
    const original = "prod_secret_key_super_sensitive_0987654321";
    const masked = maskValue("secret_key", original);
    expect(masked).not.toContain(original);
    expect(masked.startsWith("synthetic_secret_key_")).toBe(true);
  });

  it("phone 遮罩後是 09 開頭的 10 碼數字字串", () => {
    const masked = maskValue("phone", "0987654321");
    expect(masked).toMatch(/^09\d{8}$/);
    expect(masked).not.toBe("0987654321");
  });

  it("name 遮罩後是非空字串，且不等於原始姓名", () => {
    const masked = maskValue("name", "王大明");
    expect(masked.length).toBeGreaterThan(0);
    expect(masked).not.toBe("王大明");
    expect(masked).not.toContain("王大明");
  });
});
