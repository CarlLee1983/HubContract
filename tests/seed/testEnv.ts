/**
 * Issue #13 code review：`MASK_HMAC_KEY` 不能寫死在程式碼裡，缺值要大聲失敗
 * （見 `src/seed/maskValue.ts`）。測試需要一個固定、非機密的 key 才能重跑得到
 * 一致的期望值；在這裡統一設定，所有 `tests/seed/*.test.ts` 開頭 import 它。
 */
process.env.MASK_HMAC_KEY ||= "test-only-hmac-key-for-hubcontract-issue-13";
