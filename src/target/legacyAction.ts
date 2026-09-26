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
  /** Recording runtime supplies a real GatewayWorker client ID. */
  getGatewayClientId?: () => Promise<string>;
  /** Recording runtime supplies a Laravel guest session created from synthetic seed. */
  prepareServiceSession?: (issueId: number) => Promise<{ cookie: string; xsrfToken: string }>;
}

/** Translates neutral internal actions into the pinned Legacy admin flow. */
export class LegacyActionAdapter {
  private readonly host: string;
  private readonly account: string;
  private readonly password: string;
  private readonly readMappings: (platformId: number, dbConfig?: DbConfig) => Promise<GameTypeMapping[]>;
  private readonly getGatewayClientId?: LegacyAdminOptions["getGatewayClientId"];
  private readonly prepareServiceSession?: LegacyAdminOptions["prepareServiceSession"];

  constructor(options: LegacyAdminOptions = {}) {
    this.host = options.host ?? "cmghubadmin.test";
    this.account = options.account ?? "super";
    // Matches the public Laravel demo bcrypt hash in synthetic-seed.sql.
    this.password = options.password ?? "password";
    this.readMappings = options.readMappings ?? readLegacyMappings;
    this.getGatewayClientId = options.getGatewayClientId;
    this.prepareServiceSession = options.prepareServiceSession;
  }

  async executeAction(action: ScenarioAction, baseUrl: string, dbBefore: Readonly<Record<string, unknown>>, dbConfig?: DbConfig): Promise<void> {
    const localLegacyUrl = `http://localhost:${config.legacyPort}`;
    if (baseUrl.replace(/\/+$/, "") !== localLegacyUrl) {
      throw new Error(`Legacy action requires the local recording target ${localLegacyUrl}; got ${baseUrl}`);
    }
    if (action.name !== "platformGameType.setActive") {
      await this.executeChatroomAction(action, baseUrl, dbBefore);
      return;
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

    const { request, cookies } = this.createRequest(baseUrl, this.host);
    await this.loginAdmin(request, cookies);
    const xsrf = cookies.get("XSRF-TOKEN")!;

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

  private createRequest(baseUrl: string, host: string, initialCookie?: string) {
    const cookies = new Map<string, string>();
    if (initialCookie) {
      for (const pair of initialCookie.split(";")) {
        const equals = pair.indexOf("=");
        if (equals > 0) cookies.set(pair.slice(0, equals).trim(), pair.slice(equals + 1).trim());
      }
    }
    const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set("Host", host);
      headers.set("Accept", headers.get("Accept") ?? "text/html,application/xhtml+xml");
      if (cookies.size > 0) headers.set("Cookie", [...cookies].map(([key, value]) => `${key}=${value}`).join("; "));
      const response = await fetch(new URL(path, `${baseUrl.replace(/\/$/, "")}/`), { ...init, headers, redirect: "manual" });
      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(";", 1)[0];
        const equals = pair.indexOf("=");
        if (equals > 0) cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
      }
      return response;
    };
    return { request, cookies };
  }

  private async loginAdmin(request: (path: string, init?: RequestInit) => Promise<Response>, cookies: Map<string, string>) {
    const loginPage = await request("/login");
    if (loginPage.status !== 200) throw new Error(`Legacy admin login page failed with HTTP ${loginPage.status}`);
    const xsrf = cookies.get("XSRF-TOKEN");
    if (!xsrf) throw new Error("Legacy admin login did not provide a CSRF cookie");
    const login = await request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-XSRF-TOKEN": decodeURIComponent(xsrf) },
      body: new URLSearchParams({ account: this.account, password: this.password }).toString(),
    });
    if (!isSuccessfulRedirect(login) || pointsToLogin(login.headers.get("location"))) {
      throw new Error(`Legacy admin login failed with HTTP ${login.status}`);
    }
  }

  private async executeChatroomAction(action: Exclude<ScenarioAction, { name: "platformGameType.setActive" }>, baseUrl: string, dbBefore: Readonly<Record<string, unknown>>) {
    const issues = dbBefore.service_issues;
    if (!Array.isArray(issues) || issues.length !== 1 || issues[0]?.id !== action.parameters.issueId) {
      throw new Error("Chatroom action requires a matching service_issues before probe");
    }
    const service = action.name === "chatroom.messageFromService";
    let session: { cookie: string; xsrfToken: string } | undefined;
    if (service) {
      if (!this.prepareServiceSession) throw new Error("Legacy service action requires a prepared synthetic guest session");
      session = await this.prepareServiceSession(action.parameters.issueId);
      if (!session.cookie || !session.xsrfToken) throw new Error("Legacy service session is missing cookie or CSRF token");
    }
    const host = service ? "cmghub.test" : this.host;
    const { request, cookies } = this.createRequest(baseUrl, host, session?.cookie);
    if (!service) await this.loginAdmin(request, cookies);
    const xsrf = service ? session!.xsrfToken : decodeURIComponent(cookies.get("XSRF-TOKEN")!);
    const page = service ? "/service/chatroom" : "/chatrooms";
    let path: string;
    let body: Record<string, string> = {};
    switch (action.name) {
      case "chatroom.join": {
        if (!this.getGatewayClientId) throw new Error("Legacy chatroom join requires a real GatewayWorker client ID");
        const clientId = await this.getGatewayClientId();
        if (!clientId) throw new Error("Legacy chatroom join received an empty GatewayWorker client ID");
        path = `/chatrooms/${action.parameters.issueId}`;
        body = { client_id: clientId };
        break;
      }
      case "chatroom.close":
        path = `/chatrooms/${action.parameters.issueId}/closed`;
        break;
      case "chatroom.messageFromAdmin":
        path = `/chatrooms/${action.parameters.issueId}/messages`;
        body = { body: action.parameters.body };
        break;
      case "chatroom.messageFromService":
        path = "/service/chatroom/messages";
        body = { body: action.parameters.body };
        break;
    }
    const response = await request(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-XSRF-TOKEN": xsrf, Referer: new URL(page, `${baseUrl}/`).toString() },
      body: new URLSearchParams(body).toString(),
    });
    if (!isSuccessfulRedirect(response) || new URL(response.headers.get("location") ?? "", `${baseUrl}/`).pathname !== page) {
      throw new Error(`Legacy chatroom action ${action.name} failed with HTTP ${response.status}`);
    }
    // Legacy catches domain errors and redirects back with a flashed error.
    const followUp = await request(page, { headers: { "X-Inertia": "true", Accept: "application/json" } });
    if (followUp.status !== 200) throw new Error(`Legacy chatroom action ${action.name} confirmation failed with HTTP ${followUp.status}`);
    let props: Record<string, unknown>;
    try { props = (await followUp.json() as { props: Record<string, unknown> }).props; }
    catch { throw new Error(`Legacy chatroom action ${action.name} confirmation was not an Inertia page`); }
    if (!props || typeof props !== "object") throw new Error(`Legacy chatroom action ${action.name} confirmation was not an Inertia page`);
    const flash = props.flash as { alert?: { error?: unknown; errorReload?: unknown }; notify?: { error?: unknown } } | undefined;
    const errors = props.errors as Record<string, unknown> | undefined;
    if (flash?.alert?.error || flash?.alert?.errorReload || flash?.notify?.error ||
      (errors && Object.keys(errors).length > 0)) {
      throw new Error(`Legacy chatroom action ${action.name} reported a flashed error`);
    }
  }
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
