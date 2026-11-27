// The Pause All button in Discord's bottom-left user panel, next to mute and deafen.
// Discord's class names are hashed ("buttons_a1b2c"), so we match on their stable prefix.

const BUTTON_ID = "custom-presence-pause";
const PANEL_BUTTONS = 'section[class*="panels_"] div[class*="container_"] > div[class*="buttons_"]';

const ICON_ON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSED =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

export class PauseButton {
  constructor(
    private isPaused: () => boolean,
    private toggle: () => void,
  ) {}

  inject(): void {
    if (document.getElementById(BUTTON_ID)) return;
    const container = document.querySelector(PANEL_BUTTONS);
    if (!container) return;
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.className = "custom-presence-pause";
    btn.addEventListener("click", () => this.toggle());
    container.prepend(btn);
    this.refresh();
  }

  refresh(): void {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;
    const paused = this.isPaused();
    btn.innerHTML = paused ? ICON_PAUSED : ICON_ON;
    btn.classList.toggle("is-paused", paused);
    const label = paused ? "Custom Presence paused: click to resume" : "Pause Custom Presence";
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }

  remove(): void {
    document.getElementById(BUTTON_ID)?.remove();
  }
}
