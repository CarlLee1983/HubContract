import path from "node:path";
import { config } from "../config";

const projectRoot = path.join(import.meta.dir, "../..");

/** Keep the recording-only Gateway client alive while Legacy performs join. */
export async function getGatewayClientId(): Promise<string> {
  const port = Number(process.env.GATEWAY_WEBSOCKET_PORT || 6001);
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`wss://localhost:${port}`, { tls: { rejectUnauthorized: false } });
    const deadline = setTimeout(() => {
      socket.close();
      reject(new Error("GatewayWorker did not supply a client ID"));
    }, 5000);
    socket.onerror = () => {
      clearTimeout(deadline);
      socket.close();
      reject(new Error("Could not connect to recording GatewayWorker"));
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string; client_id?: string };
        if (message.type !== "connect" || !/^[0-9a-f]{20}$/.test(message.client_id ?? "")) {
          throw new Error("GatewayWorker returned an invalid client ID");
        }
        clearTimeout(deadline);
        const closeLater = setTimeout(() => socket.close(), 30000);
        closeLater.unref();
        resolve(message.client_id!);
      } catch (error) {
        clearTimeout(deadline);
        socket.close();
        reject(error);
      }
    };
  });
}

/** Prepare the pinned Legacy `Request::guest()` path for a seeded guest issue. */
export async function prepareServiceSession(issueId: number): Promise<{ cookie: string; xsrfToken: string }> {
  const response = await fetch(new URL("/service/issue/", config.baseUrl), {
    headers: { Host: "cmghub.test" },
    redirect: "manual",
  });
  if (response.status !== 200) throw new Error(`Legacy service session page returned HTTP ${response.status}`);
  const cookies = response.headers.getSetCookie().map((header) => header.split(";", 1)[0]);
  const session = cookies.find((cookie) => cookie.startsWith("stationhublegacy_session="));
  const xsrf = cookies.find((cookie) => cookie.startsWith("XSRF-TOKEN="));
  if (!session || !xsrf) throw new Error("Legacy service page did not provide session and CSRF cookies");
  const encryptedSession = session.slice(session.indexOf("=") + 1);
  const vendorDir = path.resolve(projectRoot, process.env.STATIONHUB_REPO || "../StationHub", "vendor");
  const proc = Bun.spawn([
    "docker", "compose", "exec", "-T", "legacy-app", "php", "/opt/hubcontract/prepare-guest-session.php",
    String(issueId), encryptedSession,
  ], {
    cwd: projectRoot,
    env: { ...process.env, STATIONHUB_VENDOR_DIR: vendorDir },
    stdout: "pipe", stderr: "pipe", timeout: 10000,
  });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text(),
  ]);
  if (code !== 0 || stdout.trim() !== "ready") {
    throw new Error(`Legacy guest session preparation failed: ${stderr.trim() || stdout.trim()}`);
  }
  return { cookie: cookies.join("; "), xsrfToken: decodeURIComponent(xsrf.slice(xsrf.indexOf("=") + 1)) };
}
