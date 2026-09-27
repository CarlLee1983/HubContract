# Original Hub API v1 Legacy replay acceptance

On 2026-09-27, an isolated `HUB_SEED=synthetic` recording environment ran the
Legacy source pinned by `docker/legacy.commit`:
`7bb0661af03383dc7322628e7bc4b5be98acf449`. Its Composer lock matched
the mounted vendor tree. The route matrix contained 20 v1 route templates and
147 scenario mappings. `scripts/prepare-v1-replay.ts` selected 141 v1-only
scenarios with committed fixtures. The six launch-plus-callback scenarios were
excluded because they also execute `/callback/*`; the isolated success and
recall scenarios from #51 independently cover the v1 launch step.

| Run | Result |
| --- | --- |
| Legacy `verify` against committed fixtures, before recording | 141 passed, 0 failed, 0 errored, 0 skipped |
| Legacy `record` A after a synthetic reset | 141 recorded, 0 errored |
| Legacy `record` B after a second independent synthetic reset | 141 recorded, 0 errored |
| Byte comparison of A and B | 141 fixture files identical; no differences |
| Legacy `verify` after fixture corrections | 141 passed, 0 failed, 0 errored, 0 skipped |
| Offline `bun test` after corrections | 216 passed, 0 failed, 182 integration tests skipped |
| `bunx tsc --noEmit` and `git diff --check` | Passed |

Both recording directories had the same SHA-256 digest over sorted relative
fixture names and file bytes:
`8a46f788e6a93a35347e7fbda46887f269d86a360f83f18832757dc70482e6ec`.
The runner also resets MariaDB, Redis, Mongo, and the provider stub before
each scenario. Both `record` runs wrote outside the repo; committed fixtures
were verified before any fixture was changed.
All 141 newly recorded JSON fixtures are semantically equal to the committed
fixtures after the corrections.

## Reproduction

Use an isolated `.env` with distinct Compose ports and subnet, a matching
`STATIONHUB_REPO` vendor tree, and `HUB_SEED=synthetic`. From HubContract:

```bash
./scripts/env-up.sh
selected=$(mktemp -d)
record_a=$(mktemp -d)
record_b=$(mktemp -d)
bun run scripts/prepare-v1-replay.ts "$selected"
./scripts/env-reset.sh
bun run verify "$selected" --adapter legacy --report-json /tmp/v1-verify.json
./scripts/env-reset.sh
bun run record "$selected" --adapter legacy --outDir "$record_a" --report-json /tmp/v1-record-a.json
./scripts/env-reset.sh
bun run record "$selected" --adapter legacy --outDir "$record_b" --report-json /tmp/v1-record-b.json
diff -qr "$record_a" "$record_b"
```

The JSON reports identify every selected scenario and its status; `recorded`
is distinct from `passed`. The selector fails on missing or duplicate
matrix-listed scenario IDs and reports the six excluded composite IDs.

## Differences resolved

- An initial 141-scenario `verify` returned 140 passed and one mismatch at
  `pg-launch-provider-failure` → `shared_resources` →
  `after.mongo.newDocuments.httplog_launch_game.0.context.header.Content-Length.0`
  (`182` expected, `183` actual). The synthetic Docker gateway yielded
  `client_ip=172.29.54.1`; Legacy embeds that IP in the PG form body. The
  nine PG launch scenarios that send this provider request now supply the
  synthetic forwarded IP `192.0.2.10`, which the pinned Legacy service trusts.
  The body length is then 182 bytes across isolated subnets. The Mongo header
  remains an exact assertion; the provider request and logged request remain
  compared. Two v1 launch fixtures were re-recorded with this fixed input.
- Comparing the first full recording with committed fixtures exposed 18 older
  v1 fixtures with no outbound layer: nine `check-transaction`, four `sms-index`,
  and five `sms-update` scenarios. Their Legacy recordings contained
  `layer3_outboundCalls: { "calls": [] }` and no other semantic difference.
  Those recorded empty layers and their matrix `outbound` entries are now
  committed. The v1 fixture and matrix checks reject a future omission even
  when both previously agreed on the missing layer.

All runs used synthetic station, member, provider, and credential values.
Mongo timestamps, dynamic PG tokens, trace IDs, transfer references, and
client IPs remain normalized in fixtures. A scan of committed fixtures and
record A found no literal Docker subnet IP, pinned forwarded IP, local workspace
path, or mounted vendor path. The run reports and raw recording directories
remain local, outside version control.
