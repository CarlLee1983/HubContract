#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> [HubContract] Stopping and removing containers..."
cd "${ROOT_DIR}"
docker compose down -v --remove-orphans
echo "==> [HubContract] Containers stopped."
