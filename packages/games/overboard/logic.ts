import {
  createDeck,
  createTurnOrder,
  currentPlayer,
  discardCards,
  drawCards,
  nextTurn,
  type Deck,
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
 * Overboard: a push-your-luck card game.
 *
 * - The deck has one 0, one 1, two 2s ... twelve 12s, plus score bonus and action cards.
 * - Each round, every player is dealt one card. Then, in turn, players Hit (take a card)
 *   or Stay (bank this round's points and sit out the rest of it).
 * - A second card with the same number sends you overboard: no points this round.
 * - Seven different numbers is a Full Hold: +15 and the round ends for everyone.
 * - Action cards are played on any active player, yourself included:
 *   Anchor (they bank and are out), Riptide (they must take 3 cards),
 *   Life Ring (keep it; it cancels one duplicate).
 * - After the round where someone reaches the target score, the highest total wins.
 */

// ---------------------------------------------------------------- cards

export type ActionKind = "anchor" | "riptide" | "lifeRing";

export type Card =
  | { id: number; kind: "number"; value: number }
  | { id: number; kind: "bonus"; value: number }
  | { id: number; kind: "double" }
  | { id: number; kind: "action"; action: ActionKind };

export const NUMBER_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const BONUS_VALUES = [2, 4, 6, 8, 10] as const;
export const ACTION_COPIES = 3;
export const FULL_HOLD = 7;
export const FULL_HOLD_BONUS = 15;
export const RIPTIDE_CARDS = 3;
/** How long a drawn card stays face down before it is revealed. */
export const FLIP_MS = 700;

/** How many copies of a number are in the deck: one 0, one 1, two 2s ... twelve 12s. */
export const copiesOf = (value: number) => Math.max(1, value);

/** A card before it gets its id. */
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
type CardSpec = WithoutId<Card>;

/** The full 94-card deck, unshuffled. */
export function fullDeck(): Card[] {
  const cards: Card[] = [];
  const add = (card: CardSpec) => cards.push({ ...card, id: cards.length } as Card);
  for (const value of NUMBER_VALUES) {
    for (let i = 0; i < copiesOf(value); i++) add({ kind: "number", value });
  }
  for (const value of BONUS_VALUES) add({ kind: "bonus", value });
  add({ kind: "double" });
  for (const action of ["anchor", "riptide", "lifeRing"] as const) {
    for (let i = 0; i < ACTION_COPIES; i++) add({ kind: "action", action });
  }
  return cards;
}

export const ACTION_NAMES: Record<ActionKind, string> = {
  anchor: "Anchor",
  riptide: "Riptide",
  lifeRing: "Life Ring",
};

export function cardName(card: Card): string {
  switch (card.kind) {
    case "number":
      return String(card.value);
    case "bonus":
      return `+${card.value}`;
    case "double":
      return "×2";
    case "action":
      return ACTION_NAMES[card.action];
  }
}

// ---------------------------------------------------------------- state

/** Where a player stands in the current round. Only "active" players still take turns. */
export type Standing = "active" | "stayed" | "anchored" | "bust" | "fullHold";

export interface Hand {
  /** Different numbers, in the order received. */
  numbers: Card[];
  /** Bonus cards, ×2, and action cards played on this player. */
  extras: Card[];
  lifeRing: Card | null;
  standing: Standing;
  /** The duplicate that sent this player overboard. */
  bustCard: Card | null;
}

/** A choice someone has to make before the round can go on. */
export type Pending =
  /** Play an Anchor or Riptide on an active player. */
  | { type: "target"; player: PlayerId; card: Card }
  /** Already holding a Life Ring: pass this one to another active player. */
  | { type: "giveRing"; player: PlayerId; card: Card };

/** Automatic work, kept as a stack (last = next) so it can pause for a choice. */
export type Task =
  /** `player` still has to take `left` cards. Anchors and Riptides drawn meanwhile are `held`. */
  | { type: "riptide"; player: PlayerId; left: number; held: Card[] }
  /** After a Riptide: `player` plays these held action cards, one by one. */
  | { type: "held"; player: PlayerId; cards: Card[] }
  /** The turn passes to the next active player. */
  | { type: "endTurn" };

/** Something that happened during the last move, for the action strip and the board. */
export type GameEvent =
  | { type: "draw"; player: PlayerId; card: Card; via: "deal" | "hit" | "riptide" }
  | { type: "stay"; player: PlayerId; points: number }
  | { type: "bust"; player: PlayerId; card: Card }
  | { type: "saved"; player: PlayerId; card: Card }
  | { type: "fullHold"; player: PlayerId }
  | { type: "play"; player: PlayerId; target: PlayerId; card: Card }
  | { type: "held"; player: PlayerId; card: Card }
  | { type: "fizzle"; player: PlayerId; card: Card }
  | { type: "ringPassed"; player: PlayerId; target: PlayerId }
  | { type: "reshuffle" }
  | { type: "deckEmpty" }
  | { type: "roundEnd"; round: number };

export type Phase = "deal" | "play" | "roundOver" | "over";

/** Everything except the deck, which is hidden from players. */
export interface Table {
  config: Config;
  players: PlayerInfo[];
  /** deal: waiting for the dealer. play: in a round. roundOver: scores shown, next deal waiting. */
  phase: Phase;
  /** The current round, or the one just finished. Starts at 1. */
  round: number;
  /** Seat index of this round's dealer. */
  dealer: number;
  hands: Record<PlayerId, Hand>;
  /** Players still to be dealt their opening card. */
  dealQueue: PlayerId[];
  /** Whose Hit/Stay turn it is. null while the opening cards are dealt. */
  turn: TurnOrder | null;
  pending: Pending | null;
  tasks: Task[];
  totals: Record<PlayerId, number>;
  /** Points scored in the last finished round. */
  roundScores: Record<PlayerId, number> | null;
  /** The deck and discards ran out mid-round, which ends it. */
  deckRanOut: boolean;
  /** What the last move did. */
  events: GameEvent[];
}

export interface State extends Table {
  deck: Deck<Card>;
}

/** What players see: the draw pile's size, not its order. Discards are face up. */
export interface View extends Table {
  drawCount: number;
  discardPile: Card[];
}

export type Move =
  { type: "deal" } | { type: "hit" } | { type: "stay" } | { type: "target"; target: PlayerId };

// ---------------------------------------------------------------- setup

const emptyHand = (): Hand => ({
  numbers: [],
  extras: [],
  lifeRing: null,
  standing: "active",
  bustCard: null,
});

export function setup(ctx: SetupContext, config: Config): State {
  const ids = ctx.players.map((p) => p.id);
  return {
    config,
    players: ctx.players,
    phase: "deal",
    round: 1,
    dealer: ctx.rng.int(0, ids.length - 1),
    deck: createDeck(fullDeck(), ctx.rng),
    hands: Object.fromEntries(ids.map((id) => [id, emptyHand()])),
    dealQueue: [],
    turn: null,
    pending: null,
    tasks: [],
    totals: Object.fromEntries(ids.map((id) => [id, 0])),
    roundScores: null,
    deckRanOut: false,
    events: [],
  };
}

// ---------------------------------------------------------------- rules helpers

const ids = (t: Pick<Table, "players">) => t.players.map((p) => p.id);
const handOf = (t: Pick<Table, "hands">, player: PlayerId): Hand => t.hands[player] ?? emptyHand();

export const isActive = (t: Pick<Table, "hands">, player: PlayerId) =>
  handOf(t, player).standing === "active";

export const activeIds = (t: Pick<Table, "players" | "hands">) =>
  ids(t).filter((id) => isActive(t, id));

/** Points this hand is worth if banked now (0 if overboard). */
export function handScore(hand: Hand): number {
  if (hand.standing === "bust") return 0;
  let points = hand.numbers.reduce((sum, c) => sum + (c.kind === "number" ? c.value : 0), 0);
  if (hand.extras.some((c) => c.kind === "double")) points *= 2;
  for (const c of hand.extras) if (c.kind === "bonus") points += c.value;
  if (hand.standing === "fullHold") points += FULL_HOLD_BONUS;
  return points;
}

/** You may Stay as long as you have a card in front of you. */
export const canStay = (hand: Hand) =>
  hand.numbers.length + hand.extras.length + (hand.lifeRing ? 1 : 0) > 0;

/** The seat that deals the next round. */
export const nextDealer = (t: Pick<Table, "players" | "dealer">) =>
  (t.dealer + 1) % t.players.length;

/** Who the game is waiting on, if anyone. */
export function decider(t: Table): PlayerId | null {
  switch (t.phase) {
    case "deal":
      return t.players[t.dealer]?.id ?? null;
    case "roundOver":
      return t.players[nextDealer(t)]?.id ?? null;
    case "play":
      if (t.pending) return t.pending.player;
      return t.turn ? currentPlayer(t.turn) : null;
    case "over":
      return null;
  }
}

/** Who `player` may play an action card on: every active player, themself included. */
export function actionTargets(t: Table, _player: PlayerId): PlayerId[] {
  return activeIds(t);
}

/** Who a spare Life Ring can go to: other active players without one. */
export function ringTargets(t: Table, player: PlayerId): PlayerId[] {
  return activeIds(t).filter((id) => id !== player && !handOf(t, id).lifeRing);
}

function pendingTargets(t: Table): PlayerId[] {
  if (!t.pending) return [];
  return t.pending.type === "giveRing"
    ? ringTargets(t, t.pending.player)
    : actionTargets(t, t.pending.player);
}

/** Every card on the table that isn't in the draw pile or the discards. */
export function cardsInPlay(t: Table): Card[] {
  const cards: Card[] = [];
  for (const id of ids(t)) {
    const h = handOf(t, id);
    cards.push(...h.numbers, ...h.extras);
    if (h.lifeRing) cards.push(h.lifeRing);
    if (h.bustCard) cards.push(h.bustCard);
  }
  if (t.pending) cards.push(t.pending.card);
  for (const task of t.tasks) {
    if (task.type === "riptide") cards.push(...task.held);
    if (task.type === "held") cards.push(...task.cards);
  }
  return cards;
}

/**
 * Card counting from public information: how many of each number the next card could be.
 * The draw pile is every card not in play or discarded; if it's empty, the next card comes
 * from the reshuffled discards.
 */
export function nextCardOdds(view: View): { counts: number[]; total: number } {
  const counts = NUMBER_VALUES.map(() => 0);
  if (view.drawCount > 0) {
    for (const v of NUMBER_VALUES) counts[v] = copiesOf(v);
    const seen = [...cardsInPlay(view), ...view.discardPile];
    for (const c of seen) if (c.kind === "number") counts[c.value]!--;
    return { counts, total: view.drawCount };
  }
  for (const c of view.discardPile) if (c.kind === "number") counts[c.value]!++;
  return { counts, total: view.discardPile.length };
}

/** Chance (0–1) that the next card is a number this player already has. */
export function bustChance(view: View, player: PlayerId): number {
  const { counts, total } = nextCardOdds(view);
  if (total === 0) return 0;
  const dupes = handOf(view, player).numbers.reduce(
    (sum, c) => sum + (c.kind === "number" ? (counts[c.value] ?? 0) : 0),
    0,
  );
  return dupes / total;
}

// ---------------------------------------------------------------- the round engine
// These work on a private copy of the state (see applyMove), so they mutate it freely.

function roundIsOver(s: State): boolean {
  return (
    s.deckRanOut ||
    ids(s).some((id) => handOf(s, id).standing === "fullHold") ||
    activeIds(s).length === 0
  );
}

function discard(s: State, cards: readonly Card[]) {
  s.deck = discardCards(s.deck, cards);
}

function drawOne(s: State, rng: MoveContext["rng"]): Card | null {
  const { deck, cards, reshuffled } = drawCards(s.deck, rng, 1);
  s.deck = deck;
  if (reshuffled) s.events.push({ type: "reshuffle" });
  return cards[0] ?? null;
}

/** Pass the turn to the next active player after the current one. */
function advanceTurn(s: State) {
  if (!s.turn) return;
  const eliminated = ids(s).filter((id) => !isActive(s, id));
  if (eliminated.length === s.players.length) return;
  s.turn = nextTurn({ ...s.turn, eliminated });
}

/** Give `player` the top card and apply it. `riptide` is set while they flip for a Riptide. */
function give(
  s: State,
  rng: MoveContext["rng"],
  player: PlayerId,
  via: "deal" | "hit" | "riptide",
  riptide?: Extract<Task, { type: "riptide" }>,
) {
  const card = drawOne(s, rng);
  if (!card) {
    s.deckRanOut = true;
    s.events.push({ type: "deckEmpty" });
    return;
  }
  s.events.push({ type: "draw", player, card, via });
  const hand = handOf(s, player);
  switch (card.kind) {
    case "number": {
      const dupe = hand.numbers.some((c) => c.kind === "number" && c.value === card.value);
      if (dupe && hand.lifeRing) {
        discard(s, [hand.lifeRing, card]);
        hand.lifeRing = null;
        s.events.push({ type: "saved", player, card });
      } else if (dupe) {
        hand.bustCard = card;
        hand.standing = "bust";
        s.events.push({ type: "bust", player, card });
      } else {
        hand.numbers.push(card);
        if (hand.numbers.length >= FULL_HOLD) {
          hand.standing = "fullHold";
          s.events.push({ type: "fullHold", player });
        }
      }
      return;
    }
    case "bonus":
    case "double":
      hand.extras.push(card);
      return;
    case "action":
      if (card.action === "lifeRing") {
        if (!hand.lifeRing) hand.lifeRing = card;
        else if (ringTargets(s, player).length > 0) s.pending = { type: "giveRing", player, card };
        else {
          discard(s, [card]);
          s.events.push({ type: "fizzle", player, card });
        }
      } else if (riptide) {
        // Anchors and Riptides drawn during a Riptide wait until all three cards are flipped.
        riptide.held.push(card);
        s.events.push({ type: "held", player, card });
      } else {
        s.pending = { type: "target", player, card };
      }
      return;
  }
}

/** Do one step of the top task. */
function stepTask(s: State, rng: MoveContext["rng"]) {
  const task = s.tasks[s.tasks.length - 1] as Task;
  switch (task.type) {
    case "endTurn":
      s.tasks.pop();
      advanceTurn(s);
      return;
    case "riptide": {
      const stillIn = isActive(s, task.player);
      if (stillIn && task.left > 0) {
        task.left--;
        give(s, rng, task.player, "riptide", task);
        return;
      }
      s.tasks.pop();
      if (task.held.length === 0) return;
      // Held cards are played after the Riptide, unless the player went overboard.
      if (handOf(s, task.player).standing === "bust") discard(s, task.held);
      else s.tasks.push({ type: "held", player: task.player, cards: task.held });
      return;
    }
    case "held": {
      const card = task.cards.shift();
      if (task.cards.length === 0) s.tasks.pop();
      if (!card) return;
      if (actionTargets(s, task.player).length === 0) {
        discard(s, [card]);
        s.events.push({ type: "fizzle", player: task.player, card });
      } else {
        s.pending = { type: "target", player: task.player, card };
      }
      return;
    }
  }
}

/** Score the round, clear any unfinished business, and decide if the game is over. */
function finishRound(s: State) {
  const scores: Record<PlayerId, number> = {};
  for (const id of ids(s)) {
    const hand = handOf(s, id);
    // If the cards ran out, players still in bank what they have.
    if (hand.standing === "active") hand.standing = "stayed";
    scores[id] = handScore(hand);
    s.totals[id] = (s.totals[id] ?? 0) + scores[id];
  }
  const leftover = [
    ...(s.pending ? [s.pending.card] : []),
    ...s.tasks.flatMap((t) => (t.type === "riptide" ? t.held : t.type === "held" ? t.cards : [])),
  ];
  discard(s, leftover);
  s.pending = null;
  s.tasks = [];
  s.dealQueue = [];
  s.roundScores = scores;
  s.events.push({ type: "roundEnd", round: s.round });
  const reached = ids(s).some((id) => (s.totals[id] ?? 0) >= s.config.targetScore);
  s.phase = reached ? "over" : "roundOver";
}

/** Keep the round going until someone has to decide something, or it ends. */
function run(s: State, rng: MoveContext["rng"]) {
  for (;;) {
    if (s.pending) return;
    if (roundIsOver(s)) return finishRound(s);
    if (s.tasks.length > 0) {
      stepTask(s, rng);
      continue;
    }
    const next = s.dealQueue.shift();
    if (next !== undefined) {
      if (isActive(s, next)) give(s, rng, next, "deal");
      continue;
    }
    if (!s.turn) {
      // Opening deal done: the player left of the dealer goes first.
      s.turn = createTurnOrder(ids(s), s.dealer);
      advanceTurn(s);
    } else if (!isActive(s, currentPlayer(s.turn))) {
      advanceTurn(s);
    }
    return; // waiting for Hit or Stay
  }
}

function startRound(s: State) {
  const n = s.players.length;
  if (s.phase === "roundOver") {
    s.round++;
    s.dealer = nextDealer(s);
  }
  // Last round's cards go to the discards, not back into the deck.
  discard(s, cardsInPlay(s));
  s.hands = Object.fromEntries(ids(s).map((id) => [id, emptyHand()]));
  s.dealQueue = Array.from({ length: n }, (_, i) => s.players[(s.dealer + 1 + i) % n]!.id);
  s.turn = null;
  s.pending = null;
  s.tasks = [];
  s.roundScores = null;
  s.deckRanOut = false;
  s.phase = "play";
}

// ---------------------------------------------------------------- moves

const nameOf = (t: Pick<Table, "players">, id: PlayerId) =>
  t.players.find((p) => p.id === id)?.name ?? "Someone";

function targetLabel(t: Table, pending: Pending, target: PlayerId): string {
  const self = target === pending.player;
  const name = nameOf(t, target);
  if (pending.type === "giveRing") return `Give it to ${name}`;
  const action = pending.card.kind === "action" ? pending.card.action : "anchor";
  if (action === "anchor") return self ? "Anchor yourself" : `Anchor ${name}`;
  return self ? "Riptide yourself" : `Riptide ${name}`;
}

export function getLegalMoves(state: Table, player: PlayerId): LegalMove<Move>[] {
  if (state.phase === "over" || decider(state) !== player) return [];
  if (state.phase === "deal" || state.phase === "roundOver") {
    const round = state.phase === "deal" ? state.round : state.round + 1;
    return [{ move: { type: "deal" }, label: `Deal round ${round}` }];
  }
  if (state.pending) {
    const pending = state.pending;
    return pendingTargets(state).map((target) => ({
      move: { type: "target", target },
      label: targetLabel(state, pending, target),
    }));
  }
  const hand = handOf(state, player);
  const moves: LegalMove<Move>[] = [{ move: { type: "hit" }, label: "Hit" }];
  if (canStay(hand))
    moves.push({ move: { type: "stay" }, label: `Stay · bank ${handScore(hand)}` });
  return moves;
}

export function validateMove(state: State, player: PlayerId, move: Move): string | null {
  if (state.phase === "over") return "The game is over.";
  if (decider(state) !== player) return "It's not your turn.";
  const key = JSON.stringify(move);
  const legal = getLegalMoves(state, player).some((m) => JSON.stringify(m.move) === key);
  return legal ? null : "That move isn't allowed right now.";
}

export function applyMove(state: State, player: PlayerId, move: Move, ctx: MoveContext): State {
  const s = structuredClone(state);
  s.events = [];
  switch (move.type) {
    case "deal":
      startRound(s);
      break;
    case "hit":
      s.tasks.push({ type: "endTurn" });
      give(s, ctx.rng, player, "hit");
      break;
    case "stay": {
      const hand = handOf(s, player);
      hand.standing = "stayed";
      s.events.push({ type: "stay", player, points: handScore(hand) });
      s.tasks.push({ type: "endTurn" });
      break;
    }
    case "target": {
      const pending = s.pending;
      if (!pending) throw new Error("applyMove: nothing to target (validateMove should catch it)");
      s.pending = null;
      const target = handOf(s, move.target);
      const card = pending.card;
      if (pending.type === "giveRing") {
        target.lifeRing = card;
        s.events.push({ type: "ringPassed", player, target: move.target });
      } else {
        target.extras.push(card);
        s.events.push({ type: "play", player, target: move.target, card });
        if (card.kind === "action" && card.action === "anchor") target.standing = "anchored";
        else s.tasks.push({ type: "riptide", player: move.target, left: RIPTIDE_CARDS, held: [] });
      }
      break;
    }
  }
  run(s, ctx.rng);
  return s;
}

// ---------------------------------------------------------------- views and text

export function getPlayerView(state: State, _viewer: Viewer): View {
  const { deck, ...table } = state;
  // Every card is dealt face up; only the order of the draw pile is secret.
  return { ...table, drawCount: deck.drawPile.length, discardPile: deck.discardPile };
}

function ranking(t: Table) {
  return t.players
    .map((p) => ({ player: p.id, score: t.totals[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
}

export function getResult(state: State): GameResult | null {
  if (state.phase !== "over") return null;
  const ranked = ranking(state);
  const best = ranked[0]?.score ?? 0;
  const winners = ranked.filter((r) => r.score === best).map((r) => r.player);
  const names = winners.map((id) => nameOf(state, id));
  const text =
    winners.length === 1
      ? `${names[0]} wins with ${best} points!`
      : `${names.join(" and ")} share the win with ${best} points!`;
  return { winners, ranking: ranked, text };
}

export function getStatus(state: State, viewer: Viewer): GameStatus {
  const who = decider(state);
  if (state.phase === "over" || !who) {
    return { text: getResult(state)?.text ?? "Game over", activePlayers: [] };
  }
  const you = viewer === who;
  const name = nameOf(state, who);
  const p = state.pending;
  let text: string;
  if (state.phase === "deal") {
    text = you ? "You're the dealer: deal the cards" : `Waiting for ${name} to deal`;
  } else if (state.phase === "roundOver") {
    text = you
      ? `Round ${state.round} over. You deal next`
      : `Round ${state.round} over. ${name} deals next`;
  } else if (p?.type === "giveRing") {
    text = you
      ? "You already have a Life Ring: pass this one on"
      : `${name} is passing on a spare Life Ring`;
  } else if (p) {
    const action = cardName(p.card);
    text = you ? `Play the ${action} on someone` : `${name} is choosing who gets the ${action}`;
  } else {
    text = you ? "Your turn: hit or stay?" : `${name} is deciding: hit or stay?`;
  }
  return { text, activePlayers: [who] };
}

/** One sentence per event, from this viewer's point of view. */
function eventText(t: Table, e: GameEvent, viewer: Viewer): string | null {
  const isYou = (id: PlayerId) => id === viewer;
  const name = (id: PlayerId) => (isYou(id) ? "you" : nameOf(t, id));
  const Name = (id: PlayerId) => (isYou(id) ? "You" : nameOf(t, id));
  const s = (id: PlayerId, verb: string) => (isYou(id) ? verb : `${verb}s`);
  switch (e.type) {
    case "draw":
      if (e.via === "deal") return `${Name(e.player)} got ${cardName(e.card)}.`;
      if (e.via === "hit") return `${Name(e.player)} hit: ${cardName(e.card)}.`;
      return `${Name(e.player)} ${s(e.player, "flip")} ${cardName(e.card)}.`;
    case "stay":
      return `${Name(e.player)} stayed and banked ${e.points}.`;
    case "bust":
      return `A second ${cardName(e.card)}! ${Name(e.player)} went overboard.`;
    case "saved":
      return `A second ${cardName(e.card)}, but ${isYou(e.player) ? "your" : `${nameOf(t, e.player)}'s`} Life Ring saved ${isYou(e.player) ? "you" : "them"}.`;
    case "fullHold":
      return `${Name(e.player)} filled the hold: 7 different numbers, +${FULL_HOLD_BONUS}!`;
    case "play": {
      const card = cardName(e.card);
      if (e.player === e.target) {
        return `${Name(e.player)} played the ${card} on ${isYou(e.player) ? "yourself" : "themself"}.`;
      }
      return `${Name(e.player)} played the ${card} on ${name(e.target)}.`;
    }
    case "held":
      return `${Name(e.player)} ${s(e.player, "hold")} the ${cardName(e.card)} until the Riptide ends.`;
    case "fizzle":
      return `Nobody can take the ${cardName(e.card)}, so it's discarded.`;
    case "ringPassed":
      return `${Name(e.player)} passed a spare Life Ring to ${name(e.target)}.`;
    case "reshuffle":
      return "The deck ran out: discards reshuffled.";
    case "deckEmpty":
      return "No cards left anywhere: the round ends.";
    case "roundEnd":
      return `Round ${e.round} is over.`;
  }
}

export function describeMove(
  before: State,
  after: State,
  player: PlayerId,
  move: Move,
  viewer: Viewer,
): ActionDescription {
  const you = viewer === player;
  const who = you ? "You" : nameOf(before, player);
  const events = after.events;
  const lines = events.map((e) => eventText(after, e, viewer)).filter(Boolean);
  if (move.type === "deal") lines.unshift(`${who} dealt round ${after.round}.`);
  const text = lines.join(" ") || `${who} moved.`;

  const drawn = events.flatMap((e) => (e.type === "draw" ? [e] : []));
  const highlight = [
    ...drawn.map((e) => `card-${e.card.id}`),
    ...new Set(
      events.flatMap((e) =>
        "player" in e
          ? [`player-${e.player}`, ...("target" in e ? [`player-${e.target}`] : [])]
          : [],
      ),
    ),
  ];
  const desc: ActionDescription = { text, highlight };
  if (drawn.length > 0) {
    desc.revealAfterMs = FLIP_MS;
    const target = move.type === "target" ? move.target : null;
    desc.pendingText =
      move.type === "deal"
        ? `${who} ${you ? "are" : "is"} dealing…`
        : target && drawn.some((d) => d.via === "riptide")
          ? `${target === viewer ? "You're" : `${nameOf(before, target)} is`} caught in the Riptide…`
          : `${who} ${you ? "are" : "is"} drawing…`;
  }

  const full = events.find((e) => e.type === "fullHold");
  const busts = events.flatMap((e) => (e.type === "bust" ? [e.player] : []));
  const saved = events.find((e) => e.type === "saved");
  const anchored = events.find(
    (e) => e.type === "play" && e.card.kind === "action" && e.card.action === "anchor",
  );
  const label = (id: PlayerId) => (id === viewer ? "You" : nameOf(after, id));
  if (full && "player" in full) {
    return { ...desc, tone: "good", flash: `${label(full.player)} filled the hold! +15` };
  }
  if (busts.length > 0) {
    const names = busts.map(label).join(" & ");
    return { ...desc, tone: "bad", flash: `${names} went overboard!` };
  }
  if (saved && "player" in saved) {
    return { ...desc, flash: `Life Ring saves ${label(saved.player)}!` };
  }
  if (anchored && anchored.type === "play") {
    return { ...desc, flash: `${label(anchored.target)} dropped anchor` };
  }
  return desc;
}
