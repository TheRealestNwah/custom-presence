// Runs in YouTube, YouTube Music and Twitch tabs. Reads what's playing from the page and
// tells the background script whenever it changes (and every few seconds as a heartbeat).

import { parseUptime, type TabInfo } from "../core/browser";

const HEARTBEAT_MS = 5000;
const MAX_DURATION_S = 12 * 60 * 60; // longer than this is a live stream's buffer, not a video

/** Visible text only: YouTube keeps hidden alternate titles inside the same heading. */
const text = (...selectors: string[]): string | undefined => {
  for (const selector of selectors) {
    const el = document.querySelector<HTMLElement>(selector);
    const t = (el?.innerText ?? el?.textContent)?.trim();
    if (t) return t;
  }
  return undefined;
};

const link = (...selectors: string[]): string | undefined => {
  for (const selector of selectors) {
    const href = document.querySelector<HTMLAnchorElement>(selector)?.href;
    if (href) return href;
  }
  return undefined;
};

// Links first; videos with several uploaders show the names as plain text ("A and B") instead.
const YT_CHANNEL_LINKS = [
  "ytd-watch-metadata ytd-channel-name a",
  "ytd-video-owner-renderer ytd-channel-name a",
  "#owner #channel-name a",
  "#upload-info ytd-channel-name a",
];
const YT_CHANNEL_TEXT = [
  ...YT_CHANNEL_LINKS,
  "ytd-watch-metadata ytd-channel-name #text",
  "ytd-watch-metadata ytd-channel-name yt-formatted-string",
  "#owner #channel-name",
  "ytd-video-owner-renderer #upload-info yt-attributed-string",
];
// Several uploaders: their names open a dialog, not a link, so use the description's channel card.
const YT_CHANNEL_HREF = [
  ...YT_CHANNEL_LINKS,
  "ytd-video-description-infocards-section-renderer a#header[href]",
  "ytd-watch-metadata #owner a[href^='/@']",
  "ytd-watch-metadata #owner a[href^='/channel/']",
  "#owner a[href^='/@']",
];

const meta = (name: string): string | undefined =>
  document.querySelector<HTMLMetaElement>(`meta[property="${name}"], meta[name="${name}"]`)?.content?.trim() || undefined;

function mainVideo(): HTMLMediaElement | null {
  const all = [...document.querySelectorAll<HTMLMediaElement>("video, audio")];
  // The biggest playing element is the real player; ads and previews are small or muted.
  return all.find((v) => !v.paused && !v.muted) ?? all.find((v) => !v.paused) ?? all[0] ?? null;
}

/** Live streams report their buffer as a finite duration, which would draw a bogus progress bar. */
function isLive(host: string): boolean {
  if (host.endsWith("twitch.tv")) return !/^\/videos\//.test(location.pathname);
  return !!document.querySelector(".ytp-live, ytd-badge-supported-renderer .badge-style-type-live-now-alternate");
}

function read(): TabInfo {
  const host = location.hostname;
  const video = mainVideo();
  const playing = !!video && !video.paused && !video.ended && video.readyState > 2;
  const info: TabInfo = { url: location.href, playing };
  const ad = !!document.querySelector(".ad-showing, .ad-interrupting");
  if (video && !ad && !isLive(host) && Number.isFinite(video.duration) && video.duration > 0 && video.duration < MAX_DURATION_S) {
    // Rounded to the second so the heartbeat doesn't count as a change.
    info.startedAt = Math.round((Date.now() - video.currentTime * 1000) / 1000) * 1000;
    info.durationMs = Math.round(video.duration) * 1000;
  }

  if (host === "music.youtube.com") {
    info.title = text("ytmusic-player-bar .title") ?? navigator.mediaSession?.metadata?.title;
    info.channel = text("ytmusic-player-bar .byline a") ?? navigator.mediaSession?.metadata?.artist;
    info.channelUrl = link("ytmusic-player-bar .byline a");
  } else if (host.endsWith("youtube.com")) {
    // The tab title is always just the video title; the page heading can hold hidden alternates.
    info.title = document.title || text("ytd-watch-metadata h1 yt-formatted-string", "h1.title");
    // "Marques Brownlee\n and The Studio" → "Marques Brownlee and The Studio"
    info.channel = text(...YT_CHANNEL_TEXT)?.replace(/\s+/g, " ").trim() || undefined;
    info.channelUrl = link(...YT_CHANNEL_HREF);
  } else if (host.endsWith("twitch.tv")) {
    info.title = text('[data-a-target="stream-title"]') ?? meta("og:description");
    info.channel = text('[data-a-target="stream-info-card-component"] h1') ?? text("h1.tw-title") ?? text('a[data-a-target="user-channel-header-item"] h1');
    info.category = text('[data-a-target="stream-game-link"]');
    // Twitch shows how long the stream has been live ("9:33:00"); turn that into when it started.
    const uptime = isLive(host) ? parseUptime(text('.live-time span[aria-hidden="true"]', ".live-time")) : undefined;
    if (uptime !== undefined) info.startedAt = Math.round((Date.now() - uptime) / 1000) * 1000;
  }
  return info;
}

let last = "";
function report(force = false): void {
  const info = read();
  const json = JSON.stringify(info);
  if (!force && json === last) return;
  last = json;
  browser.runtime.sendMessage({ type: "tab", info }).catch(() => undefined);
}

for (const ev of ["play", "playing", "pause", "ended", "loadedmetadata", "seeked", "ratechange"]) {
  document.addEventListener(ev, () => report(), true);
}
new MutationObserver(() => report()).observe(document.querySelector("title") ?? document.head, {
  childList: true,
  subtree: true,
  characterData: true,
});
setInterval(() => report(true), HEARTBEAT_MS);
report(true);
