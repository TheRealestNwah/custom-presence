# custom-presence: design summary

Agreed 2026-11-27. Terms are defined in [GLOSSARY.md](../GLOSSARY.md); the browser architecture is explained in [ADR 0001](adr/0001-browser-extension-plus-helper.md).

## Scope

- Personal use first, public GitHub repo (`custom-presence`), publishable later.
- Windows only. Using BetterDiscord breaks Discord's ToS, and linking to Known Games adds a little risk.

## Pieces

| Piece | Job |
|---|---|
| **BetterDiscord plugin** (TypeScript, bundled to `.plugin.js`) | Settings UI, Mappings, Plex/Plexamp polling, Spotify toggle, publishing Activities |
| **Waterfox extension** (Firefox-style WebExtension, unsigned) | Reads YouTube / YouTube Music / Twitch tabs, ignoring private windows |
| **Helper** (native-messaging host) | Started by Waterfox; relays tab playback to the plugin over localhost. Installer script registers it. |

## Mappings

- Detection uses Discord's Registered Games. The user adds a Program there once (e.g. Prism Launcher).
- A Mapping has: Program, Activity Type, display name, optional details/state lines, and either a linked Known Game (search box over Discord's game list) or a pasted image URL.
- A Mapping replaces Discord's own Activity for its Program.

## Integrations (each toggleable)

| Integration | Activity | Line 1 | Line 2 | Button |
|---|---|---|---|---|
| YouTube | Watching YouTube | video title | channel | Watch |
| YouTube Music | Listening | song | artist | — |
| Twitch | Watching Twitch | streamer | category/game | Watch stream |
| Plex | Watching *show/movie* | S2E5 · episode title | — | — |
| Plexamp | Listening to Plexamp | track | artist — album | — |
| Spotify | Discord's native connection; plugin only toggles it | | | |

- Every Activity shows elapsed time.
- Plex/Plexamp: "Sign in with Plex" PIN flow; server is the NAS on the LAN; only devices ticked as **This PC** count.
- Artwork: Plex's public artwork links where available, otherwise the Plex/Plexamp logo. YouTube/Twitch thumbnails are public.
- Paused playback hides its Activity immediately.

## Showing Activities

- All active Activities show at once. Primary Activity order is Playing > Watching > Listening.
- **Pause All** sits in the user panel (next to mute/deafen) and in plugin settings.
- Updates only when something changes, re-sent after Discord reconnects.

## Repo conventions

- TypeScript, typecheck + lint + tests in CI as required checks on `main`.
- `CLAUDE.md` with build/test details, `AGENTS.md` pointing to it, README with AI disclosure + Support sections once public.
