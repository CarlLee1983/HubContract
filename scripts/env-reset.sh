#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Per-worktree overrides (Issue #8) — see .env.example. Falls back to the
# committed defaults (main checkout's ports/subnet) when no `.env` exists.
if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

# `docker compose exec` resolves the service name to whichever project's
# container is running in this directory, instead of a fixed container name
# (Issue #8) — this must run from ROOT_DIR so compose finds docker-compose.yml
# and this worktree's .env.
cd "${ROOT_DIR}"
# Compose interpolates every service volume even for `exec mariadb`; worker
# services use the same vendor mount as legacy-app.
STATIONHUB_VENDOR_DIR="${STATIONHUB_VENDOR_DIR:-${ROOT_DIR}/${STATIONHUB_REPO:-../StationHub}/vendor}"
export STATIONHUB_VENDOR_DIR

echo "==> [HubContract] Resetting MariaDB schema and synthetic seeds..."
docker compose exec -T mariadb mariadb -uroot -proot_recording_pass -e "
  DROP DATABASE IF EXISTS stationhub_recording;
  CREATE DATABASE stationhub_recording CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  GRANT ALL PRIVILEGES ON stationhub_recording.* TO 'recording_user'@'%';
  FLUSH PRIVILEGES;
"

# 1. Full frozen mysql-schema.sql (including migrations)
docker compose exec -T mariadb mariadb -uroot -proot_recording_pass stationhub_recording < "${ROOT_DIR}/seeds/mysql-schema.sql"

# 2. Baseline seed data. Issue #13 code review: which seed to load is an explicit
# choice via HUB_SEED, not "whichever file happens to exist" — auto-switching on
# file presence would make two checkouts of the same commit reset to different
# data depending on who's run `seed:mask` locally. Default stays synthetic so
# `npm run env:up` behaves exactly as before.
HUB_SEED="${HUB_SEED:-synthetic}"
case "${HUB_SEED}" in
  synthetic)
    SEED_FILE="${ROOT_DIR}/seeds/synthetic-seed.sql"
    OVERLAY_FILE=""
    ;;
  snapshot)
    SEED_FILE="${ROOT_DIR}/seeds/snapshot-seed.sql"
    if [ ! -f "${SEED_FILE}" ]; then
      echo "==> [HubContract] ERROR: HUB_SEED=snapshot but ${SEED_FILE} does not exist." >&2
      echo "    Run 'bun run seed:mask <your-snapshot> seeds/snapshot-seed.sql' first (see README.md「資料安全」)." >&2
      exit 1
    fi
    # 情境基準列 overlay：把 scenarios/*.json、fixtures/*.json 依賴的固定業務資料
    # 疊在遮罩後的快照之上（見 seeds/scenario-baseline.sql 開頭說明）。
    OVERLAY_FILE="${ROOT_DIR}/seeds/scenario-baseline.sql"
    ;;
  *)
    echo "==> [HubContract] ERROR: unknown HUB_SEED='${HUB_SEED}' (expected 'synthetic' or 'snapshot')" >&2
    exit 1
    ;;
esac
echo "==> [HubContract] HUB_SEED=${HUB_SEED}, using seed file: ${SEED_FILE}"
docker compose exec -T mariadb mariadb -uroot -proot_recording_pass stationhub_recording < "${SEED_FILE}"
if [ -n "${OVERLAY_FILE}" ]; then
  echo "==> [HubContract] Applying scenario baseline overlay: ${OVERLAY_FILE}"
  docker compose exec -T mariadb mariadb -uroot -proot_recording_pass stationhub_recording < "${OVERLAY_FILE}"
fi

echo "==> [HubContract] Resetting Redis..."
docker compose exec -T redis redis-cli FLUSHALL >/dev/null

echo "==> [HubContract] Resetting MongoDB..."
docker compose exec -T mongo mongosh stationhub_recording --eval "db.dropDatabase()" >/dev/null

echo "==> [HubContract] Resetting provider stub (Issue #8)..."
curl -sf -X POST "http://localhost:${MOCK_PROVIDER_PORT:-18081}/__stub/reset" >/dev/null

echo "==> [HubContract] Reset completed successfully."
