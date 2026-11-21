import {
  activePlayers,
  createDeck,
  createTurnOrder,
  currentPlayer,
  drawCards,
  eliminate,
  nextTurn,
  type TurnOrder,
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
 * Matchstick Glutton: a climbing card game with digital-clock numbers.
 *
 * - Cards show hex digits 0–F drawn with 7 segments. Play sets of 1–5 equal numbers,
 *   each set beating the last one (same size, stronger number), or pass. Passing makes
 *   you take a matchstick.
 * - You may turn a card upside down and add matchsticks to its segments to make another
 *   number (a 4 plus 2 sticks is a 9; an upside-down 3 is an E). Spent sticks go back.
 * - When everyone else has passed, the last player to play clears the trick and leads.
 * - The strongest number ends the trick at once: everyone else takes a matchstick.
 * - Five of a kind is a Revolution: the order flips (0 strongest, F weakest).
 * - You're out once you have no cards and no matchsticks. Out of cards but holding
 *   sticks, you return one per turn. Finishing order is the ranking.
 *
 * The changes follow digital-clock segments: a card can become any number whose
 * segments include all of its own (upright or upside down); each new segment costs one
 * matchstick. This reproduces every example in the rulebook.
 */

// ---------------------------------------------------------------- digits

export const SEGMENTS = ["a", "b", "c", "d", "e", "f", "g"] as const;
export type Segment = (typeof SEGMENTS)[number];

/** Lit segments of each value 0–15, standard 7-segment hex. */
export const DIGIT_SEGMENTS: readonly string[] = [
  "abcdef", // 0
  "bc", // 1
  "abdeg", // 2
  "abcdg", // 3
  "bcfg", // 4
  "acdfg", // 5
  "acdefg", // 6
  "abc", // 7
  "abcdefg", // 8
  "abcdfg", // 9
  "abcefg", // A
  "cdefg", // b
  "adef", // C
  "bcdeg", // d
  "adefg", // E
  "aefg", // F
];

export const VALUES = Array.from({ length: 16 }, (_, i) => i);
export const LABELS = "0123456789AbCdEF";
export const label = (v: number) => LABELS[v] ?? "?";

/** Turning a card upside down swaps top/bottom and left/right segments. */
const UPSIDE_DOWN: Record<Segment, Segment> = {
  a: "d",
  b: "e",
  c: "f",
  d: "a",
  e: "b",
  f: "c",
  g: "g",
};

export function segmentsOf(value: number, flipped = false): Segment[] {
  const segs = [...(DIGIT_SEGMENTS[value] ?? "")] as Segment[];
  return (flipped ? segs.map((s) => UPSIDE_DOWN[s]) : segs).sort();
}

/** The 14 printed card types (3 doubles as E and 6 as 9), 4 of each: 56 cards. */
export const PRINTED = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 15] as const;
export const COPIES = 4;

export interface Card {
  id: number;
  digit: number;
}

export function fullDeck(): Card[] {
  return PRINTED.flatMap((digit, t) =>
    Array.from({ length: COPIES }, (_, k) => ({ id: t * COPIES + k, digit })),
  );
}

export interface Change {
  flipped: boolean;
  /** Matchsticks added. */
  cost: number;
  /** Segments the matchsticks fill in (as seen after flipping). */
  added: Segment[];
}

/** The cheapest way to make `digit` show `value`, or null if it can't. */
export function changeTo(digit: number, value: number): Change | null {
  const target = segmentsOf(value);
  let best: Change | null = null;
  for (const flipped of [false, true]) {
    const segs = segmentsOf(digit, flipped);
    if (!segs.every((s) => target.includes(s))) continue;
    const added = target.filter((s) => !segs.includes(s));
    if (!best || added.length < best.cost) best = { flipped, cost: added.length, added };
  }
  return best;
}

// ---------------------------------------------------------------- state

export const STARTING_STICKS = 1;
export const MAX_SET = 5;
/** With 2 or 3 players everyone gets 15 cards; with more, the whole deck is dealt. */
export const SMALL_GAME_HAND = 15;

export interface PlayedCard {
  card: Card;
  flipped: boolean;
  added: Segment[];
}

export interface Play {
  player: PlayerId;
  value: number;
  cards: PlayedCard[];
}

export type GameEvent =
  | { type: "played"; play: Play; cost: number }
  | { type: "passed"; player: PlayerId }
  | { type: "returned"; player: PlayerId; sticksLeft: number }
  | { type: "revolution"; on: boolean }
  | { type: "unbeatable"; player: PlayerId; value: number }
  | { type: "cleared"; leader: PlayerId | null }
  | { type: "out"; player: PlayerId; place: number }
  | { type: "over" };

export interface Table {
  config: Config;
  players: PlayerInfo[];
  phase: "play" | "over";
  /** Whose turn; players who are out are eliminated. */
  turn: TurnOrder;
  sticks: Record<PlayerId, number>;
  /** Plays in the current trick, oldest first; empty when someone has to lead. */
  trick: Play[];
  /** Who passed since the last play. */
  passed: PlayerId[];
  /** True while 0 is strongest and F weakest. */
  revolution: boolean;
  /** Finishing order. */
  finished: PlayerId[];
}

export interface State extends Table {
  hands: Record<PlayerId, Card[]>;
  events: GameEvent[];
}

export interface View extends Table {
  hand: Card[];
  handCounts: Record<PlayerId, number>;
}

export type Move =
  { type: "play"; cards: number[]; value: number } | { type: "pass" } | { type: "return" };

export function setup(ctx: SetupContext, config: Config): State {
  const ids = ctx.players.map((p) => p.id);
  const n = ids.length;
  const dealer = ctx.rng.int(0, n - 1);
  let deck = createDeck(fullDeck(), ctx.rng);
  const hands: Record<PlayerId, Card[]> = Object.fromEntries(ids.map((id) => [id, []]));
  if (n <= 3) {
    for (const id of ids) {
      const drawn = drawCards(deck, ctx.rng, SMALL_GAME_HAND);
      deck = drawn.deck;
      hands[id] = drawn.cards;
    }
  } else {
    deck.drawPile.forEach((card, i) => hands[ids[(dealer + 1 + i) % n]!]!.push(card));
  }
  for (const id of ids) hands[id]!.sort((a, b) => a.digit - b.digit || a.id - b.id);
  return {
    config,
    players: ctx.players,
    phase: "play",
    turn: createTurnOrder(ids, dealer),
    sticks: Object.fromEntries(ids.map((id) => [id, STARTING_STICKS])),
    trick: [],
    passed: [],
    revolution: false,
    finished: [],
    hands,
    events: [],
  };
}

// ---------------------------------------------------------------- helpers

export const nameOf = (t: Pick<Table, "players">, id: PlayerId) =>
  t.players.find((p) => p.id === id)?.name ?? id;

/** Higher is stronger, under the current order. */
export const rankOf = (t: Pick<Table, "revolution">, value: number) =>
  t.revolution ? 15 - value : value;

export const strongest = (t: Pick<Table, "revolution">) => (t.revolution ? 0 : 15);

export const revolutionSize = (t: Pick<Table, "config">) =>
  t.config.revolution === "4 cards" ? 4 : 5;

export const top = (t: Pick<Table, "trick">): Play | undefined => t.trick[t.trick.length - 1];

/** Why this play isn't allowed, with the cost if it is. */
export function checkPlay(
  state: State,
  player: PlayerId,
  ids: readonly number[],
  value: number,
): { error: string } | { cost: number; cards: PlayedCard[] } {
  if (!Number.isInteger(value) || value < 0 || value > 15) return { error: "Pick a number." };
  const hand = state.hands[player] ?? [];
  if (ids.length < 1 || ids.length > MAX_SET) return { error: "Play 1 to 5 cards." };
  if (new Set(ids).size !== ids.length) return { error: "Each card only once." };
  const last = top(state);
  if (last) {
    if (ids.length !== last.cards.length) return { error: `Play ${last.cards.length} cards.` };
    if (rankOf(state, value) <= rankOf(state, last.value)) {
      return { error: `Beat ${label(last.value)} with a stronger number.` };
    }
  }
  const cards: PlayedCard[] = [];
  let cost = 0;
  for (const id of ids) {
    const card = hand.find((c) => c.id === id);
    if (!card) return { error: "That card isn't in your hand." };
    const change = changeTo(card.digit, value);
    if (!change) return { error: `A ${label(card.digit)} can't become ${label(value)}.` };
    cost += change.cost;
    cards.push({ card, flipped: change.flipped, added: change.added });
  }
  if (cost > (state.sticks[player] ?? 0)) {
    return { error: `That needs ${cost} matchsticks; you have ${state.sticks[player] ?? 0}.` };
  }
  return { cost, cards };
}

/** One sensible way to play each number at each allowed size (cheapest cards first). */
export function playOptions(state: State, player: PlayerId) {
  const hand = state.hands[player] ?? [];
  const sticks = state.sticks[player] ?? 0;
  const last = top(state);
  const sizes = last ? [last.cards.length] : [1, 2, 3, 4, 5];
  const out: { cards: number[]; value: number; cost: number }[] = [];
  for (const value of VALUES) {
    if (last && rankOf(state, value) <= rankOf(state, last.value)) continue;
    const able = hand
      .map((c) => ({ id: c.id, cost: changeTo(c.digit, value)?.cost }))
      .filter((c): c is { id: number; cost: number } => c.cost !== undefined)
      .sort((a, b) => a.cost - b.cost || a.id - b.id);
    for (const k of sizes) {
      if (able.length < k) continue;
      const picked = able.slice(0, k);
      const cost = picked.reduce((n, c) => n + c.cost, 0);
      if (cost <= sticks) out.push({ cards: picked.map((c) => c.id), value, cost });
    }
  }
  return out;
}

const sticksText = (n: number) => `${n} matchstick${n === 1 ? "" : "s"}`;

// ---------------------------------------------------------------- moves

export function getLegalMoves(state: State, player: PlayerId): LegalMove<Move>[] {
  if (state.phase !== "play" || currentPlayer(state.turn) !== player) return [];
  const hand = state.hands[player] ?? [];
  if (hand.length === 0) return [{ move: { type: "return" }, label: "Return a matchstick" }];
  const moves: LegalMove<Move>[] = playOptions(state, player).map((o) => ({
    move: { type: "play", cards: o.cards, value: o.value },
    label: `Play ${o.cards.length} × ${label(o.value)}${o.cost ? ` (${sticksText(o.cost)})` : ""}`,
    where: "board",
  }));
  if (state.trick.length > 0) {
    moves.push({ move: { type: "pass" }, label: "Pass (take a matchstick)" });
  }
  return moves;
}

export function validateMove(state: State, player: PlayerId, move: Move): string | null {
  if (state.phase === "over") return "The game is over.";
  if (currentPlayer(state.turn) !== player) return "It's not your turn.";
  const hand = state.hands[player] ?? [];
  switch (move.type) {
    case "play": {
      if (hand.length === 0) return "You have no cards: return a matchstick.";
      if (!Array.isArray(move.cards)) return "Pick some cards.";
      const res = checkPlay(state, player, move.cards, move.value);
      return "error" in res ? res.error : null;
    }
    case "pass":
      if (hand.length === 0) return "You have no cards: return a matchstick.";
      return state.trick.length === 0 ? "You're leading: play something." : null;
    case "return":
      return hand.length === 0 ? null : "You still have cards to play.";
    default:
      return "That move isn't allowed.";
  }
}

/** Out if no cards and no sticks; the game ends when one player is left. */
function checkOut(s: State, player: PlayerId) {
  if ((s.hands[player]?.length ?? 0) > 0 || (s.sticks[player] ?? 0) > 0) return;
  if (s.finished.includes(player)) return;
  s.finished.push(player);
  s.events.push({ type: "out", player, place: s.finished.length });
  s.turn = eliminate(s.turn, player);
  const left = activePlayers(s.turn);
  if (left.length <= 1) {
    s.finished.push(...left);
    s.phase = "over";
    s.events.push({ type: "over" });
  }
}

/** Clear the trick and give the lead to `leader`, or the next player still in after them. */
function clearTrick(s: State, leader: PlayerId) {
  s.trick = [];
  s.passed = [];
  const seats = s.turn.players;
  let i = seats.indexOf(leader);
  for (let k = 0; k < seats.length && s.turn.eliminated.includes(seats[i]!); k++) {
    i = (i + 1) % seats.length;
  }
  s.turn = { ...s.turn, current: i };
  s.events.push({ type: "cleared", leader: seats[i] ?? null });
}

/** After a pass or a returned stick: has everyone but the last player to play passed? */
function afterPass(s: State) {
  const last = top(s);
  if (!last) return;
  const others = activePlayers(s.turn).filter((id) => id !== last.player);
  if (others.every((id) => s.passed.includes(id))) clearTrick(s, last.player);
  else s.turn = nextTurn(s.turn);
}

export function applyMove(state: State, player: PlayerId, move: Move, _ctx: MoveContext): State {
  const s = structuredClone(state);
  s.events = [];
  switch (move.type) {
    case "play": {
      const res = checkPlay(s, player, move.cards, move.value);
      if ("error" in res) throw new Error(res.error);
      const wasStrongest = move.value === strongest(s);
      s.sticks[player] = (s.sticks[player] ?? 0) - res.cost;
      s.hands[player] = s.hands[player]!.filter((c) => !move.cards.includes(c.id));
      const play: Play = { player, value: move.value, cards: res.cards };
      s.trick.push(play);
      s.passed = [];
      s.events.push({ type: "played", play, cost: res.cost });
      const revolution = res.cards.length >= revolutionSize(s);
      if (revolution) {
        s.revolution = !s.revolution;
        s.events.push({ type: "revolution", on: s.revolution });
      }
      checkOut(s, player);
      if (s.phase === "over") break;
      if (wasStrongest && !revolution) {
        // Nothing beats it: everyone else takes a matchstick and the trick ends.
        for (const id of activePlayers(s.turn))
          if (id !== player) s.sticks[id] = (s.sticks[id] ?? 0) + 1;
        s.events.push({ type: "unbeatable", player, value: move.value });
        clearTrick(s, player);
      } else {
        s.turn = nextTurn(s.turn);
      }
      break;
    }
    case "pass":
      s.sticks[player] = (s.sticks[player] ?? 0) + 1;
      s.passed.push(player);
      s.events.push({ type: "passed", player });
      afterPass(s);
      break;
    case "return": {
      const left = (s.sticks[player] ?? 0) - 1;
      s.sticks[player] = left;
      s.events.push({ type: "returned", player, sticksLeft: left });
      const leading = s.trick.length === 0;
      if (!leading) s.passed.push(player);
      checkOut(s, player);
      if (s.phase === "over") break;
      if (leading)
        s.turn = nextTurn(s.turn); // the next player leads instead
      else afterPass(s);
      break;
    }
  }
  return s;
}

// ---------------------------------------------------------------- views and text

export function getPlayerView(state: State, viewer: Viewer): View {
  const { hands, events: _events, ...table } = state;
  return {
    ...table,
    hand: viewer === "spectator" ? [] : (hands[viewer] ?? []),
    handCounts: Object.fromEntries(state.players.map((p) => [p.id, hands[p.id]?.length ?? 0])),
  };
}

const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

export function getResult(state: State): GameResult | null {
  if (state.phase !== "over") return null;
  const first = state.finished[0];
  return {
    winners: first ? [first] : [],
    ranking: state.finished.map((player, i) => ({ player, score: i + 1 })),
    text: first ? `${nameOf(state, first)} got rid of everything first and wins!` : "Game over",
  };
}

export function getStatus(state: State, viewer: Viewer): GameStatus {
  if (state.phase === "over")
    return { text: getResult(state)?.text ?? "Game over", activePlayers: [] };
  const who = currentPlayer(state.turn);
  const you = viewer === who;
  const name = nameOf(state, who);
  const last = top(state);
  let text: string;
  if ((state.hands[who]?.length ?? 0) === 0) {
    text = you ? "No cards left: return a matchstick" : `${name} is returning a matchstick`;
  } else if (!last) {
    text = you ? "Your lead: play 1–5 cards of one number" : `${name} is leading`;
  } else {
    text = you
      ? `Beat ${last.cards.length} × ${label(last.value)}, or pass`
      : `Waiting for ${name}`;
  }
  return { text, activePlayers: [who] };
}

function eventText(state: State, e: GameEvent, viewer: Viewer): string {
  const Name = (id: PlayerId) => (id === viewer ? "You" : nameOf(state, id));
  const verb = (id: PlayerId, you: string, them: string) => (id === viewer ? you : them);
  switch (e.type) {
    case "played":
      return `${Name(e.play.player)} played ${e.play.cards.length} × ${label(e.play.value)}${
        e.cost ? ` using ${sticksText(e.cost)}` : ""
      }.`;
    case "passed":
      return `${Name(e.player)} passed and ${verb(e.player, "take", "takes")} a matchstick.`;
    case "returned":
      return `${Name(e.player)} returned a matchstick (${e.sticksLeft} left).`;
    case "revolution":
      return e.on
        ? "Revolution! 0 is now strongest, F weakest."
        : "Revolution again! Back to normal: F is strongest.";
    case "unbeatable":
      return `${label(e.value)} can't be beaten: everyone else takes a matchstick.`;
    case "cleared":
      return e.leader
        ? `Trick over. ${Name(e.leader)} ${verb(e.leader, "lead", "leads")}.`
        : "Trick over.";
    case "out":
      return `${Name(e.player)} ${verb(e.player, "are", "is")} out: ${ordinal(e.place)} place!`;
    case "over":
      return getResult(state)?.text ?? "Game over.";
  }
}

export function describeMove(
  _before: State,
  after: State,
  player: PlayerId,
  _move: Move,
  viewer: Viewer,
): ActionDescription {
  const desc: ActionDescription = {
    text: after.events.map((e) => eventText(after, e, viewer)).join(" "),
  };
  const has = (t: GameEvent["type"]) => after.events.some((e) => e.type === t);
  if (has("over")) {
    const won = after.finished[0] === viewer;
    return {
      ...desc,
      tone: won ? "good" : "normal",
      flash: won ? "You win!" : `${nameOf(after, after.finished[0]!)} wins!`,
    };
  }
  if (has("revolution")) return { ...desc, tone: "good", flash: "Revolution!" };
  const out = after.events.find((e) => e.type === "out");
  if (out?.type === "out") {
    return {
      ...desc,
      tone: "good",
      flash: out.player === viewer ? "You're out!" : `${nameOf(after, out.player)} is out!`,
    };
  }
  if (has("unbeatable")) return { ...desc, tone: player === viewer ? "good" : "bad" };
  return desc;
}
