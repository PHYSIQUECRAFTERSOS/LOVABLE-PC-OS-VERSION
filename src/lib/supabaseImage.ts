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
    if (opts.resize) u.searchParams.set("resize", opts.resize);
    return u.toString();
  } catch {
    return url;
  }
}
