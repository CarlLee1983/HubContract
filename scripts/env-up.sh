#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> [HubContract] Starting recording environment containers..."
cd "${ROOT_DIR}"
docker compose up -d

echo "==> [HubContract] Waiting for services to be healthy..."
docker compose wait mariadb redis mongo legacy-app >/dev/null 2>&1 || true

echo "==> [HubContract] Resetting database to synthetic seed state..."
"${SCRIPT_DIR}/env-reset.sh"

echo "==> [HubContract] Verifying GET /v1/server/status..."
STATUS_RES=$(curl -s -w "\n%{http_code}" http://localhost:8080/v1/server/status)
HTTP_CODE=$(echo "${STATUS_RES}" | tail -n 1)
BODY=$(echo "${STATUS_RES}" | sed '$d')

if [ "${HTTP_CODE}" = "200" ]; then
  echo "==> [HubContract] Environment ready! (status: 200, body: ${BODY})"
else
  echo "==> [HubContract] ERROR: /v1/server/status returned HTTP ${HTTP_CODE}: ${BODY}"
  exit 1
fi
