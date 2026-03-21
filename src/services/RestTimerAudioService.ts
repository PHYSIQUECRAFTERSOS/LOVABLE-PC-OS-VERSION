/**
 * RestTimerAudioService — Singleton Web Audio API service for iOS Safari
 *
 * Solves:
 * 1. AudioContext suspension — resumes on every unlock()
 * 2. User gesture requirement — unlock() plays silent buffer during taps
 * 3. Reliable playback — uses AudioBuffer (not HTML5 Audio)
 *
 * Usage:
 *   import { restTimerAudio } from "@/services/RestTimerAudioService";
 *   // On every user tap in training view:
 *   restTimerAudio.unlock();
 *   // When timer hits 3 seconds:
 *   restTimerAudio.playCountdown();
 */

const COUNTDOWN_URL = "/sounds/rest-timer-countdown.mp3";
const OVERLAY_VOLUME = 0.85;

class RestTimerAudioService {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private countdownBuffer: AudioBuffer | null = null;
  private bufferLoading: Promise<AudioBuffer | null> | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private unlocked = false;

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

    this.ctx = new Ctor();
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = OVERLAY_VOLUME;
    this.gainNode.connect(this.ctx.destination);
    return this.ctx;
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
    try {
      const silentBuffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = silentBuffer;
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      // ignore
    }

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
