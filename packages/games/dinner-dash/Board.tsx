import { useEffect, useRef, type ReactNode } from "react";
import type { BoardProps, PlayerId, PlayerInfo } from "@utopia/shared";
import {
  MENU,
  decider,
  handsToEmpty,
  itemName,
  orderSize,
  starsPerPlayer,
  type Category,
  type Move,
  type OrderCard,
  type Served,
  type View,
} from "./logic.js";

const cardCount = (n: number) => `${n} ${n === 1 ? "card" : "cards"}`;

/** Stars (or a red cross when out) and cards left, for the shell's player list. */
export function playerDecor(view: View) {
  return {
    scores: Object.fromEntries(
      view.players.map((p) => [
        p.id,
        `${"⭐".repeat(view.stars[p.id] ?? 0) || "❌"} ${cardCount(view.handCounts[p.id] ?? 0)}`,
      ]),
    ),
  };
}

const CATEGORY_COLOR: Record<Category, string> = {
  coffee: "#b45309",
  tea: "#15803d",
  cold: "#0284c7",
  bakery: "#ea580c",
  kitchen: "#db2777",
};

const colorOf = (item: number) => CATEGORY_COLOR[MENU[item]?.category ?? "coffee"];

const sameMove = (a: Move | null, b: Move) => !!a && JSON.stringify(a) === JSON.stringify(b);

type Propose = (move: Move, label: string) => void;

// ---------------------------------------------------------------- cards

function Ticket({
  item,
  count = 1,
  glow = false,
  size = "md",
}: {
  item: number;
  /** Shown as "×2" when more than one. */
  count?: number;
  /** Just served: pulse it. */
  glow?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border-l-4 bg-[#fdf8ef] font-semibold text-slate-800 shadow-sm ${
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm"
      } ${glow ? "animate-pulse ring-2 ring-amber-400" : ""}`}
      style={{ borderLeftColor: colorOf(item) }}
    >
      {itemName(item)}
      {count > 1 && (
        <span className="rounded bg-slate-800 px-1 text-[11px] font-black text-amber-300">
          ×{count}
        </span>
      )}
    </span>
  );
}

/** A face-up card in your hand: tall like a playing card, tappable when you can serve it. */
function HandCard({
  card,
  onServe,
  selected,
}: {
  card: OrderCard;
  onServe: (() => void) | null;
  selected: boolean;
}) {
  const body = (
    <>
      <span className="h-1.5 w-full rounded-t-md" style={{ background: colorOf(card.item) }} />
      <span className="flex flex-1 items-center px-1.5 text-center text-sm leading-tight font-bold">
        {itemName(card.item)}
      </span>
      {onServe && (
        <span className="pb-1 text-[10px] font-semibold text-amber-700 uppercase">
          {selected ? "Serving" : "Tap to serve"}
        </span>
      )}
    </>
  );
  const cls = `flex h-24 w-[5.5rem] flex-col items-center rounded-lg bg-[#fdf8ef] text-slate-800 shadow-md transition ${
    selected ? "-translate-y-2 ring-4 ring-amber-400" : ""
  }`;
  return onServe ? (
    <button type="button" onClick={onServe} className={`${cls} hover:-translate-y-1`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Face-down cards, fanned like a poker hand. */
function CardBacks({ count }: { count: number }) {
  if (count === 0) return <span className="text-xs text-emerald-400">✓ empty</span>;
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex -space-x-3">
        {Array.from({ length: Math.min(count, 7) }, (_, i) => (
          <span
            key={i}
            className="h-8 w-6 rounded border border-amber-200/50 shadow"
            style={{
              background: "repeating-linear-gradient(45deg, #78350f 0 4px, #92400e 4px 8px)",
            }}
          />
        ))}
      </span>
      <span className="text-sm font-bold text-slate-200">{count}</span>
    </span>
  );
}

/** One line of the order, appearing in turn as if read out. */
function OrderLine({ card, index }: { card: OrderCard; index: number }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = ref.current?.animate(
      [
        { opacity: 0, transform: "translateX(-12px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 300, delay: index * 600, fill: "backwards", easing: "ease-out" },
    );
    return () => a?.cancel();
  }, [index]);
  return (
    <li ref={ref} className="flex items-center gap-2">
      <span className="w-5 text-right text-xs text-slate-500 tabular-nums">{index + 1}.</span>
      <Ticket item={card.item} />
    </li>
  );
}

/** ⭐ per star left; a red ❌ once out. */
function Stars({ left, total }: { left: number; total: number }) {
  if (left === 0) {
    return (
      <span aria-label="Out of stars" className="text-red-500">
        ❌
      </span>
    );
  }
  return (
    <span aria-label={`${left} of ${total} stars left`} className="tracking-tight">
      {"⭐".repeat(left)}
      <span className="text-slate-600">{"☆".repeat(Math.max(0, total - left))}</span>
    </span>
  );
}

// ---------------------------------------------------------------- panels

function LevelTrack({ view }: { view: View }) {
  const n = view.players.length;
  return (
    <section className="rounded-2xl bg-gradient-to-b from-amber-950/70 to-slate-900 p-3">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: view.config.levels }, (_, i) => {
          const level = i + 1;
          const done = level <= view.cleared;
          const current = level === view.level && !done;
          return (
            <span
              key={level}
              className={`flex h-8 flex-1 items-center justify-center rounded-lg text-sm font-black ${
                done
                  ? "bg-amber-400 text-amber-950"
                  : current
                    ? "bg-slate-100 text-slate-900 ring-2 ring-amber-400"
                    : "bg-slate-800 text-slate-500"
              }`}
            >
              {done ? "✓" : level}
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-center text-xs text-amber-100/80">
        Level {view.level} · {orderSize(view)} items · clear it when {handsToEmpty(n)}{" "}
        {handsToEmpty(n) === 1 ? "hand is" : "hands are"} empty
      </p>
    </section>
  );
}

function YourHand({
  me,
  view,
  legalMoves,
  proposed,
  propose,
}: {
  me: PlayerInfo;
  view: View;
  legalMoves: BoardProps<View, Move>["legalMoves"];
  proposed: Move | null;
  propose: Propose;
}) {
  const caller = decider(view);
  const callerName = view.players.find((p) => p.id === caller)?.name ?? "?";
  const yourTurn = caller === me.id;
  const out = (view.stars[me.id] ?? 0) === 0;

  // Serving: one legal move per item, so map each card to its item's move.
  const serveFor = (card: OrderCard) =>
    legalMoves.find((m) => {
      const mv = m.move;
      return mv.type === "serve" && view.hand.find((c) => c.id === mv.card)?.item === card.item;
    });
  const canServe = !yourTurn && legalMoves.some((m) => m.move.type === "serve");
  const missMove = legalMoves.find((m) => m.move.type === "miss");

  return (
    <section
      aria-label="Your hand"
      className="rounded-2xl border-2 p-3"
      style={{
        borderColor: me.color,
        background: `linear-gradient(180deg, ${me.color}2e, #0f172a 70%)`,
        boxShadow: yourTurn ? `0 0 0 4px ${me.color}44` : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p
            className="text-[11px] font-bold tracking-widest uppercase"
            style={{ color: me.color }}
          >
            Your hand
          </p>
          <p className="font-semibold">{me.name}</p>
        </div>
        <span className="text-lg">
          <Stars left={view.stars[me.id] ?? 0} total={starsPerPlayer(view.players.length)} />
        </span>
      </div>

      {yourTurn && (
        <div className="mt-2 rounded-xl bg-white/10 p-2.5">
          <p className="font-bold text-white">🗣️ Your turn: say an order out loud</p>
          <p className="text-xs text-slate-300">
            Name something from the order that someone else is holding. They serve it from their
            hand.
          </p>
          {missMove && (
            <button
              type="button"
              onClick={() => propose(missMove.move, "Nobody has it: lose your star")}
              className={`mt-2 min-h-10 w-full rounded-lg text-sm font-bold ${
                sameMove(proposed, missMove.move)
                  ? "bg-amber-400 text-slate-900"
                  : "bg-red-900/70 text-red-100 hover:bg-red-800"
              }`}
            >
              ❌ Nobody has it
            </button>
          )}
        </div>
      )}
      {canServe && (
        <p className="mt-2 rounded-lg bg-amber-400/15 px-2.5 py-1.5 text-xs text-amber-100">
          <b>{callerName}</b> is ordering. If it's in your hand, tap it to serve.
        </p>
      )}
      {out && !yourTurn && (
        <p className="mt-2 text-xs text-red-300">
          You're out of stars this level, but you still serve your cards.
        </p>
      )}

      <div className="mt-3 flex min-h-24 flex-wrap gap-2">
        {view.hand.map((c) => {
          const serve = canServe ? serveFor(c) : undefined;
          return (
            <HandCard
              key={c.id}
              card={c}
              selected={!!serve && sameMove(proposed, serve.move)}
              onServe={serve ? () => propose(serve.move, serve.label) : null}
            />
          );
        })}
        {view.hand.length === 0 && (
          <p className="self-center text-sm text-emerald-300">
            ✓ Hand empty: you count towards clearing the level
          </p>
        )}
      </div>
    </section>
  );
}

/** Everyone else around the table: stars and face-down cards. */
function Seats({ view, viewer }: { view: View; viewer: PlayerId | "spectator" }) {
  const caller = decider(view);
  const total = starsPerPlayer(view.players.length);
  const need = handsToEmpty(view.players.length);
  const empty = view.players.filter((p) => (view.handCounts[p.id] ?? 0) === 0).length;
  // Seat order, starting after you.
  const me = view.players.findIndex((p) => p.id === viewer);
  const others = view.players
    .map((_, i) => view.players[(i + Math.max(me, 0)) % view.players.length]!)
    .filter((p) => p.id !== viewer);
  return (
    <section aria-label="Players" className="flex flex-col gap-1.5">
      <p className="flex justify-between px-1 text-[10px] tracking-wide text-slate-500 uppercase">
        <span>{viewer === "spectator" ? "Players" : "Around the table"}</span>
        <span className={empty >= need ? "text-emerald-400" : ""}>
          Empty hands {empty}/{need}
        </span>
      </p>
      <ul className="grid grid-cols-2 gap-1.5 @2xl:grid-cols-3">
        {others.map((p) => {
          const ordering = view.phase === "play" && caller === p.id;
          const left = view.stars[p.id] ?? 0;
          return (
            <li
              key={p.id}
              className={`flex flex-col gap-1.5 rounded-xl border-2 bg-slate-900/70 p-2 ${
                left === 0 ? "opacity-70" : ""
              }`}
              style={{ borderColor: ordering ? p.color : "#1e293b" }}
            >
              <div className="flex items-center gap-1.5 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: p.color }}
                />
                <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                <Stars left={left} total={total} />
              </div>
              <div className="flex items-center justify-between">
                <CardBacks count={view.handCounts[p.id] ?? 0} />
                {ordering && (
                  <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
                    🗣️ ordering
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Served cards, the same item stacked: "Latte ×2". */
function groupServed(served: Served[]) {
  const groups: { item: number; count: number; ids: number[] }[] = [];
  for (const s of served) {
    const g = groups.find((x) => x.item === s.card.item);
    if (g) {
      g.count += 1;
      g.ids.push(s.card.id);
    } else groups.push({ item: s.card.item, count: 1, ids: [s.card.id] });
  }
  return groups;
}

function Pool({ view, highlight }: { view: View; highlight: readonly string[] }) {
  const groups = groupServed(view.served);
  return (
    <section aria-label="Pool" className="flex flex-col gap-2 rounded-xl bg-slate-900/60 p-2.5">
      <p className="text-[10px] tracking-wide text-slate-500 uppercase">
        Pool · served {view.served.length} of {orderSize(view)}
      </p>
      <div className="flex min-h-7 flex-wrap gap-1.5">
        {groups.map((g) => (
          <Ticket
            key={g.item}
            item={g.item}
            count={g.count}
            glow={g.ids.some((id) => highlight.includes(`card-${id}`))}
          />
        ))}
        {groups.length === 0 && <span className="text-xs text-slate-600">Nothing served yet</span>}
      </div>
    </section>
  );
}

const REFERENCE: [string, ReactNode][] = [
  ["Order", "Read out once. Memorize it, then it's shuffled and dealt out."],
  ["Call", "On your turn, say out loud an item someone else holds."],
  ["Serve", "Have it? Tap it in your hand. Several have it: first one clockwise serves."],
  [
    "Nobody",
    <>
      No one has it: the caller taps Nobody has it and <b className="text-red-300">loses ⭐</b>.
    </>,
  ],
  ["Clear", "Enough empty hands clears the level. The next order is bigger."],
  ["Lose", "Everyone is ❌: the rush wins."],
];

function QuickReference() {
  return (
    <section aria-label="Rules reference" className="rounded-xl bg-slate-900/60 p-2.5">
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
  );
}

// ---------------------------------------------------------------- board

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
  const me = view.players.find((p) => p.id === viewer);
  const taker = view.players[view.orderTaker];
  const youTake = taker?.id === viewer;
  const proposedLabel = proposed
    ? (legalMoves.find((m) => sameMove(proposed, m.move))?.label ?? null)
    : null;
  const over = view.phase === "won" || view.phase === "lost";
  const table = view.phase === "play" || over;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-3 @2xl:grid @2xl:max-w-6xl @2xl:grid-cols-[26rem_1fr] @2xl:items-start @2xl:gap-x-6 @2xl:px-6">
      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        <div className="order-1">
          <LevelTrack view={view} />
        </div>

        {view.phase === "ready" && (
          <section className="order-2 rounded-2xl border border-amber-400/30 bg-slate-900 p-4 text-center">
            <p className="text-3xl">🧾</p>
            <p className="mt-1 font-bold text-amber-100">Level {view.level} order</p>
            <p className="text-sm text-slate-400">
              {youTake ? "You take" : `${taker?.name ?? "?"} takes`} an order of {orderSize(view)}{" "}
              items. Get ready to memorize it!
            </p>
          </section>
        )}

        {view.phase === "order" && view.order && (
          <section className="order-2 rounded-2xl bg-[#fdf8ef]/5 p-3 ring-1 ring-amber-200/30">
            <p className="text-center text-[11px] font-bold tracking-[0.3em] text-amber-200 uppercase">
              Order · level {view.level}
            </p>
            <ol key={view.level} className="mt-2 grid gap-1.5">
              {view.order.map((c, i) => (
                <OrderLine key={c.id} card={c} index={i} />
              ))}
            </ol>
            <p className="mt-3 text-center text-xs text-amber-100/70">
              {youTake
                ? "Hand it out when everyone has it memorized."
                : `Memorize it! It disappears when ${taker?.name ?? "?"} hands it out.`}
            </p>
          </section>
        )}

        {me && view.phase === "play" && (
          <div className="order-3">
            <YourHand
              me={me}
              view={view}
              legalMoves={legalMoves}
              proposed={proposed}
              propose={propose}
            />
          </div>
        )}

        {over && view.leftovers && (
          <section className="order-6 rounded-xl bg-slate-900/60 p-2.5">
            <p className="mb-1.5 text-[10px] tracking-wide text-slate-500 uppercase">
              Still in hands
            </p>
            <ul className="grid gap-1.5">
              {view.players.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-1 text-xs">
                  <span className="w-14 truncate font-semibold" style={{ color: p.color }}>
                    {p.name}
                  </span>
                  {(view.leftovers?.[p.id] ?? []).map((c) => (
                    <Ticket key={c.id} item={c.item} size="sm" />
                  ))}
                  {(view.leftovers?.[p.id] ?? []).length === 0 && (
                    <span className="text-slate-600">—</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {table && (
          <div className="order-4">
            <Seats view={view} viewer={over ? "spectator" : viewer} />
          </div>
        )}
        {table && (
          <div className="order-5">
            <Pool view={view} highlight={highlight} />
          </div>
        )}
        <div className="order-7">
          <QuickReference />
        </div>
      </div>

      {/* Board moves are confirmed here: the shell's bar only confirms its own buttons. */}
      {proposed && proposedLabel && (
        <div className="sticky bottom-2 z-10 order-8 flex gap-2 rounded-2xl border border-amber-400/50 bg-slate-950/95 p-2 shadow-xl @2xl:col-span-2">
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
            {proposed.type === "miss" ? "Nobody has it: lose your star" : proposedLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export { docView } from "./doc.js";
