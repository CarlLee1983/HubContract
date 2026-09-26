# MCP contract coverage

Issue [HubRefactoring#19](https://github.com/CarlLee1983/HubRefactoring/issues/19) covers the nine `/mcp/*` routes in the Legacy API inventory. Every scenario is recorded against the pinned Legacy target and verified against its committed fixture.

| Route | Contract effects |
| --- | --- |
| `GET /mcp/health` | Response, secret and IP rejection |
| `GET /mcp/platform-maintenance` | Response and current Redis-backed maintenance items |
| `POST /mcp/platform-maintenance/{platform}` | Response and Redis maintenance flag |
| `DELETE /mcp/platform-maintenance/{platform}` | Response and Redis flag removal |
| `GET /mcp/platform-maintenance-schedule` | Response and schedule list |
| `POST /mcp/platform-maintenance-schedule` | Response and schedule DB insertion |
| `POST /mcp/platform-maintenance-schedule/run` | Response and reconciled Redis maintenance flag |
| `PATCH /mcp/platform-maintenance-schedule/{schedule}` | Response and schedule DB update |
| `DELETE /mcp/platform-maintenance-schedule/{schedule}` | Response and schedule soft deletion |

The suite includes a wrong MCP secret and a non-allowlisted IP. A schedule run must prove its Redis effect with `redisProbe`, while schedule writes compare DB state. The existing set, clear, and unauthorized fixtures remain part of this coverage.
