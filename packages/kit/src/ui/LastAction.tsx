import { useEffect, useRef, useState } from "react";
import type { ActionDescription } from "@utopia/shared";

export interface LastActionProps {
  /** Most recent first. */
  actions: readonly ActionDescription[];
  /** While the latest result is held back, show this instead of it ("Bob is rolling…"). */
  pendingText?: string;
}

const TONE = {
  normal: { strip: "bg-slate-900 text-slate-200", dot: "bg-amber-400" },
  good: { strip: "bg-amber-400/15 text-amber-100", dot: "bg-amber-400" },
  bad: { strip: "bg-red-900/50 text-red-100", dot: "bg-red-500" },
};

/** Strip showing the last move, coloured by how good or bad it was. Tap for history. */
export function LastAction({ actions, pendingText }: LastActionProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [latest, ...older] = actions;

  // Close the history when tapping anywhere else, or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!latest) return null;
  const tone = TONE[pendingText ? "normal" : (latest.tone ?? "normal")];
  return (
    <div ref={root} className="relative z-10 border-b border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-sm ${tone.strip}`}
      >
        <span aria-hidden className={`h-2 w-2 shrink-0 animate-pulse rounded-full ${tone.dot}`} />
        <span className="flex-1">{pendingText ?? latest.text}</span>
        {older.length > 0 && (
          <span className="shrink-0 text-xs opacity-60">{open ? "Hide" : "History"}</span>
        )}
      </button>
      {open && older.length > 0 && (
        <ol className="absolute inset-x-0 top-full max-h-72 overflow-y-auto border-b border-slate-700 bg-slate-900/95 px-4 py-2 text-sm text-slate-400 shadow-xl">
          {older.map((a, i) => (
            <li key={i} className="flex items-baseline gap-2 py-1">
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${TONE[a.tone ?? "normal"].dot}`}
              />
              {a.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
