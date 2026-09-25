import type { ScenarioAction } from "../schema/scenario";
import type { TargetAdapter } from "../runner";

interface LegacyAdminOptions {
  host?: string;
  account?: string;
  password?: string;
}

/** Translates neutral internal actions into the pinned Legacy admin flow. */
export class LegacyTargetAdapter implements TargetAdapter {
  private readonly host: string;
  private readonly account: string;
  private readonly password: string;

  constructor(options: LegacyAdminOptions = {}) {
    this.host = options.host ?? "cmghubadmin.test";
    this.account = options.account ?? "super";
    // Matches the public Laravel demo bcrypt hash in synthetic-seed.sql.
    this.password = options.password ?? "password";
  }

  async executeAction(action: ScenarioAction, baseUrl: string): Promise<void> {
    if (action.name !== "platformGameType.setActive") {
      throw new Error(`Legacy target does not support action ${action.name}`);
    }

    const cookies = new Map<string, string>();
    const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set("Host", this.host);
      headers.set("Accept", "text/html,application/xhtml+xml");
      if (cookies.size > 0) {
        headers.set("Cookie", [...cookies].map(([key, value]) => `${key}=${value}`).join("; "));
      }
      const response = await fetch(new URL(path, `${baseUrl.replace(/\/$/, "")}/`), {
        ...init,
        headers,
        redirect: "manual",
      });
      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(";", 1)[0];
        const equals = pair.indexOf("=");
        if (equals > 0) cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
      }
      return response;
    };

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
        gameTypes: [{ id: action.parameters.gameTypeId, active: String(action.parameters.active) }],
      }]),
    });
    if (!isSuccessfulRedirect(actionResponse) || pointsToLogin(actionResponse.headers.get("location"))) {
      throw new Error(`Legacy internal action failed with HTTP ${actionResponse.status}`);
    }
  }
}

function isSuccessfulRedirect(response: Response): boolean {
  return response.status === 302 || response.status === 303;
}

function pointsToLogin(location: string | null): boolean {
  return location !== null && new URL(location, "http://legacy.invalid").pathname === "/login";
}
