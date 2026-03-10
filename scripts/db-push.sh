#!/bin/bash
# db-push.sh — run SQL migrations directly against Supabase (no dashboard needed)
# Usage: ./scripts/db-push.sh                           (runs all migrations)
#        ./scripts/db-push.sh supabase/migrations/x.sql (runs one file)
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$REPO_ROOT/.env" 2>/dev/null || true

PROJECT_ID="${SUPABASE_PROJECT_ID_SERVICE:-}"
ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"

if [ -z "$ACCESS_TOKEN" ] || [ -z "$PROJECT_ID" ]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID_SERVICE must be set in .env"
  exit 1
fi

run_sql() {
  local SQL_FILE="$1"
  local SQL_CONTENT
  SQL_CONTENT=$(cat "$SQL_FILE")

  echo "→ Running: $SQL_FILE"

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    "https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' <<< "$SQL_CONTENT")}")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "204" ]; then
    echo "  ✓ Success"
  else
    echo "  ✗ Failed (HTTP $HTTP_CODE): $BODY"
    exit 1
  fi
}

if [ -n "$1" ]; then
  run_sql "$1"
else
  for f in "$REPO_ROOT/supabase/migrations/"*.sql; do
    [ -f "$f" ] || continue
    run_sql "$f"
  done
fi

echo ""
echo "✓ Done — SQL applied to project: $PROJECT_ID"
