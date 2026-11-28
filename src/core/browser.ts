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
  /** Twitch category / game. */
  category?: string;
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
export function parseTab(info: TabInfo): Playback | null {
  let u: URL;
  try {
    u = new URL(info.url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "");

  if (host === "music.youtube.com") {
    const id = youtubeVideoId(u);
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
    };
  }

  if (host === "youtube.com" || host === "youtu.be") {
    const id = youtubeVideoId(u);
    const title = stripSuffix(info.title, /\s*-\s*YouTube$/);
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
    };
  }

  return null;
}
