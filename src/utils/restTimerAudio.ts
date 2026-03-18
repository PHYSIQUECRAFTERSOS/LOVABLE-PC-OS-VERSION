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
let activeSource: AudioBufferSourceNode | null = null;
let preloading = false;

/**
 * Create or resume the AudioContext. Must be called from a user gesture
 * (tap/click) at least once to satisfy iOS autoplay policy.
 */
export function initAudioContext(): void {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

/**
 * Fetch and decode the 3-second countdown MP3 into an AudioBuffer.
 * Safe to call multiple times — only loads once.
 */
export async function preloadCountdownSound(): Promise<void> {
  if (countdownBuffer || preloading) return;
  preloading = true;

  try {
    initAudioContext();
    const response = await fetch("/assets/sounds/rest-timer-countdown.mp3");
    const arrayBuffer = await response.arrayBuffer();
    if (audioCtx) {
      countdownBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    }
  } catch {
    /* Sound unavailable — timer still works visually */
  } finally {
    preloading = false;
  }
}

/**
 * Play the 3-second countdown sound. Mixes with Spotify/Apple Music.
 */
export function playCountdownSound(): void {
  if (!audioCtx || !countdownBuffer) return;

  // Stop any currently playing countdown
  stopCountdownSound();

  // Resume context if suspended (e.g. after backgrounding)
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  const source = audioCtx.createBufferSource();
  source.buffer = countdownBuffer;
  source.connect(audioCtx.destination);
  source.onended = () => {
    if (activeSource === source) activeSource = null;
  };
  source.start(0);
  activeSource = source;
}

/**
 * Stop the countdown sound (e.g. on skip).
 */
export function stopCountdownSound(): void {
  if (activeSource) {
    try {
      activeSource.stop();
    } catch {
      /* already stopped */
    }
    activeSource = null;
  }
}
