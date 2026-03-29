/**
 * RestTimerAudioService — Hybrid Native + Web Audio
 *
 * On NATIVE (Capacitor iOS/Android):
 *   Uses @capacitor-community/native-audio with focus:false
 *   so the countdown sound MIXES with Spotify / Apple Music.
 *
 * On WEB (browser / PWA):
 *   Falls back to Web Audio API (AudioContext) which will pause
 *   background music on mobile browsers — acceptable since native
 *   is the primary target.
 *
 * Usage:
 *   import { restTimerAudio } from "@/services/RestTimerAudioService";
 *   restTimerAudio.unlock();          // call on user gesture
 *   restTimerAudio.startKeepAlive();  // when rest timer starts
 *   restTimerAudio.playCountdown();   // at 3 seconds remaining
 *   restTimerAudio.stopCountdown();   // on skip
 *   restTimerAudio.stopKeepAlive();   // when timer completes
 */

import { Capacitor } from "@capacitor/core";
import AudioMixPlugin from "@/plugins/AudioMixPlugin";

const NATIVE_ASSET_ID = "rest_timer_countdown";
const NATIVE_ASSET_PATH = "public/audio/Rest_Timer_3_Seconds.mp3";
const WEB_COUNTDOWN_URL = "/audio/Rest_Timer_3_Seconds.mp3";
const OVERLAY_VOLUME = 0.85;
const KEEPALIVE_INTERVAL_MS = 5000;

type ManagedAudioContextState = AudioContextState | "interrupted";

class RestTimerAudioService {
  // --- Native state ---
  private nativePreloaded = false;
  private nativePreloading: Promise<void> | null = null;

  // --- Web fallback state ---
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private countdownBuffer: AudioBuffer | null = null;
  private bufferLoading: Promise<AudioBuffer | null> | null = null;
  private activeSource: AudioBufferSourceNode | OscillatorNode | null = null;
  private unlocked = false;
  private keepAliveId: ReturnType<typeof setInterval> | null = null;

  private get isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  // ========== NATIVE AUDIO (Capacitor) ==========

  private async getNativeAudio() {
    const { NativeAudio } = await import("@capacitor-community/native-audio");
    return NativeAudio;
  }

  private async nativePreload(): Promise<void> {
    if (this.nativePreloaded) return;
    if (this.nativePreloading) {
      await this.nativePreloading;
      return;
    }

    this.nativePreloading = (async () => {
      try {
        // Configure AVAudioSession for mixing BEFORE preloading
        try {
          await AudioMixPlugin.enableMixing();
          console.log("[RestTimerAudio] AudioMixPlugin mixing enabled");
        } catch (mixErr) {
          console.warn("[RestTimerAudio] AudioMixPlugin not available:", mixErr);
        }

        const NativeAudio = await this.getNativeAudio();
        // CRITICAL: focus:false tells the native layer to NOT steal audio focus,
        // so Spotify / Apple Music keeps playing alongside our sound.
        await NativeAudio.configure({ focus: false, fade: false });
        await NativeAudio.preload({
          assetId: NATIVE_ASSET_ID,
          assetPath: NATIVE_ASSET_PATH,
          audioChannelNum: 1,
          isUrl: false,
        });
        this.nativePreloaded = true;
        console.log("[RestTimerAudio] Native preload OK — assetPath:", NATIVE_ASSET_PATH);
      } catch (err: any) {
        if (err?.message?.includes("already exists")) {
          this.nativePreloaded = true;
          console.log("[RestTimerAudio] Native asset already loaded");
        } else {
          console.error("[RestTimerAudio] Native preload failed:", err);
          // Try alternate path without public/ prefix
          try {
            const NativeAudio = await this.getNativeAudio();
            await NativeAudio.preload({
              assetId: NATIVE_ASSET_ID,
              assetPath: "audio/Rest_Timer_3_Seconds.mp3",
              audioChannelNum: 1,
              isUrl: false,
            });
            this.nativePreloaded = true;
            console.log("[RestTimerAudio] Native preload OK with alternate path");
          } catch (err2: any) {
            if (err2?.message?.includes("already exists")) {
              this.nativePreloaded = true;
            } else {
              console.error("[RestTimerAudio] Native preload failed with alternate path too:", err2);
            }
          }
        }
      }
    })();

    await this.nativePreloading;
    this.nativePreloading = null;
  }

  private async nativePlay(): Promise<boolean> {
    // Re-enable mixing before every play in case iOS reset the audio session
    try {
      await AudioMixPlugin.enableMixing();
    } catch { /* plugin not available on web */ }

    if (!this.nativePreloaded) {
      await this.nativePreload();
    }
    try {
      const NativeAudio = await this.getNativeAudio();
      // Stop any running instance so replay works cleanly
      try { await NativeAudio.stop({ assetId: NATIVE_ASSET_ID }); } catch { /* not playing */ }
      await NativeAudio.play({ assetId: NATIVE_ASSET_ID });
      console.log("[RestTimerAudio] ✅ Native countdown PLAYING");
      return true;
    } catch (err) {
      console.error("[RestTimerAudio] ❌ Native play failed:", err);
      // Fall back to web audio on native if NativeAudio fails
      console.log("[RestTimerAudio] Attempting web audio fallback on native...");
      return this.webPlay();
    }
  }

  private async nativeStop(): Promise<void> {
    try {
      const NativeAudio = await this.getNativeAudio();
      await NativeAudio.stop({ assetId: NATIVE_ASSET_ID });
    } catch { /* not playing */ }
  }

  private async nativeUnload(): Promise<void> {
    if (!this.nativePreloaded) return;
    try {
      const NativeAudio = await this.getNativeAudio();
      await NativeAudio.unload({ assetId: NATIVE_ASSET_ID });
    } catch { /* already unloaded */ }
    this.nativePreloaded = false;
  }

  // ========== WEB AUDIO FALLBACK ==========

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

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = OVERLAY_VOLUME;
    this.gainNode.connect(this.ctx.destination);
    return this.ctx;
  }

  private async resumeContext(ctx: AudioContext): Promise<boolean> {
    if ((ctx.state as ManagedAudioContextState) === "running") return true;
    try { await ctx.resume(); } catch { /* ignore */ }
    return (ctx.state as ManagedAudioContextState) === "running";
  }

  private async ensureRunningContext(): Promise<AudioContext | null> {
    let ctx = this.ensureContext();
    if (!ctx) return null;
    if (await this.resumeContext(ctx)) return ctx;

    try { await ctx.close(); } catch { /* ignore */ }
    this.ctx = null;
    this.gainNode = null;
    ctx = this.ensureContext();
    if (!ctx) return null;
    return (await this.resumeContext(ctx)) ? ctx : null;
  }

  private playSilent(): void {
    if (!this.ctx || this.ctx.state === "closed") return;
    try {
      if ((this.ctx.state as ManagedAudioContextState) !== "running") {
        this.ctx.resume().catch(() => {});
      }
      const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
    } catch { /* ignore */ }
  }

  private playFallbackTone(ctx: AudioContext): boolean {
    if (!this.gainNode) return false;
    try {
      const osc = ctx.createOscillator();
      const toneGain = ctx.createGain();
      const t = ctx.currentTime;
      osc.type = "sine";
      osc.frequency.value = 880;
      toneGain.gain.setValueAtTime(0.0001, t);
      toneGain.gain.exponentialRampToValueAtTime(0.45, t + 0.02);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      osc.connect(toneGain);
      toneGain.connect(this.gainNode);
      osc.onended = () => {
        if (this.activeSource === osc) this.activeSource = null;
        osc.disconnect();
        toneGain.disconnect();
      };
      this.activeSource = osc;
      osc.start(t);
      osc.stop(t + 0.26);
      return true;
    } catch { return false; }
  }

  private async webPreload(): Promise<void> {
    if (this.countdownBuffer) return;
    if (this.bufferLoading) { await this.bufferLoading; return; }

    this.bufferLoading = (async () => {
      const ctx = await this.ensureRunningContext();
      if (!ctx) return null;
      try {
        const resp = await fetch(WEB_COUNTDOWN_URL, { cache: "force-cache" });
        if (!resp.ok) throw new Error(`Fetch ${resp.status}`);
        const ab = await resp.arrayBuffer();
        const decoded = await ctx.decodeAudioData(ab.slice(0));
        this.countdownBuffer = decoded;
        console.log("[RestTimerAudio] Web buffer preloaded");
        return decoded;
      } catch (e) {
        console.warn("[RestTimerAudio] Web preload failed:", e);
        return null;
      }
    })();

    await this.bufferLoading;
    this.bufferLoading = null;
  }

  private async webPlay(): Promise<boolean> {
    const ctx = await this.ensureRunningContext();
    if (!ctx || !this.gainNode) return false;

    if (!this.countdownBuffer) await this.webPreload();
    this.webStopSource();

    if (!this.countdownBuffer) return this.playFallbackTone(ctx);

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
      console.log("[RestTimerAudio] Web countdown playing");
      return true;
    } catch {
      source.disconnect();
      return this.playFallbackTone(ctx);
    }
  }

  private webStopSource(): void {
    if (!this.activeSource) return;
    try { this.activeSource.stop(); } catch { /* already stopped */ }
    this.activeSource = null;
  }

  // ========== PUBLIC API ==========

  /**
   * Start keepalive loop (web only — native doesn't need it).
   */
  startKeepAlive(): void {
    if (this.isNative) return; // native audio doesn't suspend
    this.stopKeepAlive();
    this.playSilent();
    this.keepAliveId = setInterval(() => this.playSilent(), KEEPALIVE_INTERVAL_MS);
  }

  stopKeepAlive(): void {
    if (this.keepAliveId !== null) {
      clearInterval(this.keepAliveId);
      this.keepAliveId = null;
    }
  }

  /**
   * Call on user gesture to satisfy iOS autoplay policy.
   * On native: preloads the audio asset.
   * On web: resumes AudioContext + preloads buffer.
   */
  async unlock(): Promise<void> {
    if (this.isNative) {
      await this.nativePreload();
    } else {
      const ctx = await this.ensureRunningContext();
      if (ctx) this.playSilent();
      this.unlocked = true;
      if (!this.countdownBuffer && !this.bufferLoading) {
        this.webPreload();
      }
    }
  }

  /** Preload countdown audio */
  async preload(): Promise<void> {
    if (this.isNative) {
      await this.nativePreload();
    } else {
      await this.webPreload();
    }
  }

  /** Play the 3-second countdown. Returns true if playback started. */
  async playCountdown(): Promise<boolean> {
    if (this.isNative) {
      return this.nativePlay();
    }
    return this.webPlay();
  }

  /** Stop currently playing countdown */
  stopCountdown(): void {
    if (this.isNative) {
      void this.nativeStop();
    } else {
      this.webStopSource();
    }
  }

  /** Unload audio resources (call when workout session ends) */
  async dispose(): Promise<void> {
    this.stopKeepAlive();
    this.stopCountdown();

    if (this.isNative) {
      await this.nativeUnload();
    } else {
      this.gainNode?.disconnect();
      this.gainNode = null;
      this.countdownBuffer = null;
      this.bufferLoading = null;
      if (this.ctx && this.ctx.state !== "closed") {
        try { await this.ctx.close(); } catch { /* ignore */ }
      }
      this.ctx = null;
    }
  }
}

// Singleton
export const restTimerAudio = new RestTimerAudioService();
