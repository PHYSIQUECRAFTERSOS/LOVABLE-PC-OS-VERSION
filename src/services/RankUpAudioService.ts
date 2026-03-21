/**
 * RankUpAudioService — Synthesized rank-up sounds using Web Audio API
 * No external MP3 files needed — generates chimes, fanfares, and epic hits programmatically.
 */

class RankUpAudioService {
  private ctx: AudioContext | null = null;

  private ensureContext(): AudioContext | null {
    if (this.ctx && this.ctx.state !== "closed") return this.ctx;
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    return this.ctx;
  }

  private async resume() {
    const ctx = this.ensureContext();
    if (ctx?.state === "suspended") {
      try { await ctx.resume(); } catch {}
    }
    return ctx;
  }

  /** Division Up — bright ascending chime, ~1s */
  async playDivisionUp(): Promise<void> {
    const ctx = await this.resume();
    if (!ctx) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.35, now);
    master.gain.linearRampToValueAtTime(0, now + 1.2);
    master.connect(ctx.destination);

    // Three ascending tones
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0, now + i * 0.15);
      g.gain.linearRampToValueAtTime(0.6, now + i * 0.15 + 0.05);
      g.gain.linearRampToValueAtTime(0, now + i * 0.15 + 0.5);
      osc.connect(g);
      g.connect(master);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.6);
    });

    // Shimmer
    const shimmer = ctx.createOscillator();
    const sg = ctx.createGain();
    shimmer.type = "triangle";
    shimmer.frequency.setValueAtTime(1046.5, now + 0.3);
    sg.gain.setValueAtTime(0, now + 0.3);
    sg.gain.linearRampToValueAtTime(0.15, now + 0.4);
    sg.gain.linearRampToValueAtTime(0, now + 1.0);
    shimmer.connect(sg);
    sg.connect(master);
    shimmer.start(now + 0.3);
    shimmer.stop(now + 1.1);
  }

  /** Tier Up — epic fanfare, ~2.5s */
  async playTierUp(): Promise<void> {
    const ctx = await this.resume();
    if (!ctx) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.4, now);
    master.gain.linearRampToValueAtTime(0, now + 2.8);
    master.connect(ctx.destination);

    // Brass-like tones (sawtooth with filter)
    const chordFreqs = [
      { f: 261.63, t: 0 },     // C4
      { f: 329.63, t: 0.2 },   // E4
      { f: 392.0, t: 0.4 },    // G4
      { f: 523.25, t: 0.7 },   // C5
      { f: 659.25, t: 1.0 },   // E5
      { f: 783.99, t: 1.2 },   // G5
      { f: 1046.5, t: 1.5 },   // C6 - peak
    ];

    chordFreqs.forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f, now + t);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(f * 3, now + t);
      filter.Q.setValueAtTime(1, now + t);
      g.gain.setValueAtTime(0, now + t);
      g.gain.linearRampToValueAtTime(0.3, now + t + 0.08);
      g.gain.linearRampToValueAtTime(0.15, now + t + 0.4);
      g.gain.linearRampToValueAtTime(0, now + t + 1.2);
      osc.connect(filter);
      filter.connect(g);
      g.connect(master);
      osc.start(now + t);
      osc.stop(now + t + 1.3);
    });

    // Impact sub-bass hit
    const sub = ctx.createOscillator();
    const subG = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(80, now);
    sub.frequency.exponentialRampToValueAtTime(40, now + 0.5);
    subG.gain.setValueAtTime(0.5, now);
    subG.gain.linearRampToValueAtTime(0, now + 0.6);
    sub.connect(subG);
    subG.connect(master);
    sub.start(now);
    sub.stop(now + 0.7);

    // Sparkle layer
    for (let i = 0; i < 8; i++) {
      const s = ctx.createOscillator();
      const sg = ctx.createGain();
      s.type = "sine";
      const sparkleTime = now + 1.5 + Math.random() * 1.0;
      s.frequency.setValueAtTime(2000 + Math.random() * 4000, sparkleTime);
      sg.gain.setValueAtTime(0, sparkleTime);
      sg.gain.linearRampToValueAtTime(0.05, sparkleTime + 0.02);
      sg.gain.linearRampToValueAtTime(0, sparkleTime + 0.15);
      s.connect(sg);
      sg.connect(master);
      s.start(sparkleTime);
      s.stop(sparkleTime + 0.2);
    }
  }

  /** Champion — grand orchestral hit, ~3.5s */
  async playChampionIn(): Promise<void> {
    const ctx = await this.resume();
    if (!ctx) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.45, now);
    master.gain.linearRampToValueAtTime(0, now + 4.0);
    master.connect(ctx.destination);

    // Deep impact
    const impact = ctx.createOscillator();
    const impG = ctx.createGain();
    impact.type = "sine";
    impact.frequency.setValueAtTime(100, now);
    impact.frequency.exponentialRampToValueAtTime(30, now + 0.8);
    impG.gain.setValueAtTime(0.7, now);
    impG.gain.linearRampToValueAtTime(0, now + 1.0);
    impact.connect(impG);
    impG.connect(master);
    impact.start(now);
    impact.stop(now + 1.1);

    // Noise burst (crash cymbal effect)
    const bufferSize = ctx.sampleRate * 0.5;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.setValueAtTime(8000, now);
    const noiseG = ctx.createGain();
    noiseG.gain.setValueAtTime(0.3, now);
    noiseG.gain.linearRampToValueAtTime(0, now + 0.6);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseG);
    noiseG.connect(master);
    noise.start(now);
    noise.stop(now + 0.7);

    // Majestic chord stacks
    const chords = [
      { freqs: [130.81, 164.81, 196.0], t: 0.1 },     // C major low
      { freqs: [261.63, 329.63, 392.0], t: 0.3 },     // C major mid
      { freqs: [523.25, 659.25, 783.99], t: 0.6 },    // C major high
      { freqs: [1046.5, 1318.5, 1568.0], t: 1.0 },    // C major very high
    ];

    chords.forEach(({ freqs, t }) => {
      freqs.forEach((f) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(f, now + t);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(f * 4, now + t);
        g.gain.setValueAtTime(0, now + t);
        g.gain.linearRampToValueAtTime(0.2, now + t + 0.1);
        g.gain.setValueAtTime(0.2, now + t + 1.0);
        g.gain.linearRampToValueAtTime(0, now + t + 2.5);
        osc.connect(filter);
        filter.connect(g);
        g.connect(master);
        osc.start(now + t);
        osc.stop(now + t + 2.6);
      });
    });

    // Sparkle wave 1 & 2
    [1.5, 3.0].forEach((wave) => {
      for (let i = 0; i < 12; i++) {
        const s = ctx.createOscillator();
        const sg = ctx.createGain();
        s.type = "sine";
        const sTime = now + wave + Math.random() * 0.8;
        s.frequency.setValueAtTime(3000 + Math.random() * 5000, sTime);
        sg.gain.setValueAtTime(0, sTime);
        sg.gain.linearRampToValueAtTime(0.04, sTime + 0.02);
        sg.gain.linearRampToValueAtTime(0, sTime + 0.2);
        s.connect(sg);
        sg.connect(master);
        s.start(sTime);
        s.stop(sTime + 0.25);
      }
    });
  }
}

export const rankUpAudio = new RankUpAudioService();
