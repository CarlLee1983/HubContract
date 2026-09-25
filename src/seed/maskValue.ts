import { createHmac } from "node:crypto";
import type { MaskCategory } from "./maskConfig";

/**
 * Issue #13：決定性合成值產生。
 *
 * 每個原始值先做 HMAC-SHA256（固定 key，非亂數、非時間戳），再依欄位類別轉成
 * 對應形狀的合成值。只要原始值相同，不論它出現在哪張表、哪個欄位，都會算出
 * 同一組合成值——這是「保持關聯」的必要條件：同一個帳號字串在不同表之間如果
 * 代表同一個人（例如 `players.account` 還原出的使用者帳號段落），遮罩後也必須
 * 還是同一個字串。
 *
 * code review：key 不能寫死在這個公開 repo 裡（就算它本身不是「機密」，寫死等於
 * 任何人都能自己算出「某個已知原始值」遮罩後長什麼樣子，削弱遮罩的意義）。
 * 一律從 `MASK_HMAC_KEY` 環境變數讀，缺值時大聲失敗；不提供預設值。
 * 同一份快照要重跑出「同樣」的種子，前提是每次都用同一把 key——這把 key 本身
 * 不需要進版控，本機留著、CI 用 secret 注入即可（見 README「資料安全」）。
 */
function getMaskHmacKey(): string {
  const key = process.env.MASK_HMAC_KEY;
  if (!key) {
    throw new Error(
      "MASK_HMAC_KEY 未設定：遮罩需要一把固定的 HMAC key 才能保證決定性輸出。" +
        "請先 export MASK_HMAC_KEY=<你自訂的固定字串> 再重跑（不要把它提交進 repo）。"
    );
  }
  return key;
}

function digestHex(value: string): string {
  return createHmac("sha256", getMaskHmacKey()).update(value, "utf8").digest("hex");
}

const SYNTHETIC_SURNAMES = ["林", "陳", "張", "黃", "李", "王", "吳", "劉", "蔡", "楊"];
const SYNTHETIC_GIVEN_NAMES = ["synthetic", "測試", "合成", "假名", "範例"];

function maskSecretKey(value: string): string {
  return `synthetic_secret_key_${digestHex(value).slice(0, 48)}`;
}

function maskAccount(value: string): string {
  return `synthetic_account_${digestHex(value).slice(0, 12)}`;
}

function maskName(value: string): string {
  const digest = digestHex(value);
  const surnameIndex = parseInt(digest.slice(0, 4), 16) % SYNTHETIC_SURNAMES.length;
  const givenIndex = parseInt(digest.slice(4, 8), 16) % SYNTHETIC_GIVEN_NAMES.length;
  return `${SYNTHETIC_SURNAMES[surnameIndex]}${SYNTHETIC_GIVEN_NAMES[givenIndex]}${digest.slice(8, 12)}`;
}

function maskEmail(value: string): string {
  return `${digestHex(value).slice(0, 20)}@example.test`;
}

function maskWalletAddress(value: string): string {
  return `synthetic_wallet_${digestHex(value).slice(0, 34)}`;
}

/** 依欄位類別把單一原始值換成決定性的合成值。 */
export function maskValue(category: MaskCategory, value: string): string {
  switch (category) {
    case "secret_key":
      return maskSecretKey(value);
    case "account":
      return maskAccount(value);
    case "name":
      return maskName(value);
    case "email":
      return maskEmail(value);
    case "wallet_address":
      return maskWalletAddress(value);
  }
}
