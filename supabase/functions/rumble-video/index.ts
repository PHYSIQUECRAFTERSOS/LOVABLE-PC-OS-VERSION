import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Stable playback proxy for Rumble videos.
 *
 * Rumble rotates CDN hostnames (e.g. 1a-1791.com -> *.cdn.rumble.cloud), which
 * kills any direct .mp4 / thumbnail URL we store. Instead of storing the CDN
 * URL, exercises store THIS function's URL:
 *   /functions/v1/rumble-video?id=<embedId>&type=video|thumb
 * Each request scrapes the current embed page and 302-redirects to the live
 * CDN URL, so stored links survive future CDN rotations.
 */

const ID_RE = /^[A-Za-z0-9._-]+$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function unescape(url: string): string {
  return url.replace(/\\\//g, "/");
}

async function scrapeEmbed(id: string): Promise<{ video: string | null; thumb: string | null }> {
  const res = await fetch(`https://rumble.com/embed/${id}/`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return { video: null, thumb: null };
  const html = await res.text();

  const videos = [...html.matchAll(/"(https:\\?\/\\?\/[^"]+?\.mp4)"/g)]
    .map((m) => unescape(m[1]))
    .filter((u) => u.includes("/video/"));
  const thumbs = [...html.matchAll(/"(https:\\?\/\\?\/[^"]+?\.jpg)"/g)]
    .map((m) => unescape(m[1]))
    .filter((u) => u.includes("/video/"));

  return { video: videos[0] || null, thumb: thumbs[0] || null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  const type = url.searchParams.get("type") === "thumb" ? "thumb" : "video";

  if (!ID_RE.test(id)) return json({ error: "Invalid video id." }, 400);

  try {
    const { video, thumb } = await scrapeEmbed(id);
    const target = type === "thumb" ? thumb : video;
    if (!target) return json({ error: "Video not found." }, 404);

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: target,
        // Redirects are cached by the browser; CDN URL is re-resolved hourly.
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[rumble-video] error:", err);
    return json({ error: (err as Error).message || "Unexpected error" }, 502);
  }
});
