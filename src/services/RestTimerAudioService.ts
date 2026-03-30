import { Capacitor } from "@capacitor/core";
import AudioMixPlugin from "@/plugins/AudioMixPlugin";

type ManagedAudioContextState = AudioContextState | "interrupted";

class RestTimerAudioService {
  private ctx: AudioContext | null = null;
  private activeNodes: (OscillatorNode | GainNode)[] = [];
  private unlocked = false;

  private isNativeIOS(): boolean {
    return Capacitor.getPlatform() === "ios";
  }

  private async enableNativeAudioSession(): Promise<void> {
    if (!this.isNativeIOS()) return;

    try {
      await AudioMixPlugin.enableMixing();
      console.log("[RestTimerAudio] Native audio session prepared");
    } catch (err) {
      console.warn("[RestTimerAudio] Native audio session unavailable:", err);
    }
  }

  private async tryNativeAlarm(): Promise<boolean> {
    if (!this.isNativeIOS()) return false;

    try {
      await AudioMixPlugin.enableMixing();
      const result = await AudioMixPlugin.playRestTimerAlarm();
      const played = !!result?.success;
      if (played) {
        console.log("[RestTimerAudio] ✅ Native rest timer alarm playing");
      }
      return played;
    } catch (err) {
      console.warn("[RestTimerAudio] Native alarm failed, falling back to Web Audio:", err);
      return false;
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx && this.ctx.state !== "closed") return this.ctx;

    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
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

    try {
      await ctx.resume();
    } catch {
      // ignore
    }

    return (ctx.state as ManagedAudioContextState) === "running";
  }

  private async ensureRunningContext(): Promise<AudioContext | null> {
    let ctx = this.ensureContext();
    if (!ctx) return null;
    if (await this.resumeContext(ctx)) return ctx;

    try {
      await ctx.close();
    } catch {
      // ignore
    }

    this.ctx = null;
    ctx = this.ensureContext();
    if (!ctx) return null;

    return (await this.resumeContext(ctx)) ? ctx : null;
  }

  private async primeWebAudioContext(): Promise<boolean> {
    const ctx = await this.ensureRunningContext();
    if (!ctx) return false;

    try {
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      this.unlocked = true;
      console.log("[RestTimerAudio] AudioContext unlocked");
      return true;
    } catch {
      return false;
    }
  }

  private async playSynthAlarm(): Promise<boolean> {
    if (!this.unlocked) {
      console.warn("[RestTimerAudio] Alarm fallback using Web Audio before explicit unlock");
    }

    const ctx = await this.ensureRunningContext();
    if (!ctx) {
      console.warn("[RestTimerAudio] No AudioContext available");
      return false;
    }

    this.stopAlarm();

    try {
      const t = ctx.currentTime;

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

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.value = 1320;
      gain2.gain.setValueAtTime(0.0001, t + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.55, t + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(t + 0.18);
      osc2.stop(t + 0.42);

      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = "sine";
      osc3.frequency.value = 1760;
      gain3.gain.setValueAtTime(0.0001, t + 0.44);
      gain3.gain.exponentialRampToValueAtTime(0.4, t + 0.46);
      gain3.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(t + 0.44);
      osc3.stop(t + 0.72);

      this.activeNodes = [osc1, gain1, osc2, gain2, osc3, gain3];

      osc3.onended = () => {
        this.activeNodes = [];
        [osc1, gain1, osc2, gain2, osc3, gain3].forEach((node) => {
          try {
            node.disconnect();
          } catch {
            // ignore
          }
        });
      };

      console.log("[RestTimerAudio] ✅ Web Audio completion alarm playing");
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
          try {
            osc.disconnect();
          } catch {
            // ignore
          }
          try {
            gain.disconnect();
          } catch {
            // ignore
          }
        };
        console.log("[RestTimerAudio] ✅ Fallback alarm playing");
        return true;
      } catch (fallbackErr) {
        console.error("[RestTimerAudio] ❌ Fallback alarm failed:", fallbackErr);
      }

      return false;
    }
  }

  async unlock(): Promise<void> {
    const webUnlockPromise = this.primeWebAudioContext();
    const nativeSessionPromise = this.enableNativeAudioSession();

    await webUnlockPromise;
    await nativeSessionPromise;
  }

  async playCompletionAlarm(): Promise<boolean> {
    const nativeSessionPromise = this.enableNativeAudioSession();
    const synthPlayed = await this.playSynthAlarm();
    await nativeSessionPromise;

    if (synthPlayed) {
      if (this.isNativeIOS()) {
        console.log("[RestTimerAudio] ✅ Synth alarm playing with iOS mix session");
      }
      return true;
    }

    return this.tryNativeAlarm();
  }

  stopAlarm(): void {
    for (const node of this.activeNodes) {
      try {
        if ("stop" in node && typeof node.stop === "function") {
          node.stop();
        }
        node.disconnect();
      } catch {
        // ignore
      }
    }
    this.activeNodes = [];
  }

  async preload(): Promise<void> {}
  async playCountdown(): Promise<boolean> {
    return this.playCompletionAlarm();
  }
  stopCountdown(): void {
    this.stopAlarm();
  }
  startKeepAlive(): void {}
  stopKeepAlive(): void {}

  async dispose(): Promise<void> {
    this.stopAlarm();
    if (this.ctx && this.ctx.state !== "closed") {
      try {
        await this.ctx.close();
      } catch {
        // ignore
      }
    }
    this.ctx = null;
    this.unlocked = false;
  }
}

export const restTimerAudio = new RestTimerAudioService();
