/**
 * Rest Timer Audio Utility
 * 
 * Provides reliable sound playback on iOS (even when backgrounded) and
 * lock-screen countdown via the Media Session API.
 *
 * How it works:
 * 1. On first user interaction, call `unlockAudio()` to prime the <audio> element.
 * 2. When a rest timer starts, call `startRestSession(seconds)` — this plays a
 *    silent WAV of the given duration so iOS keeps the audio session alive and
 *    shows the "Now Playing" widget on the lock screen with a countdown.
 * 3. When the timer completes, call `playAlarm()` — swaps in a short chime.
 * 4. On skip / cleanup, call `stopRestSession()`.
 */

// ── Singleton audio element ──────────────────────────────────────────
let audioEl: HTMLAudioElement | null = null;
let unlocked = false;

function getAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = document.createElement("audio");
    audioEl.setAttribute("playsinline", "true");
    audioEl.setAttribute("webkit-playsinline", "true");
    // Keep element in DOM so iOS doesn't garbage-collect the session
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);
  }
  return audioEl;
}

/**
 * Call on the FIRST user gesture (e.g. "Start Workout" tap) to unlock
 * iOS audio playback. Safe to call multiple times — only acts once.
 */
export function unlockAudio(): void {
  if (unlocked) return;
  const el = getAudio();
  // Play a tiny silent data-URI to unlock the audio session
  el.src = SILENT_100MS;
  el.volume = 0.01;
  el.play().then(() => {
    el.pause();
    el.currentTime = 0;
    unlocked = true;
  }).catch(() => {
    // Will retry on next call
  });
}

// ── Silent WAV generation ────────────────────────────────────────────

/** Generate an in-memory WAV data-URI of `seconds` duration (silence). */
function generateSilentWav(seconds: number): string {
  const sampleRate = 8000; // low rate = small file
  const numSamples = sampleRate * Math.ceil(seconds);
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data sub-chunk (all zeros = silence)
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  // samples are already 0 (silence)

  const blob = new Blob([buffer], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// Tiny 100ms silent WAV for unlock
const SILENT_100MS = (() => {
  if (typeof window === "undefined") return "";
  return generateSilentWav(0.1);
})();

// ── Alarm chime (generated via AudioContext on-demand) ───────────────

function playAlarmChime(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const playTone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.35, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };

    // Three-tone ascending chime (like Strong app)
    playTone(880, 0, 0.15);
    playTone(1100, 0.12, 0.15);
    playTone(1320, 0.24, 0.25);

    // Second burst for emphasis
    playTone(880, 0.55, 0.15);
    playTone(1100, 0.67, 0.15);
    playTone(1320, 0.79, 0.25);

    // Close context after sounds finish
    setTimeout(() => ctx.close().catch(() => {}), 2000);
  } catch {
    /* Audio not available */
  }
}

// ── Silent-track URL cache ───────────────────────────────────────────
let currentSilentUrl: string | null = null;

function revokeSilentUrl() {
  if (currentSilentUrl) {
    URL.revokeObjectURL(currentSilentUrl);
    currentSilentUrl = null;
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Start a rest session: plays a silent track of `seconds` duration and
 * registers with the Media Session API so iOS shows the lock-screen timer.
 */
export function startRestSession(seconds: number, label?: string): void {
  unlockAudio();
  const el = getAudio();

  // Stop any previous session
  el.pause();
  revokeSilentUrl();

  // Generate & play silent track matching rest duration
  currentSilentUrl = generateSilentWav(seconds);
  el.src = currentSilentUrl;
  el.volume = 0.01; // near-silent but not 0 (iOS ignores volume 0)
  el.loop = false;
  el.play().catch(() => {});

  // Media Session metadata — shows on lock screen
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: "Rest Timer",
      artist: label || "Physique Crafters",
      album: "Workout",
    });

    try {
      navigator.mediaSession.setPositionState({
        duration: seconds,
        playbackRate: 1,
        position: 0,
      });
    } catch {
      /* older browsers */
    }

    // Prevent media controls from interfering
    const noop = () => {};
    navigator.mediaSession.setActionHandler("play", noop);
    navigator.mediaSession.setActionHandler("pause", noop);
    navigator.mediaSession.setActionHandler("seekbackward", noop);
    navigator.mediaSession.setActionHandler("seekforward", noop);
    navigator.mediaSession.setActionHandler("previoustrack", noop);
    navigator.mediaSession.setActionHandler("nexttrack", noop);
  }
}

/**
 * Update the lock-screen position state to reflect elapsed time.
 * Call this periodically (e.g. every 1s) from the timer component.
 */
export function updateRestPosition(elapsed: number, total: number): void {
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setPositionState({
        duration: total,
        playbackRate: 1,
        position: Math.min(elapsed, total),
      });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Play the completion alarm sound.
 */
export function playAlarm(): void {
  // Stop silent track
  const el = getAudio();
  el.pause();
  revokeSilentUrl();

  // Play chime via AudioContext (more flexible than static file)
  playAlarmChime();

  // Update lock screen to show "Rest Complete"
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: "Rest Complete! 💪",
      artist: "Physique Crafters",
      album: "Workout",
    });
  }
}

/**
 * Stop everything — call on skip or unmount.
 */
export function stopRestSession(): void {
  const el = getAudio();
  el.pause();
  el.currentTime = 0;
  revokeSilentUrl();

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = null;
    try {
      navigator.mediaSession.setPositionState();
    } catch {
      /* ignore */
    }
  }
}
