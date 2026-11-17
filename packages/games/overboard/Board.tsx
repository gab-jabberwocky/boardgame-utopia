import { useEffect, useRef, type ReactNode } from "react";
import type { BoardProps, PlayerId, PlayerInfo } from "@utopia/shared";
import {
  FULL_HOLD,
  FULL_HOLD_BONUS,
  NUMBER_VALUES,
  RIPTIDE_CARDS,
  bustChance,
  decider,
  handScore,
  nextCardOdds,
  type Card,
  type Hand,
  type Move,
  type Standing,
  type View,
} from "./logic.js";

/** Running totals for the shell's player list. */
export function playerDecor(view: View) {
  return {
    scores: Object.fromEntries(view.players.map((p) => [p.id, `${view.totals[p.id] ?? 0}`])),
  };
}

// ---------------------------------------------------------------- cards

/** Numeral colour per value, from deep sea (low) to coral (high). */
const NUMBER_INK = [
  "#64748b",
  "#0e7490",
  "#0891b2",
  "#0d9488",
  "#059669",
  "#65a30d",
  "#ca8a04",
  "#d97706",
  "#ea580c",
  "#dc2626",
  "#db2777",
  "#9333ea",
  "#4f46e5",
];

const SIZES = {
  xs: { box: "h-8 w-6 rounded", text: "text-sm", long: "text-[10px]", small: "text-[7px]" },
  sm: { box: "h-11 w-8 rounded-md", text: "text-base", long: "text-xs", small: "text-[8px]" },
  md: { box: "h-14 w-10 rounded-lg", text: "text-xl", long: "text-sm", small: "text-[9px]" },
  lg: { box: "h-28 w-20 rounded-xl", text: "text-5xl", long: "text-3xl", small: "text-xs" },
} as const;

function faceStyle(card: Card): { bg: string; ink: string; label: string; sub: string } {
  switch (card.kind) {
    case "number":
      return {
        bg: "#f8f1e3",
        ink: NUMBER_INK[card.value] ?? "#334155",
        label: `${card.value}`,
        sub: "",
      };
    case "bonus":
      return { bg: "#fbbf24", ink: "#78350f", label: `+${card.value}`, sub: "bounty" };
    case "double":
      return { bg: "#c084fc", ink: "#3b0764", label: "×2", sub: "double" };
    case "action":
      return {
        anchor: { bg: "#334155", ink: "#e2e8f0", label: "⚓", sub: "anchor" },
        riptide: { bg: "#0f766e", ink: "#ccfbf1", label: "🌊", sub: "riptide" },
        lifeRing: { bg: "#fff1f2", ink: "#e11d48", label: "🛟", sub: "life ring" },
      }[card.action];
  }
}

function CardFace({
  card,
  size = "sm",
  faceDown = false,
  flip = false,
  tone,
}: {
  card: Card | null;
  size?: keyof typeof SIZES;
  faceDown?: boolean;
  /** Play the flip-over animation when shown. */
  flip?: boolean;
  /** "bust" outlines in red, "held" is dashed (waiting to be played). */
  tone?: "bust" | "held";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = !faceDown && card;
  useEffect(() => {
    if (!flip || !shown || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = ref.current?.animate(
      [
        { transform: "rotateY(90deg) scale(1.15)", filter: "brightness(1.4)" },
        { transform: "rotateY(0deg) scale(1)", filter: "brightness(1)" },
      ],
      { duration: 380, easing: "cubic-bezier(.2,.8,.3,1.2)" },
    );
    return () => a?.cancel();
  }, [flip, shown]);
  const s = SIZES[size];
  if (!shown) {
    return (
      <div
        aria-label="Face-down card"
        className={`${s.box} flex shrink-0 items-center justify-center border-2 border-sky-300/40 ${
          faceDown ? "animate-pulse" : ""
        }`}
        style={{
          background: "repeating-linear-gradient(135deg, #1e3a8a 0 6px, #1d4ed8 6px 8px), #1e3a8a",
        }}
      >
        <span className={`${s.text} opacity-50`}>⚓</span>
      </div>
    );
  }
  const f = faceStyle(card);
  return (
    <div
      ref={ref}
      aria-label={f.sub ? `${f.label} ${f.sub}` : `Number ${f.label}`}
      className={`${s.box} relative flex shrink-0 flex-col items-center justify-center border-2 font-black shadow-md ${
        tone === "bust"
          ? "border-red-500 ring-2 ring-red-500"
          : tone === "held"
            ? "border-dashed border-amber-300 opacity-80"
            : "border-slate-900/30"
      }`}
      style={{ background: f.bg, color: f.ink }}
    >
      <span className={`${f.label.length > 2 ? s.long : s.text} leading-none`}>{f.label}</span>
      {f.sub && size === "lg" && (
        <span className={`${s.small} mt-0.5 font-semibold tracking-wide uppercase`}>{f.sub}</span>
      )}
      {tone === "bust" && (
        <span className="absolute -top-2 -right-2 rounded-full bg-red-600 px-1 text-[10px] text-white">
          ✕
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- hands

const STANDING: Record<Standing, { text: string; cls: string } | null> = {
  active: null,
  stayed: { text: "Banked", cls: "bg-emerald-600 text-white" },
  anchored: { text: "⚓ Anchored", cls: "bg-slate-500 text-white" },
  bust: { text: "💥 Overboard", cls: "bg-red-600 text-white" },
  fullHold: { text: "🏆 Full hold", cls: "bg-amber-400 text-slate-900" },
};

const EMPTY_HAND: Hand = {
  numbers: [],
  extras: [],
  lifeRing: null,
  standing: "active",
  bustCard: null,
};

/** What a hand shows and whether its outcome is still being revealed. */
interface HandProps {
  player: PlayerInfo;
  hand: Hand;
  /** Action cards waiting to be played after a Riptide. */
  held: Card[];
  total: number;
  /** Points banked this round, once the round is scored. */
  roundScore: number | null;
  /** The game is waiting on this player. */
  isUp: boolean;
  /** The viewer is about to target this player. */
  isTarget: boolean;
  /** Cards still face down (being revealed): don't give the outcome away. */
  hidden: (card: Card) => boolean;
  /** Cards that should play the flip animation. */
  flips: (card: Card) => boolean;
}

function handState({ hand, hidden }: Pick<HandProps, "hand" | "hidden">) {
  const revealing = [...hand.numbers, ...hand.extras, hand.bustCard, hand.lifeRing].some(
    (c) => c && hidden(c),
  );
  return {
    revealing,
    badge: revealing ? null : STANDING[hand.standing],
    out: !revealing && hand.standing === "bust",
    extras: [...hand.extras, ...(hand.lifeRing ? [hand.lifeRing] : [])],
  };
}

function NumberCards({
  hand,
  size,
  hidden,
  flips,
}: Pick<HandProps, "hand" | "hidden" | "flips"> & { size: "sm" | "md" }) {
  return (
    <>
      {hand.numbers.map((c) => (
        <CardFace key={c.id} card={c} size={size} faceDown={hidden(c)} flip={flips(c)} />
      ))}
      {hand.bustCard && (
        <CardFace
          card={hand.bustCard}
          size={size}
          faceDown={hidden(hand.bustCard)}
          flip={flips(hand.bustCard)}
          tone="bust"
        />
      )}
    </>
  );
}

function ExtraCards({
  cards,
  held,
  size,
  hidden,
  flips,
}: Pick<HandProps, "held" | "hidden" | "flips"> & { cards: Card[]; size: "sm" | "md" }) {
  return (
    <>
      {cards.map((c) => (
        <CardFace key={c.id} card={c} size={size} faceDown={hidden(c)} flip={flips(c)} />
      ))}
      {held.map((c) => (
        <CardFace
          key={c.id}
          card={c}
          size={size}
          faceDown={hidden(c)}
          flip={flips(c)}
          tone="held"
        />
      ))}
    </>
  );
}

/** Seven pips, one per different number: how close you are to a Full hold. */
function HoldProgress({ count, color }: { count: number; color: string }) {
  return (
    <div className="flex items-center gap-2" aria-label={`${count} of ${FULL_HOLD} different`}>
      <div className="flex gap-1">
        {Array.from({ length: FULL_HOLD }, (_, i) => (
          <span
            key={i}
            className="h-1.5 w-4 rounded-full"
            style={{ background: i < count ? color : "#334155" }}
          />
        ))}
      </div>
      <span className="text-[11px] text-slate-400">
        {count}/{FULL_HOLD} for a Full hold
      </span>
    </div>
  );
}

/** The viewer's own hand: big, in their colour, with their odds. */
function YourHold(props: HandProps & { risk: ReactNode }) {
  const { player, hand, held, total, roundScore, isUp, isTarget, hidden, flips, risk } = props;
  const { revealing, badge, out, extras } = handState(props);
  const [score, scoreLabel] =
    roundScore !== null
      ? [`+${roundScore}`, "this round"]
      : revealing
        ? ["?", "in hold"]
        : out
          ? ["0", "overboard"]
          : [`${handScore(hand)}`, hand.standing === "active" ? "in hold" : "banked"];
  return (
    <section
      aria-label="Your hold"
      className="rounded-2xl border-2 p-3 transition"
      style={{
        borderColor: isTarget ? "#fbbf24" : player.color,
        background: `linear-gradient(180deg, ${player.color}2e, #0f172a 70%)`,
        boxShadow: isTarget
          ? "0 0 0 4px #fbbf2466"
          : isUp
            ? `0 0 0 4px ${player.color}44, 0 8px 24px ${player.color}33`
            : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[11px] font-bold tracking-widest uppercase"
            style={{ color: player.color }}
          >
            Your hold
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
            <span className="truncate">{player.name}</span>
            {badge && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.cls}`}>
                {badge.text}
              </span>
            )}
            {isUp && !badge && (
              <span className="animate-pulse rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-900">
                Your move
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`text-3xl leading-none font-black ${
              roundScore !== null ? "text-amber-300" : out ? "text-red-400" : "text-white"
            }`}
          >
            {score}
          </p>
          <p className="text-[11px] text-slate-400">{scoreLabel}</p>
          <p className="text-xs text-slate-300">{total} total</p>
        </div>
      </div>

      <div
        className={`mt-2 flex min-h-14 flex-wrap items-center gap-1.5 ${out ? "opacity-70" : ""}`}
      >
        <NumberCards hand={hand} size="md" hidden={hidden} flips={flips} />
        {hand.numbers.length === 0 && !hand.bustCard && (
          <span className="text-sm text-slate-500">No numbers yet</span>
        )}
      </div>
      {hand.standing !== "bust" && hand.standing !== "fullHold" && (
        <div className="mt-2">
          <HoldProgress count={hand.numbers.length} color={player.color} />
        </div>
      )}
      {extras.length + held.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-700/60 pt-2">
          <ExtraCards cards={extras} held={held} size="md" hidden={hidden} flips={flips} />
        </div>
      )}
      {risk}
    </section>
  );
}

/** Someone else's hand: one compact row. */
function RivalLane(props: HandProps) {
  const { player, hand, held, total, roundScore, isUp, isTarget, hidden, flips } = props;
  const { revealing, badge, out, extras } = handState(props);
  return (
    <li
      className={`rounded-xl border-2 bg-slate-900/70 px-2 py-1.5 transition ${out ? "opacity-60" : ""}`}
      style={{
        borderColor: isTarget ? "#fbbf24" : isUp ? player.color : "#1e293b",
        boxShadow: isTarget ? "0 0 0 3px #fbbf2466" : undefined,
      }}
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: player.color }} />
        <span className="truncate font-semibold">
          {isUp && "▶ "}
          {player.name}
        </span>
        {badge && (
          <span className={`rounded-full px-1.5 py-px text-[10px] font-bold ${badge.cls}`}>
            {badge.text}
          </span>
        )}
        <span className="ml-auto shrink-0 text-right text-xs text-slate-400">
          {roundScore !== null ? (
            <span className="font-bold text-amber-300">+{roundScore} · </span>
          ) : (
            !revealing &&
            hand.standing !== "bust" && (
              <span className="text-slate-200">{handScore(hand)} in hold · </span>
            )
          )}
          {total} pts
        </span>
      </div>
      <div className="mt-1 flex min-h-11 flex-wrap items-center gap-1">
        <NumberCards hand={hand} size="sm" hidden={hidden} flips={flips} />
        {extras.length + held.length > 0 && (
          <span className="mx-0.5 h-8 w-px bg-slate-700" aria-hidden />
        )}
        <ExtraCards cards={extras} held={held} size="sm" hidden={hidden} flips={flips} />
        {hand.numbers.length + extras.length === 0 && !hand.bustCard && (
          <span className="text-xs text-slate-600">no cards</span>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- deck and odds

function CardCount({ view, viewer }: { view: View; viewer: PlayerId | "spectator" }) {
  const { counts } = nextCardOdds(view);
  const mine = new Set(
    (view.hands[viewer]?.numbers ?? []).map((c) => (c.kind === "number" ? c.value : -1)),
  );
  return (
    <div className="w-full">
      <p className="mb-1 text-center text-[10px] tracking-wide text-slate-500 uppercase">
        Numbers left in the deck · <span className="text-red-400">red = you have it</span>
      </p>
      <div className="grid grid-cols-13 gap-0.5">
        {NUMBER_VALUES.map((v) => (
          <div
            key={v}
            className={`flex flex-col items-center rounded py-0.5 ${
              mine.has(v) ? "bg-red-950 ring-1 ring-red-500/60" : "bg-slate-800"
            }`}
          >
            <span className="text-[11px] font-bold" style={{ color: NUMBER_INK[v] }}>
              {v}
            </span>
            <span className={`text-[10px] ${counts[v] ? "text-slate-300" : "text-slate-600"}`}>
              {counts[v]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskMeter({ view, viewer }: { view: View; viewer: PlayerId }) {
  const hand = view.hands[viewer];
  if (!hand) return null;
  const risk = bustChance(view, viewer);
  const pct = Math.round(risk * 100);
  const color = risk < 0.2 ? "#34d399" : risk < 0.4 ? "#fbbf24" : "#f87171";
  return (
    <div className="mt-2 rounded-xl bg-slate-950/60 px-3 py-2">
      <div className="flex items-center gap-3 text-xs">
        <span className="shrink-0 text-slate-300">Duplicate risk</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
        <span className="w-10 text-right text-base font-black" style={{ color }}>
          {pct}%
        </span>
      </div>
      {hand.lifeRing && risk > 0 && (
        <p className="mt-1 text-xs text-rose-300">🛟 Your Life Ring would save you once.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- quick reference

const REFERENCE: { cards: Card[]; name: string; effect: ReactNode }[] = [
  {
    cards: [{ id: -1, kind: "number", value: 7 }],
    name: "Number 0–12",
    effect: (
      <>
        Worth its value. <b className="text-red-300">Same number twice = overboard</b>, 0 points.
      </>
    ),
  },
  {
    cards: [{ id: -1, kind: "bonus", value: 4 }],
    name: "Bounty",
    effect: "+2 to +10, added to your score.",
  },
  {
    cards: [{ id: -1, kind: "double" }],
    name: "Double",
    effect: "Doubles your numbers (not bounties).",
  },
  {
    cards: [{ id: -1, kind: "action", action: "anchor" }],
    name: "Anchor",
    effect: "Freezes a player: they bank now and sit out the round.",
  },
  {
    cards: [{ id: -1, kind: "action", action: "riptide" }],
    name: "Riptide",
    effect: `A player must take the next ${RIPTIDE_CARDS} cards, one by one.`,
  },
  {
    cards: [{ id: -1, kind: "action", action: "lifeRing" }],
    name: "Life Ring",
    effect: "Cancels one duplicate. One each; a spare goes to someone else.",
  },
];

const REMINDERS: [string, ReactNode][] = [
  ["🏆", `${FULL_HOLD} different numbers: +${FULL_HOLD_BONUS} and the round ends at once.`],
  ["🎯", "⚓ and 🌊 go to anyone still in the round, you included."],
  ["🧮", `Score: numbers, ×2, then + bounties, then +${FULL_HOLD_BONUS}.`],
  ["♻️", "Used cards stay out until the deck runs out, then get reshuffled."],
];

function QuickReference() {
  return (
    <section aria-label="Card reference" className="rounded-xl bg-slate-900/60 p-2.5">
      <table className="w-full border-separate border-spacing-y-1 text-xs">
        <tbody>
          {REFERENCE.map((row) => (
            <tr key={row.name}>
              <td className="w-8 pr-2 align-middle">
                {row.cards.map((c, i) => (
                  <CardFace key={i} card={c} size="xs" />
                ))}
              </td>
              <th
                scope="row"
                className="pr-2 text-left align-middle font-semibold whitespace-nowrap text-slate-200"
              >
                {row.name}
              </th>
              <td className="align-middle text-slate-400">{row.effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-1.5 grid gap-1 border-t border-slate-800 pt-2 text-xs text-slate-400">
        {REMINDERS.map(([icon, text]) => (
          <li key={icon} className="flex gap-2">
            <span aria-hidden>{icon}</span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- board

export default function Board({
  view,
  viewer,
  highlight,
  proposed,
  revealing,
}: BoardProps<View, Move>) {
  const fresh = new Set(highlight.filter((h) => h.startsWith("card-")));
  const hidden = (c: Card) => revealing && fresh.has(`card-${c.id}`);
  const flips = (c: Card) => highlight.includes(`card-${c.id}`);
  const up = decider(view);
  const draws = view.events.flatMap((e) => (e.type === "draw" ? [e] : []));
  const spotlight = draws[draws.length - 1];
  const nameOf = (id: PlayerId) =>
    id === viewer ? "You" : (view.players.find((p) => p.id === id)?.name ?? "?");
  const heldBy = (id: PlayerId) =>
    view.tasks.flatMap((t) =>
      t.type === "riptide" && t.player === id
        ? t.held
        : t.type === "held" && t.player === id
          ? t.cards
          : [],
    );
  const pendingCard = view.pending?.card ?? null;
  const target = proposed?.type === "target" ? proposed.target : null;
  const showScores = !revealing && (view.phase === "roundOver" || view.phase === "over");
  const myTurn =
    !revealing && view.phase === "play" && up === viewer && !view.pending && viewer !== "spectator";
  const dealer = view.players[view.dealer];

  const handProps = (p: PlayerInfo): HandProps => ({
    player: p,
    hand: view.hands[p.id] ?? EMPTY_HAND,
    held: heldBy(p.id),
    total: view.totals[p.id] ?? 0,
    roundScore: showScores ? (view.roundScores?.[p.id] ?? 0) : null,
    isUp: !revealing && up === p.id,
    isTarget: target === p.id,
    hidden,
    flips,
  });

  // Everyone else in turn order after you.
  const meIndex = view.players.findIndex((p) => p.id === viewer);
  const me = view.players[meIndex];
  const others = view.players
    .map((_, i) => view.players[(i + Math.max(meIndex, 0)) % view.players.length]!)
    .filter((p) => p.id !== viewer);

  const lastAction = pendingCard && !revealing ? pendingCard : (spotlight?.card ?? null);
  const caption =
    pendingCard && !revealing
      ? `${nameOf(view.pending!.player)} ${view.pending!.player === viewer ? "play" : "plays"} it`
      : spotlight
        ? `${nameOf(spotlight.player)}${spotlight.via === "riptide" ? " · riptide" : ""}`
        : "No card yet";

  // One column on phones (in `order`), two side by side on wide screens.
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-3 @2xl:grid @2xl:max-w-6xl @2xl:grid-cols-[24rem_1fr] @2xl:items-start @2xl:gap-x-6 @2xl:px-6">
      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {/* Deck and the card just drawn */}
        <div className="order-1 flex items-center gap-3 rounded-2xl bg-gradient-to-b from-sky-950 to-slate-900 p-2.5">
          <div className="flex flex-col items-center gap-0.5">
            <div className="relative">
              <div className="absolute top-1 left-1">
                <CardFace card={null} size="md" />
              </div>
              <CardFace card={null} size="md" />
            </div>
            <span className="text-[10px] text-slate-400">{view.drawCount} left</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <CardFace
              key={lastAction?.id ?? "none"}
              card={lastAction}
              size="lg"
              faceDown={lastAction ? hidden(lastAction) : false}
              flip
            />
            <span className="max-w-24 truncate text-[10px] text-slate-400">{caption}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">Round {view.round}</span>
            <span>
              {dealer && `${nameOf(dealer.id)} ${dealer.id === viewer ? "deal" : "deals"}`}
            </span>
            <span>First to {view.config.targetScore}</span>
            <span>{view.discardPile.length} discarded</span>
          </div>
        </div>

        {showScores && (
          <div className="order-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-2 text-center">
            <p className="text-sm font-bold text-amber-200">
              {view.phase === "over" ? "Final round scored" : `Round ${view.round} scored`}
            </p>
            <p className="text-xs text-amber-100/70">
              Cards stay on the table until the next deal.
            </p>
          </div>
        )}

        {me && (
          <div className="order-3">
            <YourHold
              {...handProps(me)}
              risk={myTurn ? <RiskMeter view={view} viewer={me.id} /> : null}
            />
          </div>
        )}

        <div className="order-5">
          <CardCount view={view} viewer={viewer} />
        </div>
      </div>

      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        <section aria-label="Other players" className="order-4 flex flex-col gap-1.5">
          <p className="px-1 text-[10px] tracking-wide text-slate-500 uppercase">
            {me ? "Other players" : "Players"}
          </p>
          <ul className="grid gap-1.5 @2xl:grid-cols-2">
            {others.map((p) => (
              <RivalLane key={p.id} {...handProps(p)} />
            ))}
          </ul>
        </section>

        <div className="order-6">
          <QuickReference />
        </div>
      </div>
    </div>
  );
}
