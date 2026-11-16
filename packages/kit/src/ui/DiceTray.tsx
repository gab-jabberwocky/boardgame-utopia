import { useEffect, useRef, useState } from "react";
import { DICE_ROLL_MS } from "../dice.js";
import { Die, type DieTone } from "./Die.js";

export interface DiceTrayProps {
  values: readonly number[];
  /** While true the dice tumble and show random faces; then they land on `values`. */
  rolling: boolean;
  tones?: readonly (DieTone | undefined)[];
  size?: number;
  /** Ring around the tray, e.g. when the last action was a roll. */
  highlight?: boolean;
  /** Shown when there are no dice yet. */
  placeholderCount?: number;
}

const randomFace = () => 1 + Math.floor(Math.random() * 6); // display only, not game logic

/** A row of dice with a tumbling roll animation. Respects reduced-motion settings. */
export function DiceTray({
  values,
  rolling,
  tones,
  size = 52,
  highlight = false,
  placeholderCount = 4,
}: DiceTrayProps) {
  const [faces, setFaces] = useState<number[]>([]);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const count = values.length;

  useEffect(() => {
    if (!rolling) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animations = reduced
      ? []
      : refs.current.slice(0, count).map((el, i) => {
          const spin = (i % 2 ? 1 : -1) * (300 + i * 60);
          return el?.animate(
            [
              { transform: `translateY(-48px) rotate(${spin}deg) scale(0.7)`, opacity: 0.4 },
              { transform: `translateY(6px) rotate(${spin / 12}deg) scale(1.08)`, offset: 0.55 },
              { transform: "translateY(-10px) rotate(-6deg)", offset: 0.75 },
              { transform: "translateY(0) rotate(0) scale(1)", opacity: 1 },
            ],
            { duration: DICE_ROLL_MS, easing: "cubic-bezier(.25,.8,.35,1)", delay: i * 40 },
          );
        });
    const timer = setInterval(() => setFaces(Array.from({ length: count }, randomFace)), 80);
    return () => {
      clearInterval(timer);
      for (const a of animations) a?.cancel();
    };
  }, [rolling, count]);

  const shown = rolling && faces.length === count ? faces : values;

  return (
    <div
      className={`flex items-center justify-center gap-3 rounded-2xl px-3 py-2 ${
        highlight ? "ring-2 ring-amber-400/70" : ""
      }`}
      style={{ minHeight: size + 16 }}
    >
      {count === 0
        ? Array.from({ length: placeholderCount }, (_, i) => (
            <div
              key={i}
              style={{ width: size, height: size, borderRadius: size * 0.2 }}
              className="border-2 border-dashed border-slate-700"
            />
          ))
        : shown.map((v, i) => (
            <div
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
            >
              <Die value={v} size={size} tone={rolling ? undefined : tones?.[i]} />
            </div>
          ))}
    </div>
  );
}
