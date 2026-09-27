import type { ScenarioAction } from "../schema/scenario";
import mysql from "mysql2/promise";
import { config } from "../config";
import type { DbConfig } from "../probe/dbProbe";

interface GameTypeMapping {
  platform_id: number;
  game_type_id: number;
  active: number;
}

export interface LegacyAdminOptions {
  host?: string;
  account?: string;
  password?: string;
  readMappings?: (platformId: number, dbConfig?: DbConfig) => Promise<GameTypeMapping[]>;
}

/** Translates neutral internal actions into the pinned Legacy admin flow. */
export class LegacyActionAdapter {
  private readonly host: string;
  private readonly account: string;
  private readonly password: string;
  private readonly readMappings: (platformId: number, dbConfig?: DbConfig) => Promise<GameTypeMapping[]>;

  constructor(options: LegacyAdminOptions = {}) {
    this.host = options.host ?? "cmghubadmin.test";
    this.account = options.account ?? "super";
    // Matches the public Laravel demo bcrypt hash in synthetic-seed.sql.
    this.password = options.password ?? "password";
    this.readMappings = options.readMappings ?? readLegacyMappings;
  }

  async executeAction(action: ScenarioAction, baseUrl: string, dbBefore: Readonly<Record<string, unknown>>, dbConfig?: DbConfig): Promise<void> {
    const localLegacyUrl = `http://localhost:${config.legacyPort}`;
    if (baseUrl.replace(/\/+$/, "") !== localLegacyUrl) {
      throw new Error(`Legacy action requires the local recording target ${localLegacyUrl}; got ${baseUrl}`);
    }
    if (action.name === "serviceIssue.create") {
      await executeServiceIssue(action.parameters, baseUrl, dbBefore);
      return;
    }
    if (action.name !== "platformGameType.setActive") {
      throw new Error(`Legacy target does not support action ${action.name}`);
    }

    const platforms = dbBefore.platforms;
    if (!Array.isArray(platforms) || platforms.length !== 1 ||
      platforms[0]?.id !== action.parameters.platformId ||
      platforms[0]?.active !== Number(action.parameters.platformActive)) {
      throw new Error("Action requires a matching platforms.active before probe");
    }

    // The Legacy endpoint calls Eloquent sync(), which detaches every omitted
    // association. Its full before snapshot is required to preserve siblings.
    const mappingRows = dbBefore.platform_game_type_map;
    const completeRows = await this.readMappings(action.parameters.platformId, dbConfig);
    if (!Array.isArray(mappingRows) || mappingRows.length === 0 ||
      mappingRows.some((row) => !isGameTypeMapping(row, action.parameters.platformId)) ||
      !completeRows.every((row) => isGameTypeMapping(row, action.parameters.platformId)) ||
      !mappingRows.some((row) => row.game_type_id === action.parameters.gameTypeId) ||
      !sameMappings(mappingRows, completeRows)) {
      throw new Error("Action requires a complete platform_game_type_map before probe containing the target mapping");
    }
    const gameTypes = mappingRows.map((row) => ({
      id: row.game_type_id,
      active: String(row.game_type_id === action.parameters.gameTypeId ? action.parameters.active : row.active === 1),
    }));

    const { cookies, request } = legacySessionRequest(baseUrl, this.host, "text/html,application/xhtml+xml");

    const loginPage = await request("/login");
    if (loginPage.status !== 200) {
      throw new Error(`Legacy admin login page failed with HTTP ${loginPage.status}`);
    }
    const xsrf = cookies.get("XSRF-TOKEN");
    if (!xsrf) throw new Error("Legacy admin login did not provide a CSRF cookie");

    const formHeaders = {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-XSRF-TOKEN": decodeURIComponent(xsrf),
    };
    const login = await request("/login", {
      method: "POST",
      headers: formHeaders,
      body: new URLSearchParams({ account: this.account, password: this.password }).toString(),
    });
    if (!isSuccessfulRedirect(login) || pointsToLogin(login.headers.get("location"))) {
      throw new Error(`Legacy admin login failed with HTTP ${login.status}`);
    }

    const actionResponse = await request("/games/platform-and-gametype", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-XSRF-TOKEN": decodeURIComponent(cookies.get("XSRF-TOKEN") ?? xsrf),
        Referer: new URL("/games/platform-and-gametype", `${baseUrl.replace(/\/$/, "")}/`).toString(),
      },
      body: JSON.stringify([{
        id: action.parameters.platformId,
        active: { value: action.parameters.platformActive },
        gameTypes,
      }]),
    });
    if (!isSuccessfulRedirect(actionResponse) || pointsToLogin(actionResponse.headers.get("location"))) {
      throw new Error(`Legacy internal action failed with HTTP ${actionResponse.status}`);
    }
  }
}

async function executeServiceIssue(
  parameters: { categoryId: number; actor: "newVisitor" | "existingIssue" },
  baseUrl: string,
  dbBefore: Readonly<Record<string, unknown>>,
): Promise<void> {
  const issues = dbBefore.service_issues;
  const guests = dbBefore.user_guests;
  if (!Array.isArray(issues) || !Array.isArray(guests) ||
    (parameters.actor === "existingIssue" &&
      (!guests.some((row) => row?.account === "synthetic_guest_existing_issue") ||
       !issues.some((row) => row?.issueable_id === 1 && row?.issueable_type === "App\\Models\\UserGuest")))) {
    throw new Error("Service issue action requires service_issues and user_guests before probes with the matching existing guest issue");
  }

  const { cookies, request } = legacySessionRequest(baseUrl, "cmghub.test", "application/json");

  const history = await request("/service/issue/history");
  if (history.status !== 200) throw new Error(`Legacy service issue session setup failed with HTTP ${history.status}`);
  const xsrf = cookies.get("XSRF-TOKEN");
  if (!xsrf) throw new Error("Legacy service issue session did not provide a CSRF cookie");
  if (parameters.actor === "existingIssue") {
    const sessionCookie = [...cookies].find(([name]) => name !== "XSRF-TOKEN");
    if (!sessionCookie) throw new Error("Legacy service issue session cookie missing");
    await attachExistingGuest(sessionCookie[0], sessionCookie[1]);
  }

  await request("/service/issue/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-XSRF-TOKEN": decodeURIComponent(xsrf),
    },
    body: new URLSearchParams({ type: String(parameters.categoryId) }).toString(),
  });
}

function legacySessionRequest(baseUrl: string, host: string, accept: string) {
  const cookies = new Map<string, string>();
  const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set("Host", host);
    headers.set("Accept", accept);
    if (cookies.size > 0) {
      headers.set("Cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    }
    const response = await fetch(new URL(path, `${baseUrl.replace(/\/$/, "")}/`), {
      ...init,
      headers,
      redirect: "manual",
    });
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";", 1)[0];
      const equal = pair.indexOf("=");
      if (equal > 0) cookies.set(pair.slice(0, equal), pair.slice(equal + 1));
    }
    return response;
  };
  return { cookies, request };
}

async function attachExistingGuest(cookieName: string, cookieValue: string): Promise<void> {
  // Use Laravel's own cookie/session services to bind the seeded guest to the
  // browser session. No test-only route or change to pinned Legacy is needed.
  const script = `require "/var/www/html/vendor/autoload.php";
$app = require "/var/www/html/bootstrap/app.php";
$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();
$name = getenv("ISSUE_SESSION_NAME");
if ($name !== config("session.cookie")) { throw new Exception("Session cookie name mismatch"); }
$plain = Illuminate\\Support\\Facades\\Crypt::decryptString(urldecode(getenv("ISSUE_SESSION_COOKIE")));
$id = Illuminate\\Cookie\\CookieValuePrefix::validate($name, $plain, app("encrypter")->getKey());
if (!$id) { throw new Exception("Invalid session cookie"); }
$session = app("session")->driver();
$session->setId($id);
$session->start();
$session->put("user_guest", "synthetic_guest_existing_issue");
$session->save();`;
  const proc = Bun.spawn(["docker", "compose", "exec", "-T", "-e", `ISSUE_SESSION_NAME=${cookieName}`,
    "-e", `ISSUE_SESSION_COOKIE=${cookieValue}`, "legacy-app", "php", "-r", script], {
    cwd: new URL("../..", import.meta.url).pathname,
    stdout: "pipe", stderr: "pipe", timeout: 60000,
  });
  const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  if (code !== 0) throw new Error(`Could not bind seeded guest to Legacy session: ${stderr}`);
}

function isGameTypeMapping(row: unknown, platformId: number): row is GameTypeMapping {
  return typeof row === "object" && row !== null &&
    "platform_id" in row && row.platform_id === platformId &&
    "game_type_id" in row && Number.isInteger(row.game_type_id) &&
    "active" in row && (row.active === 0 || row.active === 1);
}

function sameMappings(before: GameTypeMapping[], current: GameTypeMapping[]): boolean {
  const byId = (rows: GameTypeMapping[]) => rows
    .map((row) => `${row.game_type_id}:${row.active}`)
    .sort();
  return JSON.stringify(byId(before)) === JSON.stringify(byId(current));
}

async function readLegacyMappings(platformId: number, dbConfig: DbConfig = {}): Promise<GameTypeMapping[]> {
  const connection = await mysql.createConnection({
    host: dbConfig.host || config.db.host,
    port: dbConfig.port || config.db.port,
    user: dbConfig.user || config.db.user,
    password: dbConfig.password || config.db.password,
    database: dbConfig.database || config.db.database,
  });
  try {
    const [rows] = await connection.execute(
      "SELECT platform_id, game_type_id, active FROM platform_game_type_map WHERE platform_id = ? ORDER BY game_type_id",
      [platformId]
    );
    return rows as GameTypeMapping[];
  } finally {
    await connection.end();
  }
}

function isSuccessfulRedirect(response: Response): boolean {
  return response.status === 302 || response.status === 303;
}

function pointsToLogin(location: string | null): boolean {
  return location !== null && new URL(location, "http://legacy.invalid").pathname === "/login";
}
