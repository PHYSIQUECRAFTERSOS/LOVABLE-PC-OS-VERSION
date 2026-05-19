import Foundation
import AVFoundation
import Capacitor

/// Owns AVAudioSession + plays the rest-timer cue.
///
/// We deliberately do NOT use @capacitor-community/native-audio for the
/// rest-timer end sound: that plugin re-asserts its own AVAudioSession
/// category (without .mixWithOthers) inside its play call, which silently
/// overrides any mixing we set elsewhere and causes Spotify / Apple Music
/// to pause. Playing the bundled mp3 via our own AVAudioPlayer here is the
/// only way to guarantee `.playback + .mixWithOthers` is in effect at the
/// exact moment the cue is decoded.
@objc(AudioMixPlugin)
public class AudioMixPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioMixPlugin"
    public let jsName = "AudioMixPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enableMixing", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "preloadRestTimerCue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playRestTimerCue", returnType: CAPPluginReturnPromise),
    ]

    private var restTimerPlayer: AVAudioPlayer?
    private let cueResource = "rest-timer-complete"
    private let cueExtension = "mp3"

    override public func load() {
        configureMixing()
        _ = loadCuePlayer()
    }

    @objc func enableMixing(_ call: CAPPluginCall) {
        configureMixing()
        call.resolve(["success": true])
    }

    @objc func preloadRestTimerCue(_ call: CAPPluginCall) {
        configureMixing()
        let ok = loadCuePlayer()
        call.resolve(["success": ok])
    }

    @objc func playRestTimerCue(_ call: CAPPluginCall) {
        // Re-assert mixing immediately before play in case some other code
        // path (push notification, etc.) reconfigured the session.
        configureMixing()

        guard let player = restTimerPlayer ?? {
            _ = loadCuePlayer()
            return restTimerPlayer
        }() else {
            call.reject("rest-timer-complete.mp3 not found in app bundle")
            return
        }

        player.currentTime = 0
        player.volume = 1.0
        let started = player.play()
        call.resolve(["success": started])
    }

    private func configureMixing() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playback,
                mode: .default,
                options: [.mixWithOthers]
            )
            try session.setActive(true, options: [])
        } catch {
            CAPLog.print("[AudioMixPlugin] Failed to configure AVAudioSession: \(error)")
        }
    }

    @discardableResult
    private func loadCuePlayer() -> Bool {
        if restTimerPlayer != nil { return true }
        guard let url = Bundle.main.url(forResource: cueResource, withExtension: cueExtension) else {
            CAPLog.print("[AudioMixPlugin] Missing bundle resource: \(cueResource).\(cueExtension)")
            return false
        }
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.numberOfLoops = 0
            player.volume = 1.0
            player.prepareToPlay()
            restTimerPlayer = player
            return true
        } catch {
            CAPLog.print("[AudioMixPlugin] AVAudioPlayer init failed: \(error)")
            return false
        }
    }
}
