import { useState, type ReactNode } from "react";

const STORAGE_KEY = "utopia.zoom";
const MIN = 0.6;
const MAX = 2.5;
const STEP = 0.1;

const round = (z: number) => Math.round(z * 10) / 10;
const clamp = (z: number) => Math.min(MAX, Math.max(MIN, z));

function loadZoom(): number | null {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    return v >= MIN && v <= MAX ? v : null;
  } catch {
    return null;
  }
}

function saveZoom(z: number | null) {
  try {
    if (z === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(z));
  } catch {
    // Private mode or blocked storage: the zoom just isn't remembered.
  }
}

/**
 * Holds the game screen: phone width on phones, full width (up to 72rem) on bigger
 * screens, where games can switch to a wide layout. Bigger screens also get −/+
 * zoom controls; the chosen zoom is remembered on this device.
 */
export function ZoomStage({ children }: { children: ReactNode }) {
  const [manual, setManual] = useState<number | null>(loadZoom);
  const zoom = manual ?? 1;
  const set = (z: number | null) => {
    const next = z === null ? null : round(clamp(z));
    setManual(next);
    saveZoom(next);
  };
  const btn =
    "flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-semibold hover:bg-slate-700 disabled:opacity-30";

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/*
        Percentage heights are not scaled by zoom, so 100% fills the stage at any zoom.
        Boards that size things by viewport height (dvh) divide by --stage-zoom.
      */}
      <div
        className="mx-auto h-full max-w-md sm:max-w-6xl"
        style={{ zoom, ["--stage-zoom" as string]: zoom }}
      >
        {children}
      </div>
      <div className="absolute right-3 bottom-3 z-40 hidden items-center gap-1 rounded-full bg-slate-800/90 p-1 text-white shadow-lg sm:flex">
        <button
          type="button"
          className={btn}
          aria-label="Zoom out"
          disabled={zoom <= MIN}
          onClick={() => set(zoom - STEP)}
        >
          −
        </button>
        <span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className={btn}
          aria-label="Zoom in"
          disabled={zoom >= MAX}
          onClick={() => set(zoom + STEP)}
        >
          +
        </button>
        <button type="button" className={btn} disabled={manual === null} onClick={() => set(null)}>
          Reset
        </button>
      </div>
    </div>
  );
}
