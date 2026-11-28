/** Discord's activity type numbers. */
export const ActivityType = {
  Playing: 0,
  Streaming: 1,
  Listening: 2,
  Watching: 3,
  Competing: 5,
} as const;
export type ActivityTypeName = keyof typeof ActivityType;
export type ActivityTypeId = (typeof ActivityType)[ActivityTypeName];

/** The activity object Discord accepts in LOCAL_ACTIVITY_UPDATE. */
export interface DiscordActivity {
  name: string;
  type: ActivityTypeId;
  application_id?: string;
  details?: string;
  state?: string;
  /** Link opened by clicking the details line. */
  details_url?: string;
  /** Link opened by clicking the state line. */
  state_url?: string;
  url?: string;
  timestamps?: { start?: number; end?: number };
  assets?: { large_image?: string; large_text?: string; large_url?: string; small_image?: string; small_text?: string };
  buttons?: string[];
  metadata?: { button_urls?: string[] };
  /** 0 = show name, 1 = show state, 2 = show details on the profile line. */
  status_display_type?: 0 | 1 | 2;
  [key: string]: unknown;
}

/** An activity the plugin wants shown, before its image is turned into a Discord asset. */
export interface DesiredActivity {
  /** Stable slot id; each slot is one Activity on the profile. */
  socketId: string;
  activity: DiscordActivity;
  /** Public image URL to show as the large image, if any. */
  imageUrl?: string;
  /** Link opened by clicking the large image. */
  imageLink?: string;
}

export interface KnownGameRef {
  id: string;
  name: string;
}

export interface Mapping {
  id: string;
  enabled: boolean;
  /** Executable file name as Discord detects it, e.g. "prismlauncher.exe". */
  exeName: string;
  type: ActivityTypeName;
  /** Display name; ignored when knownGame is set. */
  name: string;
  details?: string;
  state?: string;
  knownGame?: KnownGameRef;
  imageUrl?: string;
  /** Required by Discord for the Streaming type. */
  streamUrl?: string;
}

export type IntegrationId = "youtube" | "youtubeMusic" | "twitch" | "plex" | "plexamp" | "spotify";

/** Something the user is watching or listening to, as reported by a source. */
export interface Playback {
  integration: Exclude<IntegrationId, "spotify">;
  /** Stable id of the item (video id, channel login, Plex rating key...). */
  key: string;
  playing: boolean;
  title: string;
  /** Channel, streamer, artist... */
  subtitle?: string;
  /** Page of the channel, streamer or artist. */
  subtitleUrl?: string;
  /** Category, album... */
  extra?: string;
  url?: string;
  imageUrl?: string;
  /** When playback would have started had it run without pausing or seeking (epoch ms). With durationMs, shows a progress bar. */
  startedAt?: number;
  /** Length of the item, if it has one (live streams don't). */
  durationMs?: number;
  /** Plex only: show or movie name. */
  showTitle?: string;
  season?: number;
  episode?: number;
  /** Plex only: name of the Plex app that played it. */
  appName?: string;
}

/** The user's own channel on a service, from their Discord Connections. */
export interface LinkedChannel {
  name: string;
  url: string;
  /** The channel's avatar, when known. */
  imageUrl?: string;
}

/** A program Discord's game detection currently sees running. */
export interface RunningGame {
  exeName: string;
  name: string;
}
