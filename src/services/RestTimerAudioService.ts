/**
 * RestTimerAudioService — Singleton Web Audio API service for iOS Safari
 *
 * Solves:
 * 1. AudioContext suspension — resumes on every unlock()
 * 2. User gesture requirement — unlock() plays silent buffer during taps
 * 3. Reliable playback — uses AudioBuffer (not HTML5 Audio)
 * 4. iOS background suspension — keepalive plays silent buffer every 5s
 *
 * Usage:
 *   import { restTimerAudio } from "@/services/RestTimerAudioService";
 *   // On every user tap in training view:
 *   restTimerAudio.unlock();
 *   // When rest timer starts:
 *   restTimerAudio.startKeepAlive();
 *   // When timer hits 3 seconds:
 *   restTimerAudio.playCountdown();
 *   // When timer completes or is skipped:
 *   restTimerAudio.stopKeepAlive();
 */

const COUNTDOWN_URL = "/sounds/rest-timer-countdown.mp3";
const OVERLAY_VOLUME = 0.85;
const KEEPALIVE_INTERVAL_MS = 5000;
let audioMixConfigured = false;
type ManagedAudioContextState = AudioContextState | "interrupted";

class RestTimerAudioService {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private countdownBuffer: AudioBuffer | null = null;
  private bufferLoading: Promise<AudioBuffer | null> | null = null;
  private activeSource: AudioBufferSourceNode | OscillatorNode | null = null;
  private unlocked = false;
  private keepAliveId: ReturnType<typeof setInterval> | null = null;

  /** Get or create AudioContext + gain node */
  private ensureContext(): AudioContext | null {
    if (this.ctx && this.ctx.state !== "closed") return this.ctx;

    // Configure native iOS audio session for mixing (fire-and-forget)
    if (!audioMixConfigured) {
      audioMixConfigured = true;
      this.configureNativeMixing();
    }

    const Ctor =
      window.AudioContext ||
      (window as any).webkitAudioContext;
    if (!Ctor) {
      console.warn("[RestTimerAudio] Web Audio API not available");
      return null;
    }

    // Use playout category on iOS to mix with other audio (Spotify, Apple Music)
    try {
      this.ctx = new Ctor({ sampleRate: 44100 } as any);
    } catch {
      this.ctx = new Ctor();
    }

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = OVERLAY_VOLUME;
    this.gainNode.connect(this.ctx.destination);
    return this.ctx;
  }

  /** Tell iOS to mix our audio with Spotify/Apple Music instead of pausing it */
  private async configureNativeMixing(): Promise<void> {
    try {
      const { default: AudioMixPlugin } = await import("@/plugins/AudioMixPlugin");
      await AudioMixPlugin.enableMixing();
      console.log("[RestTimerAudio] Native audio mixing enabled");
    } catch {
      // Not running in native shell — no-op in browser
    }
  }

  private isRunningState(state: ManagedAudioContextState): boolean {
    return state === "running";
  }

  private async resumeContext(ctx: AudioContext): Promise<boolean> {
    if (this.isRunningState(ctx.state as ManagedAudioContextState)) return true;

    try {
      await ctx.resume();
    } catch (e) {
      console.warn("[RestTimerAudio] Resume failed:", e);
    }

    return this.isRunningState(ctx.state as ManagedAudioContextState);
  }

  private async ensureRunningContext(): Promise<AudioContext | null> {
    let ctx = this.ensureContext();
    if (!ctx) return null;

    if (await this.resumeContext(ctx)) {
      return ctx;
    }

    try {
      await ctx.close();
    } catch {
      // ignore teardown issues and recreate below
    }

    this.ctx = null;
    this.gainNode = null;
    ctx = this.ensureContext();
    if (!ctx) return null;

    return (await this.resumeContext(ctx)) ? ctx : null;
  }

  /** Play a single-sample silent buffer to keep iOS AudioContext alive */
  private playSilent(): void {
    if (!this.ctx || this.ctx.state === "closed") return;
    try {
      if (!this.isRunningState(this.ctx.state as ManagedAudioContextState)) {
        this.ctx.resume().catch(() => {});
      }
      const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
    } catch {
      // ignore
    }
  }

  private playFallbackTone(ctx: AudioContext): boolean {
    if (!this.gainNode) return false;

    try {
      const oscillator = ctx.createOscillator();
      const toneGain = ctx.createGain();
      const startAt = ctx.currentTime;

      oscillator.type = "sine";
      oscillator.frequency.value = 880;

      toneGain.gain.setValueAtTime(0.0001, startAt);
      toneGain.gain.exponentialRampToValueAtTime(0.45, startAt + 0.02);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.24);

      oscillator.connect(toneGain);
      toneGain.connect(this.gainNode);
      oscillator.onended = () => {
        if (this.activeSource === oscillator) this.activeSource = null;
        oscillator.disconnect();
        toneGain.disconnect();
      };

      this.activeSource = oscillator;
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.26);
      console.warn("[RestTimerAudio] Falling back to synthesized timer tone");
      return true;
    } catch (e) {
      console.warn("[RestTimerAudio] Fallback tone failed:", e);
      return false;
    }
  }

  /**
   * Start keepalive loop — plays a silent buffer every 5s to prevent
   * iOS from suspending the AudioContext during long rest periods.
   * Safe to call multiple times; previous interval is cleared first.
   */
  startKeepAlive(): void {
    this.stopKeepAlive();
    // Immediately play one silent buffer
    this.playSilent();
    this.keepAliveId = setInterval(() => this.playSilent(), KEEPALIVE_INTERVAL_MS);
    console.log("[RestTimerAudio] Keepalive started");
  }

  /** Stop keepalive loop */
  stopKeepAlive(): void {
    if (this.keepAliveId !== null) {
      clearInterval(this.keepAliveId);
      this.keepAliveId = null;
      console.log("[RestTimerAudio] Keepalive stopped");
    }
  }

  /**
   * MUST be called from a user gesture (tap/click).
   * Resumes AudioContext and plays a silent buffer to satisfy iOS autoplay policy.
   */
  async unlock(): Promise<void> {
    const ctx = await this.ensureRunningContext();
    if (!ctx) return;

    // Play a tiny silent buffer to keep iOS happy
    this.playSilent();

    this.unlocked = true;

    // Start preloading if not already done
    if (!this.countdownBuffer && !this.bufferLoading) {
      this.preload();
    }
  }

  /** Preload and decode the countdown MP3 */
  async preload(): Promise<void> {
    if (this.countdownBuffer) return;
    if (this.bufferLoading) {
      await this.bufferLoading;
      return;
    }

    this.bufferLoading = (async () => {
      const ctx = await this.ensureRunningContext();
      if (!ctx) return null;

      try {
        const resp = await fetch(COUNTDOWN_URL, { cache: "force-cache" });
        if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
        const ab = await resp.arrayBuffer();
        const decoded = await ctx.decodeAudioData(ab.slice(0));
        this.countdownBuffer = decoded;
        console.log("[RestTimerAudio] Countdown buffer preloaded");
        return decoded;
      } catch (e) {
        console.warn("[RestTimerAudio] Preload failed:", e);
        return null;
      }
    })();

    await this.bufferLoading;
    this.bufferLoading = null;
  }

  /** Play the 3-second countdown sound. Mixes with music. */
  async playCountdown(): Promise<boolean> {
    const ctx = await this.ensureRunningContext();
    if (!ctx || !this.gainNode) return false;

    // Ensure buffer is loaded
    if (!this.countdownBuffer) {
      await this.preload();
    }

    // Stop any currently playing countdown
    this.stopCountdown();

    if (!this.countdownBuffer) {
      console.warn("[RestTimerAudio] No buffer available, skipping playback");
      return this.playFallbackTone(ctx);
    }

    const source = ctx.createBufferSource();

    try {
      source.buffer = this.countdownBuffer;
      source.connect(this.gainNode);
      source.onended = () => {
        if (this.activeSource === source) this.activeSource = null;
        source.disconnect();
      };
      this.activeSource = source;
      source.start(0);
      console.log("[RestTimerAudio] Countdown playing");
      return true;
    } catch (e) {
      console.warn("[RestTimerAudio] Playback failed:", e);
      source.disconnect();
      return this.playFallbackTone(ctx);
    }
  }

  /** Stop currently playing countdown */
  stopCountdown(): void {
    if (!this.activeSource) return;
    try {
      this.activeSource.stop();
    } catch {
      // already stopped
    }
    this.activeSource = null;
  }
}

// Singleton
export const restTimerAudio = new RestTimerAudioService();
