import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface ResolveResult {
  provider: "rumble" | "youtube";
  embedUrl: string;
  thumbnailUrl: string | null;
  title: string | null;
  /** Direct .mp4 URL — Rumble iframes are blocked inside the native webview. */
  videoFileUrl?: string | null;
}

/** Pull the highest-quality direct mp4 out of a Rumble embed page. */
async function fetchRumbleMp4(embedUrl: string): Promise<string | null> {
  try {
    const res = await fetch(embedUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const html = await res.text();
    const matches = [...html.matchAll(/"(https:\\?\/\\?\/[^"]+?\.mp4)"/g)].map((m) =>
      m[1].replace(/\\\//g, "/"),
    );
    if (matches.length === 0) return null;
    // Prefer the last (usually highest) rendition that is unique.
    return matches[0];
  } catch {
    return null;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function extractEmbedSrc(html: string): string | null {
  const m = html.match(/src=["']([^"']*rumble\.com\/embed\/[^"']+)["']/i);
  if (!m) return null;
  let src = m[1].replace(/&amp;/g, "&");
  if (src.startsWith("//")) src = `https:${src}`;
  const idMatch = src.match(/rumble\.com\/embed\/([A-Za-z0-9._-]+)/i);
  return idMatch ? `https://rumble.com/embed/${idMatch[1]}/` : src;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url.trim() : "";

    if (!url || !/^https?:\/\//i.test(url)) {
      return json({ error: "A valid video URL is required." }, 400);
    }
    if (!/(^|\.)rumble\.com$/i.test(new URL(url).hostname)) {
      return json({ error: "Only Rumble links can be resolved here." }, 400);
    }

    // 1) Official oEmbed endpoint
    const oembedUrl = `https://rumble.com/api/Media/oembed.json?url=${encodeURIComponent(url)}`;
    let result: ResolveResult | null = null;

    try {
      const res = await fetch(oembedUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (res.ok) {
        const data = await res.json();
        const embedUrl = typeof data?.html === "string" ? extractEmbedSrc(data.html) : null;
        if (embedUrl) {
          result = {
            provider: "rumble",
            embedUrl,
            thumbnailUrl: data?.thumbnail_url || null,
            title: data?.title || null,
          };
        }
      }
    } catch (_e) {
      // fall through to HTML scrape
    }

    // 2) Fallback: scrape the page for the embed id / og:image
    if (!result) {
      const page = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!page.ok) return json({ error: `Rumble returned ${page.status}` }, 502);
      const html = await page.text();

      const idMatch =
        html.match(/rumble\.com\/embed\/([A-Za-z0-9._-]+)/i) ||
        html.match(/"embedUrl"\s*:\s*"[^"]*rumble\.com\/embed\/([A-Za-z0-9._-]+)/i);
      if (!idMatch) return json({ error: "Could not find an embeddable video on that page." }, 422);

      const thumb =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] || null;
      const title =
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] || null;

      result = {
        provider: "rumble",
        embedUrl: `https://rumble.com/embed/${idMatch[1]}/`,
        thumbnailUrl: thumb,
        title,
      };
    }

    return json(result);
  } catch (err) {
    console.error("[resolve-video-link] error:", err);
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});
