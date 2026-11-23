import {
  activePlayers,
  createDeck,
  createTurnOrder,
  currentPlayer,
  drawCards,
  eliminate,
  nextTurn,
  type TurnOrder,
  isMove,
} from "@utopia/kit";
import type {
  ActionDescription,
  GameResult,
  GameStatus,
  LegalMove,
  MoveContext,
  PlayerId,
  PlayerInfo,
  SetupContext,
  Viewer,
} from "@utopia/shared";
import type { Config } from "./config.js";

/*
 * Dinner Dash: a cooperative memory game.
 *
 * - Each level, the order taker reads out an order of (level × players) cards, then
 *   shuffles them and deals them out evenly. Everyone sees only their own cards.
 * - In turn, starting left of the order taker, a player says one item out loud. Anyone
 *   else holding it serves it from their hand into the pool (if several do, the first
 *   one clockwise from the caller). If nobody does, the caller says so and loses their
 *   star: they can't call again this level. Calls are spoken and checked by the
 *   players; the game only enforces who may serve and who serves first.
 * - The level is cleared once enough players have empty hands (1 with 2 players,
 *   2 with 3–4, 3 with 5–6). The order taker then moves left and the next order is
 *   bigger. Clear every level to win; if everyone runs out of stars, the rush wins.
 * - With 2 players, everyone has 2 stars.
 */

// ---------------------------------------------------------------- the menu

export type Category = "coffee" | "tea" | "cold" | "bakery" | "kitchen";

export const CATEGORIES: { id: Category; name: string }[] = [
  { id: "coffee", name: "Coffee" },
  { id: "tea", name: "Tea" },
  { id: "cold", name: "Cold drinks" },
  { id: "bakery", name: "Bakery" },
  { id: "kitchen", name: "Kitchen" },
];

export interface MenuItem {
  name: string;
  category: Category;
}

const items = (category: Category, names: string[]): MenuItem[] =>
  names.map((name) => ({ name, category }));

/** 42 items, many of them easy to mix up. Each is printed on COPIES cards. */
export const MENU: readonly MenuItem[] = [
  ...items("coffee", [
    "Espresso",
    "Double Espresso",
    "Americano",
    "Iced Americano",
    "Latte",
    "Iced Latte",
    "Oat Latte",
    "Cappuccino",
    "Dry Cappuccino",
    "Flat White",
    "Mocha",
    "White Mocha",
  ]),
  ...items("tea", [
    "Green Tea",
    "Iced Green Tea",
    "Black Tea",
    "Milk Tea",
    "Chai Latte",
    "Iced Chai",
    "Matcha Latte",
    "Mint Tea",
  ]),
  ...items("cold", [
    "Lemonade",
    "Pink Lemonade",
    "Orange Juice",
    "Apple Juice",
    "Strawberry Smoothie",
    "Mango Smoothie",
    "Chocolate Milk",
    "Sparkling Water",
  ]),
  ...items("bakery", [
    "Croissant",
    "Almond Croissant",
    "Chocolate Croissant",
    "Blueberry Muffin",
    "Lemon Muffin",
    "Cinnamon Roll",
    "Plain Bagel",
    "Sesame Bagel",
  ]),
  ...items("kitchen", [
    "Pancakes",
    "Waffles",
    "Avocado Toast",
    "Cheese Toastie",
    "Fruit Cup",
    "Yogurt Bowl",
  ]),
];

export const COPIES = 2;
export const MAX_LEVEL = 7;

export interface OrderCard {
  id: number;
  /** Index into MENU. */
  item: number;
}

/** All 84 order cards. */
export function fullDeck(): OrderCard[] {
  return MENU.flatMap((_, item) =>
    Array.from({ length: COPIES }, (_, copy) => ({ id: item * COPIES + copy, item })),
  );
}

export const itemName = (item: number) => MENU[item]?.name ?? "?";

// ---------------------------------------------------------------- state

/** Stars per player: wrong calls you can survive each level. */
export const starsPerPlayer = (playerCount: number) => (playerCount === 2 ? 2 : 1);

/** How many players must empty their hands to clear a level. */
export const handsToEmpty = (playerCount: number) =>
  playerCount <= 2 ? 1 : playerCount <= 4 ? 2 : 3;

export type Phase = "ready" | "order" | "play" | "won" | "lost";

export interface Served {
  card: OrderCard;
  /** Who called it. */
  caller: PlayerId;
  /** Who held it. */
  holder: PlayerId;
}

export type GameEvent =
  | { type: "takeOrder"; player: PlayerId; level: number; size: number }
  | { type: "handOut"; player: PlayerId; each: number }
  /** `offeredBy` tapped the card, but `holder` was first in line clockwise. */
  | { type: "served"; caller: PlayerId; holder: PlayerId; card: OrderCard; offeredBy: PlayerId }
  | { type: "missed"; caller: PlayerId; starsLeft: number }
  | { type: "levelCleared"; level: number }
  | { type: "won" }
  | { type: "lost"; level: number };

/** What everyone can see. */
export interface Table {
  config: Config;
  players: PlayerInfo[];
  phase: Phase;
  level: number;
  /** Seat index of this level's order taker. */
  orderTaker: number;
  /** Whose call it is (players out of stars are eliminated). */
  turn: TurnOrder;
  stars: Record<PlayerId, number>;
  /** The pool: cards served face up this level, in order. */
  served: Served[];
  /** Levels cleared so far. */
  cleared: number;
}

export interface State extends Table {
  /** The order as read out. Hidden once it's handed out. */
  order: OrderCard[];
  hands: Record<PlayerId, OrderCard[]>;
  /** What the last move did. */
  events: GameEvent[];
}

export interface View extends Table {
  /** The order being read out: only while memorizing. */
  order: OrderCard[] | null;
  /** The viewer's own cards. */
  hand: OrderCard[];
  handCounts: Record<PlayerId, number>;
  /** Everyone's unserved cards, once the game is over. */
  leftovers: Record<PlayerId, OrderCard[]> | null;
}

export type Move =
  | { type: "takeOrder" }
  | { type: "handOut" }
  /** Serve a card from your hand for the current caller's spoken order. */
  | { type: "serve"; card: number }
  /** The caller: nobody had what I ordered. */
  | { type: "miss" };

// ---------------------------------------------------------------- helpers

export function setup(ctx: SetupContext, config: Config): State {
  const n = ctx.players.length;
  const each = starsPerPlayer(n);
  const seats = ctx.players.map((p) => p.id);
  return {
    config,
    players: ctx.players,
    phase: "ready",
    level: 1,
    orderTaker: 0,
    // Replaced when the first order is handed out.
    turn: createTurnOrder(seats, 1 % n),
    stars: Object.fromEntries(seats.map((id) => [id, each])),
    served: [],
    cleared: 0,
    order: [],
    hands: Object.fromEntries(seats.map((id) => [id, []])),
    events: [],
  };
}

const ids = (t: Pick<Table, "players">) => t.players.map((p) => p.id);

export const nameOf = (t: Pick<Table, "players">, id: PlayerId) =>
  t.players.find((p) => p.id === id)?.name ?? id;

export const orderTakerId = (t: Pick<Table, "players" | "orderTaker">) =>
  t.players[t.orderTaker]?.id ?? "";

/** Cards in this level's order. */
export const orderSize = (t: Pick<Table, "level" | "players">) => t.level * t.players.length;

/** Who the game is waiting on, if anyone. */
export function decider(t: Table): PlayerId | null {
  switch (t.phase) {
    case "ready":
    case "order":
      return orderTakerId(t);
    case "play":
      return currentPlayer(t.turn);
    default:
      return null;
  }
}

/** Players whose hands are empty (they count towards clearing the level). */
export function emptyHands(t: Table, counts: Record<PlayerId, number>): PlayerId[] {
  return ids(t).filter((id) => (counts[id] ?? 0) === 0);
}

const countsOf = (s: State) =>
  Object.fromEntries(ids(s).map((id) => [id, s.hands[id]?.length ?? 0]));

/** Players in seat order starting after `from`, not including them. */
function clockwiseAfter(t: Table, from: PlayerId): PlayerId[] {
  const all = ids(t);
  const i = all.indexOf(from);
  return all.slice(i + 1).concat(all.slice(0, i));
}

// ---------------------------------------------------------------- moves

export function getLegalMoves(state: State, player: PlayerId): LegalMove<Move>[] {
  const { phase } = state;
  if ((phase === "ready" || phase === "order") && decider(state) === player) {
    return phase === "ready"
      ? [{ move: { type: "takeOrder" }, label: `Take the level ${state.level} order` }]
      : [{ move: { type: "handOut" }, label: "Hand out the order" }];
  }
  if (phase !== "play" || !state.hands[player]) return [];

  const moves: LegalMove<Move>[] = [];
  const hand = state.hands[player] ?? [];
  if (currentPlayer(state.turn) === player) {
    moves.push({ move: { type: "miss" }, label: "Nobody has it", where: "board" });
  } else {
    // Anyone but the caller may serve, even out of stars. One move per item.
    const seen = new Set<number>();
    for (const card of hand) {
      if (seen.has(card.item)) continue;
      seen.add(card.item);
      moves.push({
        move: { type: "serve", card: card.id },
        label: `Serve ${itemName(card.item)}`,
        where: "board",
      });
    }
  }
  return moves;
}

export function validateMove(state: State, player: PlayerId, move: Move): string | null {
  if (!isMove(move)) return "That move isn't allowed.";
  if (state.phase === "won" || state.phase === "lost") return "The game is over.";
  if (!state.players.some((p) => p.id === player)) return "You're not in this game.";
  const key = JSON.stringify(move);
  const legal = getLegalMoves(state, player).some((m) => JSON.stringify(m.move) === key);
  if (legal) return null;
  if (state.phase === "play" && move.type === "miss") return "Only the caller can say that.";
  if (state.phase === "play" && move.type === "serve" && currentPlayer(state.turn) === player) {
    return "You can't serve your own order.";
  }
  return "That move isn't allowed right now.";
}

function startLevel(s: State, rng: MoveContext["rng"]) {
  const each = starsPerPlayer(s.players.length);
  for (const id of ids(s)) s.stars[id] = each;
  const { cards } = drawCards(createDeck(fullDeck(), rng), rng, orderSize(s));
  s.order = cards;
  s.hands = Object.fromEntries(ids(s).map((id) => [id, []]));
  s.served = [];
  s.phase = "order";
}

function handOut(s: State, rng: MoveContext["rng"]) {
  const seats = ids(s);
  const firstSeat = (s.orderTaker + 1) % seats.length;
  rng.shuffle(s.order).forEach((card, i) => {
    s.hands[seats[(firstSeat + i) % seats.length]!]!.push(card);
  });
  s.turn = createTurnOrder(seats, firstSeat);
  s.phase = "play";
}

function finishLevel(s: State) {
  s.cleared = s.level;
  s.events.push({ type: "levelCleared", level: s.level });
  if (s.level >= s.config.levels) {
    s.phase = "won";
    s.events.push({ type: "won" });
    return;
  }
  s.level += 1;
  s.orderTaker = (s.orderTaker + 1) % s.players.length;
  s.phase = "ready";
}

/** `player` serves this card for the caller; the first holder clockwise actually does. */
function serve(s: State, player: PlayerId, cardId: number) {
  const caller = currentPlayer(s.turn);
  const item = s.hands[player]!.find((c) => c.id === cardId)!.item;
  const holder = clockwiseAfter(s, caller).find((id) => s.hands[id]?.some((c) => c.item === item))!;
  const hand = s.hands[holder]!;
  const at =
    holder === player
      ? hand.findIndex((c) => c.id === cardId)
      : hand.findIndex((c) => c.item === item);
  const card = hand.splice(at, 1)[0]!;
  s.served.push({ card, caller, holder });
  s.events.push({ type: "served", caller, holder, card, offeredBy: player });
  if (emptyHands(s, countsOf(s)).length >= handsToEmpty(s.players.length)) {
    finishLevel(s);
    return;
  }
  s.turn = nextTurn(s.turn);
}

/** Nobody had the caller's order: they lose a star. */
function miss(s: State, caller: PlayerId) {
  const starsLeft = (s.stars[caller] ?? 1) - 1;
  s.stars[caller] = starsLeft;
  s.events.push({ type: "missed", caller, starsLeft });
  if (starsLeft === 0) s.turn = eliminate(s.turn, caller);
  if (activePlayers(s.turn).length === 0) {
    s.phase = "lost";
    s.events.push({ type: "lost", level: s.level });
    return;
  }
  s.turn = nextTurn(s.turn);
}

export function applyMove(state: State, player: PlayerId, move: Move, ctx: MoveContext): State {
  const s = structuredClone(state);
  s.events = [];
  switch (move.type) {
    case "takeOrder":
      startLevel(s, ctx.rng);
      s.events.push({ type: "takeOrder", player, level: s.level, size: s.order.length });
      break;
    case "handOut":
      handOut(s, ctx.rng);
      s.events.push({ type: "handOut", player, each: s.level });
      break;
    case "serve":
      serve(s, player, move.card);
      break;
    case "miss":
      miss(s, player);
      break;
  }
  return s;
}

// ---------------------------------------------------------------- views and text

export function getPlayerView(state: State, viewer: Viewer): View {
  const { order, hands, events: _events, ...table } = state;
  const over = state.phase === "won" || state.phase === "lost";
  return {
    ...table,
    order: state.phase === "order" ? order : null,
    hand: viewer === "spectator" ? [] : (hands[viewer] ?? []),
    handCounts: Object.fromEntries(ids(state).map((id) => [id, hands[id]?.length ?? 0])),
    leftovers: over ? hands : null,
  };
}

export function getResult(state: State): GameResult | null {
  const levels = state.config.levels;
  if (state.phase === "won") {
    return {
      winners: ids(state),
      text: `Everyone wins! You cleared all ${levels} level${levels === 1 ? "" : "s"}.`,
    };
  }
  if (state.phase === "lost") {
    return {
      winners: [],
      text: `The rush wins on level ${state.level}. You cleared ${state.cleared} of ${levels}.`,
    };
  }
  return null;
}

export function getStatus(state: State, viewer: Viewer): GameStatus {
  const who = decider(state);
  if (!who) return { text: getResult(state)?.text ?? "Game over", activePlayers: [] };
  const you = viewer === who;
  const name = nameOf(state, who);
  let text: string;
  if (state.phase === "ready") {
    text = you
      ? `Take the level ${state.level} order (${orderSize(state)} items)`
      : `Waiting for ${name} to take the level ${state.level} order`;
  } else if (state.phase === "order") {
    text = you
      ? "Memorize the order, then hand it out"
      : `Memorize the order! ${name} hands it out soon`;
  } else if (you) {
    text = "Your turn: say an order out loud";
  } else {
    const holding = viewer !== "spectator" && (state.hands[viewer]?.length ?? 0) > 0;
    text = holding ? `${name} is ordering: serve it if you have it` : `${name} is ordering`;
  }
  return { text, activePlayers: [who] };
}

function eventText(state: State, e: GameEvent, viewer: Viewer): string {
  const name = (id: PlayerId) => (id === viewer ? "you" : nameOf(state, id));
  const Name = (id: PlayerId) => (id === viewer ? "You" : nameOf(state, id));
  const whose = (id: PlayerId) => (id === viewer ? "your" : `${nameOf(state, id)}'s`);
  switch (e.type) {
    case "takeOrder":
      return `${Name(e.player)} took the level ${e.level} order: ${e.size} items. Memorize it!`;
    case "handOut":
      return `${Name(e.player)} handed out the order: ${e.each} card${e.each === 1 ? "" : "s"} each.`;
    case "served": {
      const text = `${Name(e.holder)} served ${itemName(e.card.item)} for ${name(e.caller)}.`;
      // Only the player who offered learns they were beaten to it (their hand stays secret).
      return e.offeredBy === viewer && e.holder !== viewer
        ? `${text} ${nameOf(state, e.holder)} was first in line, so you keep yours.`
        : text;
    }
    case "missed": {
      const lost =
        e.starsLeft === 0
          ? `${Name(e.caller)} ${e.caller === viewer ? "are" : "is"} out of stars.`
          : `${Name(e.caller)} ${e.caller === viewer ? "lose" : "loses"} a star (${e.starsLeft} left).`;
      return `Nobody had ${whose(e.caller)} order. ${lost}`;
    }
    case "levelCleared":
      return `Level ${e.level} cleared!`;
    case "won":
      return "Every level cleared. What a shift!";
    case "lost":
      return `Nobody has a star left. The rush wins on level ${e.level}.`;
  }
}

export function describeMove(
  _before: State,
  after: State,
  player: PlayerId,
  _move: Move,
  viewer: Viewer,
): ActionDescription {
  const text = after.events.map((e) => eventText(after, e, viewer)).join(" ");
  const desc: ActionDescription = { text };
  const ev = (type: GameEvent["type"]) => after.events.find((e) => e.type === type);

  const served = ev("served");
  if (served?.type === "served") desc.highlight = [`card-${served.card.id}`];
  if (ev("won")) return { ...desc, tone: "good", flash: "Shift complete!" };
  if (ev("lost")) return { ...desc, tone: "bad", flash: "The rush wins!" };
  const cleared = ev("levelCleared");
  if (cleared?.type === "levelCleared") {
    return { ...desc, tone: "good", flash: `Level ${cleared.level} cleared!` };
  }
  const missed = ev("missed");
  if (missed?.type === "missed") {
    const out = { ...desc, tone: "bad" as const, highlight: [`player-${player}`] };
    return missed.starsLeft === 0 ? { ...out, flash: "Out of stars!" } : out;
  }
  return desc;
}
