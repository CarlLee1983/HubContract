import "./testEnv";
import { describe, expect, it } from "bun:test";
import { maskJsonValue } from "../../src/seed/jsonValueMasker";
import { STUB_BASE_URL } from "../../src/seed/maskConfig";

describe("Issue #13：maskJsonValue", () => {
  it("字串輸入：合法 JSON 物件，鍵名符合敏感片段的字串值被遮罩", () => {
    const output = JSON.parse(maskJsonValue('{"secret_key":"real_secret","note":"keep this"}'));
    expect(output.secret_key).not.toBe("real_secret");
    expect(output.note).toBe("keep this");
  });

  it("已解析的物件輸入（mysql2 有時會自動解析 JSON 型別欄位）也能正確處理", () => {
    const output = JSON.parse(maskJsonValue({ token: "real_token" }));
    expect(output.token).not.toBe("real_token");
  });

  it("陣列元素繼承父鍵名脈絡", () => {
    const output = JSON.parse(maskJsonValue('{"tokens":["TOK1","TOK2"],"notes":["keep1","keep2"]}'));
    expect(output.tokens).not.toContain("TOK1");
    expect(output.tokens).not.toContain("TOK2");
    expect(output.notes).toEqual(["keep1", "keep2"]);
  });

  it("字串值本身又是一段 JSON 時遞迴處理", () => {
    const inner = JSON.stringify({ account: "real_nested_account" });
    const output = JSON.parse(maskJsonValue(JSON.stringify({ nested: inner })));
    expect(output.nested).not.toContain("real_nested_account");
    expect(JSON.parse(output.nested).account).not.toBe("real_nested_account");
  });

  it("URL 值換成 stub 位址，不管鍵名是什麼", () => {
    const output = JSON.parse(maskJsonValue('{"callback_url":"https://real.example/cb"}'));
    expect(output.callback_url).toBe(STUB_BASE_URL);
  });

  it("鍵名片段比對：sign_type、platform_name 是明確的安全例外，不會被片段 'sign'/'name' 誤判", () => {
    const output = JSON.parse(maskJsonValue('{"sign_type":"HMAC-SHA256","platform_name":"cq9"}'));
    expect(output.sign_type).toBe("HMAC-SHA256");
    expect(output.platform_name).toBe("cq9");
  });

  it("鍵名片段比對：signature 仍會被判定為敏感（不在安全例外清單裡）", () => {
    const output = JSON.parse(maskJsonValue('{"signature":"real_signature_value"}'));
    expect(output.signature).not.toBe("real_signature_value");
  });

  it("擴大後的敏感片段集合涵蓋 phone/mobile/tel/merchant/salt/iv/auth/cert/uid", () => {
    const original = {
      phone: "real_phone",
      mobile: "real_mobile",
      tel: "real_tel",
      merchant_id: "real_merchant",
      salt: "real_salt",
      iv: "real_iv",
      auth_code: "real_auth",
      cert: "real_cert",
      uid: "real_uid",
    };
    const output = JSON.parse(maskJsonValue(original));
    for (const key of Object.keys(original) as (keyof typeof original)[]) {
      expect(output[key]).not.toBe(original[key]);
    }
  });

  it("數字在敏感鍵底下也要遮（型別會變成字串）", () => {
    const output = JSON.parse(maskJsonValue('{"pin_code_key":123456}'));
    expect(output.pin_code_key).not.toBe(123456);
    expect(typeof output.pin_code_key).toBe("string");
  });

  it("非敏感鍵底下的數字、布林、null 原樣保留", () => {
    const output = JSON.parse(maskJsonValue('{"amount":100,"active":true,"extra":null}'));
    expect(output.amount).toBe(100);
    expect(output.active).toBe(true);
    expect(output.extra).toBeNull();
  });

  it("非合法 JSON 字串輸入時 throw", () => {
    expect(() => maskJsonValue("not-json-at-all")).toThrow(/不是合法 JSON/);
  });

  it("同樣輸入重跑，輸出逐位元組相同（決定性）", () => {
    const input = '{"secret_key":"real_secret","nested":"{\\"token\\":\\"TOK\\"}"}';
    expect(maskJsonValue(input)).toBe(maskJsonValue(input));
  });
});
