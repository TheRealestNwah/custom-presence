import type { KnownGameRef } from "./types";

/** An entry from Discord's detectable-applications list. */
export interface DetectableApp {
  id: string;
  name: string;
  aliases?: string[];
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Search Known Games by name or alias: exact matches, then prefix, then substring. */
export function searchKnownGames(apps: DetectableApp[], query: string, limit = 20): KnownGameRef[] {
  const q = norm(query);
  if (!q) return [];
  const scored: { app: DetectableApp; score: number }[] = [];
  for (const app of apps) {
    let best = Infinity;
    for (const n of [app.name, ...(app.aliases ?? [])]) {
      const s = norm(n);
      const score = s === q ? 0 : s.startsWith(q) ? 1 : s.includes(q) ? 2 : Infinity;
      best = Math.min(best, score);
    }
    if (best < Infinity) scored.push({ app, score: best });
  }
  scored.sort((a, b) => a.score - b.score || a.app.name.length - b.app.name.length);
  return scored.slice(0, limit).map(({ app }) => ({ id: app.id, name: app.name }));
}
