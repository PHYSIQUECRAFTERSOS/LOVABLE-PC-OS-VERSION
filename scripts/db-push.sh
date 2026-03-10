#!/bin/bash
# db-push.sh — run a SQL file directly against Supabase (no dashboard needed)
# Usage: ./scripts/db-push.sh path/to/migration.sql
#   OR:  ./scripts/db-push.sh  (runs all pending migrations in supabase/migrations/)
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$REPO_ROOT/.env" 2>/dev/null || true

PROJECT_ID="${SUPABASE_PROJECT_ID_SERVICE:-}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [ -z "$SERVICE_KEY" ] || [ -z "$PROJECT_ID" ]; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY and SUPABASE_PROJECT_ID_SERVICE must be set in .env"
  exit 1
fi

run_sql() {
  local SQL_FILE="$1"
  local SQL_CONTENT
  SQL_CONTENT=$(cat "$SQL_FILE")

  echo "→ Running: $SQL_FILE"

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    "https://${PROJECT_ID}.supabase.co/rest/v1/rpc/exec_sql" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"sql\": $(echo "$SQL_CONTENT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}" \
    2>/dev/null)

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  # Fallback: try direct pg via management API if exec_sql rpc doesn't exist
  if [ "$HTTP_CODE" != "200" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      "https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query" \
      -H "Authorization: Bearer ${SERVICE_KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"query\": $(echo "$SQL_CONTENT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}" \
      2>/dev/null)
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | head -n -1)
  fi

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
    echo "  ✓ Success"
  else
    echo "  ✗ Failed (HTTP $HTTP_CODE): $BODY"
    echo ""
    echo "  → Manual fallback: paste the SQL from $SQL_FILE into:"
    echo "    https://supabase.com/dashboard/project/${PROJECT_ID}/sql"
    exit 1
  fi
}

if [ -n "$1" ]; then
  run_sql "$1"
else
  # Run all migrations in order
  for f in "$REPO_ROOT/supabase/migrations/"*.sql; do
    [ -f "$f" ] || continue
    run_sql "$f"
  done
fi

echo ""
echo "✓ All SQL applied to project: $PROJECT_ID"
