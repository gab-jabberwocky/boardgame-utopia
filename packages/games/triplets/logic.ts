import {
  createDeck,
  createTurnOrder,
  currentPlayer,
  drawCards,
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
 * Triplets: find three of a kind.
 *
 * - 36 cards, three each of 1–12. Each player holds a hand, sorted low to high and
 *   hidden; the rest lie face down in the middle.
 * - On your turn, reveal cards one at a time: the lowest or highest card of any hand
 *   (yours included; asking again gives the next one in), or any card in the middle.
 * - Stop when a card doesn't match the previous one: everyone sees the cards, then they
 *   go back where they came from. Or when you find all three: keep the trio.
 * - Win with 3 trios (Simple) or 2 connected trios (Spicy: numbers adding up to 7 or
 *   7 apart). The 7 trio always wins.
 * - Nothing revealed is written down: remembering where the numbers are is the game.
 */

export const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const COPIES = 3;
export const LUCKY = 7;

/** Cards per hand and in the middle, by player count. */
export const DEAL: Record<number, { hand: number; middle: number }> = {
  3: { hand: 9, middle: 9 },
  4: { hand: 7, middle: 8 },
  5: { hand: 6, middle: 6 },
  6: { hand: 5, middle: 6 },
};

export function fullDeck(): number[] {
  return VALUES.flatMap((v) => Array.from({ length: COPIES }, () => v));
}

/** Spicy mode: two numbers are connected if they add up to 7 or are 7 apart. */
export const connected = (a: number, b: number) => a + b === 7 || Math.abs(a - b) === 7;

export const connections = (n: number): number[] => VALUES.filter((m) => connected(n, m));

export type End = "low" | "high";

export type Reveal =
  | { from: "hand"; player: PlayerId; end: End; value: number }
  | { from: "middle"; slot: number; value: number };

export type Win = { how: "seven" } | { how: "three" } | { how: "pair"; trios: [number, number] };

export type GameEvent =
  | { type: "revealed"; player: PlayerId; reveal: Reveal }
  | { type: "match"; count: number }
  | { type: "mismatch" }
  | { type: "trio"; player: PlayerId; value: number }
  | { type: "putBack"; player: PlayerId }
  | { type: "won"; player: PlayerId; win: Win };

/** What everyone can see. */
export interface Table {
  config: Config;
  players: PlayerInfo[];
  /** "mismatch": the cards stay face up until the player puts them back. */
  phase: "reveal" | "mismatch" | "over";
  turn: TurnOrder;
  trios: Record<PlayerId, number[]>;
  /** Cards face up this turn, in order. */
  revealed: Reveal[];
  winner: PlayerId | null;
  win: Win | null;
}

export interface State extends Table {
  /** Sorted low to high. */
  hands: Record<PlayerId, number[]>;
  /** Face-down cards in the middle; null once taken in a trio. */
  middle: (number | null)[];
  events: GameEvent[];
}

export interface View extends Table {
  /** Your own hand (empty for spectators). */
  hand: number[];
  handCounts: Record<PlayerId, number>;
  /** Each middle slot: face down, face up (revealed this turn), or gone. */
  middle: (number | "down" | "gone")[];
}

export type Move =
  | { type: "reveal"; target: PlayerId; end: End }
  | { type: "flip"; slot: number }
  | { type: "putBack" };

// ---------------------------------------------------------------- setup

export function setup(ctx: SetupContext, config: Config): State {
  const n = ctx.players.length;
  const deal = DEAL[n];
  if (!deal) throw new Error(`Triplets is for 3–6 players, not ${n}`);
  let deck = createDeck(fullDeck(), ctx.rng);
  const hands: Record<PlayerId, number[]> = {};
  for (const p of ctx.players) {
    const drawn = drawCards(deck, ctx.rng, deal.hand);
    deck = drawn.deck;
    hands[p.id] = drawn.cards.sort((a, b) => a - b);
  }
  const middle = drawCards(deck, ctx.rng, deal.middle).cards;
  return {
    config,
    players: ctx.players,
    phase: "reveal",
    turn: createTurnOrder(
      ctx.players.map((p) => p.id),
      ctx.rng.int(0, n - 1),
    ),
    trios: Object.fromEntries(ctx.players.map((p) => [p.id, []])),
    revealed: [],
    winner: null,
    win: null,
    hands,
    middle,
    events: [],
  };
}

// ---------------------------------------------------------------- helpers

export const nameOf = (t: Pick<Table, "players">, id: PlayerId) =>
  t.players.find((p) => p.id === id)?.name ?? id;

/** How many cards of this hand are face up at each end this turn. */
export function shown(t: Pick<Table, "revealed">, player: PlayerId): Record<End, number> {
  const out = { low: 0, high: 0 };
  for (const r of t.revealed) if (r.from === "hand" && r.player === player) out[r.end] += 1;
  return out;
}

/** The next card this end of the hand would show, if any are left. */
function nextFrom(s: State, player: PlayerId, end: End): number | undefined {
  const hand = s.hands[player] ?? [];
  const { low, high } = shown(s, player);
  if (low + high >= hand.length) return undefined;
  return end === "low" ? hand[low] : hand[hand.length - 1 - high];
}

export function winOf(trios: number[], mode: Config["mode"]): Win | null {
  if (trios.includes(LUCKY)) return { how: "seven" };
  if (mode === "Simple") return trios.length >= 3 ? { how: "three" } : null;
  for (const a of trios) {
    const b = trios.find((x) => connected(a, x));
    if (b !== undefined) return { how: "pair", trios: [Math.min(a, b), Math.max(a, b)] };
  }
  return null;
}

const plural = (v: number) => `${v}s`;

// ---------------------------------------------------------------- moves

export function getLegalMoves(state: State, player: PlayerId): LegalMove<Move>[] {
  if (state.phase === "over" || currentPlayer(state.turn) !== player) return [];
  if (state.phase === "mismatch")
    return [{ move: { type: "putBack" }, label: "Put the cards back" }];
  const moves: LegalMove<Move>[] = [];
  for (const p of state.players) {
    for (const end of ["low", "high"] as const) {
      if (nextFrom(state, p.id, end) === undefined) continue;
      const which = end === "low" ? "lowest" : "highest";
      moves.push({
        move: { type: "reveal", target: p.id, end },
        label: p.id === player ? `Reveal your ${which} card` : `Ask ${p.name} for their ${which}`,
        where: "board",
      });
    }
  }
  state.middle.forEach((card, slot) => {
    const up = state.revealed.some((r) => r.from === "middle" && r.slot === slot);
    if (card !== null && !up) {
      moves.push({
        move: { type: "flip", slot },
        label: `Flip middle card ${slot + 1}`,
        where: "board",
      });
    }
  });
  return moves;
}

export function validateMove(state: State, player: PlayerId, move: Move): string | null {
  if (state.phase === "over") return "The game is over.";
  if (currentPlayer(state.turn) !== player) return "It's not your turn.";
  const key = JSON.stringify(move);
  const legal = getLegalMoves(state, player).some((m) => JSON.stringify(m.move) === key);
  return legal ? null : "That move isn't allowed right now.";
}

function takeTrio(s: State, player: PlayerId, value: number) {
  for (const r of s.revealed) {
    if (r.from === "middle") s.middle[r.slot] = null;
    else {
      const hand = s.hands[r.player]!;
      hand.splice(hand.indexOf(value), 1);
    }
  }
  s.revealed = [];
  s.trios[player]!.push(value);
  s.events.push({ type: "trio", player, value });
  const win = winOf(s.trios[player]!, s.config.mode);
  if (win) {
    s.phase = "over";
    s.winner = player;
    s.win = win;
    s.events.push({ type: "won", player, win });
  } else {
    s.turn = nextTurn(s.turn);
  }
}

export function applyMove(state: State, player: PlayerId, move: Move, _ctx: MoveContext): State {
  const s = structuredClone(state);
  s.events = [];
  if (move.type === "putBack") {
    s.revealed = [];
    s.phase = "reveal";
    s.events.push({ type: "putBack", player });
    s.turn = nextTurn(s.turn);
    return s;
  }
  const reveal: Reveal =
    move.type === "reveal"
      ? {
          from: "hand",
          player: move.target,
          end: move.end,
          value: nextFrom(s, move.target, move.end)!,
        }
      : { from: "middle", slot: move.slot, value: s.middle[move.slot]! };
  const first = s.revealed[0]?.value;
  s.revealed.push(reveal);
  s.events.push({ type: "revealed", player, reveal });
  if (first !== undefined && reveal.value !== first) {
    s.phase = "mismatch";
    s.events.push({ type: "mismatch" });
  } else if (s.revealed.length === COPIES) {
    takeTrio(s, player, reveal.value);
  } else if (s.revealed.length > 1) {
    s.events.push({ type: "match", count: s.revealed.length });
  }
  return s;
}

// ---------------------------------------------------------------- views and text

export function getPlayerView(state: State, viewer: Viewer): View {
  const { hands, middle, events: _events, ...table } = state;
  const over = state.phase === "over";
  return {
    ...table,
    hand: viewer === "spectator" ? [] : (hands[viewer] ?? []),
    handCounts: Object.fromEntries(state.players.map((p) => [p.id, hands[p.id]?.length ?? 0])),
    middle: middle.map((card, slot) =>
      card === null
        ? "gone"
        : over || state.revealed.some((r) => r.from === "middle" && r.slot === slot)
          ? card
          : "down",
    ),
  };
}

function winText(name: string, win: Win): string {
  const wins = `${name} ${name === "You" ? "win" : "wins"}`;
  if (win.how === "seven") return `${wins} with the 7 trio!`;
  if (win.how === "three") return `${wins} with three trios!`;
  return `${wins} with connected trios: ${win.trios[0]} & ${win.trios[1]}!`;
}

export function getResult(state: State): GameResult | null {
  if (state.phase !== "over" || !state.winner || !state.win) return null;
  return {
    winners: [state.winner],
    ranking: state.players
      .map((p) => ({ player: p.id, score: state.trios[p.id]?.length ?? 0 }))
      .sort((a, b) => b.score - a.score),
    text: winText(nameOf(state, state.winner), state.win),
  };
}

export function getStatus(state: State, viewer: Viewer): GameStatus {
  if (state.phase === "over") {
    return { text: getResult(state)?.text ?? "Game over", activePlayers: [] };
  }
  const who = currentPlayer(state.turn);
  const you = viewer === who;
  const name = nameOf(state, who);
  let text: string;
  if (state.phase === "mismatch") {
    text = you ? "No match. Take a good look, then put the cards back" : `No match for ${name}`;
  } else if (state.revealed.length === 0) {
    text = you ? "Your turn: reveal a card" : `${name} is hunting for a trio`;
  } else {
    const v = state.revealed[0]!.value;
    const left = COPIES - state.revealed.length;
    text = you
      ? `Find ${left} more ${left === 1 ? String(v) : plural(v)}`
      : `${name} has ${state.revealed.length} × ${v}`;
  }
  return { text, activePlayers: [who] };
}

function eventText(state: State, e: GameEvent, viewer: Viewer): string | null {
  const Name = (id: PlayerId) => (id === viewer ? "You" : nameOf(state, id));
  switch (e.type) {
    case "revealed": {
      const r = e.reveal;
      // Numbers are left out on purpose: remembering them is the game.
      if (r.from === "middle") return `${Name(e.player)} flipped a card in the middle.`;
      const which = r.end === "low" ? "lowest" : "highest";
      const whose =
        r.player === e.player
          ? e.player === viewer
            ? "your"
            : "their own"
          : r.player === viewer
            ? "your"
            : `${nameOf(state, r.player)}'s`;
      return `${Name(e.player)} revealed ${whose} ${which} card.`;
    }
    case "match":
      return e.count === 2 ? "A pair!" : null;
    case "mismatch":
      return "No match.";
    case "trio":
      return `Trio of ${plural(e.value)} for ${e.player === viewer ? "you" : nameOf(state, e.player)}!`;
    case "putBack":
      return "The cards go back face down.";
    case "won":
      return winText(Name(e.player), e.win);
  }
}

export function describeMove(
  _before: State,
  after: State,
  player: PlayerId,
  _move: Move,
  viewer: Viewer,
): ActionDescription {
  const text = after.events
    .map((e) => eventText(after, e, viewer))
    .filter((t): t is string => !!t)
    .join(" ");
  const desc: ActionDescription = { text };
  const won = after.events.find((e) => e.type === "won");
  if (won) {
    return {
      ...desc,
      tone: "good",
      flash: player === viewer ? "You win!" : `${nameOf(after, player)} wins!`,
    };
  }
  const trio = after.events.find((e) => e.type === "trio");
  if (trio?.type === "trio")
    return { ...desc, tone: "good", flash: `Trio of ${plural(trio.value)}!` };
  if (after.events.some((e) => e.type === "mismatch")) return { ...desc, tone: "bad" };
  return desc;
}
