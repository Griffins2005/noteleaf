#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# apps/api/scripts/migrate.sh
#
# Runs Prisma migrations against the production database.
# Executed by the `migrate` service in docker-compose.yml, which runs once
# and exits before the `api` service starts (enforced via depends_on condition).
#
# Why prisma migrate deploy and not prisma migrate dev:
#   - `migrate deploy` applies pending migrations from the migrations/ directory.
#     It does NOT generate new migrations or prompt interactively.
#     Safe to run in CI/CD and Docker — idempotent on already-applied migrations.
#   - `migrate dev` generates migrations from schema diff — only for local development.
#
# Exit codes:
#   0 → migrations applied successfully (or nothing to apply)
#   1 → migration failed — Docker Compose will mark the migrate service as failed,
#       preventing the api service from starting (via depends_on: condition: service_completed_successfully)
# ─────────────────────────────────────────────────────────────────────────────

set -e  # Exit immediately on any command failure

echo "[migrate] Waiting for database to be ready..."

# Simple TCP connectivity check — retry until Postgres accepts connections.
# The `migrate` service depends_on postgres with health check, so this
# should succeed quickly, but a brief retry loop is cheap insurance.
RETRIES=10
until node -e "const net=require('node:net'); const s=net.connect(5432, 'postgres'); s.setTimeout(1000); s.on('connect', () => process.exit(0)); s.on('timeout', () => process.exit(1)); s.on('error', () => process.exit(1));" || [ "$RETRIES" -eq 0 ]; do
  echo "[migrate] Database not ready. Retrying in 2s... ($RETRIES retries left)"
  RETRIES=$((RETRIES - 1))
  sleep 2
done

if [ "$RETRIES" -eq 0 ]; then
  echo "[migrate] ERROR: Database did not become ready in time."
  exit 1
fi

echo "[migrate] Database is ready. Running migrations..."
npx prisma migrate deploy

echo "[migrate] Migrations complete."
