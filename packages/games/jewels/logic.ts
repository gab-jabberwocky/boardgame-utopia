import {
  createDeck,
  createTurnOrder,
  currentPlayer,
  drawCards,
  nextTurn,
  type Deck,
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
 * Jewels: a gem trading race for 2–4 players.
 *
 * - On your turn do one thing: take 3 gems of different colours; take 2 of one colour
 *   (only from a pile of 4 or more); reserve a card (face up, or the top of a deck,
 *   hidden) and take a Gold, which is wild; or buy a face-up or reserved card.
 * - Cards give a permanent discount (bonus) in their colour, and some give points.
 * - At the end of your turn: keep at most 10 tokens, then a Patron visits if your bonuses
 *   meet their requirement (3 points; one per turn, your choice if several).
 * - When someone reaches the target (15), the round is finished so everyone has had the
 *   same number of turns. Most points wins; ties go to fewer cards bought.
 *
 * The card and Patron lists are this game's own design.
 */

// ---------------------------------------------------------------- components

export const COLORS = ["white", "blue", "green", "red", "black"] as const;
export type Color = (typeof COLORS)[number];
export type TokenKind = Color | "gold";
export const TOKEN_KINDS: TokenKind[] = [...COLORS, "gold"];
export const LETTER: Record<TokenKind, string> = {
  white: "W",
  blue: "B",
  green: "G",
  red: "R",
  black: "K",
  gold: "O",
};

export type Level = 1 | 2 | 3;
export const MARKET_SIZE = 4;
export const GOLD = 5;
export const TOKEN_LIMIT = 10;
export const MAX_RESERVED = 3;
export const PATRON_POINTS = 3;

/** Gems per colour by player count. */
export const gemsPerColor = (players: number) => (players <= 2 ? 4 : players === 3 ? 5 : 7);

export interface Card {
  id: number;
  level: Level;
  color: Color;
  points: number;
  cost: Partial<Record<Color, number>>;
}

export interface Patron {
  id: number;
  needs: Partial<Record<Color, number>>;
}

type Spec = Omit<Card, "id" | "level" | "color">;

/** Card designs per colour; `k(n)` is the colour n steps along, `k(0)` the card's own. */
const DESIGNS: Record<Level, (k: (n: number) => Color) => Spec[]> = {
  1: (k) => [
    { points: 0, cost: { [k(1)]: 3 } },
    { points: 0, cost: { [k(1)]: 1, [k(2)]: 1, [k(3)]: 1, [k(4)]: 1 } },
    { points: 0, cost: { [k(1)]: 2, [k(2)]: 1 } },
    { points: 0, cost: { [k(2)]: 2, [k(3)]: 2 } },
    { points: 0, cost: { [k(1)]: 1, [k(3)]: 1, [k(4)]: 2 } },
    { points: 0, cost: { [k(1)]: 2, [k(3)]: 1, [k(4)]: 2 } },
    { points: 0, cost: { [k(2)]: 1, [k(3)]: 2, [k(4)]: 2 } },
    { points: 1, cost: { [k(4)]: 4 } },
  ],
  2: (k) => [
    { points: 2, cost: { [k(1)]: 5 } },
    { points: 1, cost: { [k(1)]: 2, [k(2)]: 3, [k(3)]: 2 } },
    { points: 2, cost: { [k(2)]: 5, [k(3)]: 3 } },
    { points: 2, cost: { [k(3)]: 4, [k(4)]: 2, [k(1)]: 1 } },
    { points: 3, cost: { [k(0)]: 6 } },
    { points: 1, cost: { [k(2)]: 3, [k(4)]: 3 } },
  ],
  3: (k) => [
    { points: 4, cost: { [k(1)]: 7 } },
    { points: 4, cost: { [k(1)]: 6, [k(2)]: 3, [k(0)]: 3 } },
    { points: 5, cost: { [k(1)]: 7, [k(0)]: 3 } },
    { points: 3, cost: { [k(1)]: 3, [k(2)]: 3, [k(3)]: 5, [k(4)]: 3 } },
  ],
};

/** All 90 cards: 40 level 1, 30 level 2, 20 level 3. */
export function fullDeck(): Card[] {
  const cards: Card[] = [];
  for (const level of [1, 2, 3] as const) {
    COLORS.forEach((color, ci) => {
      const k = (n: number) => COLORS[(ci + n) % COLORS.length]!;
      for (const spec of DESIGNS[level](k)) cards.push({ ...spec, id: cards.length, level, color });
    });
  }
  return cards;
}

/** 10 Patrons: 4 + 4 of two neighbouring colours, or 3 + 3 + 3 of three. */
export function allPatrons(): Patron[] {
  const out: Patron[] = [];
  COLORS.forEach((c, i) => {
    const next = COLORS[(i + 1) % 5]!;
    out.push({ id: out.length, needs: { [c]: 4, [next]: 4 } });
  });
  COLORS.forEach((c, i) => {
    const a = COLORS[(i + 1) % 5]!;
    const b = COLORS[(i + 2) % 5]!;
    out.push({ id: out.length, needs: { [c]: 3, [a]: 3, [b]: 3 } });
  });
  return out;
}

// ---------------------------------------------------------------- state

export interface Seat {
  tokens: Record<TokenKind, number>;
  cards: Card[];
  reserved: Card[];
  patrons: Patron[];
}

export type Pending = { type: "discard" } | { type: "patron"; options: number[] };

export type GameEvent =
  | { type: "took"; player: PlayerId; tokens: Color[] }
  | { type: "reserved"; player: PlayerId; card: Card; fromDeck: boolean; gold: boolean }
  | { type: "bought"; player: PlayerId; card: Card; fromReserve: boolean }
  | { type: "discarded"; player: PlayerId; token: TokenKind }
  | { type: "patron"; player: PlayerId; patron: Patron }
  | { type: "passed"; player: PlayerId }
  | { type: "finalRound"; player: PlayerId }
  | { type: "over" };

export interface Table {
  config: Config;
  players: PlayerInfo[];
  phase: "play" | "over";
  turn: TurnOrder;
  /** Seat index of the first player: the game ends when the turn comes back to them. */
  firstSeat: number;
  supply: Record<TokenKind, number>;
  market: Record<Level, (Card | null)[]>;
  patrons: Patron[];
  pending: Pending | null;
  /** Someone reached the target: this is the last round. */
  finalRound: boolean;
  /** Passes in a row (if everyone passes, nobody can do anything and the game ends). */
  passStreak: number;
  /** This turn's Patron check is done (one visit per turn at most). */
  patronChecked: boolean;
}

export interface State extends Table {
  seats: Record<PlayerId, Seat>;
  decks: Record<Level, Deck<Card>>;
  events: GameEvent[];
}

export interface SeatView extends Omit<Seat, "reserved"> {
  /** Your own reserved cards (everyone's at the end); null for others. */
  reserved: Card[] | null;
  reservedLevels: Level[];
}

export interface View extends Table {
  seats: Record<PlayerId, SeatView>;
  deckCounts: Record<Level, number>;
}

export type Move =
  | { type: "take"; colors: Color[] }
  | { type: "double"; color: Color }
  | { type: "reserve"; card: number }
  | { type: "reserveDeck"; level: Level }
  | { type: "buy"; card: number }
  | { type: "discard"; token: TokenKind }
  | { type: "patron"; id: number }
  | { type: "pass" };

const emptyTokens = (): Record<TokenKind, number> =>
  Object.fromEntries(TOKEN_KINDS.map((t) => [t, 0])) as Record<TokenKind, number>;

export function setup(ctx: SetupContext, config: Config): State {
  const n = ctx.players.length;
  if (n < 2 || n > 4) throw new Error("Jewels is for 2–4 players");
  const { rng } = ctx;
  const all = fullDeck();
  const decks = {} as Record<Level, Deck<Card>>;
  const market = {} as Record<Level, (Card | null)[]>;
  for (const level of [1, 2, 3] as const) {
    const drawn = drawCards(
      createDeck(
        all.filter((c) => c.level === level),
        rng,
      ),
      rng,
      MARKET_SIZE,
    );
    decks[level] = drawn.deck;
    market[level] = drawn.cards;
  }
  const supply = emptyTokens();
  for (const c of COLORS) supply[c] = gemsPerColor(n);
  supply.gold = GOLD;
  const first = rng.int(0, n - 1);
  return {
    config,
    players: ctx.players,
    phase: "play",
    turn: createTurnOrder(
      ctx.players.map((p) => p.id),
      first,
    ),
    firstSeat: first,
    supply,
    market,
    patrons: rng.shuffle(allPatrons()).slice(0, n + 1),
    pending: null,
    finalRound: false,
    passStreak: 0,
    patronChecked: false,
    seats: Object.fromEntries(
      ctx.players.map((p) => [
        p.id,
        { tokens: emptyTokens(), cards: [], reserved: [], patrons: [] },
      ]),
    ),
    decks,
    events: [],
  };
}

// ---------------------------------------------------------------- helpers

export const nameOf = (t: Pick<Table, "players">, id: PlayerId) =>
  t.players.find((p) => p.id === id)?.name ?? id;

export function bonuses(seat: Pick<Seat, "cards">): Record<Color, number> {
  const out = Object.fromEntries(COLORS.map((c) => [c, 0])) as Record<Color, number>;
  for (const c of seat.cards) out[c.color] += 1;
  return out;
}

export const points = (seat: Pick<Seat, "cards" | "patrons">) =>
  seat.cards.reduce((n, c) => n + c.points, 0) + seat.patrons.length * PATRON_POINTS;

export const tokenCount = (seat: Pick<Seat, "tokens">) =>
  TOKEN_KINDS.reduce((n, t) => n + seat.tokens[t], 0);

/** Tokens to pay for a card: bonuses first, then matching gems, Gold for the rest. */
export function payment(seat: Pick<Seat, "cards" | "tokens">, card: Card) {
  const bonus = bonuses(seat);
  const pay: Partial<Record<TokenKind, number>> = {};
  let gold = 0;
  for (const c of COLORS) {
    const need = Math.max(0, (card.cost[c] ?? 0) - bonus[c]);
    const use = Math.min(need, seat.tokens[c]);
    if (use) pay[c] = use;
    gold += need - use;
  }
  if (gold > seat.tokens.gold) return null;
  if (gold) pay.gold = gold;
  return pay;
}

export const meets = (seat: Pick<Seat, "cards">, patron: Patron) => {
  const b = bonuses(seat);
  return COLORS.every((c) => b[c] >= (patron.needs[c] ?? 0));
};

export const costText = (cost: Partial<Record<TokenKind, number>>) =>
  (Object.entries(cost) as [TokenKind, number][])
    .filter(([, k]) => k > 0)
    .map(([t, k]) => `${k}${LETTER[t]}`)
    .join(" ") || "free";

export const patronText = (p: Patron) => costText(p.needs);

/** "2 blue + 1 Gold", or "nothing" when bonuses cover it all. */
export const payText = (pay: Partial<Record<TokenKind, number>>) =>
  (Object.entries(pay) as [TokenKind, number][])
    .filter(([, k]) => k > 0)
    .map(([t, k]) => `${k} ${t === "gold" ? "Gold" : t}`)
    .join(" + ") || "nothing";

const patronWords = (p: Patron) =>
  (Object.entries(p.needs) as [Color, number][]).map(([c, k]) => `${k} ${c}`).join(", ");

/** "red card (2 pts)". */
const cardShort = (c: Card) =>
  `${c.color} card${c.points ? ` (${c.points} pt${c.points === 1 ? "" : "s"})` : ""}`;

function marketCards(t: Pick<Table, "market">): Card[] {
  return ([3, 2, 1] as const).flatMap((l) => t.market[l].filter((c): c is Card => !!c));
}

/** Every set of 3 different colours (or fewer, if fewer colours are left). */
function takeOptions(supply: Table["supply"]): Color[][] {
  const avail = COLORS.filter((c) => supply[c] > 0);
  if (avail.length <= 3) return avail.length ? [avail] : [];
  const out: Color[][] = [];
  for (let a = 0; a < avail.length; a++)
    for (let b = a + 1; b < avail.length; b++)
      for (let c = b + 1; c < avail.length; c++) out.push([avail[a]!, avail[b]!, avail[c]!]);
  return out;
}

// ---------------------------------------------------------------- moves

function mainMoves(state: State, player: PlayerId): LegalMove<Move>[] {
  const seat = state.seats[player]!;
  const moves: LegalMove<Move>[] = [];
  for (const colors of takeOptions(state.supply)) {
    moves.push({
      move: { type: "take", colors },
      label: `Take ${colors.join(", ")}`,
      where: "board",
    });
  }
  for (const color of COLORS) {
    if (state.supply[color] >= 4) {
      moves.push({ move: { type: "double", color }, label: `Take 2 ${color}`, where: "board" });
    }
  }
  if (seat.reserved.length < MAX_RESERVED) {
    const gold = state.supply.gold > 0 ? " + Gold" : "";
    for (const card of marketCards(state)) {
      moves.push({
        move: { type: "reserve", card: card.id },
        label: `Reserve this ${cardShort(card)}${gold}`,
        where: "board",
      });
    }
    for (const level of [3, 2, 1] as const) {
      if (state.decks[level].drawPile.length === 0) continue;
      moves.push({
        move: { type: "reserveDeck", level },
        label: `Reserve the top level ${level} card${gold}`,
        where: "board",
      });
    }
  }
  for (const card of [...marketCards(state), ...seat.reserved]) {
    const pay = payment(seat, card);
    if (!pay) continue;
    moves.push({
      move: { type: "buy", card: card.id },
      label: `Buy this ${cardShort(card)} · pay ${payText(pay)}`,
      where: "board",
    });
  }
  return moves;
}

export function getLegalMoves(state: State, player: PlayerId): LegalMove<Move>[] {
  if (state.phase !== "play" || currentPlayer(state.turn) !== player) return [];
  const seat = state.seats[player]!;
  const p = state.pending;
  if (p?.type === "discard") {
    return TOKEN_KINDS.filter((t) => seat.tokens[t] > 0).map((token) => ({
      move: { type: "discard", token },
      label: `Return 1 ${token}`,
    }));
  }
  if (p?.type === "patron") {
    return state.patrons
      .filter((pt) => p.options.includes(pt.id))
      .map((pt) => ({ move: { type: "patron", id: pt.id }, label: `Patron (${patronWords(pt)})` }));
  }
  const moves = mainMoves(state, player);
  return moves.length ? moves : [{ move: { type: "pass" }, label: "Pass (nothing possible)" }];
}

export function validateMove(state: State, player: PlayerId, move: Move): string | null {
  if (!isMove(move)) return "That move isn't allowed.";
  if (state.phase === "over") return "The game is over.";
  if (currentPlayer(state.turn) !== player) return "It's not your turn.";
  const key = JSON.stringify(move);
  if (move.type === "take") {
    if (!Array.isArray(move.colors)) return "Pick some colours.";
    // Colours may come in any order.
    const sorted = { ...move, colors: COLORS.filter((c) => move.colors.includes(c)) };
    if (sorted.colors.length !== move.colors.length) return "Pick different colours.";
    const ok = getLegalMoves(state, player).some(
      (m) => JSON.stringify(m.move) === JSON.stringify(sorted),
    );
    return ok ? null : "You can't take those.";
  }
  const legal = getLegalMoves(state, player).some((m) => JSON.stringify(m.move) === key);
  return legal ? null : "That move isn't allowed right now.";
}

/** Take a card out of the market (refilling its slot) or the player's reserve. */
function removeCard(s: State, player: PlayerId, id: number, rng: MoveContext["rng"]): Card {
  for (const level of [1, 2, 3] as const) {
    const row = s.market[level];
    const i = row.findIndex((c) => c?.id === id);
    if (i >= 0) {
      const card = row[i]!;
      const drawn = drawCards(s.decks[level], rng, 1);
      s.decks[level] = drawn.deck;
      row[i] = drawn.cards[0] ?? null;
      return card;
    }
  }
  const reserved = s.seats[player]!.reserved;
  return reserved.splice(
    reserved.findIndex((c) => c.id === id),
    1,
  )[0]!;
}

/** After the action (and any discards): Patrons, the target check, then the next player. */
function finishTurn(s: State, player: PlayerId) {
  const seat = s.seats[player]!;
  if (tokenCount(seat) > TOKEN_LIMIT) {
    s.pending = { type: "discard" };
    return;
  }
  if (!s.patronChecked) {
    s.patronChecked = true;
    const options = s.patrons.filter((p) => meets(seat, p)).map((p) => p.id);
    if (options.length === 1) visit(s, player, options[0]!);
    else if (options.length > 1) {
      s.pending = { type: "patron", options };
      return;
    }
  }
  s.pending = null;
  s.patronChecked = false;
  if (!s.finalRound && points(seat) >= s.config.pointsToWin) {
    s.finalRound = true;
    s.events.push({ type: "finalRound", player });
  }
  s.turn = nextTurn(s.turn);
  const everyonePassed = s.passStreak >= s.players.length;
  if ((s.finalRound && s.turn.current === s.firstSeat) || everyonePassed) {
    s.phase = "over";
    s.events.push({ type: "over" });
  }
}

function visit(s: State, player: PlayerId, id: number) {
  const patron = s.patrons.find((p) => p.id === id)!;
  s.patrons = s.patrons.filter((p) => p.id !== id);
  s.seats[player]!.patrons.push(patron);
  s.events.push({ type: "patron", player, patron });
}

export function applyMove(state: State, player: PlayerId, move: Move, ctx: MoveContext): State {
  const s = structuredClone(state);
  s.events = [];
  const seat = s.seats[player]!;
  if (move.type !== "pass" && move.type !== "discard" && move.type !== "patron") s.passStreak = 0;
  switch (move.type) {
    case "take":
    case "double": {
      const tokens = move.type === "take" ? move.colors : [move.color, move.color];
      for (const t of tokens) {
        s.supply[t] -= 1;
        seat.tokens[t] += 1;
      }
      s.events.push({ type: "took", player, tokens });
      break;
    }
    case "reserve":
    case "reserveDeck": {
      let card: Card;
      if (move.type === "reserve") card = removeCard(s, player, move.card, ctx.rng);
      else {
        const drawn = drawCards(s.decks[move.level], ctx.rng, 1);
        s.decks[move.level] = drawn.deck;
        card = drawn.cards[0]!;
      }
      seat.reserved.push(card);
      const gold = s.supply.gold > 0;
      if (gold) {
        s.supply.gold -= 1;
        seat.tokens.gold += 1;
      }
      s.events.push({
        type: "reserved",
        player,
        card,
        fromDeck: move.type === "reserveDeck",
        gold,
      });
      break;
    }
    case "buy": {
      const fromReserve = seat.reserved.some((c) => c.id === move.card);
      const card = [...marketCards(s), ...seat.reserved].find((c) => c.id === move.card)!;
      const pay = payment(seat, card)!;
      for (const [t, k] of Object.entries(pay) as [TokenKind, number][]) {
        seat.tokens[t] -= k;
        s.supply[t] += k;
      }
      removeCard(s, player, card.id, ctx.rng);
      seat.cards.push(card);
      s.events.push({ type: "bought", player, card, fromReserve });
      break;
    }
    case "discard":
      seat.tokens[move.token] -= 1;
      s.supply[move.token] += 1;
      s.events.push({ type: "discarded", player, token: move.token });
      break;
    case "patron":
      visit(s, player, move.id);
      break;
    case "pass":
      s.passStreak += 1;
      s.events.push({ type: "passed", player });
      break;
  }
  if (move.type === "discard" && tokenCount(seat) > TOKEN_LIMIT) return s;
  finishTurn(s, player);
  return s;
}

// ---------------------------------------------------------------- views and text

export function getPlayerView(state: State, viewer: Viewer): View {
  const { seats, decks, events: _events, ...table } = state;
  const reveal = state.phase === "over";
  return {
    ...table,
    deckCounts: {
      1: decks[1].drawPile.length,
      2: decks[2].drawPile.length,
      3: decks[3].drawPile.length,
    },
    seats: Object.fromEntries(
      Object.entries(seats).map(([id, seat]) => [
        id,
        {
          ...seat,
          reserved: reveal || id === viewer ? seat.reserved : null,
          reservedLevels: seat.reserved.map((c) => c.level),
        },
      ]),
    ),
  };
}

function ranking(s: State) {
  return s.players
    .map((p) => ({
      player: p.id,
      score: points(s.seats[p.id]!),
      cards: s.seats[p.id]!.cards.length,
    }))
    .sort((a, b) => b.score - a.score || a.cards - b.cards);
}

export function getResult(state: State): GameResult | null {
  if (state.phase !== "over") return null;
  const ranked = ranking(state);
  const best = ranked[0]!;
  const winners = ranked
    .filter((r) => r.score === best.score && r.cards === best.cards)
    .map((r) => r.player);
  const names = winners.map((id) => nameOf(state, id));
  return {
    winners,
    ranking: ranked.map(({ player, score }) => ({ player, score })),
    text:
      winners.length === 1
        ? `${names[0]} wins with ${best.score} points!`
        : `${names.join(" and ")} share the win with ${best.score} points!`,
  };
}

export function getStatus(state: State, viewer: Viewer): GameStatus {
  if (state.phase === "over")
    return { text: getResult(state)?.text ?? "Game over", activePlayers: [] };
  const who = currentPlayer(state.turn);
  const you = viewer === who;
  const name = nameOf(state, who);
  const p = state.pending;
  let text: string;
  if (p?.type === "discard") {
    text = you
      ? `Too many tokens: return ${tokenCount(state.seats[who]!) - TOKEN_LIMIT}`
      : `${name} is returning tokens`;
  } else if (p?.type === "patron") {
    text = you ? "Two Patrons want to visit: choose one" : `${name} is choosing a Patron`;
  } else {
    text = you ? "Your turn: take gems, reserve, or buy" : `Waiting for ${name}`;
  }
  if (state.finalRound) text += " (last round)";
  return { text, activePlayers: [who] };
}

function eventText(state: State, e: GameEvent, viewer: Viewer): string {
  const Name = (id: PlayerId) => (id === viewer ? "You" : nameOf(state, id));
  switch (e.type) {
    case "took":
      return `${Name(e.player)} took ${e.tokens.join(", ")}.`;
    case "reserved": {
      const what =
        e.fromDeck && e.player !== viewer
          ? `a level ${e.card.level} card from the deck`
          : `a level ${e.card.level} ${cardShort(e.card)}`;
      return `${Name(e.player)} reserved ${what}${e.gold ? " and took a Gold" : ""}.`;
    }
    case "bought":
      return `${Name(e.player)} bought a level ${e.card.level} ${cardShort(e.card)}.`;
    case "discarded":
      return `${Name(e.player)} returned 1 ${e.token}.`;
    case "patron":
      return `A Patron (${patronWords(e.patron)}) visits ${e.player === viewer ? "you" : nameOf(state, e.player)}: +${PATRON_POINTS}.`;
    case "passed":
      return `${Name(e.player)} couldn't do anything and passed.`;
    case "finalRound":
      return `${Name(e.player)} reached ${state.config.pointsToWin}: last round!`;
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
  const highlight = after.events.flatMap((e) => (e.type === "bought" ? [`card-${e.card.id}`] : []));
  if (highlight.length) desc.highlight = highlight;
  if (after.events.some((e) => e.type === "over")) {
    const won = getResult(after)?.winners.includes(viewer as PlayerId) ?? false;
    return { ...desc, tone: won ? "good" : "normal", flash: won ? "You win!" : "Game over" };
  }
  if (after.events.some((e) => e.type === "finalRound"))
    return { ...desc, tone: "good", flash: "Last round!" };
  if (after.events.some((e) => e.type === "patron")) {
    const good = { ...desc, tone: "good" as const };
    return player === viewer ? { ...good, flash: "A Patron visits you!" } : good;
  }
  return desc;
}
