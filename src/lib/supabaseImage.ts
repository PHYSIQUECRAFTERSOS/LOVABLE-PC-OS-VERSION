/**
 * Rewrite a Supabase Storage public URL to use the image transformation
 * endpoint (auto-negotiates WebP/AVIF). Non-Supabase URLs pass through
 * untouched, so this is safe for arbitrary avatar sources.
 */
export function transformSupabaseImage(
  url: string | null | undefined,
  opts: { width?: number; height?: number; quality?: number; resize?: "cover" | "contain" | "fill" } = {}
): string | undefined {
  if (!url) return undefined;
  try {
    const marker = "/storage/v1/object/public/";
    if (!url.includes(marker)) return url;
    const rendered = url.replace(marker, "/storage/v1/render/image/public/");
    const u = new URL(rendered);
    if (opts.width) u.searchParams.set("width", String(opts.width));
    if (opts.height) u.searchParams.set("height", String(opts.height));
    u.searchParams.set("quality", String(opts.quality ?? 70));
    // Only apply `resize` when BOTH dimensions are provided. Supabase's
    // transform treats `resize=cover` with a single dimension as a square
    // target and hard-crops non-square originals, which distorts avatars.
    // Width-only (or height-only) with no `resize` scales proportionally and
    // preserves aspect ratio; the browser then centers via CSS object-cover.
    if (opts.resize && opts.width && opts.height) {
      u.searchParams.set("resize", opts.resize);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Convert a signed Supabase Storage object URL into a transformed (resized)
 * variant so private photo grids don't download multi-megabyte originals.
 * Returns the original URL untouched when it isn't a signed object URL.
 */
export function signedThumbUrl(
  signedUrl: string | null | undefined,
  opts: { width?: number; height?: number; quality?: number } = {}
): string {
  if (!signedUrl) return "";
  const marker = "/storage/v1/object/sign/";
  if (!signedUrl.includes(marker)) return signedUrl;
  try {
    const u = new URL(signedUrl.replace(marker, "/storage/v1/render/image/sign/"));
    if (opts.width) u.searchParams.set("width", String(opts.width));
    if (opts.height) u.searchParams.set("height", String(opts.height));
    if (opts.width && opts.height) u.searchParams.set("resize", "cover");
    u.searchParams.set("quality", String(opts.quality ?? 60));
    return u.toString();
  } catch {
    return signedUrl;
  }
}

/**
 * Batch-sign storage paths in a single request (falls back to per-path signing
 * if the batch call fails). Returns a path -> signed URL map.
 */
export async function signStoragePaths(
  client: { storage: { from: (b: string) => any } },
  bucket: string,
  paths: string[],
  expiresIn = 3600
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (!paths.length) return map;
  const { data, error } = await client.storage.from(bucket).createSignedUrls(paths, expiresIn);
  if (!error && data) {
    data.forEach((d: any) => {
      if (d?.path && d?.signedUrl) map[d.path] = d.signedUrl;
    });
    if (Object.keys(map).length) return map;
  }
  const results = await Promise.allSettled(
    paths.map((p) => client.storage.from(bucket).createSignedUrl(p, expiresIn))
  );
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && (r as any).value?.data?.signedUrl) {
      map[paths[i]] = (r as any).value.data.signedUrl;
    }
  });
  return map;
}
