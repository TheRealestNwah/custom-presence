import { ActivityClock, activeMappings, computeActivities, filterDiscordActivities, SOCKET_PREFIX } from "../core/activity";
import { normalizeSettings, type Settings } from "../core/settings";
import type { DesiredActivity, DiscordActivity, Playback } from "../core/types";
import {
  connectedAccountsStore,
  getLinkedYouTubeChannel,
  getRunningGames,
  localActivityStore,
  onConnectionOpen,
  PLUGIN,
  resolveImage,
  runningGameStore,
  setActivity,
} from "./discord";
import { fetchBrowserPlaybacks } from "./helperClient";
import { PauseButton } from "./pauseButton";
import { fetchPlexPlaybacks } from "./plexClient";
import { SettingsPanel, STYLES } from "./settingsPanel";

const BROWSER_POLL_MS = 5000;
const PLEX_POLL_MS = 10000;
const NUDGE_SOCKET = `${SOCKET_PREFIX}:nudge`;

const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export default class CustomPresence {
  settings: Settings = normalizeSettings(undefined, makeId);
  private clock = new ActivityClock();
  private browser: Playback[] = [];
  private plex: Playback[] = [];
  private sent = new Map<string, string>();
  private ours: DiscordActivity[] = [];
  private revision = 0;
  private timers: ReturnType<typeof setInterval>[] = [];
  private cleanups: (() => void)[] = [];
  private pauseButton = new PauseButton(() => this.settings.paused, () => this.update({ paused: !this.settings.paused }));

  start(): void {
    this.settings = normalizeSettings(BdApi.Data.load(PLUGIN, "settings"), makeId);
    this.save();
    BdApi.DOM.addStyle(PLUGIN, STYLES);
    this.safely("patching the activity list", () => this.patchActivityStore());

    const games = runningGameStore();
    const onGames = () => this.render();
    games?.addChangeListener(onGames);
    this.cleanups.push(() => games?.removeChangeListener(onGames));
    const accounts = connectedAccountsStore();
    accounts?.addChangeListener(onGames);
    this.cleanups.push(() => accounts?.removeChangeListener(onGames));
    // Discord forgets local activities when it reconnects, so send everything again.
    this.safely("listening for reconnects", () =>
      this.cleanups.push(onConnectionOpen(() => {
        this.sent.clear();
        this.render();
      })),
    );

    this.timers.push(setInterval(() => void this.pollBrowser(), BROWSER_POLL_MS));
    this.timers.push(setInterval(() => void this.pollPlex(), PLEX_POLL_MS));
    void this.pollBrowser();
    void this.pollPlex();
    this.pauseButton.inject();
    this.render();
  }

  stop(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    for (const socketId of this.sent.keys()) setActivity(socketId, null);
    this.sent.clear();
    this.ours = [];
    BdApi.Patcher.unpatchAll(PLUGIN);
    BdApi.DOM.removeStyle(PLUGIN);
    this.pauseButton.remove();
    this.nudge();
  }

  /** BetterDiscord calls this on DOM changes; keeps the Pause All button in the user panel. */
  observer(): void {
    this.pauseButton.inject();
  }

  getSettingsPanel(): unknown {
    return BdApi.React.createElement(SettingsPanel, { plugin: this });
  }

  update(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.save();
    this.pauseButton.refresh();
    if (patch.integrations || patch.plex) {
      void this.pollPlex();
      void this.pollBrowser();
    }
    this.render();
  }

  /** Run one part of start-up; if Discord changed something, warn once instead of failing the whole plugin. */
  private safely(what: string, fn: () => void): void {
    try {
      fn();
    } catch (e) {
      BdApi.Logger.error(PLUGIN, `Failed ${what}`, e);
      BdApi.UI.showToast(`Custom Presence: failed ${what}. Discord may have updated; see the console.`, { type: "error" });
    }
  }

  private save(): void {
    BdApi.Data.save(PLUGIN, "settings", this.settings);
  }

  private browserWanted(): boolean {
    const i = this.settings.integrations;
    return !this.settings.paused && (i.youtube || i.youtubeMusic || i.twitch);
  }

  private async pollBrowser(): Promise<void> {
    const next = this.browserWanted() ? await fetchBrowserPlaybacks(this.settings.helperPort) : [];
    if (JSON.stringify(next) !== JSON.stringify(this.browser)) {
      this.browser = next;
      this.render();
    }
  }

  private async pollPlex(): Promise<void> {
    const i = this.settings.integrations;
    let next: Playback[] = [];
    if (!this.settings.paused && (i.plex || i.plexamp)) {
      try {
        next = await fetchPlexPlaybacks(this.settings.plex, {});
      } catch (e) {
        BdApi.Logger.warn(PLUGIN, "Plex poll failed", e);
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(this.plex)) {
      this.plex = next;
      this.render();
    }
  }

  /** Recompute what should show and send only what changed. */
  render(): void {
    const rev = ++this.revision;
    const desired = computeActivities(
      { settings: this.settings, runningGames: getRunningGames(), playbacks: [...this.browser, ...this.plex], now: Date.now(), youtubeChannel: getLinkedYouTubeChannel() },
      this.clock,
    );
    void this.withImages(desired).then((ready) => {
      if (rev !== this.revision) return; // a newer render started while images were loading
      this.send(ready);
    }).catch((e) => BdApi.Logger.error(PLUGIN, "Couldn't update activities", e));
  }

  private withImages(desired: DesiredActivity[]): Promise<{ socketId: string; activity: DiscordActivity }[]> {
    return Promise.all(
      desired.map(async ({ socketId, activity, imageUrl, imageLink }) => {
        const out = { ...activity };
        if (imageUrl) {
          const key = await resolveImage(out.application_id ?? this.settings.customAppId, imageUrl);
          if (key) out.assets = { large_image: key, large_text: out.details ?? out.name, ...(imageLink ? { large_url: imageLink } : {}) };
        }
        return { socketId, activity: out };
      }),
    );
  }

  private send(ready: { socketId: string; activity: DiscordActivity }[]): void {
    const next = new Map(ready.map(({ socketId, activity }) => [socketId, activity]));
    for (const socketId of this.sent.keys()) {
      if (!next.has(socketId)) {
        setActivity(socketId, null);
        this.sent.delete(socketId);
      }
    }
    // Dispatch in priority order so the Primary Activity is the most recent of the highest rank.
    for (const [socketId, activity] of next) {
      const json = JSON.stringify(activity);
      if (this.sent.get(socketId) === json) continue;
      setActivity(socketId, activity);
      this.sent.set(socketId, json);
    }
    this.ours = [...next.values()];
    this.nudge();
  }

  /** Make Discord re-read activities so the filter (Spotify toggle, replaced games) applies now. */
  private nudge(): void {
    setActivity(NUDGE_SOCKET, null);
  }

  /** Hide Discord's own activities that the settings replace or switch off. */
  private patchActivityStore(): void {
    const store = localActivityStore();
    if (!store) {
      BdApi.Logger.warn(PLUGIN, "LocalActivityStore not found; Spotify toggle and Mapping replacement won't work");
      return;
    }
    const filter = (list: DiscordActivity[]) => {
      const replacedGameNames = this.settings.paused
        ? []
        : activeMappings(this.settings.mappings, getRunningGames()).map(({ game }) => game.name).filter(Boolean);
      return filterDiscordActivities(list, { spotifyEnabled: this.settings.integrations.spotify, replacedGameNames, ours: this.ours });
    };
    BdApi.Patcher.after(PLUGIN, store, "getActivities", (_this, _args, ret) => (Array.isArray(ret) ? filter(ret) : ret));
    if (typeof store.getPrimaryActivity === "function") {
      BdApi.Patcher.after(PLUGIN, store, "getPrimaryActivity", (_this, _args, ret) => {
        if (!ret) return ret;
        if (filter([ret]).length) return ret;
        return filter((store.getActivities() as DiscordActivity[]) ?? [])[0] ?? null;
      });
    }
  }
}
