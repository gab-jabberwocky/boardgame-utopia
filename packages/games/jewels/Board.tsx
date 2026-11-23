import { useState, type ReactNode } from "react";
import type { BoardProps, LegalMove, PlayerInfo } from "@utopia/shared";
import {
  COLORS,
  LETTER,
  PATRON_POINTS,
  TOKEN_KINDS,
  TOKEN_LIMIT,
  bonuses,
  points,
  tokenCount,
  type Card,
  type Color,
  type Level,
  type Move,
  type Patron,
  type SeatView,
  type TokenKind,
  type View,
} from "./logic.js";

const pts = (n: number) => `${n} pt${n === 1 ? "" : "s"}`;

/** Points, for the shell's player list. */
export function playerDecor(view: View) {
  return {
    scores: Object.fromEntries(view.players.map((p) => [p.id, pts(points(view.seats[p.id]!))])),
  };
}

// ---------------------------------------------------------------- look

const TOKEN: Record<TokenKind, { bg: string; ring: string; ink: string }> = {
  white: { bg: "#f1f5f9", ring: "#94a3b8", ink: "#334155" },
  blue: { bg: "#2563eb", ring: "#93c5fd", ink: "#dbeafe" },
  green: { bg: "#16a34a", ring: "#86efac", ink: "#dcfce7" },
  red: { bg: "#dc2626", ring: "#fca5a5", ink: "#fee2e2" },
  black: { bg: "#1f2937", ring: "#9ca3af", ink: "#e5e7eb" },
  gold: { bg: "#facc15", ring: "#a16207", ink: "#713f12" },
};

/** Secret mode greys the colours out, so gems also show a letter there. */
function Letter({ kind }: { kind: TokenKind }) {
  return <span className="hidden secret:inline">{kind === "gold" ? "★" : LETTER[kind]}</span>;
}

function Token({
  kind,
  count,
  size = "md",
}: {
  kind: TokenKind;
  count?: number;
  size?: "sm" | "md" | "lg";
}) {
  const t = TOKEN[kind];
  const box =
    size === "lg"
      ? "h-11 min-w-11 text-base"
      : size === "md"
        ? "h-7 min-w-7 text-xs secret:px-1"
        : "h-4 min-w-4 text-[9px] secret:px-0.5";
  return (
    <span
      aria-label={count === undefined ? kind : `${count} ${kind}`}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 font-black ${box} ${
        count === 0 ? "opacity-25" : ""
      }`}
      style={{ background: t.bg, borderColor: t.ring, color: t.ink }}
    >
      {count === undefined ? (
        <>
          <span className="secret:hidden">{kind === "gold" ? "★" : "◆"}</span>
          <Letter kind={kind} />
        </>
      ) : (
        <>
          {count}
          {kind !== "gold" && <Letter kind={kind} />}
        </>
      )}
    </span>
  );
}

function CardView({
  card,
  mark,
  onClick,
  glow = false,
}: {
  card: Card;
  mark?: "buy" | "picked" | null;
  onClick?: (() => void) | undefined;
  glow?: boolean;
}) {
  const t = TOKEN[card.color];
  const costs = (Object.entries(card.cost) as [Color, number][]).filter(([, k]) => k > 0);
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      aria-label={`${card.color} level ${card.level} card, ${card.points} points, costs ${costs
        .map(([c, k]) => `${k} ${c}`)
        .join(", ")}`}
      className={`flex h-[5.5rem] w-[3.6rem] shrink-0 flex-col overflow-hidden rounded-lg bg-[#f6f1e7] text-slate-900 shadow-md transition ${
        mark === "picked"
          ? "-translate-y-1 ring-4 ring-amber-400"
          : mark === "buy"
            ? "ring-2 ring-emerald-400"
            : ""
      } ${glow ? "animate-pulse" : ""}`}
    >
      <span
        className="flex h-6 items-center justify-between px-1"
        style={{ background: t.bg, color: t.ink }}
      >
        <span className="text-sm leading-none font-black">{card.points || ""}</span>
        <span className="text-[10px] font-black">
          <Letter kind={card.color} />
        </span>
      </span>
      <span className="mt-auto flex flex-wrap gap-0.5 p-1">
        {costs.map(([c, k]) => (
          <Token key={c} kind={c} count={k} size="sm" />
        ))}
      </span>
    </button>
  );
}

function DeckBack({
  level,
  count,
  picked,
  onClick,
}: {
  level: Level;
  count: number;
  picked: boolean;
  onClick?: (() => void) | undefined;
}) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      aria-label={`Level ${level} deck, ${count} cards`}
      className={`flex h-[5.5rem] w-10 shrink-0 flex-col items-center justify-center rounded-lg border border-amber-200/40 text-amber-100 shadow ${
        picked ? "ring-4 ring-amber-400" : ""
      }`}
      style={{ background: "repeating-linear-gradient(45deg, #422006 0 5px, #713f12 5px 10px)" }}
    >
      <span className="text-[10px]">{"●".repeat(level)}</span>
      <span className="text-sm font-black">{count}</span>
    </button>
  );
}

function PatronTile({ patron }: { patron: Patron }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-amber-300/50 bg-gradient-to-b from-violet-900 to-violet-950 px-1.5 py-1">
      <span className="text-xs font-black text-amber-200">{PATRON_POINTS}</span>
      <span className="flex gap-0.5">
        {(Object.entries(patron.needs) as [Color, number][]).map(([c, k]) => (
          <span
            key={c}
            className="flex h-5 min-w-4 items-center justify-center rounded-sm px-0.5 text-[10px] font-black"
            style={{ background: TOKEN[c].bg, color: TOKEN[c].ink }}
          >
            {k}
            <Letter kind={c} />
          </span>
        ))}
      </span>
    </div>
  );
}

function SeatPanel({
  player,
  seat,
  mine,
  active,
  children,
}: {
  player: PlayerInfo;
  seat: SeatView;
  mine: boolean;
  active: boolean;
  children?: ReactNode;
}) {
  const b = bonuses(seat);
  const held = tokenCount(seat);
  return (
    <section
      aria-label={mine ? "Your jewels" : `${player.name}'s jewels`}
      className="rounded-2xl border-2 p-2.5"
      style={{
        borderColor: active ? player.color : "#1e293b",
        background: mine ? `linear-gradient(180deg, ${player.color}26, #0f172a 60%)` : "#0f172acc",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: player.color }} />
        <span className="truncate font-semibold">
          {active && "▶ "}
          {mine ? `You (${player.name})` : player.name}
        </span>
        <span className="ml-auto text-sm font-black text-amber-300">{pts(points(seat))}</span>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1">
        {COLORS.map((c) => (
          <div
            key={c}
            className={`flex items-center justify-center rounded-md py-1 text-sm font-black ${b[c] ? "" : "opacity-30"}`}
            style={{ background: TOKEN[c].bg, color: TOKEN[c].ink }}
            aria-label={`${b[c]} ${c} bonus`}
          >
            {b[c]}
            <span className="ml-0.5 text-[10px]">
              <Letter kind={c} />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1">
        {TOKEN_KINDS.map((t) => (
          <Token key={t} kind={t} count={seat.tokens[t]} />
        ))}
        <span
          className={`ml-auto text-xs ${held > TOKEN_LIMIT ? "text-red-400" : "text-slate-400"}`}
        >
          {held}/{TOKEN_LIMIT}
        </span>
      </div>
      {(seat.patrons.length > 0 || (!mine && seat.reservedLevels.length > 0)) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
          {seat.patrons.map((p) => (
            <PatronTile key={p.id} patron={p} />
          ))}
          {!mine && seat.reservedLevels.length > 0 && (
            <span>
              Reserved: {seat.reservedLevels.length} (level {seat.reservedLevels.join(", ")})
            </span>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- board

const REFERENCE: [string, ReactNode][] = [
  ["Take", "3 gems of different colours, or 2 of one colour from a pile of 4+."],
  ["Reserve", "A face-up card or a deck's top card (hidden) + 1 Gold (wild). Max 3."],
  ["Buy", "Cost minus your bonuses. Gold pays for anything. Spent tokens go back."],
  ["Limit", `End your turn with at most ${TOKEN_LIMIT} tokens.`],
  ["Patron", `Visits when your bonuses meet the need: +${PATRON_POINTS}. One per turn.`],
  ["End", "Someone reaches the target: finish the round. Most points; tie → fewer cards."],
];

interface Ui {
  sig: string;
  gems: Color[];
  card: number | null;
  deck: Level | null;
}

export default function Board({
  view,
  viewer,
  highlight,
  legalMoves,
  proposed,
  propose,
  submit,
  cancel,
}: BoardProps<View, Move>) {
  const current = view.turn.players[view.turn.current];
  const myTurn = view.phase === "play" && current === viewer && !view.pending;
  const me = view.players.find((p) => p.id === viewer);
  const mySeat = me ? view.seats[me.id] : undefined;

  const sig = JSON.stringify([view.turn.current, view.supply, view.pending, view.market]);
  const blank: Ui = { sig, gems: [], card: null, deck: null };
  const [ui, setUi] = useState<Ui>(blank);
  const cur = ui.sig === sig ? ui : blank;
  const set = (patch: Partial<Ui>) => {
    setUi({ ...blank, ...patch, sig });
    cancel();
  };

  const find = (pred: (m: Move) => boolean) => legalMoves.find((m) => pred(m.move));
  const buyFor = (id: number) => find((m) => m.type === "buy" && m.card === id);
  const reserveFor = (id: number) => find((m) => m.type === "reserve" && m.card === id);

  const sameMove = (a: Move | null, b: Move) => !!a && JSON.stringify(a) === JSON.stringify(b);
  const proposedBoard = proposed
    ? legalMoves.find((m) => m.where === "board" && sameMove(proposed, m.move))
    : undefined;

  // What the current selection can do.
  let actions: LegalMove<Move>[] = [];
  let cantBuy: string | null = null;
  if (cur.gems.length) {
    const [a, b] = cur.gems;
    const move =
      cur.gems.length === 2 && a === b
        ? find((m) => m.type === "double" && m.color === a)
        : find(
            (m) =>
              m.type === "take" &&
              m.colors.length === cur.gems.length &&
              cur.gems.every((c) => m.colors.includes(c)),
          );
    if (move) actions = [move];
  } else if (cur.card !== null) {
    actions = [buyFor(cur.card), reserveFor(cur.card)].filter((m): m is LegalMove<Move> => !!m);
    const picked = [
      ...([3, 2, 1] as const).flatMap((l) => view.market[l]),
      ...(mySeat?.reserved ?? []),
    ].find((c) => c?.id === cur.card);
    if (picked && mySeat && !buyFor(picked.id)) {
      const b = bonuses(mySeat);
      const short =
        COLORS.reduce(
          (k, c) => k + Math.max(0, (picked.cost[c] ?? 0) - b[c] - mySeat.tokens[c]),
          0,
        ) - mySeat.tokens.gold;
      cantBuy = `Not enough to buy it yet: ${short} gem${short === 1 ? "" : "s"} short.`;
    }
  } else if (cur.deck !== null) {
    const level = cur.deck;
    const m = find((mv) => mv.type === "reserveDeck" && mv.level === level);
    if (m) actions = [m];
  }

  const tapGem = (c: Color) => {
    if (!myTurn) return;
    const gems = cur.gems;
    let next: Color[];
    if (gems.includes(c))
      next = gems.length === 1 && view.supply[c] >= 4 ? [c, c] : gems.filter((g) => g !== c);
    else next = gems[0] !== undefined && gems[0] === gems[1] ? [c] : [...gems, c].slice(-3);
    set({ gems: next });
    // A complete pick is proposed right away; the strip then asks to confirm.
    const [a, b] = next;
    const move =
      next.length === 2 && a === b
        ? find((m) => m.type === "double" && m.color === a)
        : find(
            (m) =>
              m.type === "take" &&
              m.colors.length === next.length &&
              next.every((g) => m.colors.includes(g)),
          );
    if (move) propose(move.move, move.label);
  };

  const hint = !myTurn
    ? null
    : cur.gems.length
      ? actions.length
        ? null
        : "Pick 3 different colours, or tap one colour twice for 2."
      : "Tap gems to take, or a card to buy or reserve.";

  const others = view.players.filter((p) => p.id !== viewer);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-3 @2xl:grid @2xl:max-w-6xl @2xl:grid-cols-[1fr_24rem] @2xl:items-start @2xl:gap-x-6 @2xl:px-6">
      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {/* Patrons */}
        <section aria-label="Patrons" className="order-2 flex flex-wrap justify-center gap-1.5">
          {view.patrons.map((p) => (
            <PatronTile key={p.id} patron={p} />
          ))}
        </section>

        {/* Cards for sale */}
        <section
          aria-label="Cards"
          className="order-3 flex flex-col gap-1.5 rounded-2xl bg-slate-900/60 p-2"
        >
          {([3, 2, 1] as const).map((level) => (
            <div key={level} className="flex justify-center gap-1">
              <DeckBack
                level={level}
                count={view.deckCounts[level]}
                picked={cur.deck === level}
                onClick={myTurn ? () => set({ deck: level }) : undefined}
              />
              {view.market[level].map((c, i) =>
                c ? (
                  <CardView
                    key={c.id}
                    card={c}
                    glow={highlight.includes(`card-${c.id}`)}
                    mark={cur.card === c.id ? "picked" : myTurn && buyFor(c.id) ? "buy" : null}
                    onClick={myTurn ? () => set({ card: c.id }) : undefined}
                  />
                ) : (
                  <span
                    key={`x${i}`}
                    className="h-[5.5rem] w-[3.6rem] rounded-lg border border-dashed border-slate-700"
                  />
                ),
              )}
            </div>
          ))}
        </section>

        {/* Gem supply */}
        <section aria-label="Gems" className="order-4 rounded-2xl bg-slate-900/60 p-2.5">
          <div className="flex justify-center gap-2">
            {TOKEN_KINDS.map((t) => {
              const picked = cur.gems.filter((g) => g === t).length;
              return (
                <button
                  key={t}
                  type="button"
                  disabled={!myTurn || t === "gold" || view.supply[t] === 0}
                  onClick={() => t !== "gold" && tapGem(t)}
                  className={`relative rounded-full transition ${picked ? "-translate-y-1 ring-4 ring-amber-400" : ""}`}
                >
                  <Token kind={t} count={view.supply[t]} size="lg" />
                  {picked > 0 && (
                    <span className="absolute -top-2 -right-1 rounded-full bg-amber-400 px-1 text-[10px] font-black text-slate-900">
                      +{picked}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {hint && <p className="mt-2 text-center text-xs text-amber-100/80">{hint}</p>}
        </section>
      </div>

      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        <div className="order-1 grid gap-1.5">
          {others.map((p) => (
            <SeatPanel
              key={p.id}
              player={p}
              seat={view.seats[p.id]!}
              mine={false}
              active={current === p.id}
            />
          ))}
        </div>
        {me && mySeat && (
          <div className="order-5">
            <SeatPanel player={me} seat={mySeat} mine active={current === me.id}>
              {(mySeat.reserved ?? []).length > 0 && (
                <div className="mt-2 border-t border-slate-800 pt-2">
                  <p className="mb-1 text-[10px] tracking-wide text-slate-500 uppercase">
                    Reserved (only you can see these)
                  </p>
                  <div className="flex gap-1">
                    {(mySeat.reserved ?? []).map((c) => (
                      <CardView
                        key={c.id}
                        card={c}
                        mark={cur.card === c.id ? "picked" : myTurn && buyFor(c.id) ? "buy" : null}
                        onClick={myTurn ? () => set({ card: c.id }) : undefined}
                      />
                    ))}
                  </div>
                </div>
              )}
            </SeatPanel>
          </div>
        )}
        <section aria-label="Rules reference" className="order-6 rounded-xl bg-slate-900/60 p-2.5">
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

      {/* Tap proposes, then confirm here. Cards offer Buy / Reserve first. */}
      {myTurn && (proposedBoard || actions.length > 0 || cantBuy) && (
        <div className="sticky bottom-2 z-10 order-7 flex flex-col gap-1.5 rounded-2xl border border-amber-400/50 bg-slate-950/95 p-2 shadow-xl @2xl:col-span-2">
          {proposedBoard ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setUi(blank);
                  cancel();
                }}
                className="min-h-12 rounded-xl bg-slate-700 px-4 font-bold text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setUi(blank);
                  submit(proposedBoard.move);
                }}
                className="min-h-12 flex-1 rounded-xl bg-amber-400 px-3 text-sm font-bold text-slate-900"
              >
                Confirm: {proposedBoard.label}
              </button>
            </div>
          ) : (
            <>
              {cantBuy && <p className="text-center text-xs text-slate-400">{cantBuy}</p>}
              {actions.map((m) => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => propose(m.move, m.label)}
                  className="min-h-11 rounded-xl bg-slate-700 px-3 text-sm font-bold text-white"
                >
                  {m.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setUi(blank)}
                className="min-h-9 rounded-xl text-sm text-slate-400"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export { docView } from "./doc.js";
