import { useSyncExternalStore } from "react";

/* A tiny router: the app has only a handful of pages, so no library is needed. */

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};

export const usePath = () => useSyncExternalStore(subscribe, () => window.location.pathname);

export function navigate(to: string, { replace = false } = {}) {
  if (replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export const roomPath = (code: string) => `/r/${code}`;
export const roomUrl = (code: string) => `${window.location.origin}${roomPath(code)}`;
