# Custom Presence

A BetterDiscord plugin that controls what the user's Discord profile says they are playing, watching or listening to, beyond what Discord detects on its own.

## Activities

**Activity**:
One "Playing / Watching / Listening / Streaming / Competing" entry shown on the user's Discord profile. Several can be shown at once.
_Avoid_: Status, presence, RPC

**Activity Type**:
The verb of an Activity: Playing, Watching, Listening, Streaming or Competing.
_Avoid_: Category, kind, "game vs series"

**Primary Activity**:
The single Activity that wins the one-line spot on the profile. Playing beats Watching, which beats Listening.

## Mappings

**Program**:
A Windows executable the user has added to Discord's Registered Games, so Discord detects it running.
_Avoid_: App, process, launcher

**Mapping**:
A user-defined rule: "while this Program runs, show this Activity."
_Avoid_: Rule, override, alias

**Known Game**:
A game or app already in Discord's own catalogue. A Mapping linked to one shows as that game, with its real name and icon.
_Avoid_: Detectable app, official game

## Integrations

**Integration**:
A built-in source that turns something the user is consuming into an Activity: YouTube, YouTube Music, Twitch, Plex, Plexamp or Spotify. Each one can be switched on or off. Browser Integrations ignore private windows.
_Avoid_: Platform, provider, connector

**Own Channel**:
The user's own YouTube channel, as linked in their Discord Connections. When switched on, the YouTube Integration shows it instead of the video being watched.
_Avoid_: My channel, linked account

**This PC**:
The one computer whose playback counts. Plex or Plexamp playing on any other device (TV, phone) is ignored.

**Pause All**:
One master switch that hides every Activity the plugin produces, without changing any individual toggle.
_Avoid_: Kill switch, disable

## Relationships

- A **Mapping** watches exactly one **Program** and produces at most one **Activity**, which replaces the one Discord would show for that Program.
- A **Mapping** may link to one **Known Game**. If it doesn't, the user supplies the name and image.
- Each **Integration** produces at most one **Activity** at a time, and only for playback on **This PC**.
- Paused playback produces no **Activity**.
- The **Spotify** Integration is a toggle over Discord's own Spotify connection, not a separate reader.
