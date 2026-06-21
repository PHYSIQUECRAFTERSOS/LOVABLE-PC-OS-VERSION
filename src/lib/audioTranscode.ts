// Lazy-loaded ffmpeg.wasm singleton for transcoding voice notes to MP3.
// Using 0.11.x which does NOT require SharedArrayBuffer / COOP-COEP headers.
// Core files are loaded from unpkg CDN (~24MB wasm, cached by browser after first load).

import type { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

const CORE_VERSION = "0.11.0";
const CORE_PATH = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/ffmpeg-core.js`;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { createFFmpeg } = await import("@ffmpeg/ffmpeg");
    const ff = createFFmpeg({
      log: false,
      corePath: CORE_PATH,
    });
    await ff.load();
    ffmpegInstance = ff;
    return ff;
  })();

  return loadPromise;
}

/**
 * Transcode an arbitrary audio Blob (webm/opus, ogg, etc.) to MP3.
 * iOS Safari / WKWebView cannot play webm — MP3 plays everywhere.
 * Voice-optimized: 64 kbps mono.
 */
export async function transcodeToMp3(input: Blob): Promise<Blob> {
  const ff = await getFFmpeg();
  const { fetchFile } = await import("@ffmpeg/ffmpeg");

  // Pick an input extension hint ffmpeg can sniff.
  const t = input.type.toLowerCase();
  const inputName = t.includes("webm")
    ? "input.webm"
    : t.includes("ogg")
      ? "input.ogg"
      : t.includes("mp4") || t.includes("m4a") || t.includes("aac")
        ? "input.m4a"
        : "input.bin";

  ff.FS("writeFile", inputName, await fetchFile(input));

  try {
    await ff.run(
      "-i", inputName,
      "-vn",
      "-acodec", "libmp3lame",
      "-ac", "1",
      "-b:a", "64k",
      "output.mp3"
    );
    const data = ff.FS("readFile", "output.mp3");
    return new Blob([data.buffer], { type: "audio/mpeg" });
  } finally {
    try { ff.FS("unlink", inputName); } catch { /* ignore */ }
    try { ff.FS("unlink", "output.mp3"); } catch { /* ignore */ }
  }
}
