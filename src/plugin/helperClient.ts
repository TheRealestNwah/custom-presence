import type { HelperSnapshot } from "../core/nativeMessaging";
import type { Playback } from "../core/types";

const STALE_MS = 20000;

export type HelperStatus = "connected" | "not running";
export let helperStatus: HelperStatus = "not running";

/** Ask the local helper what Waterfox is playing. No helper means Waterfox is closed: nothing playing. */
export async function fetchBrowserPlaybacks(port: number): Promise<Playback[]> {
  try {
    const res = await BdApi.Net.fetch(`http://127.0.0.1:${port}/playback`, { timeout: 2000 });
    if (!res.ok) throw new Error(String(res.status));
    const snap = (await res.json()) as HelperSnapshot;
    helperStatus = "connected";
    // The extension sends every 5s; an older snapshot means Waterfox is frozen or stopped sending.
    if (typeof snap.updatedAt === "number" && Date.now() - snap.updatedAt > STALE_MS) return [];
    return Array.isArray(snap.items) ? snap.items : [];
  } catch {
    helperStatus = "not running";
    return [];
  }
}
