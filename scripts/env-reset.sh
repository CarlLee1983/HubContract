#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> [HubContract] Resetting MariaDB schema and synthetic seeds..."
docker exec -i hub_contract_mariadb mariadb -uroot -proot_recording_pass -e "
  DROP DATABASE IF EXISTS stationhub_recording;
  CREATE DATABASE stationhub_recording CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  GRANT ALL PRIVILEGES ON stationhub_recording.* TO 'recording_user'@'%';
  FLUSH PRIVILEGES;
"

# 1. Full frozen mysql-schema.sql (including migrations)
docker exec -i hub_contract_mariadb mariadb -uroot -proot_recording_pass stationhub_recording < "${ROOT_DIR}/seeds/mysql-schema.sql"

# 2. Synthetic seeds
docker exec -i hub_contract_mariadb mariadb -uroot -proot_recording_pass stationhub_recording < "${ROOT_DIR}/seeds/synthetic-seed.sql"

echo "==> [HubContract] Resetting Redis..."
docker exec hub_contract_redis redis-cli FLUSHALL >/dev/null

echo "==> [HubContract] Resetting MongoDB..."
docker exec hub_contract_mongo mongosh stationhub_recording --eval "db.dropDatabase()" >/dev/null

echo "==> [HubContract] Reset completed successfully."
