import type { Playback } from "./types";

/** The subset of a Plex /status/sessions item we read. */
interface PlexSessionItem {
  type?: string;
  ratingKey?: string;
  title?: string;
  originalTitle?: string;
  grandparentTitle?: string;
  parentTitle?: string;
  parentIndex?: number;
  index?: number;
  year?: number;
  guid?: string;
  parentGuid?: string;
  grandparentGuid?: string;
  Player?: { machineIdentifier?: string; state?: string; product?: string; title?: string };
}

/** Turn a /status/sessions response into Playbacks, keeping only players that are This PC. */
export function parseSessions(json: unknown, thisPcDevices: string[]): Playback[] {
  const items = ((json as { MediaContainer?: { Metadata?: PlexSessionItem[] } })?.MediaContainer?.Metadata ?? []);
  const allowed = new Set(thisPcDevices);
  const out: Playback[] = [];
  for (const m of items) {
    const player = m.Player;
    if (!player?.machineIdentifier || !allowed.has(player.machineIdentifier)) continue;
    const playing = player.state !== "paused" && player.state !== "stopped";
    const key = m.ratingKey ?? m.guid ?? m.title ?? "";
    if (m.type === "episode") {
      out.push({
        integration: "plex",
        key,
        playing,
        title: m.title ?? "",
        showTitle: m.grandparentTitle,
        season: m.parentIndex,
        episode: m.index,
      });
    } else if (m.type === "movie" || m.type === "clip") {
      out.push({
        integration: "plex",
        key,
        playing,
        title: m.title ?? "",
        showTitle: m.title,
        extra: m.year ? String(m.year) : undefined,
      });
    } else if (m.type === "track") {
      out.push({
        integration: "plexamp",
        key,
        playing,
        title: m.title ?? "",
        subtitle: m.originalTitle ?? m.grandparentTitle,
        extra: m.parentTitle,
        appName: player.product?.toLowerCase().includes("plexamp") ? "Plexamp" : "Plex",
      });
    }
  }
  return out;
}

/** Which Plex catalogue guid holds the best artwork: the show for episodes, the album for tracks. */
export function artworkGuid(item: { type?: string; guid?: string; parentGuid?: string; grandparentGuid?: string }): string | undefined {
  const guid = item.type === "episode" ? item.grandparentGuid : item.type === "track" ? item.parentGuid : item.guid;
  return guid?.startsWith("plex://") ? guid : undefined;
}

/** Same as parseSessions but keeps the raw items, so callers can look up artwork. */
export function sessionItems(json: unknown): PlexSessionItem[] {
  return (json as { MediaContainer?: { Metadata?: PlexSessionItem[] } })?.MediaContainer?.Metadata ?? [];
}

/** "plex://show/5d9c086c46115600200aa2fe" → "5d9c086c46115600200aa2fe" */
export function guidId(guid: string): string | undefined {
  return /^plex:\/\/[a-z]+\/([A-Za-z0-9]+)$/.exec(guid)?.[1];
}

/** Pull a public https poster URL from a metadata.provider.plex.tv response. */
export function providerThumb(json: unknown): string | undefined {
  const m = (json as { MediaContainer?: { Metadata?: { thumb?: string }[] } })?.MediaContainer?.Metadata?.[0];
  return m?.thumb?.startsWith("https://") ? m.thumb : undefined;
}

export interface PlexResource {
  name: string;
  product?: string;
  platform?: string;
  clientIdentifier: string;
  provides?: string;
  owned?: boolean;
  connections?: { uri: string; local?: boolean; relay?: boolean }[];
}

export interface PlexDevice {
  id: string;
  name: string;
  product?: string;
  platform?: string;
}

/** Split a plex.tv /api/v2/resources response into servers and players. */
export function parseResources(json: unknown): { servers: PlexResource[]; players: PlexDevice[] } {
  const list = Array.isArray(json) ? (json as PlexResource[]) : [];
  const provides = (r: PlexResource) => (r.provides ?? "").split(",");
  return {
    servers: list.filter((r) => provides(r).includes("server")),
    players: list
      .filter((r) => provides(r).some((p) => p === "player" || p === "client"))
      .map((r) => ({ id: r.clientIdentifier, name: r.name, product: r.product, platform: r.platform })),
  };
}

/** Connection URLs to try for a server, best first: local, then remote, relay last. */
export function serverUris(server: PlexResource): string[] {
  const conns = server.connections ?? [];
  const score = (c: { local?: boolean; relay?: boolean }) => (c.relay ? 2 : c.local ? 0 : 1);
  return [...conns].sort((a, b) => score(a) - score(b)).map((c) => c.uri);
}
