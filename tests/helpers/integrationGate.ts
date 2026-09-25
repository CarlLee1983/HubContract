/**
 * Issue #12: integration tests that need the recording environment (Legacy +
 * MariaDB/Redis/Mongo via docker compose) only run when this env var is set.
 * CI runs offline (no Docker), so it does not set it and these tests are
 * skipped there; run locally with `HUB_CONTRACT_INTEGRATION=1 bun test`.
 */
export const RUNS_AGAINST_RECORDING_ENV = process.env.HUB_CONTRACT_INTEGRATION === "1";
