import { useState, type ReactNode } from "react";
import type { BoardProps, LegalMove, PlayerInfo } from "@utopia/shared";
import {
  COLORS,
  GOAL,
  TOKEN_KINDS,
  TOKEN_LIMIT,
  colorPoints,
  crowns,
  points,
  royalName,
  tokenCount,
  type Ability,
  type Card,
  type Color,
  type Level,
  type Move,
  type Royal,
  type SeatView,
  type TokenKind,
  type View,
} from "./logic.js";

/** Points and crowns, for the shell's player list. */
export function playerDecor(view: View) {
  return {
    scores: Object.fromEntries(
      view.players.map((p) => {
        const seat = view.seats[p.id]!;
        return [p.id, `${points(seat)} pts · ${crowns(seat)}👑`];
      }),
    ),
  };
}

// ---------------------------------------------------------------- look

const TOKEN: Record<TokenKind, { bg: string; ring: string; ink: string; name: string }> = {
  white: { bg: "#f1f5f9", ring: "#94a3b8", ink: "#334155", name: "white" },
  blue: { bg: "#2563eb", ring: "#93c5fd", ink: "#dbeafe", name: "blue" },
  green: { bg: "#16a34a", ring: "#86efac", ink: "#dcfce7", name: "green" },
  red: { bg: "#dc2626", ring: "#fca5a5", ink: "#fee2e2", name: "red" },
  black: { bg: "#1f2937", ring: "#9ca3af", ink: "#e5e7eb", name: "black" },
  pearl: { bg: "#f5d0fe", ring: "#c026d3", ink: "#86198f", name: "Pearl" },
  gold: { bg: "#facc15", ring: "#a16207", ink: "#713f12", name: "Gold" },
};

const GLYPH: Record<TokenKind, string> = {
  white: "◆",
  blue: "◆",
  green: "◆",
  red: "◆",
  black: "◆",
  pearl: "●",
  gold: "★",
};

/** Letters shown on gems in secret mode, when the colours are greyed out. */
const LETTER: Record<TokenKind, string> = {
  white: "W",
  blue: "B",
  green: "G",
  red: "R",
  black: "K",
  pearl: "P",
  gold: "★",
};

const WILD_BG = "conic-gradient(#f1f5f9, #2563eb, #16a34a, #dc2626, #1f2937, #f1f5f9)";

const ABILITY_ICON: Record<Ability, string> = {
  again: "↻",
  token: "+◆",
  privilege: "📜",
  steal: "✋",
};

const ABILITY_TEXT: Record<Ability, string> = {
  again: "another turn",
  token: "take a matching token",
  privilege: "take a Privilege",
  steal: "take a token from your opponent",
};

const sameMove = (a: Move | null, b: Move) => !!a && JSON.stringify(a) === JSON.stringify(b);

function Token({
  kind,
  size = "md",
  count,
}: {
  kind: TokenKind;
  size?: "sm" | "md" | "lg";
  count?: number;
}) {
  const t = TOKEN[kind];
  const box =
    size === "lg"
      ? "h-11 min-w-11 text-lg"
      : size === "md"
        ? "h-7 min-w-7 text-xs secret:px-1"
        : "h-4 min-w-4 text-[9px] secret:px-0.5";
  return (
    <span
      aria-label={count === undefined ? t.name : `${count} ${t.name}`}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 font-black ${box} ${
        count === 0 ? "opacity-25" : ""
      }`}
      style={{ background: t.bg, borderColor: t.ring, color: t.ink }}
    >
      {count === undefined ? (
        <>
          <span className="secret:hidden">{GLYPH[kind]}</span>
          <span className="hidden secret:inline">{LETTER[kind]}</span>
        </>
      ) : (
        <>
          {count}
          {/* Secret mode greys the colours out: say which gem it is. */}
          {kind !== "gold" && <span className="hidden secret:inline">{LETTER[kind]}</span>}
        </>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- cards

type CardMark = "buy" | "reserve" | "picked" | null;

function CardView({
  card,
  mark = null,
  glow = false,
  onClick,
}: {
  card: Card;
  /** "buy": you can afford it; "reserve": tap to reserve with the selected Gold. */
  mark?: CardMark;
  glow?: boolean;
  onClick?: (() => void) | undefined;
}) {
  const band = card.color === "wild" ? WILD_BG : TOKEN[card.color].bg;
  const ink = card.color === "wild" ? "#0f172a" : TOKEN[card.color].ink;
  const ring =
    mark === "picked"
      ? "ring-4 ring-amber-400 -translate-y-1"
      : mark === "reserve"
        ? "ring-2 ring-amber-400"
        : mark === "buy"
          ? "ring-2 ring-emerald-400"
          : "";
  const costs = (Object.entries(card.cost) as [TokenKind, number][]).filter(([, n]) => n > 0);
  const label = `${card.color} level ${card.level} card, ${card.points} points, ${card.crowns} crowns${
    card.ability ? `, ${ABILITY_TEXT[card.ability]}` : ""
  }, costs ${costs.map(([t, n]) => `${n} ${TOKEN[t].name}`).join(", ")}`;
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      aria-label={label}
      className={`relative flex h-[5.75rem] w-[3.4rem] shrink-0 flex-col overflow-hidden rounded-lg bg-[#f6f1e7] text-slate-900 shadow-md transition ${ring} ${
        glow ? "animate-pulse" : ""
      }`}
    >
      <span
        className="flex h-6 items-center justify-between px-1"
        style={{ background: band, color: ink }}
      >
        <span className="text-sm leading-none font-black">{card.points || ""}</span>
        <span className="hidden text-[10px] font-black secret:inline">
          {card.color === "wild" ? "🌈" : LETTER[card.color]}
        </span>
        {card.bonus === 2 && (
          <span className="rounded bg-black/30 px-0.5 text-[9px] font-black text-white">×2</span>
        )}
      </span>
      <span className="flex h-5 items-center justify-center gap-0.5 text-[11px] leading-none">
        {card.color === "wild" && <span aria-hidden>🌈</span>}
        {card.crowns > 0 && <span>{"👑".repeat(card.crowns)}</span>}
        {card.ability && (
          <span className="font-black text-violet-700">{ABILITY_ICON[card.ability]}</span>
        )}
      </span>
      <span className="mt-auto flex flex-wrap gap-0.5 p-1">
        {costs.map(([t, n]) => (
          <Token key={t} kind={t} size="sm" count={n} />
        ))}
      </span>
    </button>
  );
}

function CardBack({
  level,
  count,
  mark,
  onClick,
}: {
  level: Level;
  count?: number;
  mark?: CardMark;
  onClick?: (() => void) | undefined;
}) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      aria-label={
        count === undefined ? `Level ${level} card` : `Level ${level} deck, ${count} cards`
      }
      className={`flex h-[5.75rem] w-10 shrink-0 flex-col items-center justify-center rounded-lg border border-amber-200/40 text-amber-100 shadow ${
        mark === "reserve" ? "ring-2 ring-amber-400" : ""
      }`}
      style={{ background: "repeating-linear-gradient(45deg, #312e81 0 5px, #3730a3 5px 10px)" }}
    >
      <span className="text-[10px] tracking-tighter">{"●".repeat(level)}</span>
      {count !== undefined && <span className="text-sm font-black">{count}</span>}
    </button>
  );
}

// ---------------------------------------------------------------- seats

function Stat({ label, value, goal }: { label: string; value: number; goal: number }) {
  const pct = Math.min(100, Math.round((value / goal) * 100));
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex justify-between text-[10px] text-slate-400">
        <span>{label}</span>
        <span className="font-bold text-slate-100">
          {value}/{goal}
        </span>
      </span>
      <span className="h-1 overflow-hidden rounded-full bg-slate-800">
        <span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

function RoyalChip({ royal }: { royal: Royal }) {
  return (
    <span
      title={`Royal card: ${royalName(royal)}`}
      className="inline-flex items-center gap-0.5 rounded-md border border-amber-300/60 bg-gradient-to-b from-violet-800 to-violet-950 px-1.5 py-0.5 text-xs font-bold text-amber-200"
    >
      ♛ {royal.points}
      {royal.ability && <span>{ABILITY_ICON[royal.ability]}</span>}
    </span>
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
  const cp = colorPoints(seat);
  const bestColor = Math.max(...COLORS.map((c) => cp[c]));
  const bonus = Object.fromEntries(COLORS.map((c) => [c, 0])) as Record<Color, number>;
  for (const o of seat.cards) bonus[o.color] += o.card.bonus;
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
        <span className="ml-auto text-xs text-slate-300" title="Privileges">
          📜 {seat.privileges}
        </span>
      </div>

      <div className="mt-2 flex gap-2">
        <Stat label="Points" value={points(seat)} goal={GOAL.points} />
        <Stat label="Crowns" value={crowns(seat)} goal={GOAL.crowns} />
        <Stat label="1 color" value={bestColor} goal={GOAL.colorPoints} />
      </div>

      {/* Bonuses: how many cards of each color, and their points */}
      <div className="mt-2 grid grid-cols-5 gap-1">
        {COLORS.map((c) => (
          <div
            key={c}
            className={`flex flex-col items-center rounded-lg py-1 ${bonus[c] ? "" : "opacity-30"}`}
            style={{ background: TOKEN[c].bg, color: TOKEN[c].ink }}
            aria-label={`${bonus[c]} ${c} bonus, ${cp[c]} points`}
          >
            <span className="text-base leading-none font-black">
              {bonus[c]}
              <span className="hidden text-[10px] secret:inline"> {LETTER[c]}</span>
            </span>
            <span className="text-[9px] leading-tight">{cp[c]} pts</span>
          </div>
        ))}
      </div>

      {/* Tokens */}
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

      {(seat.royals.length > 0 || seat.reservedLevels.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {seat.royals.map((r) => (
            <RoyalChip key={r.id} royal={r} />
          ))}
          {!mine && seat.reservedLevels.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              Reserved
              {seat.reservedLevels.map((l, i) => (
                <span
                  key={i}
                  className="rounded border border-amber-200/40 bg-indigo-900 px-1 text-[9px] text-amber-100"
                >
                  {"●".repeat(l)}
                </span>
              ))}
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
  [
    "Optional",
    "📜 Spend Privileges (1 token each, no Gold), then you may refill the board: opponent gets 📜.",
  ],
  [
    "Take",
    "Up to 3 tokens in a straight, unbroken line. No Gold. 3 alike or 2 Pearls: opponent gets 📜.",
  ],
  ["Reserve", "Take 1 Gold + a card from the pyramid or a deck. Max 3 reserved."],
  ["Buy", "Cost minus your bonuses. Gold is wild. Spent tokens go to the bag."],
  [
    "Abilities",
    "↻ another turn · +◆ matching token · 📜 Privilege · ✋ steal a token · 🌈 joins your color",
  ],
  ["Crowns", "Your 3rd and 6th 👑 each earn a Royal card ♛."],
  ["Limit", `End your turn with at most ${TOKEN_LIMIT} tokens.`],
  ["Win", `${GOAL.points} points · ${GOAL.crowns} 👑 · ${GOAL.colorPoints} points in one color`],
];

interface Ui {
  sig: string;
  /** Selected board cells for a take. */
  sel: number[];
  /** Selected Gold cell, waiting for a card or deck to reserve. */
  gold: number | null;
  /** Next token tap spends a Privilege. */
  privilege: boolean;
  /** Wild card waiting for its color. */
  wild: number | null;
}

export default function Board({
  view,
  viewer,
  highlight,
  legalMoves,
  proposed,
  propose,
  cancel,
  submit,
}: BoardProps<View, Move>) {
  const current = view.turn.players[view.turn.current];
  const myTurn = view.phase === "play" && current === viewer;
  const pending = view.pending;
  const me = view.players.find((p) => p.id === viewer);
  const opponent = view.players.find((p) => p.id !== viewer) ?? view.players[1]!;
  const bottom = me ?? view.players[0]!;
  const top = me ? opponent : view.players[1]!;

  // Selection resets whenever the game moves on.
  const sig = JSON.stringify([view.board, view.turn.current, pending, view.replenished]);
  const [ui, setUi] = useState<Ui>({ sig, sel: [], gold: null, privilege: false, wild: null });
  const cur: Ui = ui.sig === sig ? ui : { sig, sel: [], gold: null, privilege: false, wild: null };
  const update = (patch: Partial<Ui>) => setUi({ ...cur, ...patch, sig });

  const find = (pred: (m: Move) => boolean): LegalMove<Move> | undefined =>
    legalMoves.find((m) => pred(m.move));
  const choose = (m: LegalMove<Move> | undefined) => (m ? propose(m.move, m.label) : cancel());
  // Only board moves are confirmed here; the shell's bar confirms its own buttons.
  const proposedBoard = proposed
    ? legalMoves.find((m) => m.where === "board" && sameMove(proposed, m.move))
    : undefined;
  const lit = (id: string) => highlight.includes(id);

  const canPrivilege = legalMoves.some((m) => m.move.type === "privilege");
  const choosing = !!pending;

  function tapCell(cell: number) {
    const token = view.board[cell];
    if (!myTurn || !token) return;
    if (pending?.type === "pickToken") {
      choose(find((m) => m.type === "pickToken" && m.cell === cell));
      return;
    }
    if (choosing) return;
    if (cur.privilege) {
      choose(find((m) => m.type === "privilege" && m.cell === cell));
      return;
    }
    if (token === "gold") {
      const can = legalMoves.some(
        (m) => (m.move.type === "reserve" || m.move.type === "reserveDeck") && m.move.gold === cell,
      );
      update({ gold: can && cur.gold !== cell ? cell : null, sel: [], wild: null });
      cancel();
      return;
    }
    const sel = cur.sel.includes(cell)
      ? cur.sel.filter((c) => c !== cell)
      : [...cur.sel, cell].slice(-3);
    update({ sel, gold: null, wild: null });
    const key = [...sel].sort((a, b) => a - b).join();
    const take = find((m) => m.type === "take" && m.cells.join() === key);
    if (sel.length && take) choose(take);
    else cancel();
  }

  const buysFor = (card: Card) =>
    legalMoves.filter((m) => m.move.type === "buy" && m.move.card === card.id);
  const reserveFor = (card: Card) =>
    cur.gold === null
      ? undefined
      : find((m) => m.type === "reserve" && m.gold === cur.gold && m.card === card.id);

  function tapCard(card: Card) {
    if (!myTurn || choosing) return;
    if (cur.gold !== null) {
      choose(reserveFor(card));
      return;
    }
    const buys = buysFor(card);
    if (buys.length === 1) {
      update({ sel: [], wild: null });
      choose(buys[0]);
    } else if (buys.length > 1) {
      update({ sel: [], wild: card.id });
      cancel();
    }
  }

  const markFor = (card: Card): CardMark => {
    if (
      proposed &&
      (proposed.type === "buy" || proposed.type === "reserve") &&
      proposed.card === card.id
    ) {
      return "picked";
    }
    if (cur.wild === card.id) return "picked";
    if (!myTurn || choosing) return null;
    if (cur.gold !== null) return reserveFor(card) ? "reserve" : null;
    return buysFor(card).length ? "buy" : null;
  };

  function resetUi() {
    update({ sel: [], gold: null, privilege: false, wild: null });
    cancel();
  }

  const hint = !myTurn
    ? null
    : pending?.type === "pickToken"
      ? `Tap a ${pending.color} token to take it.`
      : pending
        ? "Choose below."
        : cur.privilege
          ? "Tap any token except Gold to take it with a Privilege."
          : cur.gold !== null
            ? "Now tap a card or a deck to reserve it."
            : "Tap up to 3 tokens in a line, a Gold to reserve, or a glowing card to buy.";

  const wildCard =
    cur.wild === null
      ? null
      : legalMoves.filter((m) => m.move.type === "buy" && m.move.card === cur.wild);

  const pyramid = (
    <section
      aria-label="Cards for sale"
      className="flex flex-col gap-1.5 rounded-2xl bg-slate-900/60 p-2"
    >
      {([3, 2, 1] as const).map((level) => (
        <div key={level} className="flex justify-center gap-1">
          <CardBack
            level={level}
            count={view.deckCounts[level]}
            mark={
              cur.gold !== null &&
              find((m) => m.type === "reserveDeck" && m.gold === cur.gold && m.level === level)
                ? "reserve"
                : null
            }
            onClick={
              myTurn && cur.gold !== null
                ? () =>
                    choose(
                      find(
                        (m) => m.type === "reserveDeck" && m.gold === cur.gold && m.level === level,
                      ),
                    )
                : undefined
            }
          />
          {view.pyramid[level].map((card, i) =>
            card ? (
              <CardView
                key={card.id}
                card={card}
                mark={markFor(card)}
                glow={lit(`card-${card.id}`)}
                onClick={myTurn && !choosing ? () => tapCard(card) : undefined}
              />
            ) : (
              <span
                key={`empty-${i}`}
                className="h-[5.75rem] w-[3.4rem] rounded-lg border border-dashed border-slate-700"
              />
            ),
          )}
        </div>
      ))}
    </section>
  );

  const tokenBoard = (
    <section
      aria-label="Token board"
      className="flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-b from-amber-950/60 to-slate-900 p-2.5"
    >
      <div className="grid grid-cols-5 gap-1.5">
        {view.board.map((token, cell) => {
          const selected = cur.sel.includes(cell) || cur.gold === cell;
          const pickable =
            myTurn &&
            !!token &&
            ((pending?.type === "pickToken" && token === pending.color) ||
              (!choosing && (cur.privilege ? token !== "gold" : true)));
          return (
            <button
              key={cell}
              type="button"
              disabled={!pickable}
              onClick={() => tapCell(cell)}
              aria-label={token ? `${TOKEN[token].name} token` : "Empty space"}
              aria-pressed={selected}
              className={`flex h-12 w-12 items-center justify-center rounded-xl bg-black/25 transition ${
                selected
                  ? "ring-4 ring-amber-400"
                  : lit(`cell-${cell}`)
                    ? "ring-2 ring-sky-300/70"
                    : ""
              } ${pickable ? "hover:bg-white/10" : ""}`}
            >
              {token && <Token kind={token} size="lg" />}
            </button>
          );
        })}
      </div>
      <div className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-300">
        <span title="Tokens in the bag">👜 {view.bag.length} in bag</span>
        <span title="Privileges in the supply">📜 {view.privilegeSupply} left</span>
        <span className="flex items-center gap-1">
          Royal:
          {view.royals.map((r) => (
            <RoyalChip key={r.id} royal={r} />
          ))}
          {view.royals.length === 0 && <span className="text-slate-500">none left</span>}
        </span>
      </div>
      {hint && (
        <p className="w-full rounded-lg bg-amber-400/15 px-2.5 py-1.5 text-center text-xs text-amber-100">
          {hint}
        </p>
      )}
    </section>
  );

  const reservedMine = me ? (view.seats[me.id]!.reserved ?? []) : [];

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-3 @2xl:grid @2xl:max-w-6xl @2xl:grid-cols-[1fr_24rem] @2xl:items-start @2xl:gap-x-6 @2xl:px-6">
      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        <div className="order-2">{pyramid}</div>
        <div className="order-3">{tokenBoard}</div>
      </div>
      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        <div className="order-1">
          <SeatPanel
            player={top}
            seat={view.seats[top.id]!}
            mine={false}
            active={current === top.id}
          />
        </div>
        <div className="order-4">
          <SeatPanel
            player={bottom}
            seat={view.seats[bottom.id]!}
            mine={!!me}
            active={current === bottom.id}
          >
            {me && (reservedMine.length > 0 || canPrivilege) && (
              <div className="mt-2 flex flex-wrap items-end gap-1.5 border-t border-slate-800 pt-2">
                {reservedMine.length > 0 && (
                  <span className="w-full text-[10px] tracking-wide text-slate-500 uppercase">
                    Reserved (only you can see these)
                  </span>
                )}
                {reservedMine.map((card) => (
                  <CardView
                    key={card.id}
                    card={card}
                    mark={markFor(card)}
                    onClick={myTurn && !choosing ? () => tapCard(card) : undefined}
                  />
                ))}
                {canPrivilege && (
                  <button
                    type="button"
                    onClick={() => {
                      update({ privilege: !cur.privilege, sel: [], gold: null, wild: null });
                      cancel();
                    }}
                    className={`ml-auto min-h-10 rounded-lg px-3 text-sm font-bold ${
                      cur.privilege ? "bg-amber-400 text-slate-900" : "bg-slate-700 text-white"
                    }`}
                  >
                    📜 {cur.privilege ? "Cancel Privilege" : "Use a Privilege"}
                  </button>
                )}
              </div>
            )}
          </SeatPanel>
        </div>
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

      {/* Board moves are confirmed here; the shell's bar handles refills and choices. */}
      {wildCard && wildCard.length > 0 && !proposed && (
        <div className="sticky bottom-2 z-10 order-6 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/50 bg-slate-950/95 p-2 shadow-xl @2xl:col-span-2">
          <span className="w-full text-sm text-slate-200">
            🌈 Which of your colors should it join?
          </span>
          {wildCard.map((m) => {
            const color = m.move.type === "buy" ? m.move.color : undefined;
            return (
              <button
                key={color}
                type="button"
                onClick={() => propose(m.move, m.label)}
                className="min-h-11 flex-1 rounded-xl border-2 px-3 font-bold"
                style={
                  color
                    ? {
                        background: TOKEN[color].bg,
                        color: TOKEN[color].ink,
                        borderColor: TOKEN[color].ring,
                      }
                    : undefined
                }
              >
                {color}
              </button>
            );
          })}
          <button
            type="button"
            onClick={resetUi}
            className="min-h-11 rounded-xl bg-slate-700 px-4 font-bold text-white"
          >
            Cancel
          </button>
        </div>
      )}
      {proposed && proposedBoard && (
        <div className="sticky bottom-2 z-10 order-6 flex gap-2 rounded-2xl border border-amber-400/50 bg-slate-950/95 p-2 shadow-xl @2xl:col-span-2">
          <button
            type="button"
            onClick={resetUi}
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
      {viewer === "spectator" && (
        <p className="order-7 text-center text-xs text-slate-500">Watching</p>
      )}
    </div>
  );
}

export { docView } from "./doc.js";
