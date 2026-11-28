// Runs in YouTube, YouTube Music and Twitch tabs. Reads what's playing from the page and
// tells the background script whenever it changes (and every few seconds as a heartbeat).

import type { TabInfo } from "../core/browser";

const HEARTBEAT_MS = 5000;
const MAX_DURATION_S = 12 * 60 * 60; // longer than this is a live stream's buffer, not a video

const text = (selector: string): string | undefined =>
  document.querySelector(selector)?.textContent?.trim() || undefined;

const link = (selector: string): string | undefined =>
  document.querySelector<HTMLAnchorElement>(selector)?.href || undefined;

const meta = (name: string): string | undefined =>
  document.querySelector<HTMLMetaElement>(`meta[property="${name}"], meta[name="${name}"]`)?.content?.trim() || undefined;

function mainVideo(): HTMLMediaElement | null {
  const all = [...document.querySelectorAll<HTMLMediaElement>("video, audio")];
  // The biggest playing element is the real player; ads and previews are small or muted.
  return all.find((v) => !v.paused && !v.muted) ?? all.find((v) => !v.paused) ?? all[0] ?? null;
}

function read(): TabInfo {
  const host = location.hostname;
  const video = mainVideo();
  const playing = !!video && !video.paused && !video.ended && video.readyState > 2;
  const info: TabInfo = { url: location.href, playing };
  const ad = !!document.querySelector(".ad-showing, .ad-interrupting");
  if (video && !ad && Number.isFinite(video.duration) && video.duration > 0 && video.duration < MAX_DURATION_S) {
    // Rounded to the second so the heartbeat doesn't count as a change.
    info.startedAt = Math.round((Date.now() - video.currentTime * 1000) / 1000) * 1000;
    info.durationMs = Math.round(video.duration) * 1000;
  }

  if (host === "music.youtube.com") {
    info.title = text("ytmusic-player-bar .title") ?? navigator.mediaSession?.metadata?.title;
    info.channel = text("ytmusic-player-bar .byline a") ?? navigator.mediaSession?.metadata?.artist;
    info.channelUrl = link("ytmusic-player-bar .byline a");
  } else if (host.endsWith("youtube.com")) {
    // The media session holds the clean title; the page heading can carry extra text.
    info.title = navigator.mediaSession?.metadata?.title || text("ytd-watch-metadata h1 yt-formatted-string") || text("h1.title") || document.title;
    info.channel = text("ytd-watch-metadata ytd-channel-name a") ?? text("#owner #channel-name a") ?? navigator.mediaSession?.metadata?.artist;
    info.channelUrl = link("ytd-watch-metadata ytd-channel-name a") ?? link("#owner #channel-name a");
  } else if (host.endsWith("twitch.tv")) {
    info.title = text('[data-a-target="stream-title"]') ?? meta("og:description");
    info.channel = text('[data-a-target="stream-info-card-component"] h1') ?? text("h1.tw-title") ?? text('a[data-a-target="user-channel-header-item"] h1');
    info.category = text('[data-a-target="stream-game-link"]');
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
