import type { ReactNode } from "react";
import type { BoardProps, LegalMove, PlayerId, PlayerInfo } from "@utopia/shared";
import { COPIES, LUCKY, connections, shown, type End, type Move, type View } from "./logic.js";

/** Trios collected, for the shell's player list. */
export function playerDecor(view: View) {
  return {
    scores: Object.fromEntries(
      view.players.map((p) => [p.id, (view.trios[p.id] ?? []).join(" · ") || "–"]),
    ),
  };
}

const INK: Record<number, string> = {
  1: "#dc2626",
  2: "#ea580c",
  3: "#2563eb",
  4: "#9333ea",
  5: "#db2777",
  6: "#16a34a",
  7: "#a16207",
  8: "#0891b2",
  9: "#65a30d",
  10: "#0d9488",
  11: "#be123c",
  12: "#4f46e5",
};

const sameMove = (a: Move | null, b: Move) => !!a && JSON.stringify(a) === JSON.stringify(b);

const SIZE = {
  sm: "h-11 w-8 rounded-md text-base",
  md: "h-16 w-11 rounded-lg text-2xl",
} as const;

function Face({
  value,
  size = "md",
  spicy = false,
  mark,
}: {
  value: number;
  size?: keyof typeof SIZE;
  /** Show the connected numbers in the corners. */
  spicy?: boolean;
  mark?: "shown" | "bad" | undefined;
}) {
  const lucky = value === LUCKY;
  return (
    <span
      aria-label={`${value}`}
      className={`relative flex shrink-0 items-center justify-center border-2 font-black shadow ${SIZE[size]} ${
        mark === "bad"
          ? "ring-2 ring-red-500"
          : mark === "shown"
            ? "-translate-y-1.5 ring-2 ring-amber-400"
            : ""
      }`}
      style={{
        background: lucky ? "linear-gradient(135deg, #fde047, #f59e0b)" : "#fdf8ef",
        borderColor: lucky ? "#a16207" : `${INK[value]}88`,
        color: INK[value],
      }}
    >
      {value}
      {spicy && size === "md" && (
        <span className="absolute inset-x-0.5 bottom-0.5 flex justify-between text-[8px] leading-none font-bold text-slate-500">
          {connections(value).map((c) => (
            <span key={c}>{c}</span>
          ))}
        </span>
      )}
    </span>
  );
}

function Back({
  size = "md",
  onClick,
  picked,
}: {
  size?: keyof typeof SIZE;
  onClick?: (() => void) | undefined;
  picked?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      aria-label="Face-down card"
      className={`shrink-0 border-2 border-fuchsia-300/40 shadow ${SIZE[size]} ${
        picked ? "-translate-y-1.5 ring-4 ring-amber-400" : onClick ? "hover:-translate-y-0.5" : ""
      } transition`}
      style={{ background: "repeating-linear-gradient(45deg, #3b0764 0 5px, #581c87 5px 10px)" }}
    />
  );
}

function TrioChips({ trios }: { trios: number[] }) {
  if (trios.length === 0) return <span className="text-xs text-slate-600">no trios</span>;
  return (
    <span className="flex gap-1">
      {trios.map((v) => (
        <span
          key={v}
          className="rounded-md px-1.5 text-xs font-black"
          style={{
            background: v === LUCKY ? "#facc15" : "#fdf8ef",
            color: INK[v],
          }}
        >
          {v}×3
        </span>
      ))}
    </span>
  );
}

function EndButton({
  end,
  move,
  proposed,
  propose,
}: {
  end: End;
  move: LegalMove<Move> | undefined;
  proposed: Move | null;
  propose: (move: Move, label: string) => void;
}) {
  if (!move) return null;
  const picked = sameMove(proposed, move.move);
  return (
    <button
      type="button"
      onClick={() => propose(move.move, move.label)}
      className={`min-h-9 rounded-lg px-2 text-xs font-bold ${
        picked ? "bg-amber-400 text-slate-900" : "bg-slate-700 text-white hover:bg-slate-600"
      }`}
    >
      {end === "low" ? "▼ Lowest" : "Highest ▲"}
    </button>
  );
}

const REFERENCE: [string, ReactNode][] = [
  [
    "Reveal",
    "One card at a time: the lowest or highest of any hand (yours too), or any middle card.",
  ],
  ["Again", "Asking the same hand again shows its next card in."],
  ["Match", "Keep going while the cards match. Three alike: the trio is yours."],
  [
    "Miss",
    <>
      A different number ends your turn: <b className="text-red-300">everything goes back</b>.
      Remember it!
    </>,
  ],
  [
    "Win",
    "Simple: 3 trios. Spicy: 2 connected trios (add up to 7 or 7 apart). The 7 trio always wins.",
  ],
];

export default function Board({
  view,
  viewer,
  legalMoves,
  proposed,
  propose,
  cancel,
  submit,
}: BoardProps<View, Move>) {
  const current = view.turn.players[view.turn.current];
  const spicy = view.config.mode === "Spicy";
  const me = view.players.find((p) => p.id === viewer);
  const meIndex = view.players.findIndex((p) => p.id === viewer);
  const others = view.players
    .map((_, i) => view.players[(i + Math.max(meIndex, 0)) % view.players.length]!)
    .filter((p) => p.id !== viewer);
  const mismatch = view.phase === "mismatch";

  const revealFor = (player: PlayerId, end: End) =>
    legalMoves.find(
      (m) => m.move.type === "reveal" && m.move.target === player && m.move.end === end,
    );
  const flipFor = (slot: number) =>
    legalMoves.find((m) => m.move.type === "flip" && m.move.slot === slot);
  const proposedBoard = proposed
    ? legalMoves.find((m) => m.where === "board" && sameMove(proposed, m.move))
    : undefined;

  /** Cards shown from this hand this turn, by end (low ones in order, high ones in order). */
  const shownFrom = (player: PlayerId) => {
    const low: number[] = [];
    const high: number[] = [];
    for (const r of view.revealed) {
      if (r.from === "hand" && r.player === player) (r.end === "low" ? low : high).push(r.value);
    }
    return { low, high };
  };

  const goal = spicy ? "2 connected trios" : "3 trios";
  const first = view.revealed[0]?.value;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-3 @2xl:grid @2xl:max-w-6xl @2xl:grid-cols-[1fr_22rem] @2xl:items-start @2xl:gap-x-6 @2xl:px-6">
      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {/* This turn's reveals */}
        <section
          aria-label="This turn"
          className={`order-1 rounded-2xl p-3 ${
            mismatch
              ? "bg-red-950/70 ring-1 ring-red-500/50"
              : "bg-gradient-to-b from-fuchsia-950/70 to-slate-900"
          }`}
        >
          <p className="text-center text-[11px] font-bold tracking-widest text-fuchsia-200 uppercase">
            {mismatch
              ? "No match: take a look, then they go back"
              : view.phase === "over"
                ? "Game over"
                : `${current === viewer ? "Your" : `${view.players.find((p) => p.id === current)?.name ?? "?"}'s`} turn`}
          </p>
          <div className="mt-2 flex items-center justify-center gap-2">
            {Array.from({ length: Math.max(COPIES, view.revealed.length) }, (_, i) => {
              const r = view.revealed[i];
              return r ? (
                <Face
                  key={i}
                  value={r.value}
                  spicy={spicy}
                  mark={mismatch && r.value !== first ? "bad" : undefined}
                />
              ) : (
                <span
                  key={i}
                  className="h-16 w-11 rounded-lg border-2 border-dashed border-slate-600"
                />
              );
            })}
          </div>
          <p className="mt-2 text-center text-xs text-slate-400">Win with {goal}, or the 7 trio.</p>
        </section>

        {/* The middle */}
        <section aria-label="Middle" className="order-3 rounded-2xl bg-slate-900/60 p-2.5">
          <p className="mb-1.5 text-[10px] tracking-wide text-slate-500 uppercase">Middle</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {view.middle.map((card, slot) => {
              if (card === "gone") {
                return (
                  <span
                    key={slot}
                    className="h-16 w-11 rounded-lg border border-dashed border-slate-800"
                  />
                );
              }
              if (card !== "down") return <Face key={slot} value={card} spicy={spicy} />;
              const flip = flipFor(slot);
              return (
                <Back
                  key={slot}
                  picked={!!flip && sameMove(proposed, flip.move)}
                  onClick={flip ? () => propose(flip.move, flip.label) : undefined}
                />
              );
            })}
          </div>
        </section>
      </div>

      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {/* Everyone else */}
        <section aria-label="Other players" className="order-2 grid grid-cols-2 gap-1.5">
          {others.map((p) => (
            <OtherHand
              key={p.id}
              player={p}
              count={view.handCounts[p.id] ?? 0}
              trios={view.trios[p.id] ?? []}
              active={current === p.id}
              shownCards={shownFrom(p.id)}
              low={revealFor(p.id, "low")}
              high={revealFor(p.id, "high")}
              proposed={proposed}
              propose={propose}
            />
          ))}
        </section>

        {/* Your hand */}
        {me && (
          <section
            aria-label="Your hand"
            className="order-4 rounded-2xl border-2 p-3"
            style={{
              borderColor: me.color,
              background: `linear-gradient(180deg, ${me.color}26, #0f172a 70%)`,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] font-bold tracking-widest uppercase"
                style={{ color: me.color }}
              >
                Your hand
              </span>
              <span className="ml-auto">
                <TrioChips trios={view.trios[me.id] ?? []} />
              </span>
            </div>
            {/* One row, lowest to highest, like a hand of cards: overlap when it gets long. */}
            <div
              className="mt-2 flex min-h-16 justify-center"
              aria-label="Your cards, lowest to highest"
            >
              {view.hand.map((v, i) => {
                const { low, high } = shown(view, me.id);
                const isShown = i < low || i >= view.hand.length - high;
                // Cards are 44px: a 4px gap when they fit in ~310px, otherwise overlap.
                const n = view.hand.length;
                const gap = Math.min(4, (310 - n * 44) / Math.max(1, n - 1));
                return (
                  <span key={i} style={{ marginLeft: i ? gap : 0, zIndex: i }} className="relative">
                    <Face value={v} spicy={spicy} mark={isShown ? "shown" : undefined} />
                  </span>
                );
              })}
              {view.hand.length === 0 && (
                <span className="self-center text-sm text-slate-500">
                  No cards left: play from the others
                </span>
              )}
            </div>
            <div className="mt-2 flex justify-between">
              <EndButton
                end="low"
                move={revealFor(me.id, "low")}
                proposed={proposed}
                propose={propose}
              />
              <EndButton
                end="high"
                move={revealFor(me.id, "high")}
                proposed={proposed}
                propose={propose}
              />
            </div>
          </section>
        )}

        <section aria-label="Rules reference" className="order-5 rounded-xl bg-slate-900/60 p-2.5">
          <table className="w-full border-separate border-spacing-y-1 text-xs">
            <tbody>
              {REFERENCE.map(([name, text]) => (
                <tr key={name}>
                  <th
                    scope="row"
                    className="w-16 pr-2 text-left align-top font-semibold text-slate-200"
                  >
                    {name}
                  </th>
                  <td className="text-slate-400">{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* Board moves are confirmed here; "Put the cards back" is in the shell's bar. */}
      {proposed && proposedBoard && (
        <div className="sticky bottom-2 z-10 order-6 flex gap-2 rounded-2xl border border-amber-400/50 bg-slate-950/95 p-2 shadow-xl @2xl:col-span-2">
          <button
            type="button"
            onClick={cancel}
            className="min-h-12 rounded-xl bg-slate-700 px-4 font-bold text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit(proposed)}
            className="min-h-12 flex-1 rounded-xl bg-amber-400 px-3 font-bold text-slate-900"
          >
            {proposedBoard.label}
          </button>
        </div>
      )}
    </div>
  );
}

function OtherHand({
  player,
  count,
  trios,
  active,
  shownCards,
  low,
  high,
  proposed,
  propose,
}: {
  player: PlayerInfo;
  count: number;
  trios: number[];
  active: boolean;
  shownCards: { low: number[]; high: number[] };
  low: LegalMove<Move> | undefined;
  high: LegalMove<Move> | undefined;
  proposed: Move | null;
  propose: (move: Move, label: string) => void;
}) {
  const hidden = count - shownCards.low.length - shownCards.high.length;
  return (
    <div
      className="flex flex-col gap-1.5 rounded-xl border-2 bg-slate-900/70 p-2"
      style={{ borderColor: active ? player.color : "#1e293b" }}
    >
      <div className="flex items-center gap-1.5 text-sm">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: player.color }} />
        <span className="min-w-0 flex-1 truncate font-semibold">
          {active && "▶ "}
          {player.name}
        </span>
        <TrioChips trios={trios} />
      </div>
      <div className="flex min-h-11 items-center justify-center gap-0.5">
        {shownCards.low.map((v, i) => (
          <Face key={`l${i}`} value={v} size="sm" mark="shown" />
        ))}
        <span className="flex -space-x-5">
          {Array.from({ length: Math.min(hidden, 9) }, (_, i) => (
            <Back key={i} size="sm" />
          ))}
        </span>
        {[...shownCards.high].reverse().map((v, i) => (
          <Face key={`h${i}`} value={v} size="sm" mark="shown" />
        ))}
        {count === 0 && <span className="text-xs text-slate-600">no cards</span>}
      </div>
      {(low || high) && (
        <div className="flex justify-between">
          <EndButton end="low" move={low} proposed={proposed} propose={propose} />
          <EndButton end="high" move={high} proposed={proposed} propose={propose} />
        </div>
      )}
    </div>
  );
}

export { docView } from "./doc.js";
