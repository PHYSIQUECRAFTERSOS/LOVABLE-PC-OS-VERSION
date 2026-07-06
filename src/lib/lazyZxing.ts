// Lazy loader for @zxing/library. The zxing bundle is ~200 KB gzipped and is
// only needed when a barcode scanner is actually opened. Cache the module so
// subsequent opens don't re-download.

type ZxingModule = typeof import("@zxing/library");

let cached: Promise<ZxingModule> | null = null;

export function loadZxing(): Promise<ZxingModule> {
  if (!cached) {
    cached = import("@zxing/library");
  }
  return cached;
}
