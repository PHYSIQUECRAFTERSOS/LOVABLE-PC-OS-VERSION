import { describe, it, expect } from "vitest";
import { pickPlayableVideoUrl, detectVideoProvider, getVideoEmbedUrl } from "@/utils/videoEmbed";
describe("rumble playback", () => {
  const mp4 = "https://1a-1791.com/video/fww1/8f/s8/2/a/z/a/Q/azaQA.caa.mp4";
  it("prefers mp4 for rumble", () => {
    const v = pickPlayableVideoUrl("https://rumble.com/embed/v7c31hg/", mp4);
    expect(v).toBe(mp4);
    expect(detectVideoProvider(v!)).toBe("file");
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
