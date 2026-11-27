# Browser playback comes from a Waterfox extension via a local helper

Discord cannot see browser tabs, and a BetterDiscord plugin can neither list processes nor host a server, so YouTube and Twitch need something outside Discord. We chose a browser extension (reads the real tab, so it knows YouTube from Twitch and gets title, channel and link) feeding a tiny local helper that the plugin polls over localhost, instead of a helper reading Windows' media controls (SMTC), which needs no extension but only sees "the browser is playing some title".

## Consequences

- The project ships three pieces (plugin, extension, helper), not one.
- Program detection stays with Discord's Registered Games, so the helper does nothing but relay browser playback.
