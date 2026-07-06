// Lazy loaders for pdfjs-dist. The pdf.js engine + its worker are large
// (hundreds of KB) and only needed when a user opens a PDF preview or runs
// AI import on a PDF. Cache the loaded module per entry point.

let modernCache: Promise<any> | null = null;
let legacyCache: Promise<any> | null = null;

/**
 * Load the modern pdfjs-dist build (used by AI import).
 * Sets GlobalWorkerOptions.workerSrc on first load.
 */
export async function loadPdfjsModern(): Promise<any> {
  if (!modernCache) {
    modernCache = (async () => {
      const [mod, workerUrlMod] = await Promise.all([
        import("pdfjs-dist"),
        // Vite ?url import — resolves to a hashed URL string.
        // @ts-ignore
        import("pdfjs-dist/build/pdf.worker.mjs?url"),
      ]);
      const pdfjsLib: any = mod;
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        (workerUrlMod as any).default ?? workerUrlMod;
      return pdfjsLib;
    })();
  }
  return modernCache;
}

/**
 * Load the legacy pdfjs-dist build (used by iOS WKWebView preview).
 * The legacy build avoids Promise.withResolvers / module workers.
 */
export async function loadPdfjsLegacy(): Promise<any> {
  if (!legacyCache) {
    legacyCache = (async () => {
      const [mod, workerUrlMod] = await Promise.all([
        // @ts-ignore - no types on legacy entry
        import("pdfjs-dist/legacy/build/pdf.mjs"),
        // @ts-ignore
        import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
      ]);
      const pdfjsLib: any = mod;
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        (workerUrlMod as any).default ?? workerUrlMod;
      return pdfjsLib;
    })();
  }
  return legacyCache;
}
