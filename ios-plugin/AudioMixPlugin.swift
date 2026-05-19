import Foundation
import AVFoundation
import Capacitor

/// Configures AVAudioSession to mix with other apps (Spotify, Apple Music)
/// so NativeAudio plays layered over background music without interruption.
///
/// NOTE: A previous `playRestTimerAlarm` native-tone path was removed — the
/// rest-timer end cue now exclusively uses the bundled mp3 via NativeAudio
/// (foreground) and a scheduled LocalNotification (background/locked).
@objc(AudioMixPlugin)
public class AudioMixPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioMixPlugin"
    public let jsName = "AudioMixPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enableMixing", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
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
                options: [.mixWithOthers]
            )
            try session.setActive(true)
            CAPLog.print("[AudioMixPlugin] AVAudioSession set to .playback + mixWithOthers")
        } catch {
            CAPLog.print("[AudioMixPlugin] Failed to configure AVAudioSession: \(error)")
        }
    }
}
