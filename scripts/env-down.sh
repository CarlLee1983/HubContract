#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# STATIONHUB_VENDOR_DIR only needs to resolve to *some* existing path here so
# `docker compose down` can parse the compose file; it doesn't need to be correct
# since no container is being (re)started. Falls back to ROOT_DIR itself if
# StationHub isn't checked out where expected. The worktree at .legacy-src is
# intentionally left in place (Issue #3) — env-up.sh reuses it next time.
STATIONHUB_VENDOR_DIR="$(cd "${ROOT_DIR}/${STATIONHUB_REPO:-../StationHub}" 2>/dev/null && pwd || echo "${ROOT_DIR}")"
export STATIONHUB_VENDOR_DIR
STATIONHUB_BUILD_DIR="${STATIONHUB_VENDOR_DIR}/public/build"
export STATIONHUB_BUILD_DIR

echo "==> [HubContract] Stopping and removing containers..."
cd "${ROOT_DIR}"
docker compose down -v --remove-orphans
echo "==> [HubContract] Containers stopped."
