import { createHmac } from "node:crypto";
import type { MaskCategory } from "./maskConfig";

/**
 * Issue #13：決定性合成值產生。
 *
 * 每個原始值先做 HMAC-SHA256（固定 salt，非亂數、非時間戳），再依欄位類別轉成
 * 對應形狀的合成值。只要原始值相同，不論它出現在哪張表、哪個欄位，都會算出
 * 同一組合成值——這是「保持關聯」的必要條件：同一支手機、同一個帳號在不同
 * 表之間如果代表同一個人，遮罩後也必須還是同一個字串。
 *
 * salt 只是為了讓輸出不是原值的裸雜湊、不是拿來當機密使用，寫死在程式碼裡即可。
 */
const MASK_SALT = "hubcontract/issue-13/mask-seed/v1";

function digestHex(value: string): string {
  return createHmac("sha256", MASK_SALT).update(value, "utf8").digest("hex");
}

const SYNTHETIC_SURNAMES = ["林", "陳", "張", "黃", "李", "王", "吳", "劉", "蔡", "楊"];
const SYNTHETIC_GIVEN_NAMES = ["synthetic", "測試", "合成", "假名", "範例"];

function maskSecretKey(value: string): string {
  return `synthetic_secret_key_${digestHex(value).slice(0, 48)}`;
}

function maskAccount(value: string): string {
  return `synthetic_account_${digestHex(value).slice(0, 12)}`;
}

function maskPhone(value: string): string {
  const digest = digestHex(value);
  // 台灣手機號碼固定 09 開頭 + 8 碼，取雜湊值的十六進位字元逐一 mod 10 轉成數字。
  let digits = "";
  for (let i = 0; digits.length < 8; i++) {
    digits += (parseInt(digest[i % digest.length], 16) % 10).toString();
  }
  return `09${digits}`;
}

function maskName(value: string): string {
  const digest = digestHex(value);
  const surnameIndex = parseInt(digest.slice(0, 4), 16) % SYNTHETIC_SURNAMES.length;
  const givenIndex = parseInt(digest.slice(4, 8), 16) % SYNTHETIC_GIVEN_NAMES.length;
  return `${SYNTHETIC_SURNAMES[surnameIndex]}${SYNTHETIC_GIVEN_NAMES[givenIndex]}${digest.slice(8, 12)}`;
}

/** 依欄位類別把單一原始值換成決定性的合成值。 */
export function maskValue(category: MaskCategory, value: string): string {
  switch (category) {
    case "secret_key":
      return maskSecretKey(value);
    case "account":
      return maskAccount(value);
    case "phone":
      return maskPhone(value);
    case "name":
      return maskName(value);
  }
}
