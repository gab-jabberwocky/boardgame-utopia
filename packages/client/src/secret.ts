import { useSyncExternalStore } from "react";

/*
 * Secret mode: the whole site in muted grey, with a plain tab title and icon, so a
 * passerby doesn't see a colourful game. Remembered per device. Games can show extra
 * hints in this mode with the `secret:` Tailwind variant (e.g. letters on gems).
 */

const KEY = "utopia.secret";
const TITLE = { normal: "Boardgame Utopia", secret: "Notes" };
const PLAIN_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#9ca3af"/><path d="M4 5h8M4 8h8M4 11h5" stroke="#f3f4f6" stroke-width="1.5"/></svg>',
  );

let on = load();
let normalIcon: string | null = null;
const listeners = new Set<() => void>();

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function apply() {
  const root = document.documentElement;
  root.classList.toggle("secret", on);
  document.title = on ? TITLE.secret : TITLE.normal;
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) {
    normalIcon ??= icon.href;
    icon.href = on ? PLAIN_ICON : normalIcon;
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", on ? "#111111" : "#0f172a");
}

/** Call once at startup so the page opens in the remembered mode. */
export function initSecretMode() {
  apply();
}

export function setSecretMode(value: boolean) {
  on = value;
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // storage blocked: it just won't be remembered
  }
  apply();
  for (const l of listeners) l();
}

export function useSecretMode(): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => on,
  );
  return [value, setSecretMode];
}
