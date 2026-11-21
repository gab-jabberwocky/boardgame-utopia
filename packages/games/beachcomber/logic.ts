import { createDeck, createTurnOrder, currentPlayer, nextTurn, type TurnOrder } from "@utopia/kit";
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
 * Beachcomber: a set-collection card game for 2–4 players.
 *
 * - Each round starts with empty hands, a shuffled deck and two face-up discard piles.
 * - On your turn add one card to your hand: draw 2 from the deck, keep 1 and discard
 *   the other (onto an empty pile if there is one), or take the top of a discard pile.
 * - Then you may play pairs of duo cards for their effect (each pair is worth 1 point
 *   in hand or played). Gulls: take any card from a discard pile. Surfers: another
 *   turn. Fishers: draw the top card. Pirate + Parrot: steal a random card.
 * - With 7+ card points you may end the round: "Stop" (everyone scores their cards) or
 *   "Last chance" (everyone else gets one more turn; if you still have the most points
 *   you score cards + colour bonus and they score only their colour bonus; otherwise
 *   you score only your colour bonus and they score their cards).
 * - If the deck is empty at the end of a turn, the round ends with no scoring.
 * - First to 40 / 35 / 30 points (2 / 3 / 4 players) after a round wins; ties go to the
 *   higher score that round. Holding all 4 Pearls wins at once.
 */

// ---------------------------------------------------------------- cards

export type Kind =
  | "gull"
  | "surfer"
  | "fisher"
  | "pirate"
  | "parrot"
  | "pebble"
  | "sandDollar"
  | "puffin"
  | "lifeguard"
  | "surfShack"
  | "fishMarket"
  | "puffinCliff"
  | "watchtower"
  | "pearl";

export type Colour =
  | "navy"
  | "sky"
  | "black"
  | "yellow"
  | "green"
  | "white"
  | "purple"
  | "grey"
  | "peach"
  | "pink"
  | "orange";

export const COLOURS: Colour[] = [
  "navy",
  "sky",
  "black",
  "yellow",
  "green",
  "white",
  "purple",
  "grey",
  "peach",
  "pink",
  "orange",
];

export const KIND_INFO: Record<
  Kind,
  { name: string; plural: string; group: "duo" | "collector" | "multiplier" | "pearl" }
> = {
  gull: { name: "Gull", plural: "Gulls", group: "duo" },
  surfer: { name: "Surfer", plural: "Surfers", group: "duo" },
  fisher: { name: "Fisher", plural: "Fishers", group: "duo" },
  pirate: { name: "Pirate", plural: "Pirates", group: "duo" },
  parrot: { name: "Parrot", plural: "Parrots", group: "duo" },
  pebble: { name: "Pebble", plural: "Pebbles", group: "collector" },
  sandDollar: { name: "Sand Dollar", plural: "Sand Dollars", group: "collector" },
  puffin: { name: "Puffin", plural: "Puffins", group: "collector" },
  lifeguard: { name: "Lifeguard", plural: "Lifeguards", group: "collector" },
  surfShack: { name: "Surf Shack", plural: "Surf Shacks", group: "multiplier" },
  fishMarket: { name: "Fish Market", plural: "Fish Markets", group: "multiplier" },
  puffinCliff: { name: "Puffin Cliff", plural: "Puffin Cliffs", group: "multiplier" },
  watchtower: { name: "Watchtower", plural: "Watchtowers", group: "multiplier" },
  pearl: { name: "Pearl", plural: "Pearls", group: "pearl" },
};

/** Points for 1, 2, 3… of a collector card. */
export const COLLECTOR_POINTS: Partial<Record<Kind, number[]>> = {
  pebble: [0, 2, 4, 6, 8, 10],
  sandDollar: [0, 3, 6, 9, 12],
  puffin: [1, 3, 5],
  lifeguard: [0, 5],
};

/** Multiplier cards: points per card of another kind. */
export const MULTIPLIERS: Partial<Record<Kind, { per: Kind; points: number }>> = {
  surfShack: { per: "surfer", points: 1 },
  fishMarket: { per: "fisher", points: 1 },
  puffinCliff: { per: "puffin", points: 2 },
  watchtower: { per: "lifeguard", points: 3 },
};

export type DuoKind = "gull" | "surfer" | "fisher" | "pirate";

export const DUO_INFO: Record<DuoKind, { cards: [Kind, Kind]; effect: string }> = {
  gull: { cards: ["gull", "gull"], effect: "take any card from a discard pile" },
  surfer: { cards: ["surfer", "surfer"], effect: "take another turn" },
  fisher: { cards: ["fisher", "fisher"], effect: "draw the top card of the deck" },
  pirate: { cards: ["pirate", "parrot"], effect: "steal a random card from a player" },
};

export interface Card {
  id: number;
  kind: Kind;
  colour: Colour;
}

/** [kind, colours…]: 58 cards. */
const CARD_LIST: [Kind, Colour[]][] = [
  ["gull", ["navy", "navy", "sky", "sky", "black", "black", "yellow", "yellow", "green"]],
  ["surfer", ["navy", "navy", "sky", "sky", "black", "black", "yellow", "yellow"]],
  ["fisher", ["navy", "navy", "sky", "sky", "black", "yellow", "green"]],
  ["pirate", ["navy", "sky", "black", "yellow", "purple"]],
  ["parrot", ["navy", "sky", "black", "yellow", "peach"]],
  ["pebble", ["navy", "sky", "black", "yellow", "green", "grey"]],
  ["sandDollar", ["green", "purple", "grey", "pink", "peach"]],
  ["puffin", ["purple", "pink", "grey"]],
  ["lifeguard", ["pink", "orange"]],
  ["surfShack", ["purple"]],
  ["fishMarket", ["green"]],
  ["puffinCliff", ["grey"]],
  ["watchtower", ["peach"]],
  ["pearl", ["white", "white", "white", "white"]],
];

export function fullDeck(): Card[] {
  const cards: Card[] = [];
  for (const [kind, colours] of CARD_LIST) {
    for (const colour of colours) cards.push({ id: cards.length, kind, colour });
  }
  return cards;
}

export const cardName = (c: Card) => `${KIND_INFO[c.kind].name} (${c.colour})`;

// ---------------------------------------------------------------- scoring

const count = (cards: Card[], kind: Kind) => cards.filter((c) => c.kind === kind).length;

export function colourCounts(cards: Card[]): Record<Colour, number> {
  const out = Object.fromEntries(COLOURS.map((c) => [c, 0])) as Record<Colour, number>;
  for (const c of cards) out[c.colour] += 1;
  return out;
}

/** Cards of the colour you have most of. */
export const colourBonus = (cards: Card[]) => Math.max(0, ...Object.values(colourCounts(cards)));

export interface Score {
  duos: number;
  collectors: number;
  multipliers: number;
  pearls: number;
  total: number;
}

/** Card points for a hand plus played pairs (no colour bonus). */
export function cardScore(hand: Card[], played: Card[][]): Score {
  const all = [...hand, ...played.flat()];
  const duos =
    played.length +
    Math.floor(count(hand, "gull") / 2) +
    Math.floor(count(hand, "surfer") / 2) +
    Math.floor(count(hand, "fisher") / 2) +
    Math.min(count(hand, "pirate"), count(hand, "parrot"));
  let collectors = 0;
  for (const [kind, table] of Object.entries(COLLECTOR_POINTS) as [Kind, number[]][]) {
    const n = count(all, kind);
    if (n > 0) collectors += table[Math.min(n, table.length) - 1]!;
  }
  let multipliers = 0;
  for (const [kind, m] of Object.entries(MULTIPLIERS) as [Kind, { per: Kind; points: number }][]) {
    if (count(all, kind) > 0) multipliers += count(all, kind) * m.points * count(all, m.per);
  }
  // Each Pearl scores a different colour: the most common, then the next, and so on.
  const sorted = Object.values(colourCounts(all)).sort((a, b) => b - a);
  const pearls = sorted.slice(0, count(all, "pearl")).reduce((n, v) => n + v, 0);
  return { duos, collectors, multipliers, pearls, total: duos + collectors + multipliers + pearls };
}

export const END_AT = 7;
export const targetScore = (playerCount: number, config: Config) =>
  ({ 2: 40, 3: 35, 4: 30 })[playerCount as 2 | 3 | 4]! * (config.length === "Long" ? 2 : 1);

// ---------------------------------------------------------------- state

export type Step = "draw" | "keep" | "act" | "scavenge" | "steal" | "roundOver" | "over";

export type GameEvent =
  | { type: "drew"; player: PlayerId; count: number }
  | { type: "kept"; player: PlayerId; card: Card; discarded: Card | null; pile: number }
  | { type: "took"; player: PlayerId; card: Card; pile: number }
  | { type: "duo"; player: PlayerId; duo: DuoKind; cards: Card[] }
  | { type: "scavenged"; player: PlayerId; card: Card; pile: number }
  | { type: "fished"; player: PlayerId; card: Card }
  | { type: "stole"; player: PlayerId; from: PlayerId; card: Card }
  | { type: "noEffect"; player: PlayerId; duo: DuoKind }
  | { type: "extraTurn"; player: PlayerId }
  | { type: "called"; player: PlayerId; call: "stop" | "lastChance" }
  | { type: "turnEnded"; player: PlayerId }
  | { type: "deckOut" }
  | { type: "scored"; scores: Record<PlayerId, number>; betWon: boolean | null }
  | { type: "pearls"; player: PlayerId }
  | { type: "won"; winners: PlayerId[] };

export interface Table {
  config: Config;
  players: PlayerInfo[];
  round: number;
  step: Step;
  turn: TurnOrder;
  /** Played pairs, face up. */
  played: Record<PlayerId, Card[][]>;
  totals: Record<PlayerId, number>;
  /** Last round's points, for the summary and tie-breaks. */
  lastRound: Record<PlayerId, number> | null;
  /** Extra turns owed to the current player (Surfer pairs). */
  extraTurns: number;
  /** Last chance: who called it, who still gets a final turn, whose hands are safe. */
  lastChance: { caller: PlayerId; remaining: PlayerId[]; safe: PlayerId[] } | null;
  /** Who ended the previous round (the next round starts to their left). */
  ender: PlayerId | null;
  winners: PlayerId[];
}

export interface State extends Table {
  deck: Card[];
  piles: [Card[], Card[]];
  hands: Record<PlayerId, Card[]>;
  /** The two cards drawn this turn, waiting for a keep/discard choice. */
  drawn: Card[];
  events: GameEvent[];
}

export interface View extends Table {
  deckCount: number;
  /** Top card of each discard pile, and how many cards are under it. */
  pileTops: [Card | null, Card | null];
  pileCounts: [number, number];
  /** Whole piles, only while you are picking from them (Gull pair). */
  pilesOpen: [Card[], Card[]] | null;
  hand: Card[];
  handCounts: Record<PlayerId, number>;
  /** Hands everyone may see: safe hands during Last chance, and all at round end. */
  shownHands: Record<PlayerId, Card[]>;
  drawn: Card[];
}

export type Move =
  | { type: "draw" }
  | { type: "keep"; card: number; pile: number }
  | { type: "take"; pile: number }
  | { type: "duo"; duo: DuoKind }
  | { type: "scavenge"; card: number }
  | { type: "steal"; target: PlayerId }
  | { type: "end" }
  | { type: "stop" }
  | { type: "lastChance" }
  | { type: "nextRound" };

// ---------------------------------------------------------------- setup

function dealRound(s: State, rng: MoveContext["rng"], first: number) {
  const deck = createDeck(fullDeck(), rng).drawPile;
  s.piles = [[deck.pop()!], [deck.pop()!]];
  s.deck = deck;
  s.hands = Object.fromEntries(s.players.map((p) => [p.id, []]));
  s.played = Object.fromEntries(s.players.map((p) => [p.id, []]));
  s.drawn = [];
  s.extraTurns = 0;
  s.lastChance = null;
  s.round += 1;
  s.step = "draw";
  s.turn = createTurnOrder(
    s.players.map((p) => p.id),
    first,
  );
}

export function setup(ctx: SetupContext, config: Config): State {
  const s: State = {
    config,
    players: ctx.players,
    round: 0,
    step: "draw",
    turn: createTurnOrder(
      ctx.players.map((p) => p.id),
      0,
    ),
    played: {},
    totals: Object.fromEntries(ctx.players.map((p) => [p.id, 0])),
    lastRound: null,
    extraTurns: 0,
    lastChance: null,
    ender: null,
    winners: [],
    deck: [],
    piles: [[], []],
    hands: {},
    drawn: [],
    events: [],
  };
  dealRound(s, ctx.rng, ctx.rng.int(0, ctx.players.length - 1));
  return s;
}

// ---------------------------------------------------------------- helpers

export const nameOf = (t: Pick<Table, "players">, id: PlayerId) =>
  t.players.find((p) => p.id === id)?.name ?? id;

export const pileName = (pile: number) => (pile === 0 ? "left" : "right");

export function scoreOf(s: Pick<State, "hands" | "played">, player: PlayerId): Score {
  return cardScore(s.hands[player] ?? [], s.played[player] ?? []);
}

/** Duo kinds this hand could play now. */
export function duosInHand(hand: Card[]): DuoKind[] {
  return (Object.keys(DUO_INFO) as DuoKind[]).filter((d) => {
    const [a, b] = DUO_INFO[d].cards;
    return a === b ? count(hand, a) >= 2 : count(hand, a) >= 1 && count(hand, b) >= 1;
  });
}

/** Players the current player can steal from. */
function stealTargets(s: State, player: PlayerId): PlayerId[] {
  return s.players
    .map((p) => p.id)
    .filter(
      (id) => id !== player && (s.hands[id]?.length ?? 0) > 0 && !s.lastChance?.safe.includes(id),
    );
}

function canCall(s: State, player: PlayerId) {
  return !s.lastChance && scoreOf(s, player).total >= END_AT;
}

// ---------------------------------------------------------------- moves

export function getLegalMoves(state: State, player: PlayerId): LegalMove<Move>[] {
  if (state.step === "over") return [];
  const current = currentPlayer(state.turn);
  if (state.step === "roundOver") {
    return player === current
      ? [{ move: { type: "nextRound" }, label: "Start the next round" }]
      : [];
  }
  if (player !== current) return [];
  const hand = state.hands[player] ?? [];
  switch (state.step) {
    case "draw": {
      const moves: LegalMove<Move>[] = [];
      if (state.deck.length > 0) {
        moves.push({
          move: { type: "draw" },
          label: state.deck.length >= 2 ? "Draw 2 cards" : "Draw the last card",
          where: "board",
        });
      }
      const tops = state.piles.map((pile) => pile[pile.length - 1]);
      tops.forEach((top, i) => {
        if (!top) return;
        // Name the pile only when both piles show the same kind of card.
        const twin = tops[1 - i]?.kind === top.kind;
        moves.push({
          move: { type: "take", pile: i },
          label: `Take ${KIND_INFO[top.kind].name}${twin ? ` (${pileName(i)})` : ""}`,
          where: "board",
        });
      });
      return moves;
    }
    case "keep": {
      if (state.drawn.length === 1) {
        return [
          {
            move: { type: "keep", card: state.drawn[0]!.id, pile: 0 },
            label: `Keep ${KIND_INFO[state.drawn[0]!.kind].name}`,
            where: "board",
          },
        ];
      }
      const empty = [0, 1].filter((i) => state.piles[i]!.length === 0);
      const piles = empty.length ? empty : [0, 1];
      return state.drawn.flatMap((keep) => {
        const other = state.drawn.find((c) => c.id !== keep.id)!;
        return piles.map((pile) => ({
          move: { type: "keep", card: keep.id, pile } as Move,
          label: `Keep ${KIND_INFO[keep.kind].name}, ${KIND_INFO[other.kind].name} to the ${pileName(pile)} pile`,
          where: "board" as const,
        }));
      });
    }
    case "act": {
      const moves: LegalMove<Move>[] = duosInHand(hand).map((duo) => ({
        move: { type: "duo", duo },
        label: `Play ${duo === "pirate" ? "Pirate + Parrot" : `2 ${KIND_INFO[duo].plural}`}`,
        where: "board" as const,
      }));
      moves.push({
        move: { type: "end" },
        label: state.extraTurns > 0 ? "End turn (extra turn next)" : "End turn",
      });
      if (canCall(state, player)) {
        moves.push({ move: { type: "stop" }, label: "Stop: score now" });
        moves.push({ move: { type: "lastChance" }, label: "Last chance" });
      }
      return moves;
    }
    case "scavenge":
      return state.piles.flatMap((pile, i) =>
        pile.map((card) => ({
          move: { type: "scavenge", card: card.id } as Move,
          label: `Take ${KIND_INFO[card.kind].name} (${card.colour}) from the ${pileName(i)} pile`,
          where: "board" as const,
        })),
      );
    case "steal":
      return stealTargets(state, player).map((target) => ({
        move: { type: "steal", target },
        label: `Steal from ${nameOf(state, target)}`,
      }));
  }
}

export function validateMove(state: State, player: PlayerId, move: Move): string | null {
  if (state.step === "over") return "The game is over.";
  const key = JSON.stringify(move);
  if (getLegalMoves(state, player).some((m) => JSON.stringify(m.move) === key)) return null;
  return currentPlayer(state.turn) === player || state.step === "roundOver"
    ? "That move isn't allowed right now."
    : "It's not your turn.";
}

// ---------------------------------------------------------------- engine

function checkPearls(s: State, player: PlayerId): boolean {
  if (count(s.hands[player] ?? [], "pearl") < 4) return false;
  s.events.push({ type: "pearls", player });
  s.winners = [player];
  s.step = "over";
  s.events.push({ type: "won", winners: [player] });
  return true;
}

function addToHand(s: State, player: PlayerId, card: Card) {
  s.hands[player]!.push(card);
  checkPearls(s, player);
}

function scoreRound(s: State, call: "stop" | "lastChance") {
  const scores: Record<PlayerId, number> = {};
  let betWon: boolean | null = null;
  const cardsOf = (id: PlayerId) => [...(s.hands[id] ?? []), ...(s.played[id] ?? []).flat()];
  if (call === "stop") {
    for (const p of s.players) scores[p.id] = scoreOf(s, p.id).total;
  } else {
    const caller = s.lastChance!.caller;
    const mine = scoreOf(s, caller).total;
    betWon = s.players.every((p) => p.id === caller || scoreOf(s, p.id).total <= mine);
    for (const p of s.players) {
      const bonus = colourBonus(cardsOf(p.id));
      if (p.id === caller) scores[p.id] = betWon ? mine + bonus : bonus;
      else scores[p.id] = betWon ? bonus : scoreOf(s, p.id).total;
    }
  }
  for (const p of s.players) s.totals[p.id] = (s.totals[p.id] ?? 0) + (scores[p.id] ?? 0);
  s.lastRound = scores;
  s.events.push({ type: "scored", scores, betWon });
  const target = targetScore(s.players.length, s.config);
  if (s.players.some((p) => (s.totals[p.id] ?? 0) >= target)) {
    const best = Math.max(...s.players.map((p) => s.totals[p.id] ?? 0));
    let top = s.players.filter((p) => s.totals[p.id] === best).map((p) => p.id);
    if (top.length > 1) {
      const bestRound = Math.max(...top.map((id) => scores[id] ?? 0));
      top = top.filter((id) => scores[id] === bestRound);
    }
    s.winners = top;
    s.step = "over";
    s.events.push({ type: "won", winners: top });
  } else {
    s.step = "roundOver";
  }
}

/** The round is over (scored or not): the next starts left of whoever ended it. */
function closeRound(s: State, ender: PlayerId) {
  s.ender = ender;
  if (s.step !== "over") {
    s.step = "roundOver";
    const ids = s.players.map((p) => p.id);
    s.turn = { ...s.turn, current: (ids.indexOf(ender) + 1) % ids.length };
  }
}

function endTurn(s: State, player: PlayerId) {
  s.events.push({ type: "turnEnded", player });
  const lc = s.lastChance;
  if (lc && player !== lc.caller) {
    lc.safe.push(player);
    lc.remaining = lc.remaining.filter((id) => id !== player);
  }
  if (s.deck.length === 0) {
    s.events.push({ type: "deckOut" });
    s.lastRound = null;
    closeRound(s, player);
    return;
  }
  if (lc && lc.remaining.length === 0) {
    scoreRound(s, "lastChance");
    closeRound(s, lc.caller);
    return;
  }
  // During Last chance everyone gets exactly one final turn: no extra turns.
  if (lc) s.extraTurns = 0;
  if (s.extraTurns > 0) {
    s.extraTurns -= 1;
    s.events.push({ type: "extraTurn", player });
  } else {
    s.turn = nextTurn(s.turn);
  }
  s.step = "draw";
}

export function applyMove(state: State, player: PlayerId, move: Move, ctx: MoveContext): State {
  const s = structuredClone(state);
  s.events = [];
  const hand = s.hands[player]!;
  switch (move.type) {
    case "draw":
      s.drawn = s.deck.splice(-Math.min(2, s.deck.length)).reverse();
      s.events.push({ type: "drew", player, count: s.drawn.length });
      s.step = "keep";
      break;
    case "keep": {
      const card = s.drawn.find((c) => c.id === move.card)!;
      const other = s.drawn.find((c) => c.id !== move.card) ?? null;
      if (other) s.piles[move.pile]!.push(other);
      s.drawn = [];
      s.events.push({ type: "kept", player, card, discarded: other, pile: move.pile });
      s.step = "act";
      addToHand(s, player, card);
      break;
    }
    case "take": {
      const card = s.piles[move.pile]!.pop()!;
      s.events.push({ type: "took", player, card, pile: move.pile });
      s.step = "act";
      addToHand(s, player, card);
      break;
    }
    case "duo": {
      const [a, b] = DUO_INFO[move.duo].cards;
      const first = hand.find((c) => c.kind === a)!;
      const second = hand.find((c) => c.kind === b && c.id !== first.id)!;
      s.hands[player] = hand.filter((c) => c.id !== first.id && c.id !== second.id);
      s.played[player]!.push([first, second]);
      s.events.push({ type: "duo", player, duo: move.duo, cards: [first, second] });
      if (move.duo === "surfer") {
        s.extraTurns += 1;
      } else if (move.duo === "fisher") {
        const top = s.deck.pop();
        if (top) {
          s.events.push({ type: "fished", player, card: top });
          addToHand(s, player, top);
        } else s.events.push({ type: "noEffect", player, duo: move.duo });
      } else if (move.duo === "gull") {
        if (s.piles[0].length + s.piles[1].length > 0) s.step = "scavenge";
        else s.events.push({ type: "noEffect", player, duo: move.duo });
      } else if (stealTargets(s, player).length > 0) {
        s.step = "steal";
      } else {
        s.events.push({ type: "noEffect", player, duo: move.duo });
      }
      break;
    }
    case "scavenge": {
      const pile = s.piles[0].some((c) => c.id === move.card) ? 0 : 1;
      const card = s.piles[pile]!.find((c) => c.id === move.card)!;
      s.piles[pile] = s.piles[pile]!.filter((c) => c.id !== move.card);
      s.events.push({ type: "scavenged", player, card, pile });
      s.step = "act";
      addToHand(s, player, card);
      break;
    }
    case "steal": {
      const victim = s.hands[move.target]!;
      const card = victim.splice(ctx.rng.int(0, victim.length - 1), 1)[0]!;
      s.events.push({ type: "stole", player, from: move.target, card });
      s.step = "act";
      addToHand(s, player, card);
      break;
    }
    case "end":
      endTurn(s, player);
      break;
    case "stop":
      s.events.push({ type: "called", player, call: "stop" });
      scoreRound(s, "stop");
      closeRound(s, player);
      break;
    case "lastChance": {
      s.events.push({ type: "called", player, call: "lastChance" });
      const ids = s.players.map((p) => p.id);
      const i = ids.indexOf(player);
      const remaining = [...ids.slice(i + 1), ...ids.slice(0, i)];
      s.lastChance = { caller: player, remaining, safe: [] };
      s.extraTurns = 0;
      endTurn(s, player);
      break;
    }
    case "nextRound": {
      const ids = s.players.map((p) => p.id);
      dealRound(s, ctx.rng, ids.indexOf(player));
      break;
    }
  }
  return s;
}

// ---------------------------------------------------------------- views and text

export function getPlayerView(state: State, viewer: Viewer): View {
  const { deck, piles, hands, drawn, events: _events, ...table } = state;
  const mine = viewer !== "spectator" && currentPlayer(state.turn) === viewer;
  const roundDone = state.step === "roundOver" || state.step === "over";
  const shown: Record<PlayerId, Card[]> = {};
  for (const p of state.players) {
    if (roundDone || state.lastChance?.safe.includes(p.id)) shown[p.id] = hands[p.id] ?? [];
  }
  return {
    ...table,
    deckCount: deck.length,
    pileTops: [piles[0][piles[0].length - 1] ?? null, piles[1][piles[1].length - 1] ?? null],
    pileCounts: [piles[0].length, piles[1].length],
    pilesOpen: mine && state.step === "scavenge" ? piles : null,
    hand: viewer === "spectator" ? [] : (hands[viewer] ?? []),
    handCounts: Object.fromEntries(state.players.map((p) => [p.id, hands[p.id]?.length ?? 0])),
    shownHands: shown,
    drawn: mine ? drawn : [],
  };
}

export function getResult(state: State): GameResult | null {
  if (state.step !== "over") return null;
  const names = state.winners.map((id) => nameOf(state, id));
  const pearls =
    state.winners.length === 1 && count(state.hands[state.winners[0]!] ?? [], "pearl") >= 4;
  return {
    winners: state.winners,
    ranking: state.players
      .map((p) => ({ player: p.id, score: state.totals[p.id] ?? 0 }))
      .sort((a, b) => b.score - a.score),
    text: pearls
      ? `${names[0]} found all 4 Pearls and wins!`
      : names.length === 1
        ? `${names[0]} wins with ${state.totals[state.winners[0]!]} points!`
        : `${names.join(" and ")} share the win!`,
  };
}

export function getStatus(state: State, viewer: Viewer): GameStatus {
  if (state.step === "over")
    return { text: getResult(state)?.text ?? "Game over", activePlayers: [] };
  const who = currentPlayer(state.turn);
  const you = viewer === who;
  const name = nameOf(state, who);
  const last = state.lastChance && state.lastChance.caller !== who ? " (last chance turn)" : "";
  let text: string;
  switch (state.step) {
    case "roundOver":
      text = you ? "Round over: start the next round" : `Round over. ${name} starts the next one`;
      break;
    case "draw":
      text = you ? `Your turn${last}: draw 2 or take a discard` : `${name} is drawing${last}`;
      break;
    case "keep":
      text = you ? "Keep one card, discard the other" : `${name} is choosing a card`;
      break;
    case "act":
      text = you ? "Play pairs, end your turn, or end the round" : `${name} is playing${last}`;
      break;
    case "scavenge":
      text = you ? "Take any card from a discard pile" : `${name} is searching a discard pile`;
      break;
    case "steal":
      text = you ? "Pick a player to steal from" : `${name} is about to steal a card`;
      break;
  }
  return { text, activePlayers: [who] };
}

function eventText(state: State, e: GameEvent, viewer: Viewer): string {
  const Name = (id: PlayerId) => (id === viewer ? "You" : nameOf(state, id));
  const name = (id: PlayerId) => (id === viewer ? "you" : nameOf(state, id));
  switch (e.type) {
    case "drew":
      return `${Name(e.player)} drew ${e.count === 1 ? "the last card" : "2 cards"}.`;
    case "kept":
      return e.discarded
        ? `${Name(e.player)} discarded ${cardName(e.discarded)} on the ${pileName(e.pile)} pile${
            e.player === viewer ? ` and kept ${cardName(e.card)}` : ""
          }.`
        : `${Name(e.player)} kept the last card.`;
    case "took":
      return `${Name(e.player)} took ${cardName(e.card)} from the ${pileName(e.pile)} pile.`;
    case "duo":
      return `${Name(e.player)} played ${e.cards.map(cardName).join(" + ")}.`;
    case "scavenged":
      return e.player === viewer
        ? `You took ${cardName(e.card)} from the ${pileName(e.pile)} pile.`
        : `${Name(e.player)} took a card from the ${pileName(e.pile)} pile.`;
    case "fished":
      return e.player === viewer
        ? `You drew ${cardName(e.card)}.`
        : `${Name(e.player)} drew a card.`;
    case "stole":
      return e.player === viewer || e.from === viewer
        ? `${Name(e.player)} stole ${cardName(e.card)} from ${name(e.from)}.`
        : `${Name(e.player)} stole a card from ${name(e.from)}.`;
    case "noEffect":
      return "Nothing to take.";
    case "extraTurn":
      return `${Name(e.player)} ${e.player === viewer ? "take" : "takes"} another turn.`;
    case "called":
      return e.call === "stop"
        ? `${Name(e.player)} called Stop!`
        : `${Name(e.player)} called Last chance! Everyone else gets one more turn.`;
    case "turnEnded":
      return "";
    case "deckOut":
      return "The deck ran out: this round scores nothing.";
    case "scored": {
      const list = state.players
        .map((p) => `${nameOf(state, p.id)} +${e.scores[p.id] ?? 0}`)
        .join(", ");
      const bet = e.betWon === null ? "" : e.betWon ? " The bet paid off." : " The bet failed.";
      return `Round scored:${bet} ${list}.`;
    }
    case "pearls":
      return `${Name(e.player)} ${e.player === viewer ? "have" : "has"} all 4 Pearls!`;
    case "won":
      return getResult(state)?.text ?? "";
  }
}

export function describeMove(
  _before: State,
  after: State,
  _player: PlayerId,
  _move: Move,
  viewer: Viewer,
): ActionDescription {
  const desc: ActionDescription = {
    text: after.events
      .map((e) => eventText(after, e, viewer))
      .filter(Boolean)
      .join(" "),
  };
  const has = (t: GameEvent["type"]) => after.events.some((e) => e.type === t);
  if (has("won")) {
    const won = viewer !== "spectator" && after.winners.includes(viewer);
    return {
      ...desc,
      tone: won ? "good" : "normal",
      flash: won ? "You win!" : `${nameOf(after, after.winners[0]!)} wins!`,
    };
  }
  const stole = after.events.find((e) => e.type === "stole");
  if (stole?.type === "stole" && stole.from === viewer) return { ...desc, tone: "bad" };
  const called = after.events.find((e) => e.type === "called");
  if (called?.type === "called") {
    return { ...desc, flash: called.call === "stop" ? "Stop!" : "Last chance!" };
  }
  if (has("deckOut")) return { ...desc, tone: "bad" };
  return desc;
}
