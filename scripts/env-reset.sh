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

echo "==> [HubContract] Resetting MariaDB schema and synthetic seeds..."
docker compose exec -T mariadb mariadb -uroot -proot_recording_pass -e "
  DROP DATABASE IF EXISTS stationhub_recording;
  CREATE DATABASE stationhub_recording CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  GRANT ALL PRIVILEGES ON stationhub_recording.* TO 'recording_user'@'%';
  FLUSH PRIVILEGES;
"

# 1. Full frozen mysql-schema.sql (including migrations)
docker compose exec -T mariadb mariadb -uroot -proot_recording_pass stationhub_recording < "${ROOT_DIR}/seeds/mysql-schema.sql"

# 2. Synthetic seeds
docker compose exec -T mariadb mariadb -uroot -proot_recording_pass stationhub_recording < "${ROOT_DIR}/seeds/synthetic-seed.sql"

echo "==> [HubContract] Resetting Redis..."
docker compose exec -T redis redis-cli FLUSHALL >/dev/null

echo "==> [HubContract] Resetting MongoDB..."
docker compose exec -T mongo mongosh stationhub_recording --eval "db.dropDatabase()" >/dev/null

echo "==> [HubContract] Resetting provider stub (Issue #8)..."
curl -sf -X POST "http://localhost:${MOCK_PROVIDER_PORT:-18081}/__stub/reset" >/dev/null

echo "==> [HubContract] Reset completed successfully."
