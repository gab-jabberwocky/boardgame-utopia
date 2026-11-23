import {
  createDeck,
  createTurnOrder,
  currentPlayer,
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
 * Jewels Duel: a two-player gem trading game.
 *
 * - 25 tokens sit on a 5×5 board: 4 of each gem color, 2 Pearls, 3 Gold. Spent tokens go
 *   into the bag; refilling the board pours the bag back onto empty spaces in a spiral.
 * - On your turn you may first spend Privileges (each takes 1 non-Gold token), then
 *   refill the board (your opponent gets a Privilege). Then you must do one of:
 *   take up to 3 non-Gold tokens in a straight, unbroken line; take a Gold and reserve
 *   a card (max 3 reserved); or buy a card from the pyramid or your reserve.
 * - Cards give a permanent bonus (discount) in their color, points, crowns and
 *   sometimes an ability. Your 3rd and 6th crown each earn a Royal card.
 * - At the end of your turn keep at most 10 tokens. Win at the end of your turn with
 *   20 points, 10 crowns, or 10 points on cards of one color.
 *
 * The card list is this game's own design, not taken from any published edition.
 */

// ---------------------------------------------------------------- tokens

export const COLORS = ["white", "blue", "green", "red", "black"] as const;
export type Color = (typeof COLORS)[number];
/** Any token except Gold. */
export type Gem = Color | "pearl";
export type TokenKind = Gem | "gold";
export const GEMS: Gem[] = [...COLORS, "pearl"];
export const TOKEN_KINDS: TokenKind[] = [...COLORS, "pearl", "gold"];

/** The 25 tokens. */
export function allTokens(): TokenKind[] {
  return [...COLORS.flatMap((c) => [c, c, c, c]), "pearl", "pearl", "gold", "gold", "gold"];
}

export const SIZE = 5;

/** Board cells (row * 5 + col) from the center outwards, the order tokens are placed in. */
export const SPIRAL: number[] = (() => {
  const out = [12];
  const dirs = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ] as const;
  let r = 2;
  let c = 2;
  let d = 0;
  for (let len = 1; out.length < SIZE * SIZE; len++) {
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < len; i++) {
        r += dirs[d]![0];
        c += dirs[d]![1];
        if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) out.push(r * SIZE + c);
      }
      d = (d + 1) % 4;
    }
  }
  return out;
})();

// ---------------------------------------------------------------- cards

export type Level = 1 | 2 | 3;
export const LEVELS: Level[] = [3, 2, 1];
export const PYRAMID_SIZE: Record<Level, number> = { 1: 5, 2: 4, 3: 3 };

export type Ability = "again" | "token" | "privilege" | "steal";

export interface Card {
  id: number;
  level: Level;
  /** Bonus color. "wild" takes the color of one of your cards when bought. */
  color: Color | "wild";
  /** Discount it gives in its color (0, 1 or 2). */
  bonus: number;
  points: number;
  crowns: number;
  cost: Partial<Record<Gem, number>>;
  ability: Ability | null;
}

export interface Royal {
  id: number;
  points: number;
  ability: Exclude<Ability, "token"> | null;
}

type Spec = Omit<Card, "id" | "level" | "color" | "bonus" | "ability"> &
  Partial<Pick<Card, "bonus" | "ability">>;

/** Card designs per level. `k` picks colors relative to the card's own: k(1) is the next one. */
const PER_COLOR: Record<Level, (k: (n: number) => Color) => Spec[]> = {
  1: (k) => [
    { points: 0, crowns: 1, cost: { [k(1)]: 3 } },
    { points: 0, crowns: 0, cost: { [k(1)]: 1, [k(2)]: 1, [k(3)]: 1 }, ability: "token" },
    { points: 1, crowns: 0, cost: { [k(2)]: 2, pearl: 1 } },
    { points: 1, crowns: 0, cost: { [k(3)]: 2, [k(4)]: 2 }, ability: "privilege" },
    { points: 0, crowns: 0, cost: { [k(4)]: 3, [k(1)]: 1 }, ability: "again" },
    { points: 0, crowns: 0, cost: { [k(1)]: 2, [k(3)]: 2 }, ability: "steal" },
  ],
  2: (k) => [
    { points: 2, crowns: 1, cost: { [k(1)]: 4, [k(2)]: 2 } },
    { points: 2, crowns: 0, cost: { [k(2)]: 3, [k(3)]: 3, pearl: 1 }, ability: "token" },
    { points: 1, crowns: 0, cost: { [k(3)]: 5 }, bonus: 2 },
    { points: 1, crowns: 1, cost: { [k(4)]: 4, [k(1)]: 2, pearl: 1 }, ability: "again" },
  ],
  3: (k) => [
    { points: 4, crowns: 1, cost: { [k(1)]: 6, [k(2)]: 2, pearl: 1 } },
    { points: 3, crowns: 2, cost: { [k(2)]: 4, [k(3)]: 4, [k(4)]: 2 } },
  ],
};

/** Wild cards: their bonus joins one of your colors. */
const WILD: Record<Level, Spec[]> = {
  1: [],
  2: [
    { points: 1, crowns: 1, cost: { white: 2, blue: 2, green: 2, pearl: 1 } },
    { points: 1, crowns: 1, cost: { green: 2, red: 2, black: 2, pearl: 1 } },
    { points: 2, crowns: 0, cost: { blue: 3, black: 3 } },
    { points: 2, crowns: 0, cost: { white: 3, red: 3 } },
  ],
  3: [
    { points: 3, crowns: 2, cost: { white: 4, green: 4, pearl: 1 } },
    { points: 3, crowns: 2, cost: { blue: 4, red: 4, pearl: 1 } },
    { points: 3, crowns: 2, cost: { green: 4, black: 4, pearl: 1 } },
  ],
};

/** All 67 cards: 30 level 1, 24 level 2, 13 level 3. */
export function fullDeck(): Card[] {
  const cards: Card[] = [];
  for (const level of [1, 2, 3] as const) {
    COLORS.forEach((color, ci) => {
      const k = (n: number) => COLORS[(ci + n) % COLORS.length]!;
      for (const spec of PER_COLOR[level](k)) {
        cards.push({ bonus: 1, ability: null, ...spec, id: cards.length, level, color });
      }
    });
    for (const spec of WILD[level]) {
      cards.push({ bonus: 1, ability: null, ...spec, id: cards.length, level, color: "wild" });
    }
  }
  return cards;
}

export const ROYALS: Royal[] = [
  { id: 0, points: 3, ability: null },
  { id: 1, points: 2, ability: "privilege" },
  { id: 2, points: 2, ability: "steal" },
  { id: 3, points: 2, ability: "again" },
];

export const PRIVILEGES = 3;
export const TOKEN_LIMIT = 10;
export const GOAL = { points: 20, crowns: 10, colorPoints: 10 } as const;

// ---------------------------------------------------------------- state

export interface Owned {
  card: Card;
  /** The color it counts as (a wild card's chosen color). */
  color: Color;
}

export interface Seat {
  tokens: Record<TokenKind, number>;
  cards: Owned[];
  reserved: Card[];
  royals: Royal[];
  privileges: number;
  /** Crown milestones (3, 6) already rewarded. */
  royalClaims: number;
}

export type Pending =
  { type: "pickToken"; color: Color } | { type: "steal" } | { type: "royal" } | { type: "discard" };

type Task =
  /** `color` is the card's color (for "take a matching token"); null for Royal cards. */
  | { type: "ability"; ability: Ability; color: Color | null }
  | { type: "royal" }
  | { type: "limit" }
  | { type: "end" };

export type Win = { how: "points" } | { how: "crowns" } | { how: "color"; color: Color };

export type GameEvent =
  | { type: "privilegeUsed"; player: PlayerId; token: Gem }
  | { type: "replenished"; player: PlayerId; placed: number }
  | { type: "privilegeGained"; player: PlayerId; from: "supply" | "opponent" }
  | { type: "took"; player: PlayerId; tokens: Gem[] }
  | { type: "reserved"; player: PlayerId; card: Card; fromDeck: boolean }
  | { type: "bought"; player: PlayerId; card: Card; color: Color }
  | { type: "again"; player: PlayerId }
  | { type: "tokenGained"; player: PlayerId; token: Color }
  | { type: "noToken"; player: PlayerId; color: Color }
  | { type: "stole"; player: PlayerId; from: PlayerId; token: Gem }
  | { type: "royal"; player: PlayerId; royal: Royal }
  | { type: "discarded"; player: PlayerId; token: TokenKind }
  | { type: "passed"; player: PlayerId }
  | { type: "won"; player: PlayerId; win: Win };

/** Everything both players can see. */
export interface Table {
  config: Config;
  players: PlayerInfo[];
  phase: "play" | "over";
  turn: TurnOrder;
  /** 25 cells, row by row. */
  board: (TokenKind | null)[];
  bag: TokenKind[];
  pyramid: Record<Level, (Card | null)[]>;
  royals: Royal[];
  /** Privileges not held by either player. */
  privilegeSupply: number;
  /** Privileges and refills happen before the main action, in that order. */
  replenished: boolean;
  /** An ability granted another turn after this one. */
  again: boolean;
  pending: Pending | null;
  winner: PlayerId | null;
  win: Win | null;
}

export interface State extends Table {
  seats: Record<PlayerId, Seat>;
  decks: Record<Level, Deck<Card>>;
  tasks: Task[];
  events: GameEvent[];
}

export interface SeatView extends Omit<Seat, "reserved"> {
  /** Your own reserved cards (everyone's once the game is over); null for the opponent's. */
  reserved: Card[] | null;
  reservedLevels: Level[];
}

export interface View extends Table {
  seats: Record<PlayerId, SeatView>;
  deckCounts: Record<Level, number>;
}

export type Move =
  | { type: "privilege"; cell: number }
  | { type: "replenish" }
  | { type: "take"; cells: number[] }
  | { type: "reserve"; gold: number; card: number }
  | { type: "reserveDeck"; gold: number; level: Level }
  | { type: "buy"; card: number; color?: Color }
  | { type: "pickToken"; cell: number }
  | { type: "steal"; gem: Gem }
  | { type: "royal"; id: number }
  | { type: "discard"; token: TokenKind }
  | { type: "pass" };

// ---------------------------------------------------------------- setup

const emptyTokens = (): Record<TokenKind, number> =>
  Object.fromEntries(TOKEN_KINDS.map((t) => [t, 0])) as Record<TokenKind, number>;

export function setup(ctx: SetupContext, config: Config): State {
  if (ctx.players.length !== 2) throw new Error("Jewels Duel is for exactly 2 players");
  const { rng } = ctx;
  const cards = fullDeck();
  const decks = {} as Record<Level, Deck<Card>>;
  const pyramid = {} as Record<Level, (Card | null)[]>;
  for (const level of [1, 2, 3] as const) {
    const deck = createDeck(
      cards.filter((c) => c.level === level),
      rng,
    );
    const drawn = drawCards(deck, rng, PYRAMID_SIZE[level]);
    decks[level] = drawn.deck;
    pyramid[level] = drawn.cards;
  }
  const board: (TokenKind | null)[] = Array.from({ length: SIZE * SIZE }, () => null);
  rng.shuffle(allTokens()).forEach((t, i) => (board[SPIRAL[i]!] = t));

  const ids = ctx.players.map((p) => p.id);
  const first = rng.int(0, 1);
  const seats = Object.fromEntries(
    ids.map((id, i) => [
      id,
      {
        tokens: emptyTokens(),
        cards: [],
        reserved: [],
        royals: [],
        // The second player starts with a Privilege.
        privileges: i === first ? 0 : 1,
        royalClaims: 0,
      } satisfies Seat,
    ]),
  );
  return {
    config,
    players: ctx.players,
    phase: "play",
    turn: createTurnOrder(ids, first),
    board,
    bag: [],
    pyramid,
    royals: [...ROYALS],
    privilegeSupply: PRIVILEGES - 1,
    replenished: false,
    again: false,
    pending: null,
    winner: null,
    win: null,
    seats,
    decks,
    tasks: [],
    events: [],
  };
}

// ---------------------------------------------------------------- helpers

export const nameOf = (t: Pick<Table, "players">, id: PlayerId) =>
  t.players.find((p) => p.id === id)?.name ?? id;

export const opponentOf = (t: Pick<Table, "players">, id: PlayerId): PlayerId =>
  t.players.find((p) => p.id !== id)?.id ?? id;

export const isGem = (t: TokenKind | null | undefined): t is Gem => !!t && t !== "gold";

type SeatLike = Pick<Seat, "cards" | "royals" | "tokens">;

export function bonuses(seat: Pick<Seat, "cards">): Record<Color, number> {
  const out = Object.fromEntries(COLORS.map((c) => [c, 0])) as Record<Color, number>;
  for (const o of seat.cards) out[o.color] += o.card.bonus;
  return out;
}

export function colorPoints(seat: Pick<Seat, "cards">): Record<Color, number> {
  const out = Object.fromEntries(COLORS.map((c) => [c, 0])) as Record<Color, number>;
  for (const o of seat.cards) out[o.color] += o.card.points;
  return out;
}

export const points = (seat: SeatLike) =>
  seat.cards.reduce((n, o) => n + o.card.points, 0) + seat.royals.reduce((n, r) => n + r.points, 0);

export const crowns = (seat: Pick<Seat, "cards">) =>
  seat.cards.reduce((n, o) => n + o.card.crowns, 0);

export const tokenCount = (seat: Pick<Seat, "tokens">) =>
  TOKEN_KINDS.reduce((n, t) => n + seat.tokens[t], 0);

export function victory(seat: SeatLike): Win | null {
  if (points(seat) >= GOAL.points) return { how: "points" };
  if (crowns(seat) >= GOAL.crowns) return { how: "crowns" };
  const cp = colorPoints(seat);
  const color = COLORS.find((c) => cp[c] >= GOAL.colorPoints);
  return color ? { how: "color", color } : null;
}

/** Tokens to pay for a card (bonuses first, then matching tokens, Gold for the rest). */
export function payment(
  seat: Pick<Seat, "cards" | "tokens">,
  card: Card,
): Partial<Record<TokenKind, number>> | null {
  const bonus = bonuses(seat);
  const pay: Partial<Record<TokenKind, number>> = {};
  let gold = 0;
  for (const gem of GEMS) {
    const need = Math.max(0, (card.cost[gem] ?? 0) - (gem === "pearl" ? 0 : bonus[gem]));
    const use = Math.min(need, seat.tokens[gem]);
    if (use) pay[gem] = use;
    gold += need - use;
  }
  if (gold > seat.tokens.gold) return null;
  if (gold) pay.gold = gold;
  return pay;
}

/** Colors a wild card can join: those of your cards that give a bonus. */
export function wildColors(seat: Pick<Seat, "cards">): Color[] {
  return COLORS.filter((c) => seat.cards.some((o) => o.color === c && o.card.bonus > 0));
}

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

/** Every group of 1–3 non-Gold tokens in an unbroken straight line (cells ascending). */
export function takeOptions(board: Table["board"]): number[][] {
  const ok = (r: number, c: number) =>
    r >= 0 && r < SIZE && c >= 0 && c < SIZE && isGem(board[r * SIZE + c]);
  const out: number[][] = [];
  for (let cell = 0; cell < SIZE * SIZE; cell++) {
    const r = Math.floor(cell / SIZE);
    const c = cell % SIZE;
    if (!ok(r, c)) continue;
    out.push([cell]);
    for (const [dr, dc] of DIRECTIONS) {
      const line = [cell];
      for (let k = 1; k <= 2 && ok(r + dr * k, c + dc * k); k++) {
        line.push((r + dr * k) * SIZE + (c + dc * k));
        out.push([...line]);
      }
    }
  }
  return out;
}

const tokenName = (t: TokenKind) => (t === "pearl" ? "Pearl" : t === "gold" ? "Gold" : t);

export function cardName(card: Card): string {
  const what = card.color === "wild" ? "wild" : card.color;
  return `${what} level ${card.level} card${card.points ? ` (${card.points} pt${card.points === 1 ? "" : "s"})` : ""}`;
}

export function royalName(r: Royal): string {
  const extra =
    r.ability === "privilege"
      ? " + a Privilege"
      : r.ability === "steal"
        ? " + take a token"
        : r.ability === "again"
          ? " + another turn"
          : "";
  return `${r.points} points${extra}`;
}

/** Board square names, chess style: columns A–E, rows 1–5. */
export const cellName = (cell: number) => `${"ABCDE"[cell % SIZE]}${Math.floor(cell / SIZE) + 1}`;

/** Where a card is: "L2.3" (level 2, third from the left) or "reserved". */
export function slotName(t: Pick<Table, "pyramid">, cardId: number): string {
  for (const level of [3, 2, 1] as const) {
    const i = t.pyramid[level].findIndex((c) => c?.id === cardId);
    if (i >= 0) return `L${level}.${i + 1}`;
  }
  return "reserved";
}

function pyramidCards(t: Table): Card[] {
  return [3, 2, 1].flatMap((l) => t.pyramid[l as Level].filter((c): c is Card => !!c));
}

// ---------------------------------------------------------------- legal moves

function mainMoves(state: State, player: PlayerId): LegalMove<Move>[] {
  const seat = state.seats[player]!;
  const moves: LegalMove<Move>[] = [];

  for (const cells of takeOptions(state.board)) {
    const names = cells.map((c) => tokenName(state.board[c]!));
    moves.push({
      move: { type: "take", cells },
      label: `Take ${names.join(", ")}`,
      where: "board",
    });
  }

  const golds = state.board.flatMap((t, i) => (t === "gold" ? [i] : []));
  if (golds.length && seat.reserved.length < 3) {
    for (const gold of golds) {
      for (const card of pyramidCards(state)) {
        moves.push({
          move: { type: "reserve", gold, card: card.id },
          label: `Reserve the ${cardName(card)}`,
          where: "board",
        });
      }
      for (const level of [3, 2, 1] as const) {
        if (state.decks[level].drawPile.length === 0) continue;
        moves.push({
          move: { type: "reserveDeck", gold, level },
          label: `Reserve the top level ${level} card`,
          where: "board",
        });
      }
    }
  }

  for (const card of [...pyramidCards(state), ...seat.reserved]) {
    if (!payment(seat, card)) continue;
    if (card.color === "wild") {
      for (const color of wildColors(seat)) {
        moves.push({
          move: { type: "buy", card: card.id, color },
          label: `Buy the ${cardName(card)} as ${color}`,
          where: "board",
        });
      }
    } else {
      moves.push({
        move: { type: "buy", card: card.id },
        label: `Buy the ${cardName(card)}`,
        where: "board",
      });
    }
  }
  return moves;
}

function pendingMoves(state: State, player: PlayerId, pending: Pending): LegalMove<Move>[] {
  const seat = state.seats[player]!;
  switch (pending.type) {
    case "pickToken":
      return state.board.flatMap((t, cell) =>
        t === pending.color
          ? [
              {
                move: { type: "pickToken", cell },
                label: `Take this ${t}`,
                where: "board",
              },
            ]
          : [],
      );
    case "steal": {
      const opp = state.seats[opponentOf(state, player)]!;
      return GEMS.filter((g) => opp.tokens[g] > 0).map((gem) => ({
        move: { type: "steal", gem },
        label: `Take 1 ${tokenName(gem)}`,
      }));
    }
    case "royal":
      return state.royals.map((r) => ({
        move: { type: "royal", id: r.id },
        label: `Royal: ${royalName(r)}`,
      }));
    case "discard":
      return TOKEN_KINDS.filter((t) => seat.tokens[t] > 0).map((token) => ({
        move: { type: "discard", token },
        label: `Return 1 ${tokenName(token)}`,
      }));
  }
}

export function getLegalMoves(state: State, player: PlayerId): LegalMove<Move>[] {
  if (state.phase !== "play" || currentPlayer(state.turn) !== player) return [];
  if (state.pending) return pendingMoves(state, player, state.pending);

  const seat = state.seats[player]!;
  const main = mainMoves(state, player);
  const moves: LegalMove<Move>[] = [];
  if (seat.privileges > 0 && !state.replenished) {
    state.board.forEach((t, cell) => {
      if (isGem(t)) {
        moves.push({
          move: { type: "privilege", cell },
          label: `Use a Privilege: take ${tokenName(t)}`,
          where: "board",
        });
      }
    });
  }
  if (state.bag.length > 0) {
    moves.push({
      move: { type: "replenish" },
      label: `Refill the board (${state.bag.length})`,
    });
  }
  // If no main action is possible you must refill first; with an empty bag, pass.
  if (main.length === 0) {
    return state.bag.length > 0 ? moves : [{ move: { type: "pass" }, label: "Pass" }];
  }
  return [...moves, ...main];
}

export function validateMove(state: State, player: PlayerId, move: Move): string | null {
  if (state.phase === "over") return "The game is over.";
  if (currentPlayer(state.turn) !== player) return "It's not your turn.";
  const key = JSON.stringify(move);
  const legal = getLegalMoves(state, player).some((m) => JSON.stringify(m.move) === key);
  return legal ? null : "That move isn't allowed right now.";
}

// ---------------------------------------------------------------- engine

function givePrivilege(s: State, to: PlayerId) {
  const other = s.seats[opponentOf(s, to)]!;
  const seat = s.seats[to]!;
  if (s.privilegeSupply > 0) {
    s.privilegeSupply -= 1;
    seat.privileges += 1;
    s.events.push({ type: "privilegeGained", player: to, from: "supply" });
  } else if (other.privileges > 0) {
    other.privileges -= 1;
    seat.privileges += 1;
    s.events.push({ type: "privilegeGained", player: to, from: "opponent" });
  }
}

function takeFromBoard(s: State, player: PlayerId, cell: number): TokenKind {
  const token = s.board[cell]!;
  s.board[cell] = null;
  s.seats[player]!.tokens[token] += 1;
  return token;
}

function steal(s: State, player: PlayerId, gem: Gem) {
  const from = opponentOf(s, player);
  s.seats[from]!.tokens[gem] -= 1;
  s.seats[player]!.tokens[gem] += 1;
  s.events.push({ type: "stole", player, from, token: gem });
}

/** Take a card out of the pyramid (refilling its slot) or out of the player's reserve. */
function removeCard(s: State, player: PlayerId, id: number, rng: MoveContext["rng"]): Card {
  for (const level of [1, 2, 3] as const) {
    const row = s.pyramid[level];
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
  const i = reserved.findIndex((c) => c.id === id);
  return reserved.splice(i, 1)[0]!;
}

function resolveAbility(s: State, player: PlayerId, ability: Ability, color: Color | null) {
  switch (ability) {
    case "again":
      s.again = true;
      s.events.push({ type: "again", player });
      return;
    case "privilege":
      givePrivilege(s, player);
      return;
    case "token": {
      if (!color) return;
      const cells = s.board.flatMap((t, i) => (t === color ? [i] : []));
      if (cells.length === 0) s.events.push({ type: "noToken", player, color });
      else if (cells.length === 1) {
        takeFromBoard(s, player, cells[0]!);
        s.events.push({ type: "tokenGained", player, token: color });
      } else s.pending = { type: "pickToken", color };
      return;
    }
    case "steal": {
      const opp = s.seats[opponentOf(s, player)]!;
      const options = GEMS.filter((g) => opp.tokens[g] > 0);
      if (options.length === 1) steal(s, player, options[0]!);
      else if (options.length > 1) s.pending = { type: "steal" };
      return;
    }
  }
}

function endTurn(s: State) {
  const me = currentPlayer(s.turn);
  const win = victory(s.seats[me]!);
  if (win) {
    s.phase = "over";
    s.winner = me;
    s.win = win;
    s.events.push({ type: "won", player: me, win });
    return;
  }
  if (!s.again) s.turn = nextTurn(s.turn);
  s.again = false;
  s.replenished = false;
}

/** Work through what's left of the turn until a player has to decide something. */
function run(s: State) {
  while (!s.pending && s.tasks.length && s.phase === "play") {
    const task = s.tasks.shift()!;
    const me = currentPlayer(s.turn);
    const seat = s.seats[me]!;
    switch (task.type) {
      case "ability":
        resolveAbility(s, me, task.ability, task.color);
        break;
      case "royal": {
        const c = crowns(seat);
        const milestones = (c >= 3 ? 1 : 0) + (c >= 6 ? 1 : 0);
        if (seat.royalClaims < milestones) {
          seat.royalClaims += 1;
          s.tasks.unshift({ type: "royal" }); // look again after this one
          if (s.royals.length > 0) s.pending = { type: "royal" };
        }
        break;
      }
      case "limit":
        if (tokenCount(seat) > TOKEN_LIMIT) s.pending = { type: "discard" };
        break;
      case "end":
        endTurn(s);
        break;
    }
  }
}

export function applyMove(state: State, player: PlayerId, move: Move, ctx: MoveContext): State {
  const s = structuredClone(state);
  s.events = [];
  const seat = s.seats[player]!;
  const opponent = opponentOf(s, player);
  switch (move.type) {
    case "privilege": {
      seat.privileges -= 1;
      s.privilegeSupply += 1;
      const token = takeFromBoard(s, player, move.cell) as Gem;
      s.events.push({ type: "privilegeUsed", player, token });
      break;
    }
    case "replenish": {
      const empty = SPIRAL.filter((cell) => s.board[cell] === null);
      const tokens = ctx.rng.shuffle(s.bag);
      tokens.forEach((t, i) => (s.board[empty[i]!] = t));
      s.bag = [];
      s.replenished = true;
      s.events.push({ type: "replenished", player, placed: tokens.length });
      givePrivilege(s, opponent);
      break;
    }
    case "take": {
      const tokens = move.cells.map((c) => takeFromBoard(s, player, c) as Gem);
      s.events.push({ type: "took", player, tokens });
      const same = tokens.length === 3 && tokens.every((t) => t === tokens[0]);
      const pearls = tokens.filter((t) => t === "pearl").length === 2;
      if (same || pearls) givePrivilege(s, opponent);
      s.tasks = [{ type: "limit" }, { type: "end" }];
      break;
    }
    case "reserve":
    case "reserveDeck": {
      takeFromBoard(s, player, move.gold);
      let card: Card;
      if (move.type === "reserve") card = removeCard(s, player, move.card, ctx.rng);
      else {
        const drawn = drawCards(s.decks[move.level], ctx.rng, 1);
        s.decks[move.level] = drawn.deck;
        card = drawn.cards[0]!;
      }
      seat.reserved.push(card);
      s.events.push({ type: "reserved", player, card, fromDeck: move.type === "reserveDeck" });
      s.tasks = [{ type: "limit" }, { type: "end" }];
      break;
    }
    case "buy": {
      const all = [...pyramidCards(s), ...seat.reserved];
      const card = all.find((c) => c.id === move.card)!;
      const pay = payment(seat, card)!;
      for (const [t, n] of Object.entries(pay) as [TokenKind, number][]) {
        seat.tokens[t] -= n;
        for (let i = 0; i < n; i++) s.bag.push(t);
      }
      removeCard(s, player, card.id, ctx.rng);
      const color = card.color === "wild" ? move.color! : card.color;
      seat.cards.push({ card, color });
      s.events.push({ type: "bought", player, card, color });
      s.tasks = [
        ...(card.ability ? [{ type: "ability" as const, ability: card.ability, color }] : []),
        { type: "royal" },
        { type: "limit" },
        { type: "end" },
      ];
      break;
    }
    case "pickToken": {
      const token = takeFromBoard(s, player, move.cell) as Color;
      s.events.push({ type: "tokenGained", player, token });
      s.pending = null;
      break;
    }
    case "steal":
      steal(s, player, move.gem);
      s.pending = null;
      break;
    case "royal": {
      const royal = s.royals.find((r) => r.id === move.id)!;
      s.royals = s.royals.filter((r) => r.id !== move.id);
      seat.royals.push(royal);
      s.events.push({ type: "royal", player, royal });
      s.pending = null;
      if (royal.ability) s.tasks.unshift({ type: "ability", ability: royal.ability, color: null });
      break;
    }
    case "discard":
      seat.tokens[move.token] -= 1;
      s.bag.push(move.token);
      s.events.push({ type: "discarded", player, token: move.token });
      s.pending = tokenCount(seat) > TOKEN_LIMIT ? { type: "discard" } : null;
      break;
    case "pass":
      s.events.push({ type: "passed", player });
      s.tasks = [{ type: "end" }];
      break;
  }
  run(s);
  return s;
}

// ---------------------------------------------------------------- views and text

export function getPlayerView(state: State, viewer: Viewer): View {
  const { seats, decks, tasks: _tasks, events: _events, ...table } = state;
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

function ranking(t: State) {
  return t.players
    .map((p) => ({ player: p.id, score: points(t.seats[p.id]!) }))
    .sort((a, b) => b.score - a.score);
}

function winText(name: string, win: Win, seat: SeatLike): string {
  const wins = `${name} ${name === "You" ? "win" : "wins"} with`;
  if (win.how === "points") return `${wins} ${points(seat)} points!`;
  if (win.how === "crowns") return `${wins} ${crowns(seat)} crowns!`;
  return `${wins} ${colorPoints(seat)[win.color]} points in ${win.color}!`;
}

export function getResult(state: State): GameResult | null {
  if (state.phase !== "over" || !state.winner || !state.win) return null;
  return {
    winners: [state.winner],
    ranking: ranking(state),
    text: winText(nameOf(state, state.winner), state.win, state.seats[state.winner]!),
  };
}

export function getStatus(state: State, viewer: Viewer): GameStatus {
  if (state.phase === "over") {
    return { text: getResult(state)?.text ?? "Game over", activePlayers: [] };
  }
  const who = currentPlayer(state.turn);
  const you = viewer === who;
  const name = nameOf(state, who);
  const p = state.pending;
  let text: string;
  if (p?.type === "royal") text = you ? "Choose a Royal card" : `${name} is choosing a Royal card`;
  else if (p?.type === "pickToken") {
    text = you ? `Take a ${p.color} token from the board` : `${name} is taking a ${p.color} token`;
  } else if (p?.type === "steal") {
    text = you
      ? `Take a token from ${nameOf(state, opponentOf(state, who))}`
      : `${name} is taking one of your tokens`;
  } else if (p?.type === "discard") {
    text = you
      ? `Too many tokens: return ${tokenCount(state.seats[who]!) - TOKEN_LIMIT} to the bag`
      : `${name} is returning tokens to the bag`;
  } else {
    text = you ? "Your turn: take tokens, reserve, or buy a card" : `Waiting for ${name}`;
  }
  return { text, activePlayers: [who] };
}

function eventText(state: State, e: GameEvent, viewer: Viewer): string {
  const Name = (id: PlayerId) => (id === viewer ? "You" : nameOf(state, id));
  const name = (id: PlayerId) => (id === viewer ? "you" : nameOf(state, id));
  const verb = (id: PlayerId, you: string, them: string) => (id === viewer ? you : them);
  switch (e.type) {
    case "privilegeUsed":
      return `${Name(e.player)} used a Privilege to take ${tokenName(e.token)}.`;
    case "replenished":
      return `${Name(e.player)} refilled the board with ${e.placed} token${e.placed === 1 ? "" : "s"}.`;
    case "privilegeGained":
      return `${Name(e.player)} ${verb(e.player, "get", "gets")} a Privilege${
        e.from === "opponent" ? ` from ${name(opponentOf(state, e.player))}` : ""
      }.`;
    case "took":
      return `${Name(e.player)} took ${e.tokens.map(tokenName).join(", ")}.`;
    case "reserved":
      return e.fromDeck && e.player !== viewer
        ? `${Name(e.player)} took a Gold and reserved a level ${e.card.level} card from the deck.`
        : `${Name(e.player)} took a Gold and reserved the ${cardName(e.card)}.`;
    case "bought":
      return `${Name(e.player)} bought the ${cardName(e.card)}${
        e.card.color === "wild" ? ` as ${e.color}` : ""
      }.`;
    case "again":
      return `${Name(e.player)} ${verb(e.player, "take", "takes")} another turn.`;
    case "tokenGained":
      return `${Name(e.player)} took a ${e.token} token from the board.`;
    case "noToken":
      return `No ${e.color} token left on the board to take.`;
    case "stole":
      return `${Name(e.player)} took 1 ${tokenName(e.token)} from ${name(e.from)}.`;
    case "royal":
      return `${Name(e.player)} claimed a Royal card: ${royalName(e.royal)}.`;
    case "discarded":
      return `${Name(e.player)} returned 1 ${tokenName(e.token)} to the bag.`;
    case "passed":
      return `${Name(e.player)} could not do anything and passed.`;
    case "won":
      return winText(Name(e.player), e.win, state.seats[e.player]!);
  }
}

export function describeMove(
  _before: State,
  after: State,
  player: PlayerId,
  move: Move,
  viewer: Viewer,
): ActionDescription {
  const desc: ActionDescription = {
    text: after.events.map((e) => eventText(after, e, viewer)).join(" "),
  };
  const highlight: string[] = [];
  if (move.type === "take") highlight.push(...move.cells.map((c) => `cell-${c}`));
  if (move.type === "privilege" || move.type === "pickToken") highlight.push(`cell-${move.cell}`);
  if (move.type === "reserve" || move.type === "reserveDeck") highlight.push(`cell-${move.gold}`);
  for (const e of after.events) if (e.type === "bought") highlight.push(`card-${e.card.id}`);
  if (highlight.length) desc.highlight = highlight;

  const won = after.events.find((e) => e.type === "won");
  if (won)
    return {
      ...desc,
      tone: "good",
      flash: player === viewer ? "You win!" : `${nameOf(after, player)} wins!`,
    };
  if (after.events.some((e) => e.type === "royal"))
    return { ...desc, tone: "good", flash: "Royal card!" };
  if (after.events.some((e) => e.type === "stole" && e.from === viewer))
    return { ...desc, tone: "bad" };
  return desc;
}
