#!/bin/bash
# post-cap-sync.sh — Restores custom native plugins after `npx cap sync`
# Capacitor sync can remove manually-added Swift files from the Xcode project.
# This script copies them back from the repo's ios-plugin/ directory.

set -e

PLUGIN_SRC="ios-plugin"
PLUGIN_DST="ios/App/App/Plugins"

if [ ! -d "$PLUGIN_SRC" ]; then
  echo "⚠️  ios-plugin/ directory not found. Skipping plugin copy."
  exit 0
fi

mkdir -p "$PLUGIN_DST"

echo "📦 Copying native plugins to Xcode project..."
cp -v "$PLUGIN_SRC"/*.swift "$PLUGIN_DST/"

echo ""
echo "✅ Native plugins synced to ios/App/App/Plugins/"
echo ""
echo "⚠️  FIRST TIME ONLY: If these files don't appear in Xcode's sidebar,"
echo "   drag them from ios/App/App/Plugins/ into the Xcode project navigator"
echo "   and check 'Copy items if needed' + select the 'App' target."
