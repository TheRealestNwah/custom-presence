/* eslint-disable @typescript-eslint/no-explicit-any */
import { searchKnownGames } from "../core/knownGames";
import type { PlexDevice } from "../core/plex";
import type { Settings } from "../core/settings";
import { ActivityType, type ActivityTypeName, type IntegrationId, type KnownGameRef, type Mapping } from "../core/types";
import { getGamesSeen, loadKnownGames, openExternal } from "./discord";
import { helperStatus } from "./helperClient";
import { findServerUri, listResources, seenPlayers, startPlexSignIn, waitForPlexToken } from "./plexClient";

const React = BdApi.React;
// Typed wrapper so component props are checked (BdApi.React itself is untyped).
function h<P>(type: (props: P) => unknown, props: P & { key?: string }, ...children: unknown[]): unknown;
function h(type: string, props?: Record<string, unknown> | null, ...children: unknown[]): unknown;
function h(type: unknown, props?: unknown, ...children: unknown[]): unknown {
  return React.createElement(type, props, ...children);
}

interface PluginLike {
  settings: Settings;
  update(patch: Partial<Settings>): void;
}

export const STYLES = `
.cp-panel { color: var(--text-normal); display: flex; flex-direction: column; gap: 20px; }
.cp-panel h2 { color: var(--header-primary); font-size: 16px; font-weight: 600; margin: 0 0 8px; }
.cp-panel .cp-help { color: var(--text-muted); font-size: 13px; margin: 2px 0 8px; }
.cp-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; }
.cp-row label { flex: 1; }
.cp-panel input[type=text], .cp-panel select {
  background: var(--input-background, var(--background-tertiary)); color: var(--text-normal);
  border: 1px solid var(--background-modifier-accent); border-radius: 4px; padding: 6px 8px; width: 100%; box-sizing: border-box;
}
.cp-card { background: var(--background-secondary); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.cp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cp-btn { background: var(--brand-500, #5865f2); color: #fff; border: 0; border-radius: 4px; padding: 6px 12px; cursor: pointer; }
.cp-btn.secondary { background: var(--background-modifier-accent); color: var(--text-normal); }
.cp-btn.danger { background: var(--status-danger, #da373c); }
.cp-results { display: flex; flex-direction: column; max-height: 180px; overflow: auto; }
.cp-results button { text-align: left; background: none; border: 0; color: var(--text-normal); padding: 4px 6px; cursor: pointer; border-radius: 4px; }
.cp-results button:hover { background: var(--background-modifier-hover); }
.cp-status-ok { color: var(--status-positive, #23a55a); }
.cp-status-off { color: var(--text-muted); }
.custom-presence-pause { background: none; border: 0; color: var(--interactive-normal); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px; cursor: pointer; }
.custom-presence-pause:hover { background: var(--background-modifier-hover); color: var(--interactive-hover); }
.custom-presence-pause.is-paused { color: var(--status-danger, #da373c); }
`;

function Switch(props: { label: string; help?: string; value: boolean; onChange: (v: boolean) => void }) {
  return h(
    "div",
    null,
    h(
      "div",
      { className: "cp-row" },
      h("label", null, props.label),
      h("input", { type: "checkbox", checked: props.value, onChange: (e: any) => props.onChange(e.target.checked) }),
    ),
    props.help && h("div", { className: "cp-help" }, props.help),
  );
}

function Text(props: { label: string; value: string; placeholder?: string; list?: string; onChange: (v: string) => void }) {
  return h(
    "label",
    null,
    h("div", { className: "cp-help" }, props.label),
    h("input", { type: "text", value: props.value, placeholder: props.placeholder, list: props.list, onChange: (e: any) => props.onChange(e.target.value) }),
  );
}

const INTEGRATIONS: { id: IntegrationId; label: string; help?: string }[] = [
  { id: "youtube", label: "YouTube", help: "From Waterfox, through the browser extension." },
  { id: "youtubeMusic", label: "YouTube Music", help: "From Waterfox, shown as Listening." },
  { id: "twitch", label: "Twitch", help: "From Waterfox, through the browser extension." },
  { id: "plex", label: "Plex", help: "Shows and movies playing on This PC." },
  { id: "plexamp", label: "Plexamp", help: "Music playing on This PC." },
  { id: "spotify", label: "Spotify", help: "Discord's own Spotify connection. Turn off to hide it." },
];

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

  if (props.value) {
    return h(
      "div",
      { className: "cp-row" },
      h("label", null, `Linked to Known Game: ${props.value.name}`),
      h("button", { className: "cp-btn secondary", onClick: () => props.onChange(undefined) }, "Unlink"),
    );
  }
  return h(
    "div",
    null,
    h(Text, { label: "Link to a Known Game (optional): uses its real name and icon", value: query, placeholder: "Search, e.g. Minecraft", onChange: setQuery }),
    error && h("div", { className: "cp-help" }, error),
    results.length > 0 &&
      h(
        "div",
        { className: "cp-results" },
        results.map((g: KnownGameRef) => h("button", { key: g.id, onClick: () => (props.onChange(g), setQuery("")) }, g.name)),
      ),
  );
}

function MappingCard(props: { mapping: Mapping; onChange: (m: Mapping) => void; onDelete: () => void }) {
  const m = props.mapping;
  const set = (patch: Partial<Mapping>) => props.onChange({ ...m, ...patch });
  return h(
    "div",
    { className: "cp-card" },
    h(Switch, { label: m.knownGame?.name || m.name || m.exeName || "New Mapping", value: m.enabled, onChange: (enabled) => set({ enabled }) }),
    h(
      "div",
      { className: "cp-grid" },
      h(Text, { label: "Program (exe name)", value: m.exeName, placeholder: "prismlauncher.exe", list: "cp-games-seen", onChange: (exeName) => set({ exeName }) }),
      h(
        "label",
        null,
        h("div", { className: "cp-help" }, "Activity type"),
        h(
          "select",
          { value: m.type, onChange: (e: any) => set({ type: e.target.value as ActivityTypeName }) },
          (Object.keys(ActivityType) as ActivityTypeName[]).map((t) => h("option", { key: t, value: t }, t)),
        ),
      ),
    ),
    h(KnownGamePicker, { value: m.knownGame, onChange: (knownGame) => set({ knownGame }) }),
    !m.knownGame && h(Text, { label: "Display name", value: m.name, placeholder: "Minecraft", onChange: (name) => set({ name }) }),
    h(
      "div",
      { className: "cp-grid" },
      h(Text, { label: "Details line (optional)", value: m.details ?? "", onChange: (details) => set({ details }) }),
      h(Text, { label: "State line (optional)", value: m.state ?? "", onChange: (state) => set({ state }) }),
    ),
    !m.knownGame && h(Text, { label: "Image URL (optional, needs the Application ID above)", value: m.imageUrl ?? "", placeholder: "https://...", onChange: (imageUrl) => set({ imageUrl }) }),
    m.type === "Streaming" && h(Text, { label: "Stream URL (Twitch or YouTube, required for Streaming)", value: m.streamUrl ?? "", onChange: (streamUrl) => set({ streamUrl }) }),
    h("div", null, h("button", { className: "cp-btn danger", onClick: props.onDelete }, "Delete Mapping")),
  );
}

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
    return h("div", null, h("button", { className: "cp-btn", disabled: !!busy, onClick: signIn }, "Sign in with Plex"), busy && h("div", { className: "cp-help" }, busy));
  }

  const all = new Map<string, PlexDevice>();
  for (const d of [...players, ...seenPlayers.values()]) if (!all.has(d.id)) all.set(d.id, d);
  const ticked = new Set(plex.thisPcDevices);

  return h(
    "div",
    { className: "cp-card" },
    h("div", null, `Server: ${plex.serverName ?? "?"} (${plex.serverUri ?? "not reachable"})`),
    h("div", { className: "cp-help" }, "Tick the players on This PC. Playback on any other device is ignored. Start playing something in a Plex app to make it appear here."),
    [...all.values()].map((d) =>
      h(Switch, {
        key: d.id,
        label: `${d.name}${d.product ? ` (${d.product})` : ""}`,
        value: ticked.has(d.id),
        onChange: (on: boolean) => setPlex({ thisPcDevices: on ? [...ticked, d.id] : [...ticked].filter((x) => x !== d.id) }),
      }),
    ),
    h("div", null, h("button", { className: "cp-btn secondary", onClick: () => setPlex({ token: undefined, serverUri: undefined, serverName: undefined }) }, "Sign out of Plex")),
  );
}

export function SettingsPanel(props: { plugin: PluginLike }) {
  const { plugin } = props;
  const [, setTick] = React.useState(0);
  const refresh = () => setTick((n: number) => n + 1);
  const s = plugin.settings;
  const update = (patch: Partial<Settings>) => {
    plugin.update(patch);
    refresh();
  };
  const setMappings = (mappings: Mapping[]) => update({ mappings });
  const gamesSeen = getGamesSeen();

  return h(
    "div",
    { className: "cp-panel" },
    h("datalist", { id: "cp-games-seen" }, gamesSeen.map((g) => h("option", { key: g.exeName, value: g.exeName }, g.name))),

    h(
      "section",
      null,
      h("h2", null, "General"),
      h(Switch, { label: "Pause All", help: "Hide everything this plugin shows. Also in the user panel, next to mute.", value: s.paused, onChange: (paused) => update({ paused }) }),
      h(Switch, { label: "Show the title on the profile line", help: "e.g. \"Watching Breaking Bad\" style text uses the video or song title instead of the app name.", value: s.titleOnProfileLine, onChange: (titleOnProfileLine) => update({ titleOnProfileLine }) }),
      h(Text, {
        label: "Discord Application ID for images (optional). Create one at discord.com/developers/applications and paste its Application ID. Without it, activities not linked to a Known Game show no picture.",
        value: s.customAppId,
        placeholder: "123456789012345678",
        onChange: (v) => update({ customAppId: v.replace(/\D/g, "") }),
      }),
    ),

    h(
      "section",
      null,
      h("h2", null, "Integrations"),
      INTEGRATIONS.map((i) =>
        h(Switch, { key: i.id, label: i.label, help: i.help, value: s.integrations[i.id], onChange: (on) => update({ integrations: { ...s.integrations, [i.id]: on } }) }),
      ),
      h(
        "div",
        { className: "cp-help" },
        "Browser helper: ",
        h("span", { className: helperStatus === "connected" ? "cp-status-ok" : "cp-status-off" }, helperStatus === "connected" ? "connected" : "not running (open Waterfox with the extension installed)"),
      ),
    ),

    h("section", null, h("h2", null, "Plex"), h(PlexSection, { plugin, refresh })),

    h(
      "section",
      null,
      h("h2", null, "Mappings"),
      h("div", { className: "cp-help" }, "First add the program in Discord: User Settings → Registered Games → Add it! Then add a Mapping here with the same exe name."),
      s.mappings.map((m, i) =>
        h(MappingCard, {
          key: m.id,
          mapping: m,
          onChange: (next: Mapping) => setMappings(s.mappings.map((x, j) => (j === i ? next : x))),
          onDelete: () => setMappings(s.mappings.filter((_, j) => j !== i)),
        }),
      ),
      h(
        "button",
        {
          className: "cp-btn",
          onClick: () =>
            setMappings([...s.mappings, { id: crypto.randomUUID(), enabled: true, exeName: "", type: "Playing", name: "" }]),
        },
        "Add Mapping",
      ),
    ),
  );
}
