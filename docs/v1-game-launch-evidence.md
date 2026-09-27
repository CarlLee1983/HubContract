# v1 game launch evidence

This evidence is limited to `POST /v1/games/launch`. PG callback requests are a
separate contract and do not count as launch evidence.

| Outcome | Legacy observation |
| --- | --- |
| Invalid request or currency | To be recorded |
| Invalid station signature | To be recorded |
| Unknown `station_code` | To be recorded |
| Successful launch | To be recorded without a callback step |
| Recall and main-wallet injection | To be recorded without a callback step |

Each rejection fixture will retain the observed HTTP status and body, plus the
applicable DB, outbound, Redis, and Mongo observations. Successful launch
fixtures will retain the `launchGame:verifyData` Redis observation. Existing
launch-plus-callback scenarios remain supporting evidence only.
