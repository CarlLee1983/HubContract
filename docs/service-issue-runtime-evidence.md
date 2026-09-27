# Service issue runtime evidence (pinned Legacy)

On 2026-09-27, the isolated synthetic recording environment used Legacy commit
`7bb0661af03383dc7322628e7bc4b5be98acf449`. The adapter submitted
`POST /service/issue/` with category ID `1` for each actor, resetting the
environment between runs. Only diagnostic fields were retained; no cookies,
session IDs, request headers, or raw response bodies were saved.

| Actor | POST result | Diagnostic location | Diagnostic message |
| --- | --- | --- | --- |
| `newVisitor` | HTTP 500, `Error` | `app/Http/Controllers/Service/IssueController.php:55` | `Call to undefined method App\Services\UserService::whenVisitorCreateGuestOrReturnUser()` |
| `existingIssue` | HTTP 500, `Error` | `app/Http/Controllers/Service/IssueController.php:55` | Same message |

The pinned `IssueController::store()` calls that method before
`hasIssueByWho()` and `create()`. The focused integration test resets and records
each actor twice, verifies the fixture, and detects a missing `service_issues`
row. It observed identical before and after DB probes for `service_issues`,
`user_guests`, and `activity_log`, and no new `httplog_*` documents.

To reproduce in an isolated worktree with its own `.env` ports and Compose
project, start `./scripts/env-up.sh`, then run
`HUB_CONTRACT_INTEGRATION=1 bun test tests/service-issue-action.test.ts`.
To inspect the route diagnostic separately from the contract fixture, run this
temporary command from the HubContract root after starting that environment:

```bash
bun -e '
import { LegacyTargetAdapter } from "./src/target/legacyAdapter.ts";
import { resetEnvironment } from "./src/env/reset.ts";
import { config } from "./src/config.ts";
const nativeFetch = globalThis.fetch;
for (const actor of ["newVisitor", "existingIssue"] as const) {
  await resetEnvironment();
  let diagnostic: Record<string, unknown> | undefined;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const response = await nativeFetch(input, init);
    if (init?.method === "POST" && new URL(String(input)).pathname === "/service/issue/") {
      const body = await response.clone().json().catch(() => ({}));
      diagnostic = {
        status: response.status,
        exception: body.exception,
        message: body.message,
        file: body.file,
        line: body.line,
      };
    }
    return response;
  }) as typeof fetch;
  const before = actor === "existingIssue"
    ? { service_issues: [{ issueable_id: 1, issueable_type: "App\\Models\\UserGuest" }],
        user_guests: [{ account: "synthetic_guest_existing_issue" }] }
    : { service_issues: [], user_guests: [] };
  await new LegacyTargetAdapter().executeAction(
    { name: "serviceIssue.create", parameters: { categoryId: 1, actor } }, config.baseUrl, before);
  console.log(JSON.stringify({ actor, diagnostic }));
}
globalThis.fetch = nativeFetch;
'
```

The exact 500 response is runtime evidence for these pinned runs, not a contract
assertion. A CSRF 419 could also produce an unchanged final-state fixture, so
the runtime diagnostic is needed to establish that each actor reached
`IssueController::store()`; rerun this inspection when the pinned Legacy version
or session setup changes. The fixture by itself establishes only the probed
final state.
