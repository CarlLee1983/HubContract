# v1 game launch evidence

These six scenarios exercise only `POST /v1/games/launch` against the pinned
Legacy commit in `docker/legacy.commit`, using the synthetic seed. Each scenario
resets the recording environment. The two successful scenarios have one launch
step so that its `launchGame:verifyData` checkpoint is retained without sending
a PG callback. PG callbacks are a separate contract and do not count as launch
evidence. The existing launch-plus-callback scenarios remain separate supporting
evidence.

| Scenario | Actual Legacy HTTP status and body | Observed effects |
| --- | --- | --- |
| `pg-launch-missing-currency` | 422; `message: 幣別必填`, `errors.currency: [幣別必填]` | No change in probed DB rows; no outbound call, matching Redis key, or new `httplog_*` document. |
| `pg-launch-invalid-currency` | 422; `message: 站點不支援此幣別：XYZ`, `errors.currency: [站點不支援此幣別：XYZ]` | Same absence of effects. |
| `pg-launch-invalid-signature` | 422; `message: sign 驗證失敗`, `errors.sign: [sign 驗證失敗]` | Same absence of effects. |
| `pg-launch-unknown-station` | 500; `message: Station not found`, exception `App\Support\Generator\Exceptions\RuntimeException` | Same absence of effects. Legacy emits a file path and stack trace; the fixture masks those fields. |
| `pg-launch-success-v1` | 200; `message: OK`, `data.launchType: html`, synthetic launcher HTML in `data.value` | Creates PG Player and play log, moves PHP 100 from main wallet to PG wallet, records a completed `main2game` remittance; three outbound calls and three `httplog_*` documents. |
| `pg-launch-recall-v1` | 200; same successful response | Starts with PHP 20 in the PG wallet, records completed `game2main` 20 and `main2game` 120 remittances, then has PHP 0 in main and 120 in PG; four outbound calls and four `httplog_*` documents. |

The rejection DB probe compares the synthetic Hub member, PG Players, PHP
wallets, PG play logs, and remittances before and after. Its Redis probe checks
`launchGame:verifyData:*` in DB 1; its Mongo probe checks new documents in all
`httplog_*` collections. Both successful fixtures retain the Redis checkpoint
`launchGame:verifyData:<PG_OPS>` with its platform, player, currency, and
60±5 second TTL. The success path calls PG Player/Create, TransferIn, and
GetLaunchURLHTML; the recall path also calls GetPlayerWallet and TransferOut.
The fixtures contain normalized synthetic values, including masked dynamic
tokens, trace IDs, transfer references, client IPs, and Mongo timestamps.

## Reproduction and comparison

With an isolated `.env` pointing `STATIONHUB_REPO` to a local checkout whose
`composer.lock` matches the pinned commit, run `./scripts/env-up.sh`. Then:

```bash
bun run record scenarios/game --tag v1-only --outDir /tmp/launch-record-a
bun run record scenarios/game --tag v1-only --outDir /tmp/launch-record-b
bun run verify scenarios/game --tag v1-only
HUB_CONTRACT_INTEGRATION=1 bun test tests/game-scenarios.test.ts
```

On 2026-09-27, two independent Legacy record passes each recorded six of six
scenarios with the seeded `PG_SYNTHETIC` game code in all four rejection
requests. All six normalized fixture JSON files compared equal across the two
passes and matched the fixtures here, so no fixture changed. Legacy `verify`
passed six of six. The focused integration command above passed 17/17 tests
(the six v1-only scenarios plus existing PG scenarios). The full offline
`bun test` run passed 185 tests, skipped 182, with zero failures.
For a negative comparison check, a temporary copy of the invalid-signature
fixture changed `layer1_inboundResponse.body.message`; `verify` exited 1 with
`[inbound_response] body.message` and the changed expected value. The checked-in
fixture was unchanged.

The v1 route matrix lists these six scenarios and fixtures as launch evidence,
including validation, signature, and unknown-Station cases.
