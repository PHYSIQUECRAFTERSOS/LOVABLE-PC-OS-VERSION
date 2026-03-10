#!/bin/bash
# deploy.sh — push current branch to GitHub main → Vercel auto-deploys
# Usage: ./scripts/deploy.sh
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$REPO_ROOT/.env" 2>/dev/null || true

if [ -z "$GITHUB_TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN not set in .env"
  exit 1
fi

REPO="${GITHUB_REPO:-Physiquecrafters/physique-crafters-os}"
CURRENT_BRANCH=$(git branch --show-current)

echo "→ Pushing $CURRENT_BRANCH to GitHub main..."

# Merge current branch into main and push directly to GitHub
git fetch "https://${GITHUB_TOKEN}@github.com/${REPO}.git" main:refs/remotes/github-direct/main 2>/dev/null || true

TEMP_BRANCH="deploy-temp-$$"
git checkout -b "$TEMP_BRANCH" refs/remotes/github-direct/main 2>/dev/null || git checkout -b "$TEMP_BRANCH" HEAD
git merge "$CURRENT_BRANCH" --no-edit
git push "https://${GITHUB_TOKEN}@github.com/${REPO}.git" "$TEMP_BRANCH:main"
git checkout "$CURRENT_BRANCH"
git branch -D "$TEMP_BRANCH" 2>/dev/null || true

echo ""
echo "✓ Deployed! Vercel is rebuilding now (~2 min)."
echo "  Live at: https://app.physiquecrafters.com"
