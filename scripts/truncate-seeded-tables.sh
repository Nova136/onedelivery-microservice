#!/usr/bin/env bash
# Truncates all tables populated by seeding-all-datas / seeding-all-datas-cloud.
#
# Usage:
#   ./scripts/truncate-seeded-tables.sh          # local Postgres (DB_HOST / DB_PORT from .env)
#   ./scripts/truncate-seeded-tables.sh --cloud  # RDS via tunnel (DB_HOST=localhost, DB_PORT=5433)
#
# Prerequisites:
#   - psql installed locally
#   - .env at repo root with DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
#   - For --cloud: RDS tunnel already open (./scripts/rds-tunnel.sh)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
SQL_FILE="$SCRIPT_DIR/truncate-seeded-tables.sql"

# ── Load .env ──────────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env not found at $ROOT_DIR/.env" >&2
  exit 1
fi

# Export only DB_* vars from .env (ignore comments and blank lines)
set -o allexport
# shellcheck disable=SC1090
source <(grep -E '^(DB_HOST|DB_PORT|DB_USER|DB_PASSWORD|DB_NAME)=' "$ENV_FILE")
set +o allexport

# ── Cloud override (tunnel mode) ───────────────────────────────────────────────
if [[ "${1:-}" == "--cloud" ]]; then
  echo "==> Cloud mode: connecting via tunnel at localhost:5433"
  DB_HOST="localhost"
  DB_PORT="5433"
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-onedelivery}"

echo "==> Connecting to ${DB_HOST}:${DB_PORT}/${DB_NAME} as ${DB_USER}"
echo "==> Running: $SQL_FILE"
echo ""

PGPASSWORD="$DB_PASSWORD" psql \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --file="$SQL_FILE" \
  --echo-all

echo ""
echo "==> Truncation complete."
