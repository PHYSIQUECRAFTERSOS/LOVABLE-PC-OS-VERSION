# Native iOS Plugins — Setup & Maintenance Guide

## Overview

This folder contains all custom Swift plugins for the Capacitor iOS app:

| File | Purpose |
|------|---------|
| `HealthKitPlugin.swift` | Apple Health step/energy/distance/weight sync |
| `StoreKitPlugin.swift` | In-app purchase bridge (StoreKit 2) |
| `AudioMixPlugin.swift` | Audio mixing for rank-up sounds during workouts |
| `PushNotificationsBridge.swift` | Push notification registration bridge |

---

## ⚠️ Critical: Files Disappear After `npx cap sync`

`npx cap sync ios` can remove or break references to manually-added Swift files in the Xcode project. **This is the #1 cause of silent feature breakage** (e.g., steps stop syncing, purchases fail).

### Solution: Always use the automated sync script

```bash
# Instead of: npx cap sync ios
npm run cap:sync

# Or for a full build:
npm run cap:build
```

These scripts automatically copy all `.swift` files from `ios-plugin/` into `ios/App/App/Plugins/` after Capacitor sync.

### Manual alternative

If you must run `npx cap sync ios` directly, always follow it with:

```bash
bash scripts/post-cap-sync.sh
```

---

## First-Time Setup (After Cloning or `npx cap add ios`)

1. Run `npm run cap:sync` to copy plugin files into the Xcode project directory
2. Open Xcode: `npx cap open ios`
3. In the Xcode project navigator (left sidebar):
   - Right-click on `App/App/` → **New Group** → name it `Plugins`
   - Drag all `.swift` files from `ios/App/App/Plugins/` into this group
   - Check **"Copy items if needed"** and select the **App** target
4. Verify all files appear in the sidebar without error icons

After this one-time setup, the `post-cap-sync.sh` script keeps the files on disk. The Xcode project references persist as long as you don't delete the `ios/` folder.

---

## Required Xcode Capabilities

In your Xcode project target → **Signing & Capabilities**, ensure these are added:

| Capability | Required By |
|------------|-------------|
| **HealthKit** | HealthKitPlugin.swift |
| **In-App Purchase** | StoreKitPlugin.swift |
| **Push Notifications** | PushNotificationsBridge.swift |
| **Background Modes** → Remote notifications | Push notifications |

---

## Required Info.plist Keys

| Key | Value | Required By |
|-----|-------|-------------|
| `NSHealthShareUsageDescription` | "Physique Crafters syncs your steps, active energy, and weight to track your fitness progress." | HealthKitPlugin |

---

## Build Sequence

```bash
git pull origin main
npm install
npm run build
npm run cap:sync        # ← copies plugins automatically
npx cap open ios
# In Xcode: Clean Build (⇧⌘K) → Archive → Upload to TestFlight
```

---

## StoreKit Plugin Setup

### Prerequisites
- iOS 15+ target
- Products created in App Store Connect:
  - `com.physiquecrafters.app.monthly`
  - `com.physiquecrafters.app.biweekly`
- Xcode 15+

### App Store Connect Configuration
1. Navigate to your app → **Subscriptions**
2. Create a Subscription Group (e.g., "Coaching Plans")
3. Add two auto-renewable subscriptions:
   - `com.physiquecrafters.app.monthly` — $399.99/month
   - `com.physiquecrafters.app.biweekly` — $299.99/month
4. Set status to **Ready to Submit** for each

### Testing in Sandbox
1. In App Store Connect → **Users and Access** → **Sandbox Testers**, create a test account
2. On your test device, sign out of your real Apple ID in Settings → App Store
3. Run the app via Xcode, sign in with the sandbox account when prompted
4. The purchase sheet will show "[Environment: Sandbox]"

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Plugin not found at runtime | Run `npm run cap:sync` and verify the `.swift` file is in `ios/App/App/Plugins/` AND in the Xcode sidebar |
| Steps not syncing | Verify HealthKitPlugin.swift is compiled (check Build Phases → Compile Sources) |
| "Product not found" | Ensure product IDs match exactly in App Store Connect and in StoreKitManager.swift |
| Purchase sheet doesn't appear | Must test on a real device with sandbox account |
| Files disappear after sync | You ran `npx cap sync` instead of `npm run cap:sync` |
