/**
 * RestTimerAudioService — Synthesized completion alarm
 *
 * Plays a short two-tone chime (880Hz → 1320Hz) exactly when the
 * rest timer hits zero. No external audio files — pure Web Audio API.
 *
 * Usage:
 *   import { restTimerAudio } from "@/services/RestTimerAudioService";
 *   restTimerAudio.unlock();               // call on user gesture
 *   restTimerAudio.playCompletionAlarm();   // at timer zero
 *   restTimerAudio.stopAlarm();             // on skip
 */

type ManagedAudioContextState = AudioContextState | "interrupted";

class RestTimerAudioService {
  private ctx: AudioContext | null = null;
  private activeNodes: (OscillatorNode | GainNode)[] = [];
  private unlocked = false;

  // ========== AUDIO CONTEXT MANAGEMENT ==========

  private ensureContext(): AudioContext | null {
    if (this.ctx && this.ctx.state !== "closed") return this.ctx;

    const Ctor =
      window.AudioContext ||
      (window as any).webkitAudioContext;
    if (!Ctor) return null;

    try {
      this.ctx = new Ctor({ sampleRate: 44100 } as any);
    } catch {
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  private async resumeContext(ctx: AudioContext): Promise<boolean> {
    const state = ctx.state as ManagedAudioContextState;
    if (state === "running") return true;
    // iOS "interrupted" state needs resume too
    try { await ctx.resume(); } catch { /* ignore */ }
    return (ctx.state as ManagedAudioContextState) === "running";
  }

  private async ensureRunningContext(): Promise<AudioContext | null> {
    let ctx = this.ensureContext();
    if (!ctx) return null;
    if (await this.resumeContext(ctx)) return ctx;

    // Context is stuck — recreate
    try { await ctx.close(); } catch { /* ignore */ }
    this.ctx = null;
    ctx = this.ensureContext();
    if (!ctx) return null;
    return (await this.resumeContext(ctx)) ? ctx : null;
  }

  // ========== PUBLIC API ==========

  /**
   * Call on user gesture to satisfy iOS autoplay policy.
   * Creates and resumes the AudioContext + plays a silent buffer.
   */
  async unlock(): Promise<void> {
    const ctx = await this.ensureRunningContext();
    if (!ctx) return;
    // Play silent buffer to fully unlock on iOS
    try {
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      this.unlocked = true;
      console.log("[RestTimerAudio] AudioContext unlocked");
    } catch { /* ignore */ }
  }

  /**
   * Play a short two-tone completion alarm.
   * Tone 1: 880Hz for 150ms, Tone 2: 1320Hz for 200ms.
   * Returns true if playback started.
   */
  async playCompletionAlarm(): Promise<boolean> {
    if (!this.unlocked) {
      console.warn("[RestTimerAudio] Alarm blocked — context not unlocked by user gesture yet");
    }

    const ctx = await this.ensureRunningContext();
    if (!ctx) {
      console.warn("[RestTimerAudio] No AudioContext available");
      return false;
    }

    this.stopAlarm(); // clear any prior

    try {
      const t = ctx.currentTime;

      // === Tone 1: 880 Hz ===
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.value = 880;
      gain1.gain.setValueAtTime(0.0001, t);
      gain1.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.17);

      // === Tone 2: 1320 Hz (starts after tone 1) ===
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.value = 1320;
      gain2.gain.setValueAtTime(0.0001, t + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.55, t + 0.20);
      gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.40);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(t + 0.18);
      osc2.stop(t + 0.42);

      // === Tone 3: Higher confirmation ping ===
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = "sine";
      osc3.frequency.value = 1760;
      gain3.gain.setValueAtTime(0.0001, t + 0.44);
      gain3.gain.exponentialRampToValueAtTime(0.4, t + 0.46);
      gain3.gain.exponentialRampToValueAtTime(0.0001, t + 0.70);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(t + 0.44);
      osc3.stop(t + 0.72);

      this.activeNodes = [osc1, gain1, osc2, gain2, osc3, gain3];

      // Auto-cleanup
      osc3.onended = () => {
        this.activeNodes = [];
        [osc1, gain1, osc2, gain2, osc3, gain3].forEach(n => {
          try { n.disconnect(); } catch { /* ignore */ }
        });
      };

      console.log("[RestTimerAudio] ✅ Completion alarm playing");
      return true;
    } catch (err) {
      console.error("[RestTimerAudio] ❌ Alarm playback failed:", err);

      try {
        const fallbackCtx = await this.ensureRunningContext();
        if (!fallbackCtx) return false;
        const t = fallbackCtx.currentTime + 0.01;
        const osc = fallbackCtx.createOscillator();
        const gain = fallbackCtx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(1046, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.7, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        osc.connect(gain);
        gain.connect(fallbackCtx.destination);
        osc.start(t);
        osc.stop(t + 0.27);
        this.activeNodes = [osc, gain];
        osc.onended = () => {
          this.activeNodes = [];
          try { osc.disconnect(); } catch {}
          try { gain.disconnect(); } catch {}
        };
        console.log("[RestTimerAudio] ✅ Fallback alarm playing");
        return true;
      } catch (fallbackErr) {
        console.error("[RestTimerAudio] ❌ Fallback alarm failed:", fallbackErr);
      }

      return false;
    }
  }

  /** Stop currently playing alarm */
  stopAlarm(): void {
    for (const node of this.activeNodes) {
      try {
        if ('stop' in node && typeof node.stop === 'function') {
          node.stop();
        }
        node.disconnect();
      } catch { /* already stopped */ }
    }
    this.activeNodes = [];
  }

  // ========== BACKWARD COMPAT (no-ops) ==========

  async preload(): Promise<void> { /* no-op — synthesized audio needs no preload */ }
  async playCountdown(): Promise<boolean> { return this.playCompletionAlarm(); }
  stopCountdown(): void { this.stopAlarm(); }
  startKeepAlive(): void { /* no-op */ }
  stopKeepAlive(): void { /* no-op */ }

  /** Unload audio resources */
  async dispose(): Promise<void> {
    this.stopAlarm();
    if (this.ctx && this.ctx.state !== "closed") {
      try { await this.ctx.close(); } catch { /* ignore */ }
    }
    this.ctx = null;
    this.unlocked = false;
  }
}

// Singleton
export const restTimerAudio = new RestTimerAudioService();
