import { artworkGuid, guidId, parseResources, parseSessions, providerThumb, serverUris, sessionItems, type PlexDevice, type PlexResource } from "../core/plex";
import type { PlexSettings } from "../core/settings";
import type { Playback } from "../core/types";

const PRODUCT = "Custom Presence";

function headers(clientId: string, token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json",
    "X-Plex-Client-Identifier": clientId,
    "X-Plex-Product": PRODUCT,
    "X-Plex-Version": __VERSION__,
    "X-Plex-Platform": "Windows",
  };
  if (token) h["X-Plex-Token"] = token;
  return h;
}

async function getJson(url: string, clientId: string, token?: string, timeout = 8000): Promise<unknown> {
  const res = await BdApi.Net.fetch(url, { headers: headers(clientId, token), timeout });
  if (!res.ok) throw new Error(`Plex returned ${res.status}`);
  return res.json();
}

/** Step 1 of "Sign in with Plex": get a PIN and the page the user approves it on. */
export async function startPlexSignIn(clientId: string): Promise<{ pinId: number; authUrl: string }> {
  const res = await BdApi.Net.fetch("https://plex.tv/api/v2/pins?strong=true", { method: "POST", headers: headers(clientId) });
  if (!res.ok) throw new Error(`Plex returned ${res.status}`);
  const pin = (await res.json()) as { id: number; code: string };
  const params = new URLSearchParams({ clientID: clientId, code: pin.code, "context[device][product]": PRODUCT });
  return { pinId: pin.id, authUrl: `https://app.plex.tv/auth#?${params}` };
}

/** Step 2: wait until the user approves, up to about 5 minutes. Resolves with the token. */
export async function waitForPlexToken(clientId: string, pinId: number, isCancelled: () => boolean): Promise<string> {
  for (let i = 0; i < 150 && !isCancelled(); i++) {
    const pin = (await getJson(`https://plex.tv/api/v2/pins/${pinId}`, clientId)) as { authToken?: string | null };
    if (pin.authToken) return pin.authToken;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Plex sign-in timed out");
}

export async function listResources(clientId: string, token: string): Promise<{ servers: PlexResource[]; players: PlexDevice[] }> {
  return parseResources(await getJson("https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1", clientId, token));
}

/** Find a connection URL that answers, local network first. */
export async function findServerUri(clientId: string, token: string, server: PlexResource): Promise<string> {
  const serverToken = (server as { accessToken?: string }).accessToken ?? token;
  for (const uri of serverUris(server)) {
    try {
      await getJson(`${uri}/identity`, clientId, serverToken, 3000);
      return uri;
    } catch {
      // try the next one
    }
  }
  throw new Error(`Couldn't reach ${server.name}`);
}

/** Players seen in recent sessions, so the This PC list includes devices plex.tv doesn't list. */
export const seenPlayers = new Map<string, PlexDevice>();
const artCache = new Map<string, string | null>();

async function artworkFor(clientId: string, token: string, guid: string): Promise<string | undefined> {
  if (artCache.has(guid)) return artCache.get(guid) ?? undefined;
  const id = guidId(guid);
  let url: string | undefined;
  if (id) {
    try {
      url = providerThumb(await getJson(`https://metadata.provider.plex.tv/library/metadata/${id}`, clientId, token));
    } catch {
      url = undefined;
    }
  }
  artCache.set(guid, url ?? null);
  return url;
}

/** What This PC is playing on the Plex server right now, with public artwork when Plex has it. */
export async function fetchPlexPlaybacks(plex: PlexSettings, fallbackImages: { plex?: string; plexamp?: string }): Promise<Playback[]> {
  if (!plex.token || !plex.serverUri) return [];
  const json = await getJson(`${plex.serverUri}/status/sessions`, plex.clientId, plex.token);
  const items = sessionItems(json);
  for (const m of items) {
    const id = m.Player?.machineIdentifier;
    if (id && !seenPlayers.has(id)) seenPlayers.set(id, { id, name: m.Player?.title ?? id, product: m.Player?.product });
  }
  const playbacks = parseSessions(json, plex.thisPcDevices);
  for (const p of playbacks) {
    const item = items.find((m) => (m.ratingKey ?? m.guid ?? m.title) === p.key);
    const guid = item && artworkGuid(item);
    p.imageUrl = (guid && (await artworkFor(plex.clientId, plex.token, guid))) || fallbackImages[p.integration as "plex" | "plexamp"];
  }
  return playbacks;
}
