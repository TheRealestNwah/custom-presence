// Everything that touches Discord's internals lives here, so breakage after a Discord update is in one place.
import type { DiscordActivity, RunningGame } from "../core/types";
import type { DetectableApp } from "../core/knownGames";

export const PLUGIN = "CustomPresence";

interface Dispatcher {
  dispatch(action: Record<string, unknown>): unknown;
  subscribe(type: string, fn: (action: unknown) => void): void;
  unsubscribe(type: string, fn: (action: unknown) => void): void;
}

const isDispatcher = (m: unknown): m is Dispatcher =>
  !!m &&
  typeof (m as Dispatcher).dispatch === "function" &&
  typeof (m as Dispatcher).subscribe === "function" &&
  typeof (m as Dispatcher).unsubscribe === "function";

let dispatcher: Dispatcher | undefined;
function getDispatcher(): Dispatcher {
  if (dispatcher) return dispatcher;
  // Every Flux store holds the dispatcher, which survives Discord renaming its exports.
  for (const name of ["UserStore", "RunningGameStore", "LocalActivityStore", "SelectedChannelStore"]) {
    const d = (BdApi.Webpack.getStore(name) as { _dispatcher?: unknown } | undefined)?._dispatcher;
    if (isDispatcher(d)) return (dispatcher = d);
  }
  const found = BdApi.Webpack.getModule(isDispatcher, { searchExports: true });
  if (isDispatcher(found)) return (dispatcher = found);
  throw new Error("Couldn't find Discord's dispatcher");
}

/** Show (or with null, clear) one Activity slot on the user's profile. */
export function setActivity(socketId: string, activity: DiscordActivity | null): void {
  getDispatcher().dispatch({ type: "LOCAL_ACTIVITY_UPDATE", socketId, activity });
}

export function onConnectionOpen(fn: () => void): () => void {
  const d = getDispatcher();
  d.subscribe("CONNECTION_OPEN", fn);
  return () => d.unsubscribe("CONNECTION_OPEN", fn);
}

export const runningGameStore = () => BdApi.Webpack.getStore("RunningGameStore");
export const localActivityStore = () => BdApi.Webpack.getStore("LocalActivityStore");

interface RawRunningGame {
  exeName?: string;
  exePath?: string;
  name?: string;
}

const toRunningGame = (g: RawRunningGame): RunningGame => ({ exeName: g.exeName ?? g.exePath ?? "", name: g.name ?? "" });

export function getRunningGames(): RunningGame[] {
  const list = (runningGameStore()?.getRunningGames?.() ?? []) as RawRunningGame[];
  return list.map(toRunningGame).filter((g) => g.exeName);
}

/** Programs Discord has detected before, including user-added Registered Games. Used to suggest exe names. */
export function getGamesSeen(): RunningGame[] {
  const list = (runningGameStore()?.getGamesSeen?.() ?? []) as RawRunningGame[];
  const seen = new Map<string, RunningGame>();
  for (const g of [...list, ...(runningGameStore()?.getRunningGames?.() ?? [])].map(toRunningGame)) {
    const exe = g.exeName.split(/[\\/]/).pop()?.toLowerCase();
    if (exe && !seen.has(exe)) seen.set(exe, { exeName: exe, name: g.name });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

interface AssetUtils {
  fetchAssetIds(applicationId: string, keys: string[]): Promise<string[]>;
}
let assetUtils: AssetUtils | undefined | null;

function findAssetUtils(): AssetUtils | null {
  const byKey = BdApi.Webpack.getModule((m) => typeof m?.fetchAssetIds === "function", { searchExports: false });
  if (byKey) return byKey as AssetUtils;
  // Newer builds export it under a mangled name; it's the function that calls the external-assets endpoint.
  const fn = BdApi.Webpack.getModule(
    (m) => typeof m === "function" && /external-assets|EXTERNAL_ASSETS/.test(Function.prototype.toString.call(m)),
    { searchExports: true },
  );
  if (typeof fn === "function") return { fetchAssetIds: fn as AssetUtils["fetchAssetIds"] };
  BdApi.Logger.warn(PLUGIN, "fetchAssetIds not found; custom images won't show");
  return null;
}
const assetCache = new Map<string, string>();

/**
 * Turn a public image URL into an asset key Discord can render ("mp:external/...").
 * Needs a real application id; returns undefined when it can't.
 */
export async function resolveImage(applicationId: string | undefined, url: string): Promise<string | undefined> {
  if (!applicationId || applicationId === "0") return undefined;
  const cacheKey = `${applicationId}|${url}`;
  const cached = assetCache.get(cacheKey);
  if (cached) return cached;
  if (assetUtils === undefined) assetUtils = findAssetUtils();
  if (!assetUtils) return undefined;
  try {
    const [id] = await assetUtils.fetchAssetIds(applicationId, [url]);
    if (id) assetCache.set(cacheKey, id);
    return id;
  } catch (e) {
    BdApi.Logger.warn(PLUGIN, "Couldn't upload image", url, e);
    return undefined;
  }
}

let knownGames: DetectableApp[] | undefined;
const KNOWN_GAMES_KEY = "knownGames";
const WEEK = 7 * 24 * 60 * 60 * 1000;

/** Discord's catalogue of detectable games, cached for a week. */
export async function loadKnownGames(): Promise<DetectableApp[]> {
  if (knownGames) return knownGames;
  const cached = BdApi.Data.load(PLUGIN, KNOWN_GAMES_KEY) as { at: number; apps: DetectableApp[] } | undefined;
  if (cached && Date.now() - cached.at < WEEK && cached.apps.length) return (knownGames = cached.apps);
  const res = await BdApi.Net.fetch("https://discord.com/api/v9/applications/detectable", { timeout: 20000 });
  if (!res.ok) throw new Error(`Discord returned ${res.status} for the game list`);
  const raw = (await res.json()) as { id: string; name: string; aliases?: string[] }[];
  knownGames = raw.map((a) => ({ id: a.id, name: a.name, aliases: a.aliases?.length ? a.aliases : undefined }));
  BdApi.Data.save(PLUGIN, KNOWN_GAMES_KEY, { at: Date.now(), apps: knownGames });
  return knownGames;
}

/** Open a link in the user's default browser. */
export function openExternal(url: string): void {
  window.open(url, "_blank");
}
