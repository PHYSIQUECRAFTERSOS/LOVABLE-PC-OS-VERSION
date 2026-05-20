import UIKit
import Capacitor

/// Custom CAPBridgeViewController subclass that manually registers our
/// local Swift plugins with the Capacitor bridge.
///
/// In Capacitor 7/8, local custom Swift plugins added directly to the App
/// target are NOT auto-discovered by the Objective-C runtime — that path
/// only works for plugins distributed via Cocoapods/SPM. Local plugins
/// must be registered manually via `bridge?.registerPluginInstance(...)`
/// inside `capacitorDidLoad()`.
///
/// Without this, the JS `registerPlugin("AudioMixPlugin" | "HealthKitPlugin" | "StoreKit")`
/// calls fall through to the web-fallback `UNIMPLEMENTED` rejection, which
/// is why on TestFlight the rest-timer cue is silent, Apple Health refuses
/// to connect, and the App Store cannot load subscription products.
///
/// One-time wiring (after dragging this file into the App target in Xcode):
///   Main.storyboard → Bridge View Controller → Identity Inspector
///     Class:  MainViewController
///     Module: App
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        print("[Caps] Registering local plugins…")
        bridge?.registerPluginInstance(AudioMixPlugin())
        bridge?.registerPluginInstance(HealthKitPlugin())
        bridge?.registerPluginInstance(StoreKitPlugin())
        print("[Caps] AudioMixPlugin + HealthKitPlugin + StoreKitPlugin registered")
    }
}
