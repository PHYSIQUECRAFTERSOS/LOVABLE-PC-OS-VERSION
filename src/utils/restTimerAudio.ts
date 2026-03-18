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
let gainNode: GainNode | null = null;
let preloading = false;

/**
 * Overlay volume relative to music (0.0–1.0).
 * 0.6 = clearly audible over music without being jarring.
 */
const OVERLAY_VOLUME = 0.6;

/**
 * Create or resume the AudioContext. Must be called from a user gesture
 * (tap/click) at least once to satisfy iOS autoplay policy.
 */
export function initAudioContext(): void {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Create a persistent gain node for volume control
    gainNode = audioCtx.createGain();
    gainNode.gain.value = OVERLAY_VOLUME;
    gainNode.connect(audioCtx.destination);
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
    if (!response.ok) {
      console.warn("[Audio] Failed to fetch countdown sound:", response.status);
      return;
    }
    const arrayBuffer = await response.arrayBuffer();
    if (audioCtx) {
      countdownBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      console.log("[Audio] Countdown sound preloaded successfully");
    }
  } catch (err) {
    console.warn("[Audio] Sound preload failed:", err);
  } finally {
    preloading = false;
  }
}

/**
 * Play the 3-second countdown sound. Mixes with Spotify/Apple Music.
 */
export function playCountdownSound(): void {
  if (!audioCtx || !countdownBuffer || !gainNode) {
    console.warn("[Audio] Cannot play — ctx:", !!audioCtx, "buffer:", !!countdownBuffer, "gain:", !!gainNode);
    return;
  }

  // Stop any currently playing countdown
  stopCountdownSound();

  // Resume context if suspended (e.g. after backgrounding)
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  const source = audioCtx.createBufferSource();
  source.buffer = countdownBuffer;
  source.connect(gainNode);
  source.onended = () => {
    if (activeSource === source) activeSource = null;
  };
  source.start(0);
  activeSource = source;
  console.log("[Audio] Countdown sound playing at volume", OVERLAY_VOLUME);
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
