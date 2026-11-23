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
 * Barista Panic: walk the ingredient counter, fill cups, serve orders before they go stale.
 *
 * - The counter is a 4×4 grid of ingredients. On your turn walk your barista 1–3 steps
 *   (Rush tokens buy extra steps), taking the ingredient of every cell you step on. You
 *   may pass other baristas but not stop on them.
 * - Pour what you took into your 3 cups (or put it back); you may empty cups first.
 *   Ingredients in a cup stay in that cup.
 * - A cup that matches an order card exactly serves it: the card becomes a completed
 *   order. Specialty orders also give a Rush token.
 * - Every order you serve sends the same number of new orders to the next two players
 *   (in a 2-player game, to your opponent).
 * - At the end of your turn your orders move one tab along. Orders falling off tab 4
 *   become penalties, and you get a Rush token for each.
 * - Spend 3 completed orders at the start of a turn on an upgrade.
 * - The last round starts when the order deck runs out or someone has 5 penalties.
 *   Score: completed orders +1, upgrades +2, penalties −1.
 */

// ---------------------------------------------------------------- ingredients and counter

export const INGREDIENTS = [
  "coffee",
  "milk",
  "steam",
  "ice",
  "water",
  "tea",
  "chocolate",
  "caramel",
] as const;
export type Ingredient = (typeof INGREDIENTS)[number];

/** Short names, used on chips and in the text view. */
export const SHORT: Record<Ingredient, string> = {
  coffee: "Co",
  milk: "Mi",
  steam: "St",
  ice: "Ic",
  water: "Wa",
  tea: "Te",
  chocolate: "Ch",
  caramel: "Ca",
};

/** The harder ingredients, doubled by the Specialty upgrade. */
export const SPECIALS: readonly Ingredient[] = ["water", "tea", "chocolate", "caramel"];

/** Token supply: 18 coffee, 12 of everything else. */
export const SUPPLY: Record<Ingredient, number> = {
  coffee: 18,
  milk: 12,
  steam: 12,
  ice: 12,
  water: 12,
  tea: 12,
  chocolate: 12,
  caramel: 12,
};

export const SIZE = 4;

/** The counter, row by row (cells A1–D4). Corners hold the basics; specials sit inside. */
export const COUNTER: readonly Ingredient[] = [
  "coffee",
  "milk",
  "steam",
  "ice",
  "tea",
  "caramel",
  "chocolate",
  "water",
  "water",
  "chocolate",
  "caramel",
  "tea",
  "ice",
  "steam",
  "milk",
  "coffee",
];

export const CORNERS = [0, SIZE - 1, SIZE * (SIZE - 1), SIZE * SIZE - 1];

export const cellName = (cell: number) => `${"ABCD"[cell % SIZE]}${Math.floor(cell / SIZE) + 1}`;

export function neighbors(cell: number, diagonal: boolean): number[] {
  const r = Math.floor(cell / SIZE);
  const c = cell % SIZE;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      if (!diagonal && dr && dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) out.push(rr * SIZE + cc);
    }
  }
  return out;
}

// ---------------------------------------------------------------- orders

export interface Recipe {
  name: string;
  needs: Ingredient[];
  /** Specialty menu: serving it also gives a Rush token. */
  specialty: boolean;
  copies: number;
}

const r = (name: string, copies: number, specialty: boolean, ...needs: Ingredient[]): Recipe => ({
  name,
  needs,
  specialty,
  copies,
});

/** 80 order cards. Ristretto and Espresso are the 4 easy starters. */
export const RECIPES: readonly Recipe[] = [
  r("Ristretto", 2, false, "coffee", "coffee", "steam"),
  r("Espresso", 2, false, "coffee", "coffee", "water"),
  r("Macchiato", 3, false, "coffee", "coffee", "milk"),
  r("Americano", 4, false, "coffee", "water", "water"),
  r("Iced Americano", 4, false, "coffee", "water", "ice"),
  r("Latte", 5, false, "coffee", "milk", "steam"),
  r("Iced Latte", 5, false, "coffee", "milk", "ice"),
  r("Cappuccino", 4, false, "coffee", "milk", "steam", "steam"),
  r("Flat White", 4, false, "coffee", "coffee", "milk", "steam"),
  r("Cold Brew", 3, false, "coffee", "water", "ice", "ice"),
  r("Hot Chocolate", 4, false, "chocolate", "milk", "steam"),
  r("Iced Chocolate", 3, false, "chocolate", "milk", "ice"),
  r("Milk Tea", 4, false, "tea", "milk", "steam"),
  r("Iced Tea", 4, false, "tea", "water", "ice"),
  r("Hot Tea", 3, false, "tea", "water", "steam"),
  r("Mocha", 4, true, "coffee", "chocolate", "milk", "steam"),
  r("Iced Mocha", 3, true, "coffee", "chocolate", "milk", "ice"),
  r("Caramel Latte", 4, true, "coffee", "caramel", "milk", "steam"),
  r("Caramel Frappe", 3, true, "coffee", "caramel", "milk", "ice"),
  r("Caramel Cocoa", 3, true, "chocolate", "caramel", "milk", "steam"),
  r("Tea Latte", 3, true, "coffee", "tea", "milk", "steam"),
  r("Caramel Milk Tea", 3, true, "tea", "caramel", "milk", "ice"),
  r("Cocoa Tea", 3, true, "chocolate", "tea", "milk", "steam"),
];

export const EASY = ["Ristretto", "Espresso"];

export interface OrderCard {
  id: number;
  /** Index into RECIPES. */
  recipe: number;
}

export function fullDeck(): OrderCard[] {
  const cards: OrderCard[] = [];
  RECIPES.forEach((rec, recipe) => {
    for (let k = 0; k < rec.copies; k++) cards.push({ id: cards.length, recipe });
  });
  return cards;
}

export const recipeOf = (card: OrderCard) => RECIPES[card.recipe]!;

// ---------------------------------------------------------------- upgrades

export type Upgrade = "crowd" | "diagonal" | "corners" | "specialty";

export const UPGRADES: Record<Upgrade, { name: string; effect: string }> = {
  crowd: { name: "Crowd bonus", effect: "2 ingredients on cells with another barista." },
  diagonal: { name: "Diagonal steps", effect: "You may step diagonally." },
  corners: { name: "Corner bonus", effect: "2 ingredients on the 4 corner cells." },
  specialty: {
    name: "Specialty bonus",
    effect: "2 ingredients on water, tea, chocolate and caramel.",
  },
};
export const UPGRADE_KINDS: Upgrade[] = ["crowd", "diagonal", "corners", "specialty"];
export const UPGRADE_COST = 3;

// ---------------------------------------------------------------- state

export const FREE_STEPS = 3;
export const CUPS = 3;
export const TABS = 4;
export const RUSH_TOKENS = 15;
export const PENALTY_LIMIT = 5;

export interface Area {
  /** tabs[0] is tab 1 (newest) … tabs[3] is tab 4 (about to go stale). */
  tabs: OrderCard[][];
  done: OrderCard[];
  penalties: OrderCard[];
  cups: Ingredient[][];
  rush: number;
  upgrades: Upgrade[];
  /** Cells of this player's barista(s): 1, or 2 in a 2-player game. */
  meeples: number[];
}

export type Phase = "place" | "move" | "pour" | "serve" | "over";

export type GameEvent =
  | { type: "placed"; player: PlayerId; cell: number; got: Ingredient | null }
  | { type: "upgraded"; player: PlayerId; upgrade: Upgrade }
  | { type: "moved"; player: PlayerId; path: number[]; got: Ingredient[]; rushUsed: number }
  | { type: "poured"; player: PlayerId; poured: number; returned: number; emptied: number[] }
  | { type: "served"; player: PlayerId; cup: number; card: OrderCard; rush: boolean }
  | { type: "orders"; player: PlayerId; count: number }
  | { type: "penalties"; player: PlayerId; count: number }
  | { type: "closed"; reason: "deck" | "penalties" | "noOrders" }
  | { type: "over" };

export interface Table {
  config: Config;
  players: PlayerInfo[];
  phase: Phase;
  turn: TurnOrder;
  /** Seat index of the starting player. */
  start: number;
  /** Last round: the game ends once the round is complete. */
  closed: boolean;
  supply: Record<Ingredient, number>;
  rushSupply: number;
  areas: Record<PlayerId, Area>;
  /** Ingredients the current player took this turn and hasn't poured yet. */
  held: Ingredient[];
  /** Who places a barista next during setup. */
  placeQueue: PlayerId[];
  servedThisTurn: number;
  /** Order cards spent on upgrades. */
  spent: OrderCard[];
}

export interface State extends Table {
  deck: Deck<OrderCard>;
  events: GameEvent[];
}

export interface View extends Table {
  deckCount: number;
}

/** A pour: first empty these cups, then add these ingredients to each cup; the rest go back. */
export interface PourPlan {
  empty: number[];
  add: Ingredient[][];
}

export type Move =
  | { type: "place"; cell: number }
  | { type: "upgrade"; upgrade: Upgrade }
  | { type: "move"; meeple: number; path: number[] }
  | ({ type: "pour" } & PourPlan)
  | { type: "serve"; cup: number; card: number }
  | { type: "endTurn" };

// ---------------------------------------------------------------- setup

export function setup(ctx: SetupContext, config: Config): State {
  const ids = ctx.players.map((p) => p.id);
  const n = ids.length;
  if (n < 2 || n > 4) throw new Error("Barista Panic is for 2–4 players");
  const start = ctx.rng.int(0, n - 1);
  const all = fullDeck();
  const easy = all.filter((c) => EASY.includes(recipeOf(c).name));
  let deck = createDeck(config.easyStart ? all.filter((c) => !easy.includes(c)) : all, ctx.rng);
  const easyLeft = ctx.rng.shuffle(easy);

  const areas: Record<PlayerId, Area> = {};
  const draw = (k: number) => {
    const res = drawCards(deck, ctx.rng, k);
    deck = res.deck;
    return res.cards;
  };
  for (let i = 0; i < n; i++) {
    const seat = (start + i) % n;
    const tab1: OrderCard[] = [];
    if (config.easyStart) tab1.push(easyLeft.pop()!);
    tab1.push(...draw(config.easyStart ? (seat === start ? 1 : 0) : seat === start ? 2 : 1));
    areas[ids[seat]!] = {
      tabs: [tab1, draw(1), [], []],
      done: [],
      penalties: [],
      cups: [[], [], []],
      rush: 0,
      upgrades: [],
      meeples: [],
    };
  }
  // Easy starters nobody got leave the game.

  // Placement: 3–4 players go anticlockwise from the player right of the starter;
  // 2 players alternate (non-starter first) until each has 2 baristas.
  const placeQueue: PlayerId[] = [];
  if (n === 2) {
    const other = ids[(start + 1) % 2]!;
    placeQueue.push(other, ids[start]!, other, ids[start]!);
  } else {
    for (let k = 1; k <= n; k++) placeQueue.push(ids[(start - k + n * 2) % n]!);
  }

  return {
    config,
    players: ctx.players,
    phase: "place",
    turn: createTurnOrder(ids, start),
    start,
    closed: false,
    supply: { ...SUPPLY },
    rushSupply: RUSH_TOKENS,
    areas,
    held: [],
    placeQueue,
    servedThisTurn: 0,
    spent: [],
    deck,
    events: [],
  };
}

// ---------------------------------------------------------------- helpers

export const nameOf = (t: Pick<Table, "players">, id: PlayerId) =>
  t.players.find((p) => p.id === id)?.name ?? id;

/** Who has to act now. */
export function decider(t: Table): PlayerId | null {
  if (t.phase === "over") return null;
  if (t.phase === "place") return t.placeQueue[0] ?? null;
  return currentPlayer(t.turn);
}

/** Every barista on the counter, except one being moved. */
function occupied(t: Table, except?: { player: PlayerId; meeple: number }): number[] {
  return Object.entries(t.areas).flatMap(([id, a]) =>
    a.meeples.filter((_, i) => !(except && except.player === id && except.meeple === i)),
  );
}

export const multiset = (items: readonly string[]) => [...items].sort().join(",");

/** Can these cup contents still grow into this recipe? */
export const fitsInto = (contents: readonly Ingredient[], needs: readonly Ingredient[]) => {
  const left = [...needs];
  for (const x of contents) {
    const i = left.indexOf(x);
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
};

export const matches = (contents: readonly Ingredient[], needs: readonly Ingredient[]) =>
  contents.length > 0 && multiset(contents) === multiset(needs);

/** How many tokens a step onto `cell` gives (before the supply limit). */
function gain(t: Table, player: PlayerId, meeple: number, cell: number): number {
  const ups = t.areas[player]!.upgrades;
  let k = 1;
  if (ups.includes("crowd") && occupied(t, { player, meeple }).includes(cell)) k *= 2;
  if (ups.includes("corners") && CORNERS.includes(cell)) k *= 2;
  if (ups.includes("specialty") && SPECIALS.includes(COUNTER[cell]!)) k *= 2;
  return k;
}

export function checkPath(
  t: Table,
  player: PlayerId,
  meeple: number,
  path: readonly number[],
): string | null {
  const area = t.areas[player]!;
  const from = area.meeples[meeple];
  if (from === undefined) return "No such barista.";
  if (path.length < 1) return "Take at least one step.";
  if (path.length > FREE_STEPS + area.rush) return "Not enough steps (Rush tokens give more).";
  const diagonal = area.upgrades.includes("diagonal");
  let at = from;
  for (const cell of path) {
    if (!Number.isInteger(cell) || !neighbors(at, diagonal).includes(cell)) {
      return `${cellName(cell)} is not next to ${cellName(at)}.`;
    }
    at = cell;
  }
  if (occupied(t, { player, meeple }).includes(at)) return "You can't stop on another barista.";
  return null;
}

/** What a path would give, respecting upgrades and the supply. */
export function pathGains(
  t: Table,
  player: PlayerId,
  meeple: number,
  path: readonly number[],
): Ingredient[] {
  const supply = { ...t.supply };
  const got: Ingredient[] = [];
  for (const cell of path) {
    const ing = COUNTER[cell]!;
    const k = Math.min(gain(t, player, meeple, cell), supply[ing]);
    supply[ing] -= k;
    for (let i = 0; i < k; i++) got.push(ing);
  }
  return got;
}

/** Every path of exactly `len` steps from a cell (for listing moves). */
function paths(from: number, len: number, diagonal: boolean): number[][] {
  if (len === 0) return [[]];
  return neighbors(from, diagonal).flatMap((n) =>
    paths(n, len - 1, diagonal).map((p) => [n, ...p]),
  );
}

export function checkPour(t: Table, plan: PourPlan): string | null {
  if (!Array.isArray(plan.empty) || !Array.isArray(plan.add) || plan.add.length !== CUPS) {
    return "Bad pour.";
  }
  if (plan.empty.some((c) => !Number.isInteger(c) || c < 0 || c >= CUPS)) return "No such cup.";
  if (new Set(plan.empty).size !== plan.empty.length) return "Each cup once.";
  const left = [...t.held] as string[];
  for (const cup of plan.add) {
    if (!Array.isArray(cup)) return "Bad pour.";
    for (const x of cup) {
      const i = left.indexOf(x);
      if (i < 0) return "You don't have that ingredient.";
      left.splice(i, 1);
    }
  }
  return null;
}

/** A sensible pour: each ingredient into a cup where it still fits one of your orders. */
export function autoPour(area: Area, held: readonly Ingredient[]): PourPlan {
  const cups = area.cups.map((c) => [...c]);
  const add: Ingredient[][] = [[], [], []];
  const needs = area.tabs.flat().map((c) => recipeOf(c).needs);
  for (const x of held) {
    const fits = (i: number) => needs.some((n) => fitsInto([...cups[i]!, x], n));
    let cup = [0, 1, 2].find((i) => cups[i]!.length > 0 && fits(i));
    if (cup === undefined) cup = [0, 1, 2].find((i) => cups[i]!.length === 0 && fits(i));
    if (cup === undefined) continue;
    cups[cup]!.push(x);
    add[cup]!.push(x);
  }
  return { empty: [], add };
}

export const tabOf = (area: Area, cardId: number) =>
  area.tabs.findIndex((tab) => tab.some((c) => c.id === cardId));

export function score(area: Pick<Area, "done" | "upgrades" | "penalties">) {
  return area.done.length + 2 * area.upgrades.length - area.penalties.length;
}

const list = (items: readonly string[]) => items.join(", ") || "nothing";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------------------------------------------------------------- legal moves

export function getLegalMoves(state: State, player: PlayerId): LegalMove<Move>[] {
  if (decider(state) !== player) return [];
  const area = state.areas[player]!;
  const taken = occupied(state);
  switch (state.phase) {
    case "place":
      return COUNTER.flatMap((ing, cell) =>
        taken.includes(cell)
          ? []
          : [
              {
                move: { type: "place", cell } as Move,
                label: `Place your barista on ${cellName(cell)} (${ing})`,
                where: "board" as const,
              },
            ],
      );
    case "move": {
      const moves: LegalMove<Move>[] = [];
      if (area.done.length >= UPGRADE_COST) {
        for (const up of UPGRADE_KINDS) {
          if (area.upgrades.includes(up)) continue;
          moves.push({
            move: { type: "upgrade", upgrade: up },
            label: `Upgrade: ${UPGRADES[up].name} (spend 3 orders)`,
          });
        }
      }
      const diagonal = area.upgrades.includes("diagonal");
      const maxLen = Math.min(FREE_STEPS + area.rush, diagonal ? FREE_STEPS : FREE_STEPS + 1);
      area.meeples.forEach((from, meeple) => {
        for (let len = 1; len <= maxLen; len++) {
          for (const path of paths(from, len, diagonal)) {
            if (checkPath(state, player, meeple, path)) continue;
            const got = pathGains(state, player, meeple, path);
            const who = area.meeples.length > 1 ? `barista ${meeple + 1}: ` : "";
            moves.push({
              move: { type: "move", meeple, path },
              label: `Move ${who}${path.map(cellName).join(">")} (+${list(got.map((g) => SHORT[g]))})`,
              where: "board",
            });
          }
        }
      });
      return moves;
    }
    case "pour": {
      const auto = autoPour(area, state.held);
      const options: { plan: PourPlan; label: string }[] = [
        {
          plan: auto,
          label: `Pour where it fits (${auto.add.flat().length} of ${state.held.length})`,
        },
        ...[0, 1, 2].map((cup) => ({
          plan: { empty: [], add: [0, 1, 2].map((i) => (i === cup ? [...state.held] : [])) },
          label: `Pour everything into cup ${cup + 1}`,
        })),
        { plan: { empty: [], add: [[], [], []] }, label: "Put everything back" },
      ];
      return options.map((o) => ({
        move: { type: "pour", ...o.plan },
        label: o.label,
        where: "board",
      }));
    }
    case "serve": {
      const moves: LegalMove<Move>[] = [];
      area.cups.forEach((cup, i) => {
        for (const [t, tab] of area.tabs.entries()) {
          const seen = new Set<number>();
          for (const card of tab) {
            if (seen.has(card.recipe) || !matches(cup, recipeOf(card).needs)) continue;
            seen.add(card.recipe);
            moves.push({
              move: { type: "serve", cup: i, card: card.id },
              label: `Serve cup ${i + 1}: ${recipeOf(card).name} (tab ${t + 1})`,
            });
          }
        }
      });
      moves.push({ move: { type: "endTurn" }, label: "End turn" });
      return moves;
    }
    case "over":
      return [];
  }
}

export function validateMove(state: State, player: PlayerId, move: Move): string | null {
  if (!isMove(move)) return "That move isn't allowed.";
  if (state.phase === "over") return "The game is over.";
  if (decider(state) !== player) return "It's not your turn.";
  const area = state.areas[player]!;
  switch (move.type) {
    case "move":
      if (state.phase !== "move") return "You've already moved.";
      return checkPath(state, player, move.meeple, Array.isArray(move.path) ? move.path : []);
    case "pour":
      if (state.phase !== "pour") return "Not time to pour.";
      return checkPour(state, move);
    case "upgrade":
      if (state.phase !== "move") return "Upgrade at the start of your turn.";
      if (area.done.length < UPGRADE_COST) return "You need 3 completed orders.";
      return UPGRADE_KINDS.includes(move.upgrade) && !area.upgrades.includes(move.upgrade)
        ? null
        : "You can't take that upgrade.";
    default: {
      const key = JSON.stringify(move);
      return getLegalMoves(state, player).some((m) => JSON.stringify(m.move) === key)
        ? null
        : "That move isn't allowed right now.";
    }
  }
}

// ---------------------------------------------------------------- engine

function take(s: State, ing: Ingredient, k: number): number {
  const got = Math.min(k, s.supply[ing]);
  s.supply[ing] -= got;
  return got;
}

function giveBack(s: State, items: readonly Ingredient[]) {
  for (const x of items) s.supply[x] += 1;
}

function draw(s: State, rng: MoveContext["rng"], k: number): OrderCard[] {
  const res = drawCards(s.deck, rng, k);
  s.deck = res.deck;
  return res.cards;
}

function close(s: State, reason: "deck" | "penalties" | "noOrders") {
  if (s.closed) return;
  s.closed = true;
  s.events.push({ type: "closed", reason });
}

function endTurn(s: State, player: PlayerId, rng: MoveContext["rng"]) {
  const ids = s.players.map((p) => p.id);
  const n = ids.length;
  const seat = ids.indexOf(player);
  const area = s.areas[player]!;

  // Too many orders: the next players (2 players: the opponent) get as many new orders.
  const served = s.servedThisTurn;
  if (served > 0) {
    const targets =
      n === 2
        ? [ids[(seat + 1) % 2]!]
        : [1, 2].map((k) => ids[(seat + k) % n]!).filter((id) => id !== player);
    for (const id of [...new Set(targets)]) {
      const cards = draw(s, rng, served);
      s.areas[id]!.tabs[0]!.push(...cards);
      if (cards.length) s.events.push({ type: "orders", player: id, count: cards.length });
    }
    if (s.deck.drawPile.length === 0) close(s, "deck");
  }

  // Flow of time: every order moves one tab along; tab 4 goes stale.
  const stale = area.tabs[TABS - 1]!;
  area.tabs = [[], ...area.tabs.slice(0, TABS - 1)];
  if (stale.length) {
    area.penalties.push(...stale);
    const rush = Math.min(stale.length, s.rushSupply);
    s.rushSupply -= rush;
    area.rush += rush;
    s.events.push({ type: "penalties", player, count: stale.length });
    if (area.penalties.length >= PENALTY_LIMIT) close(s, "penalties");
  }
  if (n === 2) {
    const card = draw(s, rng, 1);
    area.tabs[0]!.push(...card);
    if (s.deck.drawPile.length === 0) close(s, "deck");
  }
  // Nobody has an order left to serve: nothing more can happen.
  if (Object.values(s.areas).every((a) => a.tabs.every((t) => t.length === 0)))
    close(s, "noOrders");

  s.servedThisTurn = 0;
  s.held = [];
  // The game ends once the round is complete (after the player right of the starter).
  if (s.closed && seat === (s.start + n - 1) % n) {
    s.phase = "over";
    s.events.push({ type: "over" });
    return;
  }
  s.turn = nextTurn(s.turn);
  s.phase = "move";
}

export function applyMove(state: State, player: PlayerId, move: Move, ctx: MoveContext): State {
  const s = structuredClone(state);
  s.events = [];
  const area = s.areas[player]!;
  switch (move.type) {
    case "place": {
      area.meeples.push(move.cell);
      const ing = COUNTER[move.cell]!;
      const got = take(s, ing, 1) ? ing : null;
      if (got) area.cups[0]!.push(got);
      s.events.push({ type: "placed", player, cell: move.cell, got });
      s.placeQueue.shift();
      if (s.placeQueue.length === 0) s.phase = "move";
      break;
    }
    case "upgrade": {
      s.spent.push(...area.done.splice(0, UPGRADE_COST));
      area.upgrades.push(move.upgrade);
      s.events.push({ type: "upgraded", player, upgrade: move.upgrade });
      break;
    }
    case "move": {
      const got: Ingredient[] = [];
      move.path.forEach((cell) => {
        const ing = COUNTER[cell]!;
        const k = take(s, ing, gain(s, player, move.meeple, cell));
        for (let i = 0; i < k; i++) got.push(ing);
      });
      const rushUsed = Math.max(0, move.path.length - FREE_STEPS);
      area.rush -= rushUsed;
      s.rushSupply += rushUsed;
      area.meeples[move.meeple] = move.path[move.path.length - 1]!;
      s.held = got;
      s.phase = "pour";
      s.events.push({ type: "moved", player, path: move.path, got, rushUsed });
      break;
    }
    case "pour": {
      for (const c of move.empty) {
        giveBack(s, area.cups[c]!);
        area.cups[c] = [];
      }
      const left = [...s.held];
      move.add.forEach((items, c) => {
        for (const x of items) {
          left.splice(left.indexOf(x), 1);
          area.cups[c]!.push(x);
        }
      });
      giveBack(s, left);
      s.events.push({
        type: "poured",
        player,
        poured: s.held.length - left.length,
        returned: left.length,
        emptied: move.empty,
      });
      s.held = [];
      s.phase = "serve";
      break;
    }
    case "serve": {
      const t = tabOf(area, move.card);
      const tab = area.tabs[t]!;
      const card = tab.splice(
        tab.findIndex((c) => c.id === move.card),
        1,
      )[0]!;
      giveBack(s, area.cups[move.cup]!);
      area.cups[move.cup] = [];
      area.done.push(card);
      const rush = recipeOf(card).specialty && s.rushSupply > 0;
      if (rush) {
        s.rushSupply -= 1;
        area.rush += 1;
      }
      s.servedThisTurn += 1;
      s.events.push({ type: "served", player, cup: move.cup, card, rush });
      break;
    }
    case "endTurn":
      endTurn(s, player, ctx.rng);
      break;
  }
  return s;
}

// ---------------------------------------------------------------- views and text

export function getPlayerView(state: State, _viewer: Viewer): View {
  // Everything is on the table except the order of the deck.
  const { deck, events: _events, ...table } = state;
  return { ...table, deckCount: deck.drawPile.length };
}

export function ranking(t: Table) {
  return t.players
    .map((p) => {
      const a = t.areas[p.id]!;
      return { player: p.id, score: score(a), done: a.done.length, rush: a.rush };
    })
    .sort((a, b) => b.score - a.score || b.done - a.done || b.rush - a.rush);
}

export function getResult(state: State): GameResult | null {
  if (state.phase !== "over") return null;
  const ranked = ranking(state);
  const best = ranked[0]!;
  const winners = ranked
    .filter((r) => r.score === best.score && r.done === best.done && r.rush === best.rush)
    .map((r) => r.player);
  const names = winners.map((id) => nameOf(state, id));
  return {
    winners,
    ranking: ranked.map(({ player, score: sc }) => ({ player, score: sc })),
    text:
      winners.length === 1
        ? `${names[0]} wins with ${best.score} points!`
        : `${names.join(" and ")} share the win with ${best.score} points!`,
  };
}

export function getStatus(state: State, viewer: Viewer): GameStatus {
  const who = decider(state);
  if (!who) return { text: getResult(state)?.text ?? "Game over", activePlayers: [] };
  const you = viewer === who;
  const name = nameOf(state, who);
  const last = state.closed ? " (last round)" : "";
  let text: string;
  switch (state.phase) {
    case "place":
      text = you ? "Place your barista on a free cell" : `${name} is placing a barista`;
      break;
    case "move":
      text = you ? `Your turn: walk 1–3 steps${last}` : `${name} is walking${last}`;
      break;
    case "pour":
      text = you ? "Pour what you took into your cups" : `${name} is pouring`;
      break;
    default:
      text = you ? "Serve matching cups, then end your turn" : `${name} is serving`;
  }
  return { text, activePlayers: [who] };
}

function eventText(state: State, e: GameEvent, viewer: Viewer): string {
  const Name = (id: PlayerId) => (id === viewer ? "You" : nameOf(state, id));
  switch (e.type) {
    case "placed":
      return `${Name(e.player)} placed a barista on ${cellName(e.cell)}${e.got ? ` and took ${e.got}` : ""}.`;
    case "upgraded":
      return `${Name(e.player)} spent 3 orders on ${UPGRADES[e.upgrade].name}.`;
    case "moved":
      return `${Name(e.player)} walked ${e.path.map(cellName).join(">")} and took ${list(e.got)}${
        e.rushUsed ? ` (${plural(e.rushUsed, "Rush token")})` : ""
      }.`;
    case "poured":
      return `${Name(e.player)} poured ${e.poured}${e.returned ? `, put back ${e.returned}` : ""}${
        e.emptied.length ? `, emptied cup ${e.emptied.map((c) => c + 1).join(" & ")}` : ""
      }.`;
    case "served":
      return `${Name(e.player)} served ${recipeOf(e.card).name}${e.rush ? " (+1 Rush token)" : ""}.`;
    case "orders":
      return `${Name(e.player)} ${e.player === viewer ? "get" : "gets"} ${plural(e.count, "new order")}.`;
    case "penalties":
      return `${Name(e.player)} ${e.player === viewer ? "get" : "gets"} ${plural(e.count, "penalty").replace("penaltys", "penalties")} for stale orders.`;
    case "closed":
      return e.reason === "deck"
        ? "The order deck is empty: last round!"
        : e.reason === "penalties"
          ? "5 penalties: last round!"
          : "No orders left anywhere: last round!";
    case "over":
      return getResult(state)?.text ?? "Game over.";
  }
}

export function describeMove(
  _before: State,
  after: State,
  player: PlayerId,
  move: Move,
  viewer: Viewer,
): ActionDescription {
  const text = after.events.map((e) => eventText(after, e, viewer)).join(" ");
  // Ending a quiet turn still says what happened: everyone's orders moved up a tab.
  const ended =
    move.type === "endTurn"
      ? `${player === viewer ? "You" : nameOf(after, player)} ended the turn; orders moved one tab along.`
      : "";
  const desc: ActionDescription = { text: [ended, text].filter(Boolean).join(" ") };
  const has = (t: GameEvent["type"]) => after.events.some((e) => e.type === t);
  if (has("over")) {
    const won = viewer !== "spectator" && (getResult(after)?.winners.includes(viewer) ?? false);
    return { ...desc, tone: won ? "good" : "normal", flash: won ? "You win!" : "Game over" };
  }
  if (has("closed")) return { ...desc, tone: "bad", flash: "Last round!" };
  if (has("served")) return { ...desc, tone: player === viewer ? "good" : "normal" };
  if (after.events.some((e) => e.type === "penalties" && e.player === viewer))
    return { ...desc, tone: "bad" };
  return desc;
}
