/**
 * Performance Standards Enforcement — 3-5-10 Rule
 * 
 * - 3s: Max spinner duration
 * - 5s: Max upload / standard API timeout
 * - 10s: Max AI processing timeout
 */

// ── Timeouts ──
export const TIMEOUTS = {
  SPINNER_MAX: 3000,
  STANDARD_API: 5000,
  UPLOAD: 5000,
  AI_PROCESS: 10000,
} as const;

// ── Image Compression ──
export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeKB?: number;
  format?: "image/jpeg" | "image/webp";
}

const DEFAULT_COMPRESS: Required<CompressOptions> = {
  maxWidth: 800,
  maxHeight: 800,
  quality: 0.75,
  maxSizeKB: 300,
  format: "image/jpeg",
};

export function compressImage(
  file: File,
  opts: CompressOptions = {}
): Promise<Blob> {
  const { maxWidth, maxHeight, quality, format } = { ...DEFAULT_COMPRESS, ...opts };

  return new Promise((resolve, reject) => {
    const start = performance.now();
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let w = img.width;
      let h = img.height;

      if (w > maxWidth || h > maxHeight) {
        const ratio = Math.min(maxWidth / w, maxHeight / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));

      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Compression failed"));
          console.log(
            `[Perf] Image compress: ${(performance.now() - start).toFixed(0)}ms, ` +
            `${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB`
          );
          resolve(blob);
        },
        format,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

// ── Fetch with timeout ──
export async function fetchWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = TIMEOUTS.STANDARD_API,
  label?: string
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const result = await fn(controller.signal);
    const elapsed = Math.round(performance.now() - start);
    if (label) {
      if (elapsed > 2000) console.warn(`[Perf] ${label}: ${elapsed}ms (slow)`);
      else console.log(`[Perf] ${label}: ${elapsed}ms`);
    }
    return result;
  } catch (err: any) {
    if (err.name === "AbortError") {
      const elapsed = Math.round(performance.now() - start);
      console.error(`[Perf] ${label || "request"} timed out after ${elapsed}ms`);
      throw new Error(`Request timed out after ${(timeoutMs / 1000).toFixed(0)}s. Tap to retry.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Global Async Guard ──
/**
 * Wraps any async operation with a hard timeout + structured error.
 * Use this for ALL user-facing async operations.
 * Never allows an unresolved promise to hang the UI.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = TIMEOUTS.STANDARD_API,
  label: string = "operation"
): Promise<T> {
  const start = performance.now();
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const elapsed = Math.round(performance.now() - start);
      console.error(`[Perf] ${label} timed out after ${elapsed}ms`);
      reject(new Error(`${label} timed out after ${(timeoutMs / 1000).toFixed(0)}s. Tap to retry.`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeout]);
    const elapsed = Math.round(performance.now() - start);
    if (elapsed > 2000) {
      console.warn(`[Perf] ${label}: ${elapsed}ms (slow)`);
    }
    return result;
  } finally {
    clearTimeout(timeoutId!);
  }
}

// ── Accepted image types ──
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export function isValidImageType(type: string): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(type);
}
