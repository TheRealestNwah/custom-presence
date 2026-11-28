/* eslint-disable @typescript-eslint/no-explicit-any */
// The settings panel, built from BetterDiscord's own components (BdApi.Components) so it matches
// Discord's look and keeps matching it when Discord restyles.
import { searchKnownGames } from "../core/knownGames";
import type { PlexDevice } from "../core/plex";
import type { Settings } from "../core/settings";
import { ActivityType, type ActivityTypeName, type IntegrationId, type KnownGameRef, type Mapping, type RunningGame } from "../core/types";
import { getGamesSeen, getLinkedYouTubeChannel, loadKnownGames, openExternal } from "./discord";
import { helperStatus } from "./helperClient";
import { findServerUri, listResources, seenPlayers, startPlexSignIn, waitForPlexToken } from "./plexClient";

const React = BdApi.React;
const C = BdApi.Components;

// Typed wrapper so our own components' props are checked (BdApi.React itself is untyped).
function h<P>(type: (props: P) => unknown, props: P & { key?: string }, ...children: unknown[]): unknown;
function h(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown;
function h(type: unknown, props?: unknown, ...children: unknown[]): unknown {
  return React.createElement(type, props, ...children);
}

interface PluginLike {
  settings: Settings;
  update(patch: Partial<Settings>): void;
}

// Colours fall back through Discord's newer and older variable names to plain dark-theme values.
const SURFACE = "var(--background-surface-high, var(--background-secondary, #2b2d31))";
const FLOATING = "var(--background-surface-highest, var(--background-floating, #111214))";
const HOVER = "var(--background-modifier-hover, rgba(78, 80, 88, 0.3))";
const TEXT = "var(--text-default, var(--text-normal, #dbdee1))";
const MUTED = "var(--text-muted, #949ba4)";
const BORDER = "var(--border-subtle, var(--background-modifier-accent, rgba(78, 80, 88, 0.48)))";

export const STYLES = `
.cp-panel { color: ${TEXT}; display: flex; flex-direction: column; gap: 8px; }
.cp-muted { color: ${MUTED}; font-size: 14px; }
.cp-ok { color: var(--status-positive, var(--text-positive, #23a55a)); }
.cp-card { background: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; }
.cp-card-head { display: flex; align-items: center; gap: 12px; }
.cp-card-title { flex: 1; min-width: 0; }
.cp-card-title strong { display: block; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-card-title span { color: ${MUTED}; font-size: 13px; }
.cp-card-body { margin-top: 12px; }
.cp-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cp-suggest { position: relative; }
.cp-suggest-list {
  margin-top: 4px; max-height: 220px; overflow-y: auto; border-radius: 8px;
  background: ${FLOATING}; border: 1px solid ${BORDER}; padding: 4px;
}
.cp-suggest-list button {
  display: flex; justify-content: space-between; gap: 12px; width: 100%; text-align: left;
  background: none; border: 0; border-radius: 4px; padding: 8px; color: ${TEXT}; cursor: pointer; font-size: 14px;
}
.cp-suggest-list button:hover, .cp-suggest-list button:focus { background: ${HOVER}; outline: none; }
.cp-suggest-list button span:last-child { color: ${MUTED}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-segmented { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; border-radius: 8px; background: ${FLOATING}; border: 1px solid ${BORDER}; }
.cp-segmented button { flex: 1; min-width: 90px; padding: 8px 10px; border: 0; border-radius: 6px; background: none; color: ${MUTED}; font-size: 14px; font-weight: 500; cursor: pointer; }
.cp-segmented button:hover { background: ${HOVER}; color: ${TEXT}; }
.cp-segmented button.is-selected { background: var(--brand-500, var(--brand-experiment, #5865f2)); color: #fff; }
.cp-linked { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: ${FLOATING}; }
.cp-linked span { flex: 1; }
.custom-presence-pause { background: none; border: 0; color: var(--interactive-normal, #b5bac1); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px; cursor: pointer; }
.custom-presence-pause:hover { background: ${HOVER}; color: var(--interactive-hover, #dbdee1); }
.custom-presence-pause.is-paused { color: var(--status-danger, #da373c); }
`;

// ---------- small building blocks ----------

function Toggle(props: { id: string; name: string; note?: string; value: boolean; onChange: (v: boolean) => void }) {
  return h(C.SettingItem, { id: props.id, name: props.name, note: props.note, inline: true }, h(C.SwitchInput, { id: props.id, value: props.value, onChange: props.onChange }));
}

function Field(props: { id: string; name: string; note?: string; children: unknown }) {
  return h(C.SettingItem, { id: props.id, name: props.name, note: props.note }, props.children);
}

function Text(props: { value: string; placeholder?: string; onChange: (v: string) => void }) {
  return h(C.TextInput, { value: props.value, placeholder: props.placeholder, onChange: props.onChange });
}

function Btn(props: { onClick: () => void; color?: string; look?: string; size?: string; disabled?: boolean; children: unknown }) {
  return h(
    C.Button,
    {
      onClick: props.onClick,
      color: props.color ?? C.Button.Colors.BRAND,
      look: props.look ?? C.Button.Looks.FILLED,
      size: props.size ?? C.Button.Sizes.SMALL,
      disabled: props.disabled,
    },
    props.children,
  );
}

/** A text box with a short, scrollable list of matches under it (replaces the browser's own autocomplete). */
function Suggest<T>(props: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  items: T[];
  label: (item: T) => [string, string?];
  onPick: (item: T) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return h(
    "div",
    {
      className: "cp-suggest",
      onFocus: () => setOpen(true),
      onBlur: (e: any) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      },
    },
    h(Text, { value: props.value, placeholder: props.placeholder, onChange: (v) => (props.onChange(v), setOpen(true)) }),
    open &&
      props.items.length > 0 &&
      h(
        "div",
        { className: "cp-suggest-list" },
        props.items.map((item, i) => {
          const [main, side] = props.label(item);
          return h(
            "button",
            { key: `${main}-${i}`, type: "button", onClick: () => (props.onPick(item), setOpen(false)) },
            h("span", null, main),
            side ? h("span", null, side) : null,
          );
        }),
      ),
  );
}

// ---------- mappings ----------

function exeMatches(games: RunningGame[], query: string): RunningGame[] {
  const q = query.trim().toLowerCase();
  const list = q ? games.filter((g) => g.exeName.includes(q) || g.name.toLowerCase().includes(q)) : games;
  return list.slice(0, 30);
}

function KnownGamePicker(props: { value?: KnownGameRef; onChange: (g?: KnownGameRef) => void }) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState([] as KnownGameRef[]);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!query.trim()) return setResults([]);
    let live = true;
    const t = setTimeout(() => {
      loadKnownGames()
        .then((apps) => live && setResults(searchKnownGames(apps, query)))
        .catch((e) => live && setError(String(e?.message ?? e)));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  const body = props.value
    ? h(
        "div",
        { className: "cp-linked" },
        h("span", null, props.value.name),
        h(Btn, { onClick: () => props.onChange(undefined), color: C.Button.Colors.PRIMARY, children: "Unlink" }),
      )
    : h(Suggest<KnownGameRef>, {
        value: query,
        placeholder: "Search, e.g. Minecraft",
        onChange: setQuery,
        items: results,
        label: (g: KnownGameRef) => [g.name],
        onPick: (g: KnownGameRef) => (props.onChange(g), setQuery("")),
      });

  return h(Field, {
    id: "cp-known-game",
    name: "Known Game",
    note: error || "Optional. Link a game Discord already knows to use its real name and icon.",
    children: body,
  });
}

const TYPE_OPTIONS = (Object.keys(ActivityType) as ActivityTypeName[]).map((t) => ({ label: t, value: t }));

function MappingCard(props: { mapping: Mapping; games: RunningGame[]; open: boolean; onToggleOpen: () => void; onChange: (m: Mapping) => void; onDelete: () => void }) {
  const m = props.mapping;
  const set = (patch: Partial<Mapping>) => props.onChange({ ...m, ...patch });
  const id = (f: string) => `cp-${m.id}-${f}`;
  const title = m.knownGame?.name || m.name || "New Mapping";

  return h(
    "div",
    { className: "cp-card" },
    h(
      "div",
      { className: "cp-card-head" },
      h("div", { className: "cp-card-title" }, h("strong", null, title), h("span", null, `${m.type} · ${m.exeName || "no program set"}`)),
      h(C.SwitchInput, { id: id("enabled"), value: m.enabled, onChange: (enabled: boolean) => set({ enabled }) }),
      h(Btn, { onClick: props.onToggleOpen, color: C.Button.Colors.PRIMARY, children: props.open ? "Close" : "Edit" }),
    ),
    props.open &&
      h(
        "div",
        { className: "cp-card-body" },
        h(Field, {
          id: id("exe"),
          name: "Program",
          note: "The exe name, as added under Registered Games. Pick one Discord has seen, or type it.",
          children: h(Suggest<RunningGame>, {
            value: m.exeName,
            placeholder: "prismlauncher.exe",
            onChange: (exeName) => set({ exeName }),
            items: exeMatches(props.games, m.exeName),
            label: (g) => [g.exeName, g.name],
            onPick: (g) => set({ exeName: g.exeName }),
          }),
        }),
        h(Field, {
          id: id("type"),
          name: "Activity type",
          children: h(
            "div",
            { className: "cp-segmented", role: "radiogroup" },
            TYPE_OPTIONS.map((o) =>
              h(
                "button",
                { key: o.value, type: "button", role: "radio", "aria-checked": m.type === o.value, className: m.type === o.value ? "is-selected" : "", onClick: () => set({ type: o.value }) },
                o.label,
              ),
            ),
          ),
        }),
        h(KnownGamePicker, { value: m.knownGame, onChange: (knownGame) => set({ knownGame }) }),
        !m.knownGame &&
          h(Field, { id: id("name"), name: "Display name", children: h(Text, { value: m.name, placeholder: "Minecraft", onChange: (name) => set({ name }) }) }),
        h(Field, { id: id("details"), name: "Details line", note: "Optional. First line under the name.", children: h(Text, { value: m.details ?? "", onChange: (details) => set({ details }) }) }),
        h(Field, { id: id("state"), name: "State line", note: "Optional. Second line.", children: h(Text, { value: m.state ?? "", onChange: (state) => set({ state }) }) }),
        !m.knownGame &&
          h(Field, {
            id: id("image"),
            name: "Image URL",
            note: "Optional. Needs the Application ID under General.",
            children: h(Text, { value: m.imageUrl ?? "", placeholder: "https://...", onChange: (imageUrl) => set({ imageUrl }) }),
          }),
        m.type === "Streaming" &&
          h(Field, {
            id: id("stream"),
            name: "Stream URL",
            note: "Required for Streaming: a Twitch or YouTube link.",
            children: h(Text, { value: m.streamUrl ?? "", onChange: (streamUrl) => set({ streamUrl }) }),
          }),
        h("div", { className: "cp-row" }, h(Btn, { onClick: props.onDelete, color: C.Button.Colors.RED, children: "Delete Mapping" })),
      ),
  );
}

// ---------- plex ----------

function PlexSection(props: { plugin: PluginLike; refresh: () => void }) {
  const { plugin } = props;
  const plex = plugin.settings.plex;
  const [busy, setBusy] = React.useState("");
  const [players, setPlayers] = React.useState([] as PlexDevice[]);
  const cancelled = React.useRef(false);

  React.useEffect(() => {
    cancelled.current = false;
    if (plex.token) {
      listResources(plex.clientId, plex.token)
        .then((r) => setPlayers(r.players))
        .catch(() => setPlayers([]));
    }
    return () => {
      cancelled.current = true;
    };
  }, [plex.token]);

  const setPlex = (patch: Partial<Settings["plex"]>) => {
    plugin.update({ plex: { ...plugin.settings.plex, ...patch } });
    props.refresh();
  };

  const signIn = async () => {
    try {
      setBusy("Approve the sign-in in your browser...");
      const { pinId, authUrl } = await startPlexSignIn(plex.clientId);
      openExternal(authUrl);
      const token = await waitForPlexToken(plex.clientId, pinId, () => cancelled.current);
      setBusy("Finding your server...");
      const { servers } = await listResources(plex.clientId, token);
      const server = servers.find((s) => s.owned) ?? servers[0];
      if (!server) throw new Error("No Plex server found on this account");
      const serverUri = await findServerUri(plex.clientId, token, server);
      setPlex({ token, serverName: server.name, serverUri });
      setBusy("");
      BdApi.UI.showToast(`Connected to ${server.name}`, { type: "success" });
    } catch (e: any) {
      setBusy("");
      BdApi.UI.showToast(`Plex sign-in failed: ${e?.message ?? e}`, { type: "error" });
    }
  };

  if (!plex.token) {
    return h(Field, {
      id: "cp-plex-signin",
      name: "Plex account",
      note: busy || "Sign in to show what This PC plays in Plex and Plexamp.",
      children: h(Btn, { onClick: signIn, disabled: !!busy, children: "Sign in with Plex" }),
    });
  }

  const all = new Map<string, PlexDevice>();
  for (const d of [...players, ...seenPlayers.values()]) if (!all.has(d.id)) all.set(d.id, d);
  const ticked = new Set(plex.thisPcDevices);

  return h(
    "div",
    null,
    h(Field, {
      id: "cp-plex-server",
      name: `Server: ${plex.serverName ?? "?"}`,
      note: plex.serverUri ?? "Not reachable",
      children: h(Btn, { onClick: () => setPlex({ token: undefined, serverUri: undefined, serverName: undefined }), color: C.Button.Colors.PRIMARY, children: "Sign out" }),
    }),
    h("div", { className: "cp-muted", style: { margin: "8px 0" } }, "This PC: tick the players on this computer. Playback anywhere else is ignored. Play something in a Plex app to make it appear here."),
    [...all.values()].map((d) =>
      h(Toggle, {
        key: d.id,
        id: `cp-plex-${d.id}`,
        name: d.name,
        note: d.product,
        value: ticked.has(d.id),
        onChange: (on: boolean) => setPlex({ thisPcDevices: on ? [...ticked, d.id] : [...ticked].filter((x) => x !== d.id) }),
      }),
    ),
  );
}

// ---------- panel ----------

const INTEGRATIONS: { id: IntegrationId; label: string; note: string }[] = [
  { id: "youtube", label: "YouTube", note: "From Waterfox, through the browser extension." },
  { id: "youtubeMusic", label: "YouTube Music", note: "From Waterfox, shown as Listening." },
  { id: "twitch", label: "Twitch", note: "From Waterfox, through the browser extension." },
  { id: "plex", label: "Plex", note: "Shows and movies playing on This PC." },
  { id: "plexamp", label: "Plexamp", note: "Music playing on This PC." },
  { id: "spotify", label: "Spotify", note: "Discord's own Spotify connection. Turn off to hide it." },
];

function Group(props: { name: string; children: unknown }) {
  return h(C.SettingGroup, { name: props.name, collapsible: true, shown: true }, props.children);
}

export function SettingsPanel(props: { plugin: PluginLike }) {
  const { plugin } = props;
  const [, setTick] = React.useState(0);
  const [openId, setOpenId] = React.useState(null as string | null);
  const refresh = () => setTick((n: number) => n + 1);
  const s = plugin.settings;
  const update = (patch: Partial<Settings>) => {
    plugin.update(patch);
    refresh();
  };
  const setMappings = (mappings: Mapping[]) => update({ mappings });
  const games = React.useMemo(() => getGamesSeen(), []);
  const ytChannel = getLinkedYouTubeChannel();

  const addMapping = () => {
    const id = crypto.randomUUID();
    setMappings([...s.mappings, { id, enabled: true, exeName: "", type: "Playing", name: "" }]);
    setOpenId(id);
  };

  return h(
    "div",
    { className: "cp-panel" },
    h(
      Group,
      { name: "General" },
      h(Toggle, { id: "cp-paused", name: "Pause All", note: "Hide everything this plugin shows. Also in the user panel, next to mute.", value: s.paused, onChange: (paused) => update({ paused }) }),
      h(Toggle, {
        id: "cp-title-line",
        name: "Title on the profile line",
        note: "Show the video or song title in the short status line instead of the app name.",
        value: s.titleOnProfileLine,
        onChange: (titleOnProfileLine) => update({ titleOnProfileLine }),
      }),
      h(Field, {
        id: "cp-app-id",
        name: "Application ID",
        note: "Optional. Activities use this Discord application (create one at discord.com/developers/applications). Leave it empty unless images stop showing.",
        children: h(Text, { value: s.customAppId, placeholder: "123456789012345678", onChange: (v) => update({ customAppId: v.replace(/\D/g, "") }) }),
      }),
    ),
    h(
      Group,
      { name: "Integrations" },
      INTEGRATIONS.map((i) =>
        h(Toggle, { key: i.id, id: `cp-int-${i.id}`, name: i.label, note: i.note, value: s.integrations[i.id], onChange: (on) => update({ integrations: { ...s.integrations, [i.id]: on } }) }),
      ),
      s.integrations.youtube &&
        h(Toggle, {
          id: "cp-yt-own-channel",
          name: "YouTube: show my channel",
          note: ytChannel
            ? `Show "Watching YouTube" with your channel (${ytChannel.name}) instead of the video you're watching.`
            : "Show \"Watching YouTube\" with your channel instead of the video. Link YouTube in User Settings → Connections first.",
          value: s.youtubeOwnChannel,
          onChange: (youtubeOwnChannel) => update({ youtubeOwnChannel }),
        }),
      h(
        "div",
        { className: "cp-muted" },
        "Browser helper: ",
        helperStatus === "connected" ? h("span", { className: "cp-ok" }, "connected") : "not running (open Waterfox with the extension installed)",
      ),
    ),
    h(Group, { name: "Plex" }, h(PlexSection, { plugin, refresh })),
    h(
      Group,
      { name: "Mappings" },
      h("div", { className: "cp-muted", style: { marginBottom: "12px" } }, "Add the program in Discord first (User Settings → Registered Games → Add it!), then add a Mapping here."),
      s.mappings.map((m, i) =>
        h(MappingCard, {
          key: m.id,
          mapping: m,
          games,
          open: openId === m.id,
          onToggleOpen: () => setOpenId(openId === m.id ? null : m.id),
          onChange: (next: Mapping) => setMappings(s.mappings.map((x, j) => (j === i ? next : x))),
          onDelete: () => setMappings(s.mappings.filter((_, j) => j !== i)),
        }),
      ),
      h(Btn, { onClick: addMapping, children: "Add Mapping" }),
    ),
  );
}
