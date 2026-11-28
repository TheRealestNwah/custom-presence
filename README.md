# Custom Presence

A [BetterDiscord](https://betterdiscord.app) plugin that shows what you're really doing on your Discord profile:

- **Any program as a game or other activity.** Open Prism Launcher and your profile says *Playing Minecraft*. Link to a game Discord already knows for its real name and icon.
- **Watching:** YouTube and Twitch (in Waterfox), Plex (desktop app).
- **Listening:** YouTube Music (in Waterfox), Plexamp, and a switch for Discord's own Spotify activity.
- **Every integration has its own toggle**, and **Pause All** (in the channel header, next to pins and the member list) hides everything at once.

Several activities can show at once. Paused videos and songs disappear straight away.

### Tested so far

| Feature | Status |
| --- | --- |
| YouTube | ✅ Tested and working: video title, channel (including videos with several uploaders), thumbnail, progress bar, clickable title and channel, and "show my channel" mode |
| Pause All button | ✅ Tested and working |
| Programs as games (Mappings) | Not tested yet |
| YouTube Music | Not tested yet |
| Twitch | Not tested yet |
| Plex | Not tested yet |
| Plexamp | Not tested yet |
| Spotify switch | Not tested yet |

> Windows only. Using BetterDiscord (any client mod) is against Discord's Terms of Service. Use it at your own risk.
> See [AI disclosure](#ai-disclosure).

## What you need

- Discord with [BetterDiscord](https://betterdiscord.app) installed
- [Node.js](https://nodejs.org) 20 or newer (to build, and to run the browser helper)
- Waterfox, for YouTube, YouTube Music and Twitch
- A Plex account, for Plex and Plexamp

## Build

Or skip building: the [latest release](https://github.com/TheRealestNwah/custom-presence/releases/latest) has a zip with everything built, plus an `install.txt` with the steps.

```powershell
git clone https://github.com/TheRealestNwah/custom-presence.git
cd custom-presence
npm ci
npm run build
```

## Install the plugin

1. Copy `dist\CustomPresence.plugin.js` into BetterDiscord's plugins folder (Discord → User Settings → Plugins → **Open Plugins Folder**).
2. Turn on **CustomPresence** in the plugin list and open its settings.

### Pictures for custom activities (optional)

Discord only shows a picture for an activity that belongs to a Discord application. Activities linked to a Known Game use that game's picture. For everything else:

1. Go to the [Discord developer portal](https://discord.com/developers/applications) and click **New Application**. Name it anything.
2. Copy its **Application ID** into the plugin's "Discord Application ID for images" setting.

## Show a program as a game (Mappings)

1. In Discord: User Settings → **Registered Games** → **Add it!** and pick the program (e.g. Prism Launcher).
2. In the plugin settings, **Add Mapping**. Type the program's exe name (`prismlauncher.exe`, suggestions appear as you type).
3. Search for a Known Game (e.g. *Minecraft*) to use its name and icon, or type your own name and paste an image URL.
4. Pick the activity type (Playing, Watching, Listening, Streaming or Competing) and optional detail lines.

While the program runs, the Mapping's activity replaces the one Discord would normally show for it.

## YouTube, YouTube Music and Twitch (Waterfox)

The browser part has two pieces: a small Waterfox extension that reads what your tabs are playing, and a helper that Waterfox starts to pass that on to Discord. Private windows are always ignored.

1. Install the helper (once):
   ```powershell
   powershell -ExecutionPolicy Bypass -File dist\helper\install.ps1
   ```
   It copies the helper to `%LOCALAPPDATA%\CustomPresence` and registers it with Waterfox. `-Uninstall` removes it.
2. Install the extension. It isn't signed by Mozilla, so either:
   - **Try it now:** open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `dist\extension\manifest.json` (gone when Waterfox restarts), or
   - **Keep it:** in `about:config` set `xpinstall.signatures.required` to `false`, zip the *contents* of `dist\extension` into `custom-presence.xpi`, then drag it into Waterfox.
3. Restart Waterfox. The plugin settings should show **Browser helper: connected** once a YouTube or Twitch tab is open.

## Plex and Plexamp

1. In the plugin settings, click **Sign in with Plex** and approve it in the browser page that opens.
2. The plugin finds your server (local network first).
3. Start playing something in Plex or Plexamp on this PC, then tick that player under **This PC**. Playback on other devices (your phone, the TV) is never shown.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| A Mapping does nothing | The program must be in Registered Games and the exe name must match (case doesn't matter). |
| No picture on a custom activity | Set the Discord Application ID (see above), or link a Known Game. |
| Browser helper: not running | Run `install.ps1` again, make sure Node is installed, restart Waterfox. |
| Plex shows nothing | Tick the player under This PC, and check the Plex integration is on. |
| Pause button missing | Discord changed its layout; Pause All is still in the plugin settings. Please open an issue. |

## Development

```powershell
npm ci
npm run check   # typecheck, lint, tests
npm run build
npm run package # the release zip, in dist
```

See [CLAUDE.md](CLAUDE.md) for the layout, and [docs/design.md](docs/design.md) for the design. Not affiliated with Discord, Plex, Google or Twitch.

## AI disclosure

This project was built with [Claude Code](https://claude.com/claude-code), Anthropic's
AI coding assistant. Claude wrote the code, tests and documentation. The
maintainer ([@TheRealestNwah](https://github.com/TheRealestNwah)) decided what
it should do, tested it, and made the release decisions. Commits written with
Claude carry a `Co-Authored-By: Claude` trailer, so the git history shows which
changes were AI-written.

## Support

Everything on my GitHub is free of charge and open source. If you find it
useful and want to leave a tip or buy me a coffee, you can do that at
[ko-fi.com/morrowheat23](https://ko-fi.com/morrowheat23). It's appreciated,
never expected.

## License

MIT. See [LICENSE](LICENSE).
