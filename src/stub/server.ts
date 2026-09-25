import http from "node:http";
import { StubScriptSchema } from "../schema/scenario";
import { StubStore } from "./store";

/**
 * Provider stub transport (Issue #8). Deliberately node:http, not Bun.serve —
 * Bun.serve (1.3.10) drops the body of a GET request, which some platforms
 * (e.g. Ws168) rely on sending. Under Bun, node:http reads GET bodies fine.
 *
 * Exposes two surfaces on the same port:
 *  - `/__stub/*`: control API for the runner (load script, read back
 *    recorded requests, reset state).
 *  - everything else: the actual provider endpoint the target under test
 *    (e.g. Legacy) calls out to.
 */
export function createStubServer(store: StubStore = new StubStore()): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://stub.local");
      const raw = await readBody(req);
      const contentType = String(req.headers["content-type"] ?? "");

      if (req.method === "PUT" && url.pathname === "/__stub/script") {
        const parsed = StubScriptSchema.safeParse(JSON.parse(raw.toString("utf-8") || "{}"));
        if (!parsed.success) {
          sendJson(res, 400, { error: "invalid stub script", issues: parsed.error.issues });
          return;
        }
        store.loadScript(parsed.data);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && url.pathname === "/__stub/reset") {
        store.reset();
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" && url.pathname === "/__stub/requests") {
        sendJson(res, 200, store.getRequests());
        return;
      }

      if (req.method === "GET" && url.pathname === "/__stub/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers[key] = value;
      }

      const query: Record<string, string> = {};
      for (const [key, value] of url.searchParams.entries()) {
        query[key] = value;
      }

      const result = store.handle({
        method: req.method ?? "GET",
        path: url.pathname,
        query,
        headers,
        body: parseBody(raw, contentType),
      });

      if (result.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, result.delayMs));
      }

      sendJson(res, result.status, result.body, result.headers);
    } catch (err) {
      // Code review Standards #8: a control-API validation error (handled
      // above via safeParse) is a 400 with the caller's mistake spelled out;
      // anything else reaching here is unexpected — log it with its cause
      // instead of only surfacing a flattened message string to the client.
      console.error("[hub-contract stub] unhandled error", err);
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: `hub-contract stub: ${message}` });
    }
  });
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseBody(raw: Buffer, contentType: string): unknown {
  if (raw.length === 0) return undefined;
  const text = raw.toString("utf-8");

  if (contentType.includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  if (contentType.includes("x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text));
  }

  return text;
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): void {
  const payload = JSON.stringify(body ?? {});
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(payload);
}

// Compose entrypoint (docker-compose.yml's mock-provider service). Guarded so
// this file can also be imported for in-process unit tests without binding a
// port (see tests/stub-store.test.ts, tests/stub-server.test.ts).
if (import.meta.main) {
  const port = Number(process.env.STUB_PORT ?? 8081);
  createStubServer().listen(port, () => {
    console.log(`[hub-contract stub] listening on :${port}`);
  });
}
