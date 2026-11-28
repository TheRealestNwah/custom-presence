import { describe, expect, it } from "vitest";
import { parseTab } from "../src/core/browser";
import { searchKnownGames } from "../src/core/knownGames";
import { encodeFrame, FrameDecoder } from "../src/core/nativeMessaging";
import { artworkGuid, guidId, parseResources, parseSessions, providerThumb, serverUris } from "../src/core/plex";

describe("parseTab", () => {
  it("reads a YouTube watch page and strips the ' - YouTube' suffix", () => {
    expect(parseTab({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1", playing: true, title: "Song - YouTube", channel: "Rick" })).toMatchObject({
      integration: "youtube",
      key: "dQw4w9WgXcQ",
      title: "Song",
      subtitle: "Rick",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      imageUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
  });

  it("reads Shorts", () => {
    expect(parseTab({ url: "https://www.youtube.com/shorts/abc123", playing: true, title: "Short" })?.key).toBe("abc123");
  });

  it("keeps a YouTube channel link only if it stays on YouTube", () => {
    const base = { url: "https://www.youtube.com/watch?v=abc", playing: true, title: "Video" };
    expect(parseTab({ ...base, channelUrl: "https://www.youtube.com/@someone" })?.subtitleUrl).toBe("https://www.youtube.com/@someone");
    expect(parseTab({ ...base, channelUrl: "https://evil.example/@someone" })?.subtitleUrl).toBeUndefined();
    expect(parseTab({ ...base, channelUrl: "javascript:alert(1)" })?.subtitleUrl).toBeUndefined();
  });

  it("passes progress through only when it makes sense", () => {
    const base = { url: "https://www.youtube.com/watch?v=abc", playing: true, title: "Video" };
    expect(parseTab({ ...base, startedAt: 5000, durationMs: 60000 })).toMatchObject({ startedAt: 5000, durationMs: 60000 });
    expect(parseTab({ ...base, startedAt: 5000 })).not.toHaveProperty("startedAt");
    expect(parseTab({ ...base, startedAt: 5000, durationMs: 0 })).not.toHaveProperty("durationMs");
  });

  it("treats music.youtube.com as YouTube Music", () => {
    expect(parseTab({ url: "https://music.youtube.com/watch?v=xyz", playing: false, title: "Track", channel: "Band" })).toMatchObject({
      integration: "youtubeMusic",
      playing: false,
      subtitle: "Band",
    });
  });

  it("ignores YouTube pages that aren't a video", () => {
    expect(parseTab({ url: "https://www.youtube.com/feed/subscriptions", playing: false, title: "Subs" })).toBeNull();
  });

  it("reads a Twitch channel with category and preview image", () => {
    expect(parseTab({ url: "https://www.twitch.tv/SomeStreamer", playing: true, title: "Speedrun", channel: "SomeStreamer", category: "Celeste" })).toMatchObject({
      integration: "twitch",
      key: "somestreamer",
      subtitle: "SomeStreamer",
      extra: "Celeste",
      url: "https://www.twitch.tv/somestreamer",
    });
  });

  it("ignores Twitch's own pages", () => {
    expect(parseTab({ url: "https://www.twitch.tv/directory/category/celeste", playing: true })).toBeNull();
  });

  it("ignores other sites and bad URLs", () => {
    expect(parseTab({ url: "https://example.com", playing: true, title: "x" })).toBeNull();
    expect(parseTab({ url: "not a url", playing: true })).toBeNull();
  });
});

describe("Plex", () => {
  const sessions = {
    MediaContainer: {
      Metadata: [
        { type: "episode", ratingKey: "10", title: "Pilot", grandparentTitle: "Show", parentIndex: 1, index: 1, Player: { machineIdentifier: "pc", state: "playing", product: "Plex for Windows" } },
        { type: "movie", ratingKey: "11", title: "Film", year: 2001, Player: { machineIdentifier: "tv", state: "playing" } },
        { type: "track", ratingKey: "12", title: "Song", grandparentTitle: "Artist", parentTitle: "Album", Player: { machineIdentifier: "amp", state: "paused", product: "Plexamp" } },
      ],
    },
  };

  it("keeps only This PC players and maps types to Integrations", () => {
    const out = parseSessions(sessions, ["pc", "amp"]);
    expect(out).toEqual([
      expect.objectContaining({ integration: "plex", key: "10", title: "Pilot", showTitle: "Show", season: 1, episode: 1, playing: true }),
      expect.objectContaining({ integration: "plexamp", key: "12", subtitle: "Artist", extra: "Album", appName: "Plexamp", playing: false }),
    ]);
  });

  it("handles empty or malformed responses", () => {
    expect(parseSessions({}, ["pc"])).toEqual([]);
    expect(parseSessions(null, ["pc"])).toEqual([]);
  });

  it("picks the show's guid for episodes and the album's for tracks", () => {
    expect(artworkGuid({ type: "episode", guid: "plex://episode/1", grandparentGuid: "plex://show/2" })).toBe("plex://show/2");
    expect(artworkGuid({ type: "track", parentGuid: "plex://album/3" })).toBe("plex://album/3");
    expect(artworkGuid({ type: "movie", guid: "local://99" })).toBeUndefined();
    expect(guidId("plex://show/5d9c086c46115600200aa2fe")).toBe("5d9c086c46115600200aa2fe");
  });

  it("only accepts public https artwork", () => {
    expect(providerThumb({ MediaContainer: { Metadata: [{ thumb: "https://metadata-static.plex.tv/a.jpg" }] } })).toBe("https://metadata-static.plex.tv/a.jpg");
    expect(providerThumb({ MediaContainer: { Metadata: [{ thumb: "/library/metadata/1/thumb" }] } })).toBeUndefined();
  });

  it("splits resources into servers and players and orders connections", () => {
    const { servers, players } = parseResources([
      { name: "NAS", provides: "server", clientIdentifier: "s1", connections: [{ uri: "https://relay", relay: true }, { uri: "https://remote" }, { uri: "http://192.168.1.5:32400", local: true }] },
      { name: "My PC", product: "Plex for Windows", provides: "client,player", clientIdentifier: "pc" },
    ]);
    expect(servers.map((s) => s.name)).toEqual(["NAS"]);
    expect(players).toEqual([{ id: "pc", name: "My PC", product: "Plex for Windows", platform: undefined }]);
    expect(serverUris(servers[0]!)).toEqual(["http://192.168.1.5:32400", "https://remote", "https://relay"]);
  });
});

describe("native messaging frames", () => {
  it("round-trips messages split across chunks", () => {
    const a = encodeFrame({ type: "playback", items: [] });
    const b = encodeFrame({ hello: "wörld" });
    const all = new Uint8Array([...a, ...b]);
    const d = new FrameDecoder();
    expect(d.push(all.subarray(0, 3))).toEqual([]);
    expect(d.push(all.subarray(3, a.length + 2))).toEqual([{ type: "playback", items: [] }]);
    expect(d.push(all.subarray(a.length + 2))).toEqual([{ hello: "wörld" }]);
  });
});

describe("searchKnownGames", () => {
  const apps = [
    { id: "1", name: "Minecraft Dungeons" },
    { id: "2", name: "Minecraft", aliases: ["MC"] },
    { id: "3", name: "Terraria" },
  ];
  it("ranks exact, then prefix, then substring matches", () => {
    expect(searchKnownGames(apps, "minecraft").map((g) => g.id)).toEqual(["2", "1"]);
    expect(searchKnownGames(apps, "mine").map((g) => g.id)).toEqual(["2", "1"]);
    expect(searchKnownGames(apps, "mc")).toEqual([{ id: "2", name: "Minecraft" }]);
    expect(searchKnownGames(apps, "  ")).toEqual([]);
  });
});
