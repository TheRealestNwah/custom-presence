# custom-presence

BetterDiscord plugin that shows any program as a Discord activity, plus YouTube, YouTube Music, Twitch, Plex and Plexamp presence, each toggleable. Vocabulary is in [GLOSSARY.md](GLOSSARY.md); the design is in [docs/design.md](docs/design.md); decisions are in [docs/adr/](docs/adr/).

## Commands

- `npm ci`: install
- `npm run check`: typecheck + lint + tests (what CI runs, plus `npm run build`)
- `npm run build`: writes `dist/CustomPresence.plugin.js`, `dist/extension/`, `dist/helper/`
- `npm test`: vitest, tests live in `tests/`

## Layout

- `src/core/`: pure logic, no Discord/browser/Node APIs. Everything testable lives here (activity building, Plex parsing, tab parsing, native-messaging framing, Known Game search, settings).
- `src/plugin/`: the BetterDiscord plugin. Talks to Discord through `discord.ts` (Flux dispatcher, stores, `fetchAssetIds`) and `bdapi.d.ts` (minimal typings for the `BdApi` global).
- `src/extension/`: Waterfox (Firefox MV2) extension. `content.ts` reads the page, `background.ts` relays to the helper.
- `src/helper/`: native-messaging host (Node) that serves `GET http://127.0.0.1:47823/playback`, plus `install.ps1`.
- `scripts/build.mjs`: esbuild bundles for all three.

## Gotchas

- The repo is `"type": "module"`, so the helper is built as `helper.cjs`. Don't rename it to `.js`.
- The plugin bundle is CommonJS with a `module.exports = module.exports.default` footer; BetterDiscord needs that and the `/** @name ... */` banner.
- BetterDiscord has no Node access: no `child_process`/`net`. Use `BdApi.Net.fetch` (no CORS) for HTTP, including localhost.
- Activities are set with `LOCAL_ACTIVITY_UPDATE` per socket id (`custom-presence:*`). Discord drops an activity with no application id, so it falls back to `"0"` (or `customAppId`); a URL becomes an asset via `fetchAssetIds`, which works with `"0"` too. `details_url`, `state_url` and `assets.large_url` make the lines and image clickable.
- Discord internals (store names, the header toolbar selector in `pauseButton.ts`, `fetchAssetIds`) can change with Discord updates. When something breaks after an update, look there first.
- Program detection uses Discord's Registered Games (`RunningGameStore`), not process scanning.
- The extension id `custom-presence@therealestnwah` must match `allowed_extensions` in `install.ps1`, and the host name `custom_presence_helper` must match in `background.ts` and `install.ps1`.
- Don't run `install.ps1` from the Claude desktop app's shell, even with the sandbox off. The app is a packaged (MSIX) app, so its writes to HKCU and `%LOCALAPPDATA%` go to a private copy that Waterfox can't see: Waterfox then reports "No such native application". Ask the user to run it from their own PowerShell window.
- Nothing here can be exercised in CI against real Discord or Waterfox; core logic is unit-tested, the rest needs a manual check.
