# MCP contract coverage

Issue [HubRefactoring#19](https://github.com/CarlLee1983/HubRefactoring/issues/19) covers the nine `/mcp/*` routes in the Legacy API inventory. Every scenario is recorded against the pinned Legacy target and verified against its committed fixture.

| Route | Contract effects |
| --- | --- |
| `GET /mcp/health` | Response |
| `GET /mcp/platform-maintenance` | Response and current Redis-backed maintenance items |
| `POST /mcp/platform-maintenance/{platform}` | Response and Redis maintenance flag |
| `DELETE /mcp/platform-maintenance/{platform}` | Response and Redis flag removal |
| `GET /mcp/platform-maintenance-schedule` | Response and schedule list |
| `POST /mcp/platform-maintenance-schedule` | Response and schedule DB insertion |
| `POST /mcp/platform-maintenance-schedule/run` | Response and both Redis maintenance and recurring marker keys |
| `PATCH /mcp/platform-maintenance-schedule/{schedule}` | Response and schedule DB update, including Legacy's partial write on error |
| `DELETE /mcp/platform-maintenance-schedule/{schedule}` | Response and schedule soft deletion |

The 12 scenarios cover all nine routes. The maintenance clear route also has separate missing-secret, wrong-secret, and non-allowlisted-IP scenarios. The schedule run uses a fixed Monday time and a seeded rule, then probes both the maintenance flag and recurring marker in Redis. Schedule writes compare database state and activity logs.

Legacy's schedule toggle returns HTTP 503 after persisting `enabled=0`, because its activity-log hook throws. The fixture records the response, changed row, and absent activity log together. The delete route returns 200 and records a deletion log.
