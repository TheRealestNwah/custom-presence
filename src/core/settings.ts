import type { IntegrationId, Mapping } from "./types";

export interface PlexSettings {
  /** Random id identifying this plugin install to Plex. */
  clientId: string;
  token?: string;
  serverName?: string;
  /** Base URL of the Plex Media Server, e.g. http://192.168.1.20:32400 */
  serverUri?: string;
  /** Plex client identifiers of the players that count as This PC. */
  thisPcDevices: string[];
}

export interface Settings {
  paused: boolean;
  /** Show the title instead of the app name on the one-line profile status. */
  titleOnProfileLine: boolean;
  /** YouTube shows the user's Own Channel instead of the video being watched. */
  youtubeOwnChannel: boolean;
  /** Discord application id used for images on activities not linked to a Known Game. */
  customAppId: string;
  helperPort: number;
  integrations: Record<IntegrationId, boolean>;
  mappings: Mapping[];
  plex: PlexSettings;
}

export const DEFAULT_HELPER_PORT = 47823;

export function defaultSettings(makeId: () => string): Settings {
  return {
    paused: false,
    titleOnProfileLine: false,
    youtubeOwnChannel: false,
    customAppId: "",
    helperPort: DEFAULT_HELPER_PORT,
    integrations: { youtube: true, youtubeMusic: true, twitch: true, plex: true, plexamp: true, spotify: true },
    mappings: [],
    plex: { clientId: makeId(), thisPcDevices: [] },
  };
}

/** Merge stored (possibly older or partial) settings over the defaults. */
export function normalizeSettings(stored: unknown, makeId: () => string): Settings {
  const base = defaultSettings(makeId);
  if (!stored || typeof stored !== "object") return base;
  const s = stored as Partial<Settings>;
  return {
    paused: typeof s.paused === "boolean" ? s.paused : base.paused,
    titleOnProfileLine: typeof s.titleOnProfileLine === "boolean" ? s.titleOnProfileLine : base.titleOnProfileLine,
    youtubeOwnChannel: typeof s.youtubeOwnChannel === "boolean" ? s.youtubeOwnChannel : base.youtubeOwnChannel,
    customAppId: typeof s.customAppId === "string" ? s.customAppId : base.customAppId,
    helperPort: typeof s.helperPort === "number" ? s.helperPort : base.helperPort,
    integrations: { ...base.integrations, ...(s.integrations ?? {}) },
    mappings: Array.isArray(s.mappings) ? s.mappings : [],
    plex: {
      ...base.plex,
      ...(s.plex ?? {}),
      thisPcDevices: Array.isArray(s.plex?.thisPcDevices) ? s.plex.thisPcDevices : [],
    },
  };
}
