/**
 * Rest Timer Audio Utility — AudioContext-only
 *
 * Uses Web Audio API (AudioContext) which MIXES with Spotify/Apple Music
 * instead of hijacking the audio session like <audio> elements do.
 *
 * Flow:
 * 1. Call `initAudioContext()` on a user gesture (e.g. "Start Workout")
 * 2. Call `preloadCountdownSound()` early to fetch+decode the MP3
 * 3. Call `playCountdownSound()` when 3 seconds remain on the rest timer
 * 4. Call `stopCountdownSound()` on skip/unmount
 */

let audioCtx: AudioContext | null = null;
let countdownBuffer: AudioBuffer | null = null;
let countdownBufferPromise: Promise<AudioBuffer | null> | null = null;
let activeSource: AudioBufferSourceNode | OscillatorNode | null = null;
let gainNode: GainNode | null = null;

/**
 * Overlay volume relative to music (0.0–1.0).
 * Kept high enough to be audible over Spotify/Apple Music without taking over playback.
 */
const OVERLAY_VOLUME = 0.9;
const COUNTDOWN_SOUND_URL = "/assets/sounds/rest-timer-countdown.mp3";

function createAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const AudioContextCtor = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    console.warn("[Audio] Web Audio API unavailable on this device");
    return null;
  }

  if (!audioCtx) {
    audioCtx = new AudioContextCtor();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = OVERLAY_VOLUME;
    gainNode.connect(audioCtx.destination);
  }

  return audioCtx;
}

async function ensureRunningAudioContext(): Promise<AudioContext | null> {
  const ctx = createAudioContext();
  if (!ctx) return null;

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch (error) {
      console.warn("[Audio] Failed to resume audio context:", error);
    }
  }

  return ctx;
}

async function loadCountdownBuffer(): Promise<AudioBuffer | null> {
  if (countdownBuffer) return countdownBuffer;
  if (countdownBufferPromise) return countdownBufferPromise;

  countdownBufferPromise = (async () => {
    const ctx = createAudioContext();
    if (!ctx) return null;

    const response = await fetch(COUNTDOWN_SOUND_URL, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Countdown sound fetch failed with ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const decodedBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    countdownBuffer = decodedBuffer;
    console.log("[Audio] Countdown sound preloaded successfully");
    return decodedBuffer;
  })()
    .catch((error) => {
      console.warn("[Audio] Sound preload failed:", error);
      countdownBuffer = null;
      return null;
    })
    .finally(() => {
      countdownBufferPromise = null;
    });

  return countdownBufferPromise;
}

function playFallbackTone(ctx: AudioContext): void {
  if (!gainNode) return;

  const oscillator = ctx.createOscillator();
  const localGain = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 880;

  localGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  localGain.gain.exponentialRampToValueAtTime(0.45, ctx.currentTime + 0.02);
  localGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);

  oscillator.connect(localGain);
  localGain.connect(gainNode);

  oscillator.onended = () => {
    if (activeSource === oscillator) activeSource = null;
    oscillator.disconnect();
    localGain.disconnect();
  };

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.24);
  activeSource = oscillator;
  console.warn("[Audio] Using fallback countdown tone");
}

/**
 * Create or resume the AudioContext. Must be called from a user gesture
 * (tap/click) at least once to satisfy iOS autoplay policy.
 */
export function initAudioContext(): void {
  void ensureRunningAudioContext();
}

/**
 * Fetch and decode the 3-second countdown MP3 into an AudioBuffer.
 * Safe to call multiple times — only loads once per session.
 */
export async function preloadCountdownSound(): Promise<void> {
  await loadCountdownBuffer();
}

/**
 * Play the 3-second countdown sound. Mixes with Spotify/Apple Music.
 * If the file has not finished decoding yet, this waits for it instead of silently failing.
 */
export async function playCountdownSound(): Promise<void> {
  const ctx = await ensureRunningAudioContext();
  const buffer = countdownBuffer ?? await loadCountdownBuffer();

  if (!ctx || !gainNode) {
    console.warn("[Audio] Cannot play countdown — audio context unavailable");
    return;
  }

  stopCountdownSound();

  if (!buffer) {
    playFallbackTone(ctx);
    return;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(gainNode);
  source.onended = () => {
    if (activeSource === source) activeSource = null;
    source.disconnect();
  };

  try {
    source.start(0);
    activeSource = source;
    console.log("[Audio] Countdown sound playing at volume", OVERLAY_VOLUME);
  } catch (error) {
    console.warn("[Audio] Countdown playback failed, using fallback tone:", error);
    source.disconnect();
    playFallbackTone(ctx);
  }
}

/**
 * Stop the countdown sound (e.g. on skip).
 */
export function stopCountdownSound(): void {
  if (!activeSource) return;

  try {
    activeSource.stop();
  } catch {
    // already stopped
  }

  activeSource = null;
}
