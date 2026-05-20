# Fix: HealthKit / StoreKit / Rest-Timer Audio all silently failing on TestFlight

## Root cause (single shared bug)

All three failures have the same cause. In Capacitor 7/8, **local custom Swift plugins added to the App target are NOT auto-discovered**. The `@objc` + `CAPBridgedPlugin` pattern only auto-registers plugins shipped via Cocoapods/SPM. Local plugins must be **manually registered** in a custom `CAPBridgeViewController` subclass via `bridge?.registerPluginInstance(...)` inside `capacitorDidLoad()`. The official Capacitor v7 docs explicitly require this step (https://capacitorjs.com/docs/v7/ios/custom-code#register-the-plugin).

Our repo has three local plugins — `AudioMixPlugin`, `HealthKitPlugin`, `StoreKitPlugin` — and none of them are registered with the bridge. That's why on TestFlight every JS call falls through to the web-fallback `UNIMPLEMENTED` rejection:

- `HealthKit.isAvailable()` rejects → JS shows "Make sure HealthKit is enabled in Xcode Capabilities"
- `StoreKit.getProducts()` rejects/returns empty → "Unable to connect to App Store"
- `AudioMixPlugin.playRestTimerCue()` rejects silently → zero sound when timer hits 0

That also explains why Spotify is no longer being stopped — last round we removed `@capacitor-community/native-audio` so AudioMix is now the *only* path that touches `AVAudioSession`. With it unregistered, nothing native runs at all, so Spotify is untouched but the cue is silent.

## Why your Xcode checks looked correct

Target Membership being ✓ only guarantees the `.swift` files **compile into the binary**. It does NOT register them with the Capacitor JS bridge. Two separate steps. We've only ever done step 1.

## The fix (3 small additions)

### 1. New file: `ios-plugin/MainViewController.swift`

A `CAPBridgeViewController` subclass that registers all three plugin instances on bridge load:

```swift
import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AudioMixPlugin())
        bridge?.registerPluginInstance(HealthKitPlugin())
        bridge?.registerPluginInstance(StoreKitPlugin())
    }
}
```

This is the canonical Capacitor 7/8 pattern. Once registered, the existing JS `registerPlugin("AudioMixPlugin" | "HealthKitPlugin" | "StoreKit")` calls bind to the live native instances.

### 2. Update `scripts/post-cap-sync.sh`

Already copies `ios-plugin/*.swift` to `ios/App/App/Plugins/`, so `MainViewController.swift` rides along automatically. Add an echo reminding the user to also wire the storyboard (one-time step, see #3).

### 3. One-time Xcode wiring (manual, with screenshots in the plan response)

In Xcode (once, then it persists across `cap sync`):

a. Drag `ios/App/App/Plugins/MainViewController.swift` into the App target's Project Navigator (Copy items if needed → ✓, Add to targets: App → ✓). Confirm with your standard 3-plugin check.

b. Open `ios/App/App/Base.lproj/Main.storyboard` → select the **Bridge View Controller** → in the right sidebar (Identity Inspector) change **Class** from `CAPBridgeViewController` to `MainViewController` and **Module** to `App`.

c. Build & run.

That's it for the silent-cue / HealthKit / StoreKit triad. After verifying `MainViewController.capacitorDidLoad()` runs (add a `print("[Caps] Plugins registered")` for the first build), all three flows light up.

## Spotify mixing (confirms the right behavior)

You chose "cue plays OVER Spotify, music never pauses." That's already what `AudioMixPlugin.configureMixing()` requests:

```swift
session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
```

Once the plugin is actually registered and called, this category is set on the AVAudioSession at preload time, at every `enableMixing()` call from JS, and re-asserted immediately before `playRestTimerCue()`. The cue layers on top of Spotify without ducking or pausing. No further code change needed — only the registration fix above.

For backgrounded/locked rest completion, the existing `LocalNotifications` path with the bundled `rest-timer-complete.mp3` continues to fire (that path was never broken).

## Verification checklist (run on a real device, in order)

1. Fresh `npx cap sync` + Xcode clean build + TestFlight upload.
2. With Spotify playing in the foreground → background it → open PC OS → start a workout → log a set → wait for rest timer to hit 0.
   - ✅ Cue plays audibly
   - ✅ Spotify keeps playing uninterrupted (no pause, no duck)
3. Settings → Connected Devices → Connect Apple Health.
   - ✅ iOS native permission sheet appears (no red error toast)
4. Subscribe screen.
   - ✅ Both products render with prices (no "Unable to connect to App Store")
   - ✅ Tap Subscribe → native Apple payment sheet appears

## Required steps after merge

1. `npx cap sync`
2. Run `./scripts/post-cap-sync.sh`
3. **One-time** in Xcode: add `MainViewController.swift` to the App target and re-class the storyboard's root VC to `MainViewController` (instructions above)
4. Archive → TestFlight

## Files touched

- **New**: `ios-plugin/MainViewController.swift`
- **Edit**: `scripts/post-cap-sync.sh` (echo a reminder about the storyboard re-class step)

No JS/React changes. No database changes. No new dependencies.
