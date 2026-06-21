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
echo ""
echo "⚠️  FIRST TIME ONLY (CRITICAL — required for HealthKit / StoreKit / "
echo "   AudioMix to actually work on device):"
echo "     1. Confirm MainViewController.swift is in the App target."
echo "     2. Open ios/App/App/Base.lproj/Main.storyboard."
echo "     3. Select the Bridge View Controller scene."
echo "     4. Identity Inspector → Class: MainViewController, Module: App."
echo "   Local Swift plugins are NOT auto-discovered in Capacitor 7/8;"
echo "   MainViewController.capacitorDidLoad() is what binds them to JS."

# ── Rest timer notification sound ─────────────────────────────────────────
# iOS LocalNotifications resolves the `sound:` filename from the app bundle
# ROOT (not from public/). Two files are needed:
#   - rest-timer-complete.mp3  → in-app foreground AVAudioPlayer cue
#   - rest-timer-complete.caf  → lock-screen / background notification sound
#                                (iOS REJECTS mp3 for notification sounds —
#                                 must be CAF/AIFF/WAV with PCM/IMA4 codec)
SOUND_MP3_SRC="public/sounds/rest-timer-complete.mp3"
SOUND_MP3_DST="ios/App/App/rest-timer-complete.mp3"
SOUND_CAF_SRC="public/sounds/rest-timer-complete.caf"
SOUND_CAF_DST="ios/App/App/rest-timer-complete.caf"
if [ -d "ios/App/App" ]; then
  if [ -f "$SOUND_MP3_SRC" ]; then
    cp -v "$SOUND_MP3_SRC" "$SOUND_MP3_DST"
  fi
  if [ -f "$SOUND_CAF_SRC" ]; then
    cp -v "$SOUND_CAF_SRC" "$SOUND_CAF_DST"
    echo "✅ Rest timer .caf (background notification sound) copied to iOS bundle root"
    echo "   ⚠️  FIRST TIME ONLY: in Xcode, drag $SOUND_CAF_DST into the App target"
    echo "      ('Copy items if needed' + 'Add to targets: App') so iOS can"
    echo "      resolve it as a notification sound. Subsequent cap syncs are fine."
  fi
fi
