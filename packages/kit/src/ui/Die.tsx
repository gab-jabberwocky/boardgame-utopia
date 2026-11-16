// Pip positions on a 3x3 grid (0 = top-left, 8 = bottom-right).
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** Colour a die to show how it is used: pair "a" (amber), pair "b" (sky), or "unused" (faded). */
export type DieTone = "a" | "b" | "unused";

const TONE_CLASSES: Record<DieTone, string> = {
  a: "bg-amber-400",
  b: "bg-sky-400",
  unused: "bg-white opacity-30",
};

export interface DieProps {
  value: number;
  /** Pixel size of the die. */
  size?: number;
  tone?: DieTone;
}

/** A six-sided die. Values outside 1–6 are shown as a number. */
export function Die({ value, size = 44, tone }: DieProps) {
  const pips = PIPS[value];
  return (
    <div
      role="img"
      aria-label={`Die showing ${value}`}
      style={{ width: size, height: size, padding: size * 0.12, borderRadius: size * 0.2 }}
      className={`grid shrink-0 grid-cols-3 grid-rows-3 text-slate-900 shadow ${
        tone ? TONE_CLASSES[tone] : "bg-white"
      }`}
    >
      {pips ? (
        Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="flex items-center justify-center">
            {pips.includes(i) && (
              <span
                className="rounded-full bg-slate-900"
                style={{ width: size * 0.17, height: size * 0.17 }}
              />
            )}
          </span>
        ))
      ) : (
        <span className="col-span-3 row-span-3 flex items-center justify-center font-bold">
          {value}
        </span>
      )}
    </div>
  );
}
