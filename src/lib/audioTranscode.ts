// Browser-native WAV encoder for voice notes.
// No wasm, no CDN — uses Web Audio API only. Output plays everywhere
// (iOS Safari, WKWebView, Chrome, Firefox, Android).
//
// Voice-optimized: mono, 16 kHz, 16-bit PCM (~32 KB/s → ~2 MB per 2-min note).

const TARGET_SAMPLE_RATE = 16000;

async function decodeBlob(input: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await input.arrayBuffer();
  const AC: typeof AudioContext =
    (window.AudioContext as typeof AudioContext) ||
    ((window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  if (!AC) throw new Error("AudioContext not supported");
  const ctx = new AC();
  try {
    // Safari requires the callback form for older versions; promise form is fine in all modern.
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    try { await ctx.close(); } catch { /* ignore */ }
  }
}

async function resampleToMono(buffer: AudioBuffer, targetRate: number): Promise<Float32Array> {
  const duration = buffer.duration;
  const frames = Math.ceil(duration * targetRate);
  const OAC: typeof OfflineAudioContext =
    (window.OfflineAudioContext as typeof OfflineAudioContext) ||
    ((window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext);
  if (!OAC) throw new Error("OfflineAudioContext not supported");

  const offline = new OAC(1, frames, targetRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = 1 * bytesPerSample; // mono
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);          // fmt chunk size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);          // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Encode an arbitrary audio Blob (webm/opus, ogg, mp4, etc.) to a mono 16-bit
 * 16 kHz WAV blob. WAV plays natively on every browser and on iOS WKWebView.
 */
export async function encodeToWav(input: Blob): Promise<Blob> {
  const decoded = await decodeBlob(input);
  const mono = await resampleToMono(decoded, TARGET_SAMPLE_RATE);
  return encodeWav(mono, TARGET_SAMPLE_RATE);
}

// Backwards-compat alias for any lingering imports.
export const transcodeToMp3 = encodeToWav;
