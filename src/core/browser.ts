import type { Playback } from "./types";

/** What the extension's content script reads from a tab. */
export interface TabInfo {
  url: string;
  playing: boolean;
  /** Video, song or stream title. */
  title?: string;
  /** Channel, artist or streamer display name. */
  channel?: string;
  /** Link to the channel or artist page, as found on the page. */
  channelUrl?: string;
  /** YouTube Music: the player's link to the current song. The tab's URL only has it on the /watch page, not while browsing. */
  playerUrl?: string;
  /** Twitch category / game. */
  category?: string;
  /**
   * Epoch ms when the video would have started if played straight through, rounded to the second.
   * For a Twitch live stream (no durationMs): when the stream went live.
   */
  startedAt?: number;
  /** Video length in ms, rounded to the second. Absent for live streams and ads. */
  durationMs?: number;
}

/** Twitch's uptime counter ("9:33:00", "12:05") in ms, or undefined if it doesn't look like one. */
export function parseUptime(text: string | undefined): number | undefined {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(text?.trim() ?? "");
  if (!m) return undefined;
  const [, h = "0", min, s] = m;
  return ((Number(h) * 60 + Number(min)) * 60 + Number(s)) * 1000;
}

const MAX_STREAM_MS = 7 * 24 * 60 * 60 * 1000;

/** When a live stream went live, if the tab reported a plausible time. */
function liveStart(info: TabInfo, now: number): Pick<Playback, "startedAt"> {
  const { startedAt } = info;
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt) || startedAt > now + 60_000 || now - startedAt > MAX_STREAM_MS) return {};
  return { startedAt };
}

/** Progress fields copied onto a Playback, only when both make sense. */
function timing(info: TabInfo): Pick<Playback, "startedAt" | "durationMs"> {
  const { startedAt, durationMs } = info;
  if (typeof startedAt !== "number" || typeof durationMs !== "number" || !(durationMs > 0) || !Number.isFinite(startedAt)) return {};
  return { startedAt, durationMs };
}

const TWITCH_RESERVED = new Set([
  "", "directory", "settings", "subscriptions", "inventory", "wallet", "drops", "search", "downloads",
  "friends", "messages", "p", "jobs", "turbo", "prime", "store", "u", "moderator", "popout",
]);

const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

function youtubeVideoId(u: URL): string | undefined {
  if (u.hostname === "youtu.be") return u.pathname.slice(1) || undefined;
  if (u.pathname === "/watch") return u.searchParams.get("v") ?? undefined;
  const m = /^\/(?:shorts|live|embed)\/([\w-]+)/.exec(u.pathname);
  return m?.[1];
}

/** The song id from YouTube Music's player link, only if it's a music.youtube.com watch link. */
function playerVideoId(href: string | undefined): string | undefined {
  const link = sameSiteLink(href, ["music.youtube.com"]);
  return link ? youtubeVideoId(new URL(link)) : undefined;
}

/** Keep a page-supplied link only if it points at the same site, so the activity never links elsewhere. */
function sameSiteLink(href: string | undefined, hosts: string[]): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href);
    return u.protocol === "https:" && hosts.includes(u.hostname) ? u.href : undefined;
  } catch {
    return undefined;
  }
}

const stripSuffix = (title: string | undefined, suffix: RegExp) => title?.replace(suffix, "").trim() || undefined;

/** Turn a tab's state into a Playback, or null if the tab isn't something we show. */
export function parseTab(info: TabInfo, now = Date.now()): Playback | null {
  let u: URL;
  try {
    u = new URL(info.url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "");

  if (host === "music.youtube.com") {
    const id = youtubeVideoId(u) ?? playerVideoId(info.playerUrl);
    if (!id || !info.title) return null;
    return {
      integration: "youtubeMusic",
      key: id,
      playing: info.playing,
      title: info.title,
      subtitle: info.channel,
      subtitleUrl: sameSiteLink(info.channelUrl, ["music.youtube.com"]),
      url: `https://music.youtube.com/watch?v=${id}`,
      imageUrl: ytThumb(id),
      ...timing(info),
    };
  }

  if (host === "youtube.com" || host === "youtu.be") {
    const id = youtubeVideoId(u);
    // Tab titles look like "(3) Video title - YouTube"; the number is unread notifications.
    const title = stripSuffix(info.title?.replace(/^\(\d+\+?\)\s*/, ""), /\s*-\s*YouTube$/);
    if (!id || !title) return null;
    return {
      integration: "youtube",
      key: id,
      playing: info.playing,
      title,
      subtitle: info.channel,
      subtitleUrl: sameSiteLink(info.channelUrl, ["www.youtube.com", "youtube.com", "m.youtube.com"]),
      url: `https://www.youtube.com/watch?v=${id}`,
      imageUrl: ytThumb(id),
      ...timing(info),
    };
  }

  if (host === "twitch.tv") {
    const parts = u.pathname.split("/").filter(Boolean);
    const first = (parts[0] ?? "").toLowerCase();
    if (first === "videos" && parts[1]) {
      return {
        integration: "twitch",
        key: `video:${parts[1]}`,
        playing: info.playing,
        title: info.title ?? "Twitch video",
        subtitle: info.channel,
        extra: info.category,
        url: `https://www.twitch.tv/videos/${parts[1]}`,
        ...timing(info),
      };
    }
    if (TWITCH_RESERVED.has(first) || !/^\w+$/.test(first)) return null;
    return {
      integration: "twitch",
      key: first,
      playing: info.playing,
      title: info.title ?? first,
      subtitle: info.channel ?? first,
      extra: info.category,
      url: `https://www.twitch.tv/${first}`,
      imageUrl: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${first}-640x360.jpg`,
      ...liveStart(info, now),
    };
  }

  return null;
}
