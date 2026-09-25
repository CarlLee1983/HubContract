#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck disable=SC1090
source "${ROOT_DIR}/docker/legacy.commit"

STATIONHUB_REPO="$(cd "${ROOT_DIR}/${STATIONHUB_REPO:-../StationHub}" && pwd)"
LEGACY_SRC_DIR="${ROOT_DIR}/.legacy-src"

echo "==> [HubContract] Pinning Legacy source to commit ${LEGACY_COMMIT}..."
if [ -d "${LEGACY_SRC_DIR}/.git" ] || [ -f "${LEGACY_SRC_DIR}/.git" ]; then
  CURRENT_HEAD="$(git -C "${LEGACY_SRC_DIR}" rev-parse HEAD)"
  if [ "${CURRENT_HEAD}" != "${LEGACY_COMMIT}" ]; then
    echo "==> [HubContract] ERROR: ${LEGACY_SRC_DIR} is checked out at ${CURRENT_HEAD}, expected ${LEGACY_COMMIT}."
    echo "    Remove it (git -C \"${STATIONHUB_REPO}\" worktree remove --force \"${LEGACY_SRC_DIR}\") and re-run."
    exit 1
  fi
  echo "==> [HubContract] ${LEGACY_SRC_DIR} already pinned at ${LEGACY_COMMIT}."
else
  git -C "${STATIONHUB_REPO}" worktree add --detach "${LEGACY_SRC_DIR}" "${LEGACY_COMMIT}"
fi

echo "==> [HubContract] Verifying vendor/ matches the pinned commit (composer.lock)..."
# vendor/ (mounted read-only below) is whatever `composer install` produced from
# STATIONHUB_REPO's WORKING TREE composer.lock — not from .legacy-src, and not
# from STATIONHUB_REPO's HEAD if that differs from the working tree. So the
# correct check is: (1) the working tree's composer.lock has no uncommitted
# changes (otherwise "HEAD's composer.lock" wouldn't be what vendor/ was built
# from), then (2) HEAD's composer.lock == the pinned commit's composer.lock.
if ! git -C "${STATIONHUB_REPO}" diff --quiet HEAD -- composer.lock; then
  echo "==> [HubContract] ERROR: ${STATIONHUB_REPO}/composer.lock has uncommitted changes."
  echo "    vendor/ is installed from the working tree's composer.lock, so it must match a committed"
  echo "    state before it can be meaningfully compared against the pinned commit's composer.lock."
  exit 1
fi

WORKTREE_LOCK_BLOB="$(git -C "${STATIONHUB_REPO}" rev-parse HEAD:composer.lock)"
PINNED_LOCK_BLOB="$(git -C "${STATIONHUB_REPO}" rev-parse "${LEGACY_COMMIT}:composer.lock")"
if [ "${WORKTREE_LOCK_BLOB}" != "${PINNED_LOCK_BLOB}" ]; then
  echo "==> [HubContract] ERROR: ${STATIONHUB_REPO}'s committed composer.lock (HEAD) differs from the"
  echo "    composer.lock pinned at commit ${LEGACY_COMMIT}. vendor/ (installed from ${STATIONHUB_REPO}'s"
  echo "    working tree) would not match the Legacy source pinned in docker/legacy.commit."
  echo "    Fix: run 'composer install' in ${STATIONHUB_REPO} against the pinned commit's composer.lock"
  echo "    (e.g. 'git checkout ${LEGACY_COMMIT} -- composer.lock && composer install'), or update"
  echo "    LEGACY_COMMIT in docker/legacy.commit to match ${STATIONHUB_REPO}'s current HEAD."
  exit 1
fi

echo "==> [HubContract] Starting recording environment containers..."
cd "${ROOT_DIR}"
STATIONHUB_VENDOR_DIR="${STATIONHUB_REPO}/vendor" docker compose up -d

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
