// Collects what each tab is playing and passes the list to the local helper over native messaging.
// Private-window tabs are ignored.

import { parseTab, type TabInfo } from "../core/browser";
import type { PlaybackMessage } from "../core/nativeMessaging";
import type { Playback } from "../core/types";

const HOST_NAME = "custom_presence_helper";
const STALE_MS = 15000; // a tab that stops reporting (crashed, frozen) drops off
const SEND_MS = 5000;

const tabs = new Map<number, { playback: Playback; seen: number }>();
let port: BrowserPort | null = null;
let retryMs = 1000;

function connect(): void {
  try {
    port = browser.runtime.connectNative(HOST_NAME);
  } catch {
    port = null;
  }
  if (!port) return scheduleReconnect();
  port.onDisconnect.addListener(() => {
    port = null;
    scheduleReconnect();
  });
  retryMs = 1000;
  send();
}

function scheduleReconnect(): void {
  setTimeout(connect, retryMs);
  retryMs = Math.min(retryMs * 2, 60000);
}

function send(): void {
  const now = Date.now();
  for (const [id, t] of tabs) if (now - t.seen > STALE_MS) tabs.delete(id);
  const message: PlaybackMessage = { type: "playback", items: [...tabs.values()].map((t) => t.playback) };
  try {
    port?.postMessage(message);
  } catch {
    port = null;
    scheduleReconnect();
  }
}

browser.runtime.onMessage.addListener((message, sender) => {
  const tab = sender.tab;
  if (!tab || tab.id === undefined || tab.incognito) return;
  const m = message as { type?: string; info?: TabInfo };
  if (m.type !== "tab" || !m.info) return;
  const playback = parseTab(m.info);
  const before = JSON.stringify(tabs.get(tab.id)?.playback ?? null);
  if (playback) tabs.set(tab.id, { playback, seen: Date.now() });
  else tabs.delete(tab.id);
  if (JSON.stringify(playback) !== before) send();
});

browser.tabs.onRemoved.addListener((tabId) => {
  if (tabs.delete(tabId)) send();
});

setInterval(send, SEND_MS);
connect();
