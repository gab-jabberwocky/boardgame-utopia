import { useState, type ReactNode } from "react";
import type { BoardProps } from "@utopia/shared";
import {
  COLLECTOR_POINTS,
  DUO_INFO,
  KIND_INFO,
  MULTIPLIERS,
  cardScore,
  colourBonus,
  targetScore,
  END_AT,
  type Card,
  type Colour,
  type DuoKind,
  type Move,
  type View,
} from "./logic.js";

/** Running totals, for the shell's player list. */
export function playerDecor(view: View) {
  return {
    scores: Object.fromEntries(view.players.map((p) => [p.id, `${view.totals[p.id] ?? 0}`])),
  };
}

const COLOUR: Record<Colour, { bg: string; ink: string; code: string }> = {
  navy: { bg: "#1e3a8a", ink: "#dbeafe", code: "Nv" },
  sky: { bg: "#38bdf8", ink: "#082f49", code: "Sk" },
  black: { bg: "#111827", ink: "#e5e7eb", code: "Bk" },
  yellow: { bg: "#facc15", ink: "#422006", code: "Ye" },
  green: { bg: "#4ade80", ink: "#052e16", code: "Gr" },
  white: { bg: "#f8fafc", ink: "#334155", code: "Wh" },
  purple: { bg: "#a855f7", ink: "#faf5ff", code: "Pu" },
  grey: { bg: "#9ca3af", ink: "#111827", code: "Gy" },
  peach: { bg: "#fdba74", ink: "#431407", code: "Pe" },
  pink: { bg: "#f472b6", ink: "#500724", code: "Pk" },
  orange: { bg: "#ea580c", ink: "#fff7ed", code: "Or" },
};

/** One line on how the card scores. */
function hint(card: Card): string {
  const table = COLLECTOR_POINTS[card.kind];
  if (table) return table.length > 3 ? `${table.slice(0, 3).join("/")}…` : table.join("/");
  const m = MULTIPLIERS[card.kind];
  if (m) return `${m.points} per ${KIND_INFO[m.per].name}`;
  if (card.kind === "pearl") return "colour";
  return "pair";
}

function CardChip({
  card,
  selected = false,
  onClick,
  size = "md",
}: {
  card: Card;
  selected?: boolean;
  onClick?: (() => void) | undefined;
  size?: "sm" | "md";
}) {
  const c = COLOUR[card.colour];
  const body = (
    <>
      <span
        className="flex items-center justify-between px-1 text-[9px] font-bold"
        style={{ background: c.bg, color: c.ink }}
      >
        <span className="truncate">{hint(card)}</span>
        <span className="hidden secret:inline">{c.code}</span>
      </span>
      <span className="flex flex-1 items-center justify-center px-1 text-center text-[11px] leading-tight font-semibold">
        {KIND_INFO[card.kind].name}
      </span>
    </>
  );
  const cls = `flex shrink-0 flex-col overflow-hidden rounded-md border-2 bg-[#fbf6ea] text-slate-800 shadow transition ${
    size === "sm" ? "h-12 w-14" : "h-16 w-[4.25rem]"
  } ${selected ? "-translate-y-1.5 ring-4 ring-amber-400" : ""}`;
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${KIND_INFO[card.kind].name}, ${card.colour}`}
      className={`${cls} hover:-translate-y-0.5`}
      style={{ borderColor: c.bg }}
    >
      {body}
    </button>
  ) : (
    <div
      className={cls}
      style={{ borderColor: c.bg }}
      aria-label={`${KIND_INFO[card.kind].name}, ${card.colour}`}
    >
      {body}
    </div>
  );
}

function duoOf(cards: Card[]): DuoKind | null {
  if (cards.length !== 2) return null;
  const [a, b] = cards.map((c) => c.kind).sort();
  if (a === b && (a === "gull" || a === "surfer" || a === "fisher")) return a;
  if (a === "parrot" && b === "pirate") return "pirate";
  return null;
}

const REFERENCE: [string, ReactNode][] = [
  [
    "Draw",
    "Draw 2, keep 1, discard 1 (to an empty pile if there is one). Or take a pile's top card.",
  ],
  [
    "Pairs",
    "Gulls: any card from a pile · Surfers: another turn · Fishers: top card · Pirate + Parrot: steal",
  ],
  ["Sets", "Pebble 0/2/4/6/8/10 · Sand Dollar 0/3/6/9/12 · Puffin 1/3/5 · Lifeguard 0/5"],
  [
    "Bonus cards",
    "Surf Shack 1/Surfer · Fish Market 1/Fisher · Puffin Cliff 2/Puffin · Watchtower 3/Lifeguard",
  ],
  ["Pearl", "Points = cards of your top colour (each Pearl a different colour). All 4 wins."],
  [
    "End",
    <>
      With {END_AT}+ points: <b className="text-slate-200">Stop</b> (all score cards) or{" "}
      <b className="text-slate-200">Last chance</b> (bet you stay ahead: +colour bonus).
    </>,
  ],
  ["Deck out", "Round ends with no points."],
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
  const me = view.players.find((p) => p.id === viewer);
  const myTurn = current === viewer;
  const nameOf = (id: string) =>
    id === viewer ? "You" : (view.players.find((p) => p.id === id)?.name ?? "?");

  const sig = JSON.stringify([view.step, view.turn.current, view.hand.length, view.round]);
  const [sel, setSel] = useState<{ sig: string; ids: number[] }>({ sig, ids: [] });
  const selected = sel.sig === sig ? sel.ids : [];
  const canDuo = myTurn && view.step === "act";
  const toggle = (id: number) => {
    const ids = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id].slice(-2);
    setSel({ sig, ids });
    const duo = duoOf(view.hand.filter((c) => ids.includes(c.id)));
    const move = legalMoves.find((m) => m.move.type === "duo" && m.move.duo === duo);
    if (move) propose(move.move, move.label);
    else cancel();
  };
  const choose = (m: { move: Move; label: string }) => propose(m.move, m.label);
  const drawMove = legalMoves.find((m) => m.move.type === "draw");
  // Keeping: tap the card to keep; if both piles could take the other, tap a pile too.
  const keeps = legalMoves.filter((m) => m.move.type === "keep");
  const keepPiles = [...new Set(keeps.map((m) => (m.move.type === "keep" ? m.move.pile : 0)))];
  const [keepSel, setKeepSel] = useState<{ sig: string; id: number | null }>({ sig, id: null });
  const keepCard = keepSel.sig === sig ? keepSel.id : null;
  const keepTo = (pile: number) => {
    const m = keeps.find(
      (k) => k.move.type === "keep" && k.move.card === keepCard && k.move.pile === pile,
    );
    if (m) choose(m);
  };
  const keepTap = (id: number) => {
    setKeepSel({ sig, id });
    const options = keeps.filter((k) => k.move.type === "keep" && k.move.card === id);
    if (options.length === 1) choose(options[0]!);
    else cancel();
  };
  const duoMoves = legalMoves.filter((m) => m.move.type === "duo");
  const proposedBoard = proposed
    ? legalMoves.find(
        (m) => m.where === "board" && JSON.stringify(m.move) === JSON.stringify(proposed),
      )
    : undefined;

  const played = me ? (view.played[me.id] ?? []) : [];
  const score = cardScore(view.hand, played);
  const bonus = colourBonus([...view.hand, ...played.flat()]);
  const others = view.players.filter((p) => p.id !== viewer);
  const roundDone = view.step === "roundOver" || view.step === "over";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-3 @2xl:grid @2xl:max-w-5xl @2xl:grid-cols-2 @2xl:items-start @2xl:gap-x-6 @2xl:px-6">
      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {roundDone && (
          <section className="order-1 rounded-xl bg-amber-400/10 p-2.5 text-sm ring-1 ring-amber-400/40">
            <p className="font-bold text-amber-200">
              Round {view.round} {view.lastRound ? "scores" : "over: the deck ran out, no points"}
            </p>
            {view.lastRound && (
              <ul className="mt-1 grid gap-0.5 text-amber-100/90">
                {view.players.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>{nameOf(p.id)}</span>
                    <span>
                      +{view.lastRound?.[p.id] ?? 0} → {view.totals[p.id] ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-[11px] text-amber-100/70">Everyone's cards are shown below.</p>
          </section>
        )}
        {/* Deck and the two discard piles */}
        <section
          aria-label="Table"
          className="order-1 rounded-2xl bg-gradient-to-b from-sky-950 to-slate-900 p-3"
        >
          <p className="mb-2 flex justify-between text-[11px] text-sky-100/80">
            <span>Round {view.round}</span>
            <span>First to {targetScore(view.players.length, view.config)}</span>
          </p>
          <div className="flex items-end justify-center gap-3">
            <div className="flex flex-col items-center gap-0.5">
              <button
                type="button"
                disabled={!drawMove}
                onClick={() => drawMove && choose(drawMove)}
                aria-label={`Deck, ${view.deckCount} cards`}
                className={`flex h-16 w-[4.25rem] items-center justify-center rounded-md border-2 bg-sky-800 text-lg font-black text-sky-100 transition ${
                  proposed?.type === "draw"
                    ? "-translate-y-1.5 border-amber-400 ring-4 ring-amber-400"
                    : drawMove
                      ? "border-amber-300 ring-2 ring-amber-300/60 hover:-translate-y-0.5"
                      : "border-sky-300/40"
                }`}
              >
                {view.deckCount}
              </button>
              <span className="text-[10px] text-slate-400">deck</span>
            </div>
            {([0, 1] as const).map((i) => {
              const take = legalMoves.find((m) => m.move.type === "take" && m.move.pile === i);
              const toss = keepCard !== null && keepPiles.includes(i);
              const top = view.pileTops[i];
              const onTap = take ? () => choose(take) : toss ? () => keepTo(i) : undefined;
              const lit =
                (proposed?.type === "take" && proposed.pile === i) ||
                (proposed?.type === "keep" && proposed.pile === i && view.drawn.length > 1);
              return (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    disabled={!onTap}
                    onClick={onTap}
                    aria-label={`${i === 0 ? "Left" : "Right"} pile${top ? `, ${KIND_INFO[top.kind].name} on top` : ", empty"}`}
                    className={`rounded-lg transition ${lit ? "-translate-y-1.5 ring-4 ring-amber-400" : onTap ? "ring-2 ring-amber-300/60 hover:-translate-y-0.5" : ""}`}
                  >
                    {top ? (
                      <CardChip card={top} />
                    ) : (
                      <span className="flex h-16 w-[4.25rem] items-center justify-center rounded-md border-2 border-dashed border-slate-600 text-[10px] text-slate-500">
                        empty
                      </span>
                    )}
                  </button>
                  <span className="text-[10px] text-slate-400">
                    {i === 0 ? "left" : "right"} · {view.pileCounts[i]}
                  </span>
                </div>
              );
            })}
          </div>
          {myTurn && view.step === "draw" && (
            <p className="mt-2 text-center text-xs text-amber-100">
              Tap the deck to draw 2 (keep 1), or tap a pile to take its top card.
            </p>
          )}
          {view.lastChance && view.step !== "roundOver" && view.step !== "over" && (
            <p className="mt-2 rounded-lg bg-amber-400/15 px-2 py-1 text-center text-xs text-amber-100">
              Last chance by {nameOf(view.lastChance.caller)}: everyone else gets one final turn.
            </p>
          )}
          {view.drawn.length > 0 && (
            <div className="mt-3 rounded-xl bg-black/30 p-2 text-center">
              <p className="mb-1 text-xs text-amber-100">
                {view.drawn.length === 1
                  ? "The last card: tap it to keep it."
                  : keepCard !== null && keepPiles.length > 1
                    ? "Now tap a pile to discard the other card."
                    : "Tap the card you want to keep. The other is discarded."}
              </p>
              <div className="flex justify-center gap-2">
                {view.drawn.map((c) => (
                  <CardChip
                    key={c.id}
                    card={c}
                    selected={keepCard === c.id}
                    onClick={myTurn ? () => keepTap(c.id) : undefined}
                  />
                ))}
              </div>
            </div>
          )}
          {view.pilesOpen && (
            <div className="mt-3 grid gap-2 rounded-xl bg-black/30 p-2">
              <p className="text-xs text-slate-300">Gull pair: tap any card to take it</p>
              {([0, 1] as const).map((i) => (
                <div key={i}>
                  <p className="text-[10px] text-slate-400 uppercase">
                    {i === 0 ? "Left" : "Right"} pile
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {view.pilesOpen![i].map((c) => {
                      const m = legalMoves.find(
                        (l) => l.move.type === "scavenge" && l.move.card === c.id,
                      );
                      return (
                        <CardChip
                          key={c.id}
                          card={c}
                          size="sm"
                          selected={proposed?.type === "scavenge" && proposed.card === c.id}
                          onClick={m ? () => propose(m.move, m.label) : undefined}
                        />
                      );
                    })}
                    {view.pilesOpen![i].length === 0 && (
                      <span className="text-xs text-slate-500">empty</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Your hand */}
        {me && (
          <section
            aria-label="Your hand"
            className="order-2 rounded-2xl border-2 p-3"
            style={{
              borderColor: me.color,
              background: `linear-gradient(180deg, ${me.color}26, #0f172a 70%)`,
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[11px] font-bold tracking-widest uppercase"
                style={{ color: me.color }}
              >
                Your hand
              </span>
              <span className="text-xs text-slate-300">
                <b className="text-lg text-white">{score.total}</b> pts · colour bonus {bonus}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {view.hand.map((c) => (
                <CardChip
                  key={c.id}
                  card={c}
                  selected={selected.includes(c.id)}
                  onClick={canDuo ? () => toggle(c.id) : undefined}
                />
              ))}
              {view.hand.length === 0 && (
                <span className="text-sm text-slate-500">
                  No cards yet: take one from the table.
                </span>
              )}
            </div>
            {canDuo && duoMoves.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {duoMoves.map((m) => {
                  const duo = m.move.type === "duo" ? m.move.duo : "gull";
                  return (
                    <button
                      key={duo}
                      type="button"
                      onClick={() => {
                        setSel({ sig, ids: [] });
                        choose(m);
                      }}
                      className={`min-h-10 rounded-lg px-3 text-left text-xs font-semibold ${
                        proposed?.type === "duo" && proposed.duo === duo
                          ? "bg-amber-400 text-slate-900"
                          : "bg-slate-700 text-white"
                      }`}
                    >
                      {m.label}
                      <span className="block text-[10px] font-normal opacity-80">
                        {DUO_INFO[duo].effect}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {played.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-700/60 pt-2">
                {played.map((pair, i) => (
                  <span key={i} className="flex gap-0.5">
                    {pair.map((c) => (
                      <CardChip key={c.id} card={c} size="sm" />
                    ))}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {/* Everyone else */}
        <section aria-label="Players" className="order-3 grid gap-1.5">
          {others.map((p) => {
            const shown = view.shownHands[p.id];
            return (
              <div
                key={p.id}
                className="rounded-xl border-2 bg-slate-900/70 px-2.5 py-2"
                style={{ borderColor: current === p.id ? p.color : "#1e293b" }}
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                  <span className="truncate font-semibold">
                    {current === p.id && "▶ "}
                    {p.name}
                  </span>
                  {view.lastChance?.safe.includes(p.id) && (
                    <span className="rounded-full bg-emerald-700 px-1.5 text-[10px] font-bold">
                      safe
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-400">
                    {view.handCounts[p.id] ?? 0} in hand · {view.totals[p.id] ?? 0} pts
                  </span>
                </div>
                {((view.played[p.id] ?? []).length > 0 || shown) && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(view.played[p.id] ?? []).map((pair, i) => (
                      <span key={i} className="flex gap-0.5">
                        {pair.map((c) => (
                          <CardChip key={c.id} card={c} size="sm" />
                        ))}
                      </span>
                    ))}
                    {shown?.map((c) => (
                      <CardChip key={c.id} card={c} size="sm" />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section aria-label="Rules reference" className="order-5 rounded-xl bg-slate-900/60 p-2.5">
          <table className="w-full border-separate border-spacing-y-1 text-xs">
            <tbody>
              {REFERENCE.map(([name, text]) => (
                <tr key={name}>
                  <th
                    scope="row"
                    className="w-20 pr-2 text-left align-top font-semibold text-slate-200"
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

      {proposed && proposedBoard && (
        <div className="sticky bottom-2 z-10 order-6 flex gap-2 rounded-2xl border border-amber-400/50 bg-slate-950/95 p-2 shadow-xl @2xl:col-span-2">
          <button
            type="button"
            onClick={() => {
              setSel({ sig, ids: [] });
              cancel();
            }}
            className="min-h-12 rounded-xl bg-slate-700 px-4 font-bold text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setSel({ sig, ids: [] });
              submit(proposed);
            }}
            className="min-h-12 flex-1 rounded-xl bg-amber-400 px-3 text-sm font-bold text-slate-900"
          >
            {proposedBoard.label}
          </button>
        </div>
      )}
    </div>
  );
}

export { docView } from "./doc.js";
