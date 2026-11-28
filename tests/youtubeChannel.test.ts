import { describe, expect, it } from "vitest";
import { parseChannelPage } from "../src/core/youtubeChannel";

const page = (title: string, image: string) =>
  `<html><head><meta property="og:title" content="${title}"><meta property="og:image" content="${image}"></head></html>`;

describe("parseChannelPage", () => {
  it("reads the channel name and avatar", () => {
    expect(parseChannelPage(page("MorrowHeat", "https://yt3.googleusercontent.com/abc=s900-c-k"))).toEqual({
      name: "MorrowHeat",
      imageUrl: "https://yt3.googleusercontent.com/abc=s900-c-k",
    });
  });

  it("decodes HTML entities in the name", () => {
    expect(parseChannelPage(page("Tom &amp; Jerry&#39;s &quot;Show&quot;", "")).name).toBe(`Tom & Jerry's "Show"`);
  });

  it("ignores avatars that aren't on YouTube's image hosts", () => {
    expect(parseChannelPage(page("X", "https://evil.example/a.png")).imageUrl).toBeUndefined();
    expect(parseChannelPage(page("X", "http://yt3.googleusercontent.com/a")).imageUrl).toBeUndefined();
  });

  it("returns nothing for a page without the tags, like a consent page", () => {
    expect(parseChannelPage("<html><title>Before you continue</title></html>")).toEqual({ name: undefined, imageUrl: undefined });
  });
});
