import type { Settings } from "./settings";
import {
  ActivityType,
  type DesiredActivity,
  type DiscordActivity,
  type LinkedChannel,
  type Mapping,
  type Playback,
  type RunningGame,
} from "./types";

export const SOCKET_PREFIX = "custom-presence";

const STEADY = "\u0000steady";

/** Remembers when each slot's current item started, so elapsed time survives re-renders. */
export class ActivityClock {
  private starts = new Map<string, { key: string; start: number }>();

  startFor(slot: string, key: string, now: number): number {
    const prev = this.starts.get(slot);
    if (prev && prev.key === key) return prev.start;
    this.starts.set(slot, { key, start: now });
    return now;
  }

  /**
   * A start time reported by the source (for a progress bar). Small jitter is ignored so Discord
   * isn't updated every poll; a seek moves it.
   */
  steady(slot: string, start: number, toleranceMs = 2000): number {
    const prev = this.starts.get(slot);
    if (prev && prev.key === STEADY && Math.abs(prev.start - start) <= toleranceMs) return prev.start;
    this.starts.set(slot, { key: STEADY, start });
    return start;
  }

  /** Forget slots that are no longer shown. */
  keepOnly(slots: Iterable<string>): void {
    const keep = new Set(slots);
    for (const slot of this.starts.keys()) if (!keep.has(slot)) this.starts.delete(slot);
  }
}

export interface ComputeInput {
  settings: Settings;
  runningGames: RunningGame[];
  playbacks: Playback[];
  now: number;
  /** The user's YouTube channel from their Discord Connections, if linked. */
  youtubeChannel?: LinkedChannel;
}

/**
 * Discord drops a local activity that has no application id, so fall back to "0" like other
 * Rich Presence tools do. Images still need a real id (customAppId).
 */
const appId = (settings: Settings) => settings.customAppId || "0";

const normExe = (exe: string) => exe.trim().toLowerCase().split(/[\\/]/).pop() ?? "";

/** Mappings whose Program is running right now. */
export function activeMappings(mappings: Mapping[], runningGames: RunningGame[]): { mapping: Mapping; game: RunningGame }[] {
  const out: { mapping: Mapping; game: RunningGame }[] = [];
  for (const mapping of mappings) {
    if (!mapping.enabled || !mapping.exeName.trim()) continue;
    const game = runningGames.find((g) => normExe(g.exeName) === normExe(mapping.exeName));
    if (game) out.push({ mapping, game });
  }
  return out;
}

function clean(activity: DiscordActivity): DiscordActivity {
  for (const k of Object.keys(activity)) {
    const v = activity[k];
    if (v === undefined || v === "") delete activity[k];
  }
  return activity;
}

export function mappingActivity(mapping: Mapping, settings: Settings, start: number): DesiredActivity {
  const type = ActivityType[mapping.type];
  const activity: DiscordActivity = clean({
    name: mapping.knownGame?.name ?? (mapping.name.trim() || mapping.exeName),
    type,
    application_id: mapping.knownGame?.id ?? appId(settings),
    details: mapping.details?.trim(),
    state: mapping.state?.trim(),
    url: type === ActivityType.Streaming ? mapping.streamUrl : undefined,
    timestamps: { start },
  });
  return {
    socketId: `${SOCKET_PREFIX}:mapping:${mapping.id}`,
    activity,
    imageUrl: mapping.knownGame ? undefined : mapping.imageUrl?.trim() || undefined,
  };
}

function withButton(activity: DiscordActivity, label: string, url?: string): DiscordActivity {
  if (!url) return activity;
  return { ...activity, buttons: [label], metadata: { button_urls: [url] } };
}

const pad = (n: number) => String(n);

/** Own Channel mode's image when the channel's avatar isn't known. */
export const YOUTUBE_LOGO = "https://www.youtube.com/img/desktop/yt_1200.png";
const OWN_CHANNEL_KEY = "own-channel";

/** Own Channel mode: say "Watching YouTube" and show the user's channel, never the video. */
function ownChannelActivity(settings: Settings, start: number, channel: LinkedChannel | undefined): DesiredActivity {
  const activity: DiscordActivity = clean({
    name: "YouTube",
    type: ActivityType.Watching,
    application_id: appId(settings),
    timestamps: { start },
    details: channel?.name,
    details_url: channel?.url,
  });
  return { socketId: `${SOCKET_PREFIX}:youtube`, activity, imageUrl: channel?.imageUrl ?? YOUTUBE_LOGO, imageLink: channel?.url };
}

/** Build the Activity an Integration shows for one Playback. */
export function playbackActivity(p: Playback, settings: Settings, start: number, youtubeChannel?: LinkedChannel): DesiredActivity {
  if (p.integration === "youtube" && settings.youtubeOwnChannel) return ownChannelActivity(settings, start, youtubeChannel);
  const base = { timestamps: { start }, application_id: appId(settings) };
  let activity: DiscordActivity;
  switch (p.integration) {
    case "youtube":
      activity = withButton(
        { ...base, name: "YouTube", type: ActivityType.Watching, details: p.title, details_url: p.url, state: p.subtitle, state_url: p.subtitleUrl },
        "Watch",
        p.url,
      );
      break;
    case "youtubeMusic":
      activity = { ...base, name: "YouTube Music", type: ActivityType.Listening, details: p.title, details_url: p.url, state: p.subtitle, state_url: p.subtitleUrl };
      break;
    case "twitch":
      activity = withButton(
        { ...base, name: "Twitch", type: ActivityType.Watching, details: p.subtitle ?? p.title, details_url: p.url, state: p.extra },
        "Watch stream",
        p.url,
      );
      break;
    case "plex": {
      const isEpisode = p.season !== undefined && p.episode !== undefined;
      activity = {
        ...base,
        name: p.showTitle ?? p.title,
        type: ActivityType.Watching,
        // Movies already show their title as the name, so the detail line carries the year instead.
        details: isEpisode ? `S${pad(p.season!)}E${pad(p.episode!)} · ${p.title}` : p.showTitle && p.showTitle !== p.title ? p.title : p.extra,
      };
      break;
    }
    case "plexamp":
      activity = {
        ...base,
        name: p.appName ?? "Plexamp",
        type: ActivityType.Listening,
        details: p.title,
        state: [p.subtitle, p.extra].filter(Boolean).join(" — ") || undefined,
      };
      break;
  }
  if (p.durationMs) activity.timestamps = { start, end: start + p.durationMs };
  if (settings.titleOnProfileLine && activity.details) activity.status_display_type = 2;
  return {
    socketId: `${SOCKET_PREFIX}:${p.integration}`,
    activity: clean(activity),
    imageUrl: p.imageUrl,
    imageLink: p.url,
  };
}

const RANK: Record<number, number> = {
  [ActivityType.Playing]: 0,
  [ActivityType.Competing]: 1,
  [ActivityType.Streaming]: 2,
  [ActivityType.Watching]: 3,
  [ActivityType.Listening]: 4,
};

/** Primary Activity first: Playing beats Watching, which beats Listening. Stable otherwise. */
export function sortByPriority<T extends { activity: DiscordActivity }>(list: T[]): T[] {
  return [...list].sort((a, b) => (RANK[a.activity.type] ?? 9) - (RANK[b.activity.type] ?? 9));
}

/** Everything the plugin wants on the profile right now, primary first. */
export function computeActivities(input: ComputeInput, clock: ActivityClock): DesiredActivity[] {
  const { settings, runningGames, playbacks, now, youtubeChannel } = input;
  if (settings.paused) {
    clock.keepOnly([]);
    return [];
  }
  const out: DesiredActivity[] = [];

  for (const { mapping } of activeMappings(settings.mappings, runningGames)) {
    const slot = `${SOCKET_PREFIX}:mapping:${mapping.id}`;
    out.push(mappingActivity(mapping, settings, clock.startFor(slot, mapping.exeName, now)));
  }

  const seen = new Set<string>();
  for (const p of playbacks) {
    if (!p.playing || seen.has(p.integration) || !settings.integrations[p.integration]) continue;
    seen.add(p.integration);
    const slot = `${SOCKET_PREFIX}:${p.integration}`;
    const ownChannel = p.integration === "youtube" && settings.youtubeOwnChannel;
    const start = ownChannel
      ? clock.startFor(slot, OWN_CHANNEL_KEY, now)
      : p.startedAt !== undefined && p.durationMs
        ? clock.steady(slot, p.startedAt)
        : clock.startFor(slot, p.key, now);
    out.push(playbackActivity(p, settings, start, youtubeChannel));
  }

  clock.keepOnly(out.map((d) => d.socketId));
  return sortByPriority(out);
}

export interface FilterContext {
  spotifyEnabled: boolean;
  /** Names Discord's game detection uses for Programs that a Mapping is replacing. */
  replacedGameNames: string[];
  /** Activities this plugin itself dispatched; never filtered. */
  ours: DiscordActivity[];
}

const isSpotify = (a: DiscordActivity) =>
  a.type === ActivityType.Listening && (a.name === "Spotify" || String((a as { party?: { id?: string } }).party?.id ?? "").startsWith("spotify:"));

/** Remove the Discord activities that the user's settings say should not show. */
export function filterDiscordActivities(list: DiscordActivity[], ctx: FilterContext): DiscordActivity[] {
  // Discord may add or reshape fields on stored activities, so match ours on the parts we set.
  const fingerprint = (a: DiscordActivity) => [a.type, a.name, a.details, a.state, a.timestamps?.start].join("|");
  const ourKeys = new Set(ctx.ours.map(fingerprint));
  const replaced = new Set(ctx.replacedGameNames);
  return list.filter((a) => {
    if (ourKeys.has(fingerprint(a))) return true;
    if (!ctx.spotifyEnabled && isSpotify(a)) return false;
    if (replaced.has(a.name)) return false;
    return true;
  });
}
