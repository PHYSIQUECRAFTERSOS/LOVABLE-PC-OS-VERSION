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

# ── Rest timer notification sound ─────────────────────────────────────────
# iOS LocalNotifications resolves `sound: 'rest-timer-complete.mp3'` from the
# app bundle ROOT (not from public/). Copy it there too. The file at
# ios/App/App/public/sounds/rest-timer-complete.mp3 is for in-app NativeAudio
# playback; the bundle-root copy is for the lock-screen notification sound.
SOUND_SRC="public/sounds/rest-timer-complete.mp3"
SOUND_DST="ios/App/App/rest-timer-complete.mp3"
if [ -f "$SOUND_SRC" ] && [ -d "ios/App/App" ]; then
  cp -v "$SOUND_SRC" "$SOUND_DST"
  echo "✅ Rest timer notification sound copied to iOS bundle root"
  echo "   ⚠️  FIRST TIME ONLY: in Xcode, drag $SOUND_DST into the App target"
  echo "      ('Copy items if needed' + 'Add to targets: App') so iOS can"
  echo "      resolve it as a notification sound. Subsequent cap syncs are fine."
fi
