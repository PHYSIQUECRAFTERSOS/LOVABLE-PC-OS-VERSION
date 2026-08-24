import { describe, it, expect } from "vitest";
import {
  pickPlayableVideoUrl,
  detectVideoProvider,
  getVideoEmbedUrl,
  isRumbleProxyVideoUrl,
} from "@/utils/videoEmbed";
describe("rumble playback", () => {
  const mp4 = "https://1a-1791.com/video/fww1/8f/s8/2/a/z/a/Q/azaQA.caa.mp4";
  const proxyVideo =
    "https://xyz.supabase.co/functions/v1/rumble-video?id=v7c31hg&type=video";
  it("prefers mp4 for rumble", () => {
    const v = pickPlayableVideoUrl("https://rumble.com/embed/v7c31hg/", mp4);
    expect(v).toBe(mp4);
    expect(detectVideoProvider(v!)).toBe("file");
  });
  it("prefers the rotation-proof proxy URL for rumble", () => {
    expect(isRumbleProxyVideoUrl(proxyVideo)).toBe(true);
    expect(detectVideoProvider(proxyVideo)).toBe("file");
    const v = pickPlayableVideoUrl("https://rumble.com/embed/v7c31hg/", proxyVideo);
    expect(v).toBe(proxyVideo);
  });
  it("thumb proxy variant is not treated as a playable file", () => {
    const thumb = proxyVideo.replace("type=video", "type=thumb");
    expect(isRumbleProxyVideoUrl(thumb)).toBe(false);
    expect(detectVideoProvider(thumb)).toBe(null);
  });
  it("keeps youtube iframe", () => {
    const v = pickPlayableVideoUrl("https://youtu.be/abc12345", null);
    expect(getVideoEmbedUrl(v)).toContain("youtube.com/embed/abc12345");
    expect(detectVideoProvider(v!)).toBe("youtube");
  });
  it("falls back to rumble embed when no mp4", () => {
    const v = pickPlayableVideoUrl("https://rumble.com/embed/v7c31hg/", null);
    expect(getVideoEmbedUrl(v)).toContain("rumble.com/embed/v7c31hg/");
  });
});
