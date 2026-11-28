import { describe, expect, it } from "vitest";
import { ActivityClock, computeActivities, filterDiscordActivities, playbackActivity, YOUTUBE_LOGO } from "../src/core/activity";
import { defaultSettings, normalizeSettings, type Settings } from "../src/core/settings";
import { ActivityType, type Mapping, type Playback } from "../src/core/types";

const settings = (over: Partial<Settings> = {}): Settings => ({ ...defaultSettings(() => "cid"), ...over });

const prism: Mapping = {
  id: "m1",
  enabled: true,
  exeName: "prismlauncher.exe",
  type: "Playing",
  name: "Minecraft",
};

const yt: Playback = {
  integration: "youtube",
  key: "abc",
  playing: true,
  title: "A video",
  subtitle: "A channel",
  url: "https://www.youtube.com/watch?v=abc",
  imageUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
};

const track: Playback = { integration: "plexamp", key: "t1", playing: true, title: "Song", subtitle: "Artist", extra: "Album", appName: "Plexamp" };

describe("computeActivities", () => {
  it("shows a Mapping while its Program runs, matching exe names case-insensitively", () => {
    const out = computeActivities(
      { settings: settings({ mappings: [prism] }), runningGames: [{ exeName: "C:\\Games\\PrismLauncher.EXE", name: "Prism Launcher" }], playbacks: [], now: 1000 },
      new ActivityClock(),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.activity).toMatchObject({ name: "Minecraft", type: ActivityType.Playing, timestamps: { start: 1000 } });
  });

  it("uses the Known Game's id and name and skips the custom image", () => {
    const linked = { ...prism, knownGame: { id: "356875570916753438", name: "Minecraft" }, imageUrl: "https://x/y.png", name: "ignored" };
    const [d] = computeActivities(
      { settings: settings({ mappings: [linked], customAppId: "999" }), runningGames: [{ exeName: "prismlauncher.exe", name: "Prism Launcher" }], playbacks: [], now: 0 },
      new ActivityClock(),
    );
    expect(d!.activity.application_id).toBe("356875570916753438");
    expect(d!.activity.name).toBe("Minecraft");
    expect(d!.imageUrl).toBeUndefined();
  });

  it("ignores disabled Mappings, disabled Integrations and paused playback", () => {
    const out = computeActivities(
      {
        settings: settings({ mappings: [{ ...prism, enabled: false }], integrations: { ...defaultSettings(() => "").integrations, youtube: false } }),
        runningGames: [{ exeName: "prismlauncher.exe", name: "Prism Launcher" }],
        playbacks: [yt, { ...track, playing: false }],
        now: 0,
      },
      new ActivityClock(),
    );
    expect(out).toEqual([]);
  });

  it("returns nothing while Pause All is on", () => {
    const out = computeActivities(
      { settings: settings({ paused: true, mappings: [prism] }), runningGames: [{ exeName: "prismlauncher.exe", name: "" }], playbacks: [yt], now: 0 },
      new ActivityClock(),
    );
    expect(out).toEqual([]);
  });

  it("orders Playing before Watching before Listening", () => {
    const out = computeActivities(
      { settings: settings({ mappings: [prism] }), runningGames: [{ exeName: "prismlauncher.exe", name: "" }], playbacks: [track, yt], now: 0 },
      new ActivityClock(),
    );
    expect(out.map((d) => d.activity.type)).toEqual([ActivityType.Playing, ActivityType.Watching, ActivityType.Listening]);
  });

  it("keeps the start time while the same item plays and resets it for a new one", () => {
    const clock = new ActivityClock();
    const run = (p: Playback, now: number) => computeActivities({ settings: settings(), runningGames: [], playbacks: [p], now }, clock)[0]!;
    expect(run(yt, 100).activity.timestamps?.start).toBe(100);
    expect(run(yt, 200).activity.timestamps?.start).toBe(100);
    expect(run({ ...yt, key: "next" }, 300).activity.timestamps?.start).toBe(300);
  });

  it("shows only the first playing item per Integration", () => {
    const out = computeActivities({ settings: settings(), runningGames: [], playbacks: [yt, { ...yt, key: "2", title: "Other" }], now: 0 }, new ActivityClock());
    expect(out).toHaveLength(1);
    expect(out[0]!.activity.details).toBe("A video");
  });
});

describe("playbackActivity layouts", () => {
  const s = settings();
  it("YouTube: title, channel and a Watch button", () => {
    expect(playbackActivity(yt, s, 0).activity).toMatchObject({
      name: "YouTube",
      type: ActivityType.Watching,
      details: "A video",
      state: "A channel",
      buttons: ["Watch"],
      metadata: { button_urls: ["https://www.youtube.com/watch?v=abc"] },
    });
  });

  it("Twitch: streamer, category and a Watch stream button", () => {
    const a = playbackActivity(
      { integration: "twitch", key: "foo", playing: true, title: "stream title", subtitle: "Foo", extra: "Minecraft", url: "https://www.twitch.tv/foo" },
      s,
      0,
    ).activity;
    expect(a).toMatchObject({ name: "Twitch", details: "Foo", state: "Minecraft", buttons: ["Watch stream"] });
  });

  it("Plex episode: show name and S2E5 · title", () => {
    const a = playbackActivity({ integration: "plex", key: "1", playing: true, title: "Ozymandias", showTitle: "Breaking Bad", season: 5, episode: 14 }, s, 0).activity;
    expect(a).toMatchObject({ name: "Breaking Bad", type: ActivityType.Watching, details: "S5E14 · Ozymandias" });
  });

  it("Plex movie: movie name with the year", () => {
    const a = playbackActivity({ integration: "plex", key: "1", playing: true, title: "Heat", showTitle: "Heat", extra: "1995" }, s, 0).activity;
    expect(a).toMatchObject({ name: "Heat", details: "1995" });
  });

  it("Plexamp: track and artist — album", () => {
    expect(playbackActivity(track, s, 0).activity).toMatchObject({ name: "Plexamp", type: ActivityType.Listening, details: "Song", state: "Artist — Album" });
  });

  it("puts the title on the profile line when asked", () => {
    expect(playbackActivity(yt, settings({ titleOnProfileLine: true }), 0).activity.status_display_type).toBe(2);
  });

  it("drops empty fields so Discord doesn't reject them", () => {
    const a = playbackActivity({ ...yt, subtitle: undefined, url: undefined }, s, 0).activity;
    expect("state" in a).toBe(false);
    expect("buttons" in a).toBe(false);
  });

  it("YouTube: title opens the video, channel opens the channel, image opens the video", () => {
    const d = playbackActivity({ ...yt, subtitleUrl: "https://www.youtube.com/@chan" }, s, 0);
    expect(d.activity).toMatchObject({ details_url: "https://www.youtube.com/watch?v=abc", state_url: "https://www.youtube.com/@chan" });
    expect(d.imageLink).toBe("https://www.youtube.com/watch?v=abc");
  });

  it("Own Channel: shows the linked channel, never the video", () => {
    const channel = { name: "Me", url: "https://www.youtube.com/channel/UC1" };
    const d = playbackActivity(yt, settings({ youtubeOwnChannel: true }), 0, channel);
    expect(d.activity).toMatchObject({ name: "YouTube", type: ActivityType.Watching, details: "Me", details_url: channel.url });
    expect(JSON.stringify(d)).not.toContain(yt.title);
    expect(JSON.stringify(d)).not.toContain("watch?v=");
    expect(d.imageLink).toBe(channel.url);
  });

  it("Own Channel: uses the channel's avatar when known, else the YouTube logo", () => {
    const channel = { name: "Me", url: "https://www.youtube.com/channel/UC1" };
    const s = settings({ youtubeOwnChannel: true });
    expect(playbackActivity(yt, s, 0, { ...channel, imageUrl: "https://yt3.googleusercontent.com/me" }).imageUrl).toBe("https://yt3.googleusercontent.com/me");
    expect(playbackActivity(yt, s, 0, channel).imageUrl).toBe(YOUTUBE_LOGO);
  });

  it("Own Channel without a linked account still hides the video", () => {
    const d = playbackActivity(yt, settings({ youtubeOwnChannel: true }), 0);
    expect(d.activity).toMatchObject({ name: "YouTube" });
    expect("details" in d.activity).toBe(false);
  });

  it("Own Channel keeps one clock across videos", () => {
    const clock = new ActivityClock();
    const run = (key: string, now: number) =>
      computeActivities({ settings: settings({ youtubeOwnChannel: true }), runningGames: [], playbacks: [{ ...yt, key }], now }, clock)[0]!.activity.timestamps?.start;
    expect(run("a", 100)).toBe(100);
    expect(run("b", 200)).toBe(100);
  });

  it("shows a progress bar when the length is known", () => {
    const d = playbackActivity({ ...yt, startedAt: 1000, durationMs: 60000 }, s, 1000);
    expect(d.activity.timestamps).toEqual({ start: 1000, end: 61000 });
  });

  it("progress: ignores rounding jitter but follows a seek", () => {
    const clock = new ActivityClock();
    const run = (startedAt: number) =>
      computeActivities({ settings: s, runningGames: [], playbacks: [{ ...yt, startedAt, durationMs: 60000 }], now: 0 }, clock)[0]!.activity.timestamps;
    expect(run(10000)).toEqual({ start: 10000, end: 70000 });
    expect(run(11000)).toEqual({ start: 10000, end: 70000 });
    expect(run(40000)).toEqual({ start: 40000, end: 100000 });
  });

  it("Own Channel shows no progress bar", () => {
    const d = playbackActivity({ ...yt, startedAt: 1000, durationMs: 60000 }, settings({ youtubeOwnChannel: true }), 5);
    expect(d.activity.timestamps).toEqual({ start: 5 });
  });

  it("falls back to application id 0 so Discord keeps the activity", () => {
    expect(playbackActivity(yt, s, 0).activity.application_id).toBe("0");
    expect(playbackActivity(yt, settings({ customAppId: "999" }), 0).activity.application_id).toBe("999");
  });
});

describe("filterDiscordActivities", () => {
  const spotify = { name: "Spotify", type: ActivityType.Listening, details: "song" };
  const prismDetected = { name: "Prism Launcher", type: ActivityType.Playing };
  const other = { name: "Elden Ring", type: ActivityType.Playing };

  it("hides Discord's own activity for Programs a Mapping replaces", () => {
    expect(filterDiscordActivities([prismDetected, other], { spotifyEnabled: true, replacedGameNames: ["Prism Launcher"], ours: [] })).toEqual([other]);
  });

  it("hides Spotify only when the Spotify toggle is off", () => {
    expect(filterDiscordActivities([spotify], { spotifyEnabled: true, replacedGameNames: [], ours: [] })).toEqual([spotify]);
    expect(filterDiscordActivities([spotify], { spotifyEnabled: false, replacedGameNames: [], ours: [] })).toEqual([]);
  });

  it("never hides the plugin's own activity, even when it shares the Program's name", () => {
    const ours = { name: "Prism Launcher", type: ActivityType.Playing, details: "modded", timestamps: { start: 5 } };
    expect(filterDiscordActivities([prismDetected, { ...ours, extra: 1 }], { spotifyEnabled: true, replacedGameNames: ["Prism Launcher"], ours: [ours] })).toHaveLength(1);
  });
});

describe("normalizeSettings", () => {
  it("fills in missing fields from older saved settings", () => {
    const s = normalizeSettings({ paused: true, integrations: { twitch: false } }, () => "new");
    expect(s.paused).toBe(true);
    expect(s.integrations).toMatchObject({ twitch: false, youtube: true });
    expect(s.plex.clientId).toBe("new");
    expect(s.mappings).toEqual([]);
  });

  it("drops malformed Mappings and an invalid helper port", () => {
    const s = normalizeSettings({ helperPort: -1, mappings: [prism, { id: "x" }, null, { ...prism, type: "Sleeping" }] }, () => "new");
    expect(s.mappings).toEqual([prism]);
    expect(s.helperPort).toBe(47823);
    expect(normalizeSettings({ helperPort: 1.5 }, () => "").helperPort).toBe(47823);
    expect(normalizeSettings({ helperPort: 5000 }, () => "").helperPort).toBe(5000);
  });

  it("keeps an existing Plex client id", () => {
    expect(normalizeSettings({ plex: { clientId: "keep" } }, () => "new").plex.clientId).toBe("keep");
  });
});
