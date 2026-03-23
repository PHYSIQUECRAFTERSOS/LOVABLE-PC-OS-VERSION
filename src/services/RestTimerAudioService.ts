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

class RestTimerAudioService {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private countdownBuffer: AudioBuffer | null = null;
  private bufferLoading: Promise<AudioBuffer | null> | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private unlocked = false;
  private keepAliveId: ReturnType<typeof setInterval> | null = null;

  /** Get or create AudioContext + gain node */
  private ensureContext(): AudioContext | null {
    if (this.ctx && this.ctx.state !== "closed") return this.ctx;

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

  /** Play a single-sample silent buffer to keep iOS AudioContext alive */
  private playSilent(): void {
    if (!this.ctx || this.ctx.state === "closed") return;
    try {
      if (this.ctx.state === "suspended") {
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
    const ctx = this.ensureContext();
    if (!ctx) return;

    // Resume if suspended
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (e) {
        console.warn("[RestTimerAudio] Resume failed:", e);
      }
    }

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
      const ctx = this.ensureContext();
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
  async playCountdown(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx || !this.gainNode) return;

    // Resume if suspended (e.g., after visibility change)
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // best effort
      }
    }

    // Ensure buffer is loaded
    if (!this.countdownBuffer) {
      await this.preload();
    }

    // Stop any currently playing countdown
    this.stopCountdown();

    if (!this.countdownBuffer) {
      console.warn("[RestTimerAudio] No buffer available, skipping playback");
      return;
    }

    try {
      const source = ctx.createBufferSource();
      source.buffer = this.countdownBuffer;
      source.connect(this.gainNode);
      source.onended = () => {
        if (this.activeSource === source) this.activeSource = null;
        source.disconnect();
      };
      this.activeSource = source;
      source.start(0);
      console.log("[RestTimerAudio] Countdown playing");
    } catch (e) {
      console.warn("[RestTimerAudio] Playback failed:", e);
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
