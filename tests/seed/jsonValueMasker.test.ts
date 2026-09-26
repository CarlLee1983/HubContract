import "./testEnv";
import { describe, expect, it } from "bun:test";
import { maskJsonValue } from "../../src/seed/jsonValueMasker";
import { STUB_BASE_URL } from "../../src/seed/maskConfig";

/**
 * Issue #13（第四輪 code review 決議）：JSON 遮罩改成白名單——每個呼叫端自己
 * 決定「這個 JSON 欄位裡，哪些鍵可以保留原樣／哪些鍵是 URL 要換成 stub」，
 * 沒有明確列出來的鍵，不管是字串還是數字，一律遮罩。不再用「鍵名像不像敏感
 * 字」的黑名單判斷（那條路連續兩輪 review 都抓到漏網：`appkey`/`md5key`/
 * `mch_id`/`pin` 這類真正的憑證/個資鍵名沒被黑名單抓到而外洩，`sign_type`/
 * `platform_name` 這類無害欄位又被誤判）。
 */
describe("Issue #13：maskJsonValue（白名單）", () => {
  it("沒有白名單時，字串值一律遮罩（安全的預設值）", () => {
    const output = JSON.parse(maskJsonValue('{"appkey":"real_appkey","note":"real_note"}'));
    expect(output.appkey).not.toBe("real_appkey");
    expect(output.note).not.toBe("real_note");
  });

  it("鍵名在白名單裡標記 keep 時，值原樣保留", () => {
    const output = JSON.parse(maskJsonValue('{"lang":"en","secret":"real_secret"}', { lang: "keep" }));
    expect(output.lang).toBe("en");
    expect(output.secret).not.toBe("real_secret");
  });

  it("鍵名在白名單裡標記 url 時，值換成 stub 位址", () => {
    const output = JSON.parse(maskJsonValue('{"api_url":"https://real-provider.example/api"}', { api_url: "url" }));
    expect(output.api_url).toBe(STUB_BASE_URL);
  });

  it("白名單只認頂層鍵名，巢狀同名鍵不會被誤判成白名單鍵", () => {
    const output = JSON.parse(
      maskJsonValue('{"lang":"en","nested":{"lang":"real_nested_secret"}}', { lang: "keep" })
    );
    expect(output.lang).toBe("en");
    expect(output.nested.lang).not.toBe("real_nested_secret");
  });

  it("陣列元素繼承父鍵名脈絡：白名單鍵的陣列原樣保留，其餘遮罩", () => {
    const output = JSON.parse(
      maskJsonValue('{"regions":["tw","vn"],"tokens":["REAL_TOK1","REAL_TOK2"]}', { regions: "keep" })
    );
    expect(output.regions).toEqual(["tw", "vn"]);
    expect(output.tokens).not.toContain("REAL_TOK1");
    expect(output.tokens).not.toContain("REAL_TOK2");
  });

  it("字串值本身又是一段 JSON 時遞迴處理，不因為外層鍵在白名單裡就整段信任", () => {
    const inner = JSON.stringify({ account: "real_nested_account" });
    const output = JSON.parse(maskJsonValue(JSON.stringify({ trusted: inner }), { trusted: "keep" }));
    expect(output.trusted).not.toContain("real_nested_account");
  });

  it("已解析的物件輸入（mysql2 有時會自動解析 JSON 型別欄位）也能正確處理", () => {
    const output = JSON.parse(maskJsonValue({ token: "real_token" }));
    expect(output.token).not.toBe("real_token");
  });

  it("數字在白名單裡才保留，否則遮罩後型別仍是數字（合成數字）", () => {
    const output = JSON.parse(maskJsonValue('{"smsCost":5,"pin":123456}', { smsCost: "keep" }));
    expect(output.smsCost).toBe(5);
    expect(output.pin).not.toBe(123456);
    expect(typeof output.pin).toBe("number");
  });

  it("布林值與 null 一律原樣保留（不管在不在白名單裡）", () => {
    const output = JSON.parse(maskJsonValue('{"active":true,"extra":null}'));
    expect(output.active).toBe(true);
    expect(output.extra).toBeNull();
  });

  it("第五輪 code review 決議：值本身是 http(s) URL 時，不管鍵名有沒有在白名單裡，一律換成 stub（不會被遮成不可用的亂碼）", () => {
    const output = JSON.parse(
      maskJsonValue(
        '{"backoffice_api_url":"https://real-backoffice.example/api","query_url":"http://real-query.example","secret_key":"real_secret_not_a_url"}'
      )
    );
    expect(output.backoffice_api_url).toBe(STUB_BASE_URL);
    expect(output.query_url).toBe(STUB_BASE_URL);
    // 非 URL 形狀的值，沒被白名單列到還是照舊遮罩，不會因為新規則而放寬。
    expect(output.secret_key).not.toBe("real_secret_not_a_url");
  });

  it("鍵名在白名單裡標記 keep，但值本身剛好是 URL 時，還是換成 stub（URL 判斷優先於 keep）", () => {
    const output = JSON.parse(maskJsonValue('{"lang":"https://real-unexpected-url.example"}', { lang: "keep" }));
    expect(output.lang).toBe(STUB_BASE_URL);
  });

  it("非合法 JSON 字串輸入時 throw", () => {
    expect(() => maskJsonValue("not-json-at-all")).toThrow(/不是合法 JSON/);
  });

  it("同樣輸入、同樣白名單重跑，輸出逐位元組相同（決定性）", () => {
    const input = '{"secret_key":"real_secret","nested":"{\\"token\\":\\"TOK\\"}"}';
    expect(maskJsonValue(input)).toBe(maskJsonValue(input));
  });

  describe("regression：第四輪 code review 探針證實會外洩的鍵，在沒有白名單時全部被遮", () => {
    it("payments.api_tokens 形狀（md5key/apikey/appsecret/privatekey/mch_id/appid/partner/client_id）", () => {
      const output = JSON.parse(
        maskJsonValue(
          '{"md5key":"LEAK_md5key","apikey":"LEAK_apikey","appsecret":"LEAK_appsecret","privatekey":"LEAK_pk","mch_id":"LEAK_mchid","appid":"LEAK_appid","partner":"LEAK_partner","client_id":"LEAK_client"}'
        )
      );
      for (const value of Object.values(output) as string[]) {
        expect(value).not.toMatch(/^LEAK_/);
      }
    });

    it("聯絡方式/身分欄位（line/telegram/whatsapp/mail/username/nickname/realname）與數字型 pin/password", () => {
      const output = JSON.parse(
        maskJsonValue(
          '{"line":"LEAK_line","telegram":"LEAK_tg","whatsapp":"LEAK_wa","mail":"LEAK_mail","username":"LEAK_username","nickname":"LEAK_nick","realname":"LEAK_realname","pin":123456,"password":987654}'
        )
      );
      expect(output.line).not.toBe("LEAK_line");
      expect(output.telegram).not.toBe("LEAK_tg");
      expect(output.whatsapp).not.toBe("LEAK_wa");
      expect(output.mail).not.toBe("LEAK_mail");
      expect(output.username).not.toBe("LEAK_username");
      expect(output.nickname).not.toBe("LEAK_nick");
      expect(output.realname).not.toBe("LEAK_realname");
      expect(output.pin).not.toBe(123456);
      expect(output.password).not.toBe(987654);
    });

    it("巢狀聯絡資訊（site_contact 形狀：email/phone_number/mobileNo）", () => {
      const output = JSON.parse(
        maskJsonValue('{"site_contact":{"email":"LEAK@x.tw","phone_number":"0912000111","mobileNo":"0912000222"}}')
      );
      expect(output.site_contact.email).not.toBe("LEAK@x.tw");
      expect(output.site_contact.phone_number).not.toBe("0912000111");
      expect(output.site_contact.mobileNo).not.toBe("0912000222");
    });

    it("頂層純字串（沒有物件/陣列包住）一律當機密處理", () => {
      const output = JSON.parse(maskJsonValue('"just-a-top-level-secret"'));
      expect(output).not.toBe("just-a-top-level-secret");
    });

    it("看起來像網域/端點但沒有白名單的鍵（endpoint/domain/host/ws）一律遮罩", () => {
      const output = JSON.parse(
        maskJsonValue('{"endpoint":"api.real-provider.com/v1","domain":"real-provider.com","ws":"wss://real.ws"}')
      );
      expect(output.endpoint).not.toContain("real-provider.com");
      expect(output.domain).not.toBe("real-provider.com");
      expect(output.ws).not.toContain("real.ws");
    });
  });
});
