import Foundation
import AVFoundation
import Capacitor

/// Configures AVAudioSession to mix with other apps (Spotify, Apple Music)
/// and provides a native rest timer completion alarm for reliable playback
/// on iOS/TestFlight even when WKWebView Web Audio is flaky.
@objc(AudioMixPlugin)
public class AudioMixPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioMixPlugin"
    public let jsName = "AudioMixPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enableMixing", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playRestTimerAlarm", returnType: CAPPluginReturnPromise),
    ]

    private let sampleRate: Double = 44_100
    private var engine: AVAudioEngine?
    private var playerNode: AVAudioPlayerNode?

    override public func load() {
        configureMixing()
        prepareEngineIfNeeded()
    }

    @objc func enableMixing(_ call: CAPPluginCall) {
        configureMixing()
        prepareEngineIfNeeded()
        call.resolve(["success": true])
    }

    @objc func playRestTimerAlarm(_ call: CAPPluginCall) {
        do {
            configureMixing()
            try playAlarmBuffer()
            call.resolve(["success": true])
        } catch {
            CAPLog.print("[AudioMixPlugin] Failed to play rest timer alarm: \(error.localizedDescription)")
            call.reject("Failed to play rest timer alarm: \(error.localizedDescription)")
        }
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

    private func prepareEngineIfNeeded() {
        guard engine == nil || playerNode == nil else {
            if let engine, !engine.isRunning {
                do {
                    try engine.start()
                } catch {
                    CAPLog.print("[AudioMixPlugin] Failed to restart audio engine: \(error)")
                }
            }
            return
        }

        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!

        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = 1.0

        do {
            try engine.start()
            self.engine = engine
            self.playerNode = player
            CAPLog.print("[AudioMixPlugin] Audio engine prepared")
        } catch {
            CAPLog.print("[AudioMixPlugin] Failed to start audio engine: \(error)")
        }
    }

    private func playAlarmBuffer() throws {
        prepareEngineIfNeeded()

        guard let engine = engine, let playerNode = playerNode else {
            throw NSError(domain: "AudioMixPlugin", code: 1, userInfo: [NSLocalizedDescriptionKey: "Audio engine unavailable"])
        }

        if !engine.isRunning {
            try engine.start()
        }

        if playerNode.isPlaying {
            playerNode.stop()
        }

        let buffer = makeAlarmBuffer()
        playerNode.scheduleBuffer(buffer, at: nil, options: .interrupts, completionHandler: nil)
        playerNode.play()

        CAPLog.print("[AudioMixPlugin] Rest timer alarm played")
    }

    private func makeAlarmBuffer() -> AVAudioPCMBuffer {
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        let tones: [(frequency: Double, duration: Double, amplitude: Double)] = [
            (880, 0.18, 0.55),
            (1320, 0.22, 0.6),
            (1760, 0.26, 0.48),
        ]
        let gapDuration = 0.04

        let totalDuration = tones.enumerated().reduce(0.0) { partial, item in
            let isLast = item.offset == tones.count - 1
            return partial + item.element.duration + (isLast ? 0 : gapDuration)
        }

        let totalFrames = max(1, Int(sampleRate * totalDuration))
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(totalFrames))!
        buffer.frameLength = AVAudioFrameCount(totalFrames)

        guard let channelData = buffer.floatChannelData?[0] else {
            return buffer
        }

        var cursor = 0
        for (index, tone) in tones.enumerated() {
            let toneFrames = max(1, Int(sampleRate * tone.duration))
            let attackFrames = max(1, Int(Double(toneFrames) * 0.12))
            let releaseFrames = max(1, Int(Double(toneFrames) * 0.25))

            for frame in 0..<toneFrames where cursor + frame < totalFrames {
                let time = Double(frame) / sampleRate
                let sample = sin(2.0 * Double.pi * tone.frequency * time)

                var envelope = tone.amplitude
                if frame < attackFrames {
                    envelope *= Double(frame) / Double(attackFrames)
                }
                if frame >= toneFrames - releaseFrames {
                    envelope *= Double(max(toneFrames - frame, 0)) / Double(releaseFrames)
                }

                channelData[cursor + frame] = Float(sample * envelope)
            }

            cursor += toneFrames
            if index < tones.count - 1 {
                cursor += Int(sampleRate * gapDuration)
            }
        }

        return buffer
    }
}
