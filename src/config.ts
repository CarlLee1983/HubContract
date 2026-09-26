/**
 * Central connection defaults for the local recording environment (docker-compose.yml).
 *
 * These are synthetic, publicly-known credentials for a disposable local recording
 * environment — not secrets. Everything here can be overridden by environment
 * variables (e.g. for CI or for pointing at StationHubNext during migration).
 */
export const config = {
  baseUrl: process.env.HUBCONTRACT_BASE_URL || "http://localhost:8080",
  legacyPort: Number(process.env.LEGACY_PORT || 8080),
  /** Max time (ms) resetEnvironment() waits for scripts/env-reset.sh before killing it and failing. */
  resetTimeoutMs: Number(process.env.HUBCONTRACT_RESET_TIMEOUT_MS || 20000),
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 33066),
    user: process.env.DB_USER || "recording_user",
    password: process.env.DB_PASSWORD || "recording_pass",
    database: process.env.DB_DATABASE || "stationhub_recording",
  },
  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 63799),
    password: process.env.REDIS_PASSWORD || undefined,
    prefix: process.env.REDIS_PREFIX || "hub_recording:",
  },
  stub: {
    /** Provider stub's control API (Issue #8), i.e. compose service `mock-provider`. */
    baseUrl: process.env.HUBCONTRACT_STUB_URL || "http://localhost:18081",
  },
  gamelobby: {
    /**
     * Same env var name (and default) as docker-compose.yml's
     * `legacy-app.environment.GAMELOBBY_HTTP_PLATFORM_OVERRIDES: "sbo:${GAMELOBBY_SBO_TIMEOUT_SECONDS:-2}"`
     * — the single shared source for "how long Legacy waits before timing out
     * an sbo outbound call" (code review Standards #10). Read here so
     * scenarios/player/player-balance-outbound-timeout.json's `delayMs` can
     * be asserted (tests/outbound-stub.test.ts) to actually exceed it,
     * instead of the two just happening to agree by coincidence.
     */
    sboTimeoutSeconds: Number(process.env.GAMELOBBY_SBO_TIMEOUT_SECONDS || 2),
  },
};
