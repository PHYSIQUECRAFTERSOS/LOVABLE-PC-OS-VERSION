import Foundation
import AVFoundation
import Capacitor

/// Configures AVAudioSession to mix with other apps (Spotify, Apple Music)
/// so that Web Audio API sounds overlay instead of interrupting music.
@objc(AudioMixPlugin)
public class AudioMixPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioMixPlugin"
    public let jsName = "AudioMixPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enableMixing", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        // Auto-enable mixing when the plugin loads so music never gets interrupted
        configureMixing()
    }

    @objc func enableMixing(_ call: CAPPluginCall) {
        configureMixing()
        call.resolve(["success": true])
    }

    private func configureMixing() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playback,
                mode: .default,
                options: [.mixWithOthers, .duckOthers]
            )
            try session.setActive(true)
            CAPLog.print("[AudioMixPlugin] AVAudioSession set to .playback + mixWithOthers + duckOthers")
        } catch {
            CAPLog.print("[AudioMixPlugin] Failed to configure AVAudioSession: \(error)")
        }
    }
}