/**
 * Shared video helpers supporting YouTube, Rumble and direct file URLs.
 *
 * Rumble page links (https://rumble.com/v7e7m34-slug.html) are NOT embeddable —
 * the embed uses a different id. Links are resolved once at save time through the
 * `resolve-video-link` edge function, and the resolved embed URL
 * (https://rumble.com/embed/<id>/) is what gets stored in `youtube_url`.
 */

export type VideoProvider = "youtube" | "rumble" | "file" | null;

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/|live\/))([A-Za-z0-9_-]{6,})/;
const RUMBLE_EMBED_RE = /rumble\.com\/embed\/([A-Za-z0-9._-]+)/i;
const RUMBLE_PAGE_RE = /rumble\.com\/(?!embed\/)([A-Za-z0-9._-]+)/i;

export function getYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(YT_RE);
  return m ? m[1] : null;
}

export function getRumbleEmbedId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(RUMBLE_EMBED_RE);
  return m ? m[1] : null;
}

export function isRumbleUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /(^|\/\/|\.)rumble\.com\//i.test(url);
}

/** True for a Rumble page link that still needs resolving into an embed URL. */
export function isRumblePageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return isRumbleUrl(url) && !getRumbleEmbedId(url) && RUMBLE_PAGE_RE.test(url);
}

/**
 * Stable Rumble playback proxy (see supabase/functions/rumble-video). These
 * URLs never rot when Rumble rotates CDN hostnames, so they are stored in
 * place of direct .mp4 / thumbnail URLs.
 */
export function isRumbleProxyUrl(url: string | null | undefined): boolean {
  return !!url && /\/functions\/v1\/rumble-video\?/.test(url);
}

/** True for the proxy's direct-play variant (renders via <video>). */
export function isRumbleProxyVideoUrl(url: string | null | undefined): boolean {
  return isRumbleProxyUrl(url) && /[?&]type=video/.test(url!);
}

export function detectVideoProvider(url: string | null | undefined): VideoProvider {
  if (!url) return null;
  if (getYouTubeId(url)) return "youtube";
  if (isRumbleUrl(url)) return "rumble";
  if (isRumbleProxyVideoUrl(url)) return "file";
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) return "file";
  return null;
}

export interface EmbedOptions {
  autoplay?: boolean;
  mute?: boolean;
}

/**
 * Returns an iframe-ready src for YouTube / Rumble URLs, or null when the URL
 * is not an embeddable provider link (uploaded files use a <video> tag instead).
 */
export function getVideoEmbedUrl(
  url: string | null | undefined,
  opts: EmbedOptions = {}
): string | null {
  if (!url) return null;
  const { autoplay = false, mute = false } = opts;

  const ytId = getYouTubeId(url);
  if (ytId) {
    const params = new URLSearchParams({ playsinline: "1", rel: "0", modestbranding: "1" });
    if (autoplay) params.set("autoplay", "1");
    if (mute) params.set("mute", "1");
    return `https://www.youtube.com/embed/${ytId}?${params.toString()}`;
  }

  const rumbleId = getRumbleEmbedId(url);
  if (rumbleId) {
    const params = new URLSearchParams();
    if (autoplay) params.set("autoplay", "2");
    if (mute) params.set("mute", "1");
    const qs = params.toString();
    return `https://rumble.com/embed/${rumbleId}/${qs ? `?${qs}` : ""}`;
  }

  return null;
}

/**
 * Thumbnail for a video URL. YouTube thumbnails are derived from the id;
 * Rumble thumbnails must come from the stored value (resolved at save time).
 */
export function getVideoThumbnail(
  url: string | null | undefined,
  storedThumbnail?: string | null
): string | null {
  if (storedThumbnail) return storedThumbnail;
  const ytId = getYouTubeId(url);
  if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  return null;
}

export interface ResolvedVideoLink {
  provider: Exclude<VideoProvider, null>;
  embedUrl: string;
  thumbnailUrl: string | null;
  title: string | null;
  /** Direct .mp4 for Rumble videos — iframes are blocked inside the native webview. */
  videoFileUrl?: string | null;
}

/**
 * Choose what to actually play for an exercise/recipe row.
 * Rumble iframes are refused inside the app webview, so when we have a resolved
 * direct file for a Rumble link we play that instead.
 */
export function pickPlayableVideoUrl(
  providerUrl: string | null | undefined,
  fileUrl: string | null | undefined
): string | null {
  if (isRumbleUrl(providerUrl) && fileUrl && detectVideoProvider(fileUrl) === "file") {
    return fileUrl;
  }
  return providerUrl || fileUrl || null;
}

/**
 * Resolve any pasted video link into a storable embed URL + thumbnail.
 * YouTube resolves locally; Rumble goes through the `resolve-video-link` edge function.
 */
export async function resolveVideoLink(
  rawUrl: string,
  invoke: (name: string, body: unknown) => Promise<{ data: any; error: any }>
): Promise<ResolvedVideoLink> {
  const url = rawUrl.trim();
  const ytId = getYouTubeId(url);
  if (ytId) {
    return {
      provider: "youtube",
      embedUrl: url,
      thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      title: null,
    };
  }

  if (isRumbleUrl(url)) {
    const existing = getRumbleEmbedId(url);
    const { data, error } = await invoke("resolve-video-link", { url });
    if (error || !data?.embedUrl) {
      // Already an embed link — usable even if the lookup failed (no direct file).
      if (existing) {
        return {
          provider: "rumble",
          embedUrl: `https://rumble.com/embed/${existing}/`,
          thumbnailUrl: null,
          title: null,
          videoFileUrl: null,
        };
      }
      throw new Error(error?.message || data?.error || "Could not resolve Rumble link");
    }
    return {
      provider: "rumble",
      embedUrl: data.embedUrl,
      thumbnailUrl: data.thumbnailUrl || null,
      title: data.title || null,
      videoFileUrl: data.videoFileUrl || null,
    };
  }

  throw new Error("Unsupported video link. Paste a YouTube or Rumble URL.");
}
