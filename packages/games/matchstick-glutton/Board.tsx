import { useState, type ReactNode } from "react";
import type { BoardProps, PlayerId } from "@utopia/shared";
import {
  MAX_SET,
  VALUES,
  changeTo,
  checkPlay,
  label,
  rankOf,
  revolutionSize,
  segmentsOf,
  top,
  type Card,
  type Move,
  type Segment,
  type State,
  type View,
} from "./logic.js";

/** Cards and matchsticks, for the shell's player list. */
export function playerDecor(view: View) {
  return {
    scores: Object.fromEntries(
      view.players.map((p) => {
        const place = view.finished.indexOf(p.id);
        return [
          p.id,
          place >= 0
            ? `🏆 ${place + 1}`
            : `🂠${view.handCounts[p.id] ?? 0} · 🔥${view.sticks[p.id] ?? 0}`,
        ];
      }),
    ),
  };
}

// ---------------------------------------------------------------- the digits

/** Segment rectangles in a 50 × 94 box. */
const SEG: Record<Segment, { x: number; y: number; w: number; h: number }> = {
  a: { x: 11, y: 4, w: 28, h: 7 },
  b: { x: 39, y: 11, w: 7, h: 32 },
  c: { x: 39, y: 51, w: 7, h: 32 },
  d: { x: 11, y: 83, w: 28, h: 7 },
  e: { x: 4, y: 51, w: 7, h: 32 },
  f: { x: 4, y: 11, w: 7, h: 32 },
  g: { x: 11, y: 43.5, w: 28, h: 7 },
};

function Digit({ lit, added = [], ink }: { lit: Segment[]; added?: Segment[]; ink: string }) {
  return (
    <svg viewBox="0 0 50 94" className="h-full w-full" aria-hidden>
      {(Object.keys(SEG) as Segment[]).map((s) => {
        const r = SEG[s];
        const on = lit.includes(s);
        const stick = added.includes(s);
        const horizontal = r.w > r.h;
        return (
          <g key={s}>
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx={3}
              fill={stick ? "#f59e0b" : on ? ink : "#0000000d"}
            />
            {stick && (
              // the match head
              <circle
                cx={horizontal ? r.x + r.w - 3 : r.x + r.w / 2}
                cy={horizontal ? r.y + r.h / 2 : r.y + 3}
                r={4.2}
                fill="#dc2626"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

const INK = "#1e293b";

function CardFace({
  digit,
  value,
  size = "md",
  selected = false,
  onClick,
}: {
  digit: number;
  /** Show the card changed into this number (flipped and with matchsticks as needed). */
  value?: number;
  size?: "sm" | "md";
  selected?: boolean;
  onClick?: (() => void) | undefined;
}) {
  const change = value === undefined ? null : changeTo(digit, value);
  const lit = change ? segmentsOf(digit, change.flipped) : segmentsOf(digit);
  const box = size === "sm" ? "h-14 w-10 p-1" : "h-20 w-14 p-1.5";
  const body = (
    <>
      <Digit lit={lit} added={change?.added ?? []} ink={INK} />
      {change?.flipped && (
        <span
          className="absolute top-0.5 left-1 text-[9px] font-bold text-sky-700"
          title="Upside down"
        >
          ↻
        </span>
      )}
      {value === undefined && (digit === 3 || digit === 6) && (
        <span className="absolute right-1 bottom-0.5 text-[9px] font-bold text-slate-400">
          {digit === 3 ? "E" : "9"}
        </span>
      )}
    </>
  );
  const cls = `relative shrink-0 rounded-lg bg-[#fbf6ea] shadow-md transition ${box} ${
    selected ? "-translate-y-2 ring-4 ring-amber-400" : ""
  }`;
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`Card ${label(digit)}`}
      className={`${cls} hover:-translate-y-1`}
    >
      {body}
    </button>
  ) : (
    <div
      className={cls}
      aria-label={value === undefined ? label(digit) : `${label(digit)} as ${label(value)}`}
    >
      {body}
    </div>
  );
}

function Sticks({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} matchsticks`}>
      {n <= 6 ? (
        Array.from({ length: n }, (_, i) => (
          <span key={i} className="relative h-4 w-1 rounded-sm bg-amber-500">
            <span className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-red-600" />
          </span>
        ))
      ) : (
        <span className="text-xs font-bold text-amber-400">🔥 {n}</span>
      )}
      {n === 0 && <span className="text-xs text-slate-500">no sticks</span>}
    </span>
  );
}

// ---------------------------------------------------------------- board

const REFERENCE: [string, ReactNode][] = [
  ["Lead", "Play 1–5 cards of one number."],
  ["Beat", "Same number of cards, stronger number. Or pass: take a matchstick 🔥."],
  ["Change", "Turn a card ↻ and/or add your matchsticks (orange) to make another number."],
  ["Trick", "Everyone else passed: the last player clears it and leads."],
  ["Top card", "The strongest number ends the trick: everyone else takes a stick."],
  ["Revolution", "5 of a kind flips the order (0 strongest). Another 5 flips it back."],
  ["Out", "No cards and no sticks. No cards left? Return 1 stick per turn."],
];

export default function Board({
  view,
  viewer,
  highlight: _highlight,
  legalMoves,
  proposed,
  propose,
  cancel,
  submit,
}: BoardProps<View, Move>) {
  const current = view.turn.players[view.turn.current];
  const myTurn = view.phase === "play" && current === viewer;
  const me = view.players.find((p) => p.id === viewer);
  const last = top(view);
  const sticks = me ? (view.sticks[me.id] ?? 0) : 0;

  // Selection resets whenever the game moves on.
  const sig = JSON.stringify([
    view.trick.length,
    view.turn.current,
    view.hand.length,
    view.revolution,
  ]);
  const [sel, setSel] = useState<{ sig: string; ids: number[] }>({ sig, ids: [] });
  const selected = sel.sig === sig ? sel.ids : [];
  const toggle = (id: number) => {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id].slice(-MAX_SET);
    setSel({ sig, ids: next });
    cancel();
  };

  const canPlay =
    myTurn && legalMoves.some((m) => m.move.type === "play" || m.move.type === "pass");
  // Numbers the selected cards can be played as, with their total matchstick cost.
  const asState = { ...view, hands: me ? { [me.id]: view.hand } : {} } as unknown as State;
  const options =
    me && myTurn && selected.length
      ? VALUES.flatMap((value) => {
          const res = checkPlay(asState, me.id, selected, value);
          return "error" in res ? [] : [{ value, cost: res.cost }];
        }).sort((a, b) => rankOf(view, a.value) - rankOf(view, b.value))
      : [];
  const reason =
    me && myTurn && selected.length && options.length === 0
      ? last && selected.length !== last.cards.length
        ? `Select ${last.cards.length} card${last.cards.length === 1 ? "" : "s"} to beat this.`
        : "These cards can't make one stronger number together."
      : null;

  const order = [...VALUES].sort((a, b) => rankOf(view, a) - rankOf(view, b));
  const nameOf = (id: PlayerId) =>
    id === viewer ? "You" : (view.players.find((p) => p.id === id)?.name ?? "?");
  const others = view.players.filter((p) => p.id !== viewer);
  const proposedPlay = proposed?.type === "play" ? proposed : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-3 @2xl:grid @2xl:max-w-5xl @2xl:grid-cols-2 @2xl:items-start @2xl:gap-x-6 @2xl:px-6">
      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {/* Strength order */}
        <section
          className={`order-1 rounded-xl p-2 ${view.revolution ? "bg-fuchsia-950/70 ring-1 ring-fuchsia-500/60" : "bg-slate-900/70"}`}
        >
          <p className="mb-1 flex justify-between text-[10px] tracking-wide text-slate-400 uppercase">
            <span>Weak</span>
            {view.revolution && <span className="font-bold text-fuchsia-300">Revolution!</span>}
            <span>Strong</span>
          </p>
          <div className="grid grid-cols-16 gap-0.5 font-mono text-xs font-black">
            {order.map((v) => (
              <span
                key={v}
                className={`rounded py-0.5 text-center ${last?.value === v ? "bg-amber-400 text-slate-900" : "bg-slate-800 text-slate-200"}`}
              >
                {label(v)}
              </span>
            ))}
          </div>
        </section>

        {/* The trick */}
        <section
          aria-label="Table"
          className="order-2 rounded-2xl bg-gradient-to-b from-emerald-950/80 to-slate-900 p-3"
        >
          {last ? (
            <>
              <p className="text-center text-xs text-emerald-100/80">
                {nameOf(last.player)} played {last.cards.length} ×{" "}
                <b className="text-white">{label(last.value)}</b>
              </p>
              <div className="mt-2 flex justify-center gap-1.5">
                {last.cards.map((c) => (
                  <CardFace key={c.card.id} digit={c.card.digit} value={last.value} />
                ))}
              </div>
              {view.trick.length > 1 && (
                <p className="mt-2 text-center text-[11px] text-slate-400">
                  Before:{" "}
                  {view.trick
                    .slice(0, -1)
                    .map((p) => `${p.cards.length}×${label(p.value)}`)
                    .join(" → ")}
                </p>
              )}
              {view.passed.length > 0 && (
                <p className="text-center text-[11px] text-slate-500">
                  Passed: {view.passed.map(nameOf).join(", ")}
                </p>
              )}
            </>
          ) : (
            <p className="py-6 text-center text-sm text-emerald-100/80">
              {current
                ? `${nameOf(current)} ${current === viewer ? "lead" : "leads"} the next trick`
                : "Game over"}
            </p>
          )}
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
                <Sticks n={sticks} />
              </span>
            </div>
            <div className="mt-2 flex min-h-20 flex-wrap justify-center gap-1.5">
              {view.hand.map((c: Card) => (
                <CardFace
                  key={c.id}
                  digit={c.digit}
                  selected={selected.includes(c.id)}
                  onClick={canPlay ? () => toggle(c.id) : undefined}
                />
              ))}
              {view.hand.length === 0 && (
                <p className="self-center text-sm text-slate-400">
                  {view.finished.includes(me.id)
                    ? "🏆 You're out!"
                    : "No cards left: return your matchsticks."}
                </p>
              )}
            </div>
            {myTurn && view.hand.length > 0 && (
              <div className="mt-3 rounded-xl bg-slate-950/60 p-2.5">
                {selected.length === 0 ? (
                  <p className="text-center text-xs text-slate-300">
                    {last
                      ? `Tap ${last.cards.length} card${last.cards.length === 1 ? "" : "s"} to beat ${label(last.value)}${
                          legalMoves.some((m) => m.move.type === "pass") ? ", or pass" : ""
                        }.`
                      : "Tap 1–5 cards to lead."}
                  </p>
                ) : options.length > 0 ? (
                  <>
                    <p className="mb-1.5 text-xs text-slate-300">Play them as:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {options.map((o) => {
                        const move: Move = { type: "play", cards: selected, value: o.value };
                        const picked = proposedPlay?.value === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() =>
                              propose(
                                move,
                                `Play ${selected.length} × ${label(o.value)}${o.cost ? ` (${o.cost} 🔥)` : ""}`,
                              )
                            }
                            className={`flex min-h-11 min-w-11 flex-col items-center justify-center rounded-lg px-2 font-mono font-black ${
                              picked ? "bg-amber-400 text-slate-900" : "bg-slate-700 text-white"
                            }`}
                          >
                            <span className="text-lg leading-none">{label(o.value)}</span>
                            {o.cost > 0 && (
                              <span className="text-[10px] font-bold text-amber-300">
                                +{o.cost}🔥
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {selected.length >= revolutionSize(view) && (
                      <p className="mt-1.5 text-xs text-fuchsia-300">This many is a Revolution!</p>
                    )}
                  </>
                ) : (
                  <p className="text-center text-xs text-red-300">{reason}</p>
                )}
                {proposedPlay && (
                  <div className="mt-2 flex justify-center gap-1.5">
                    {proposedPlay.cards.map((id) => {
                      const c = view.hand.find((h) => h.id === id);
                      return c ? (
                        <CardFace key={id} digit={c.digit} value={proposedPlay.value} size="sm" />
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {/* Everyone else */}
        <section aria-label="Players" className="order-3 grid grid-cols-2 gap-1.5">
          {others.map((p) => {
            const place = view.finished.indexOf(p.id);
            const count = view.handCounts[p.id] ?? 0;
            return (
              <div
                key={p.id}
                className="flex flex-col gap-1 rounded-xl border-2 bg-slate-900/70 px-2.5 py-2"
                style={{ borderColor: current === p.id ? p.color : "#1e293b" }}
              >
                <span className="flex items-center gap-1.5 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: p.color }}
                  />
                  <span className="truncate font-semibold">
                    {current === p.id && "▶ "}
                    {p.name}
                  </span>
                  {view.passed.includes(p.id) && (
                    <span className="ml-auto text-[10px] text-slate-400">passed</span>
                  )}
                </span>
                {place >= 0 ? (
                  <span className="text-sm font-bold text-amber-300">
                    🏆 {place + 1}
                    {place === 0 ? "st" : place === 1 ? "nd" : place === 2 ? "rd" : "th"}
                  </span>
                ) : (
                  <span className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs text-slate-300">
                      <span className="h-5 w-3.5 rounded-sm border border-amber-200/40 bg-indigo-900" />
                      {count}
                    </span>
                    <Sticks n={view.sticks[p.id] ?? 0} />
                  </span>
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

      {proposedPlay && (
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
            onClick={() => {
              setSel({ sig, ids: [] });
              submit(proposedPlay);
            }}
            className="min-h-12 flex-1 rounded-xl bg-amber-400 px-3 font-bold text-slate-900"
          >
            Play {proposedPlay.cards.length} × {label(proposedPlay.value)}
          </button>
        </div>
      )}
    </div>
  );
}

export { docView } from "./doc.js";
