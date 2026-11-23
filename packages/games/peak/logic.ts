import {
  DICE_ROLL_MS,
  createTurnOrder,
  currentPlayer,
  nextTurn,
  rollDice,
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
 * Peak: a push-your-luck climbing game.
 *
 * - 11 trails, numbered 2 to 12. Trail 7 is the longest (13 steps), 2 and 12 the shortest (3).
 * - On your turn, roll 4 dice and split them into two pairs. Each pair's sum is a trail to climb.
 * - You have 3 climbers per turn. A climber starts just above your camp on that trail.
 * - After climbing you may roll again or stop. Stopping turns your climbers into camps.
 * - If a roll gives no trail you can climb, you fall: this turn's climbing is lost.
 * - A camp on the top step claims that trail's peak; other players' camps there are removed.
 * - First to claim `peaksToWin` peaks wins.
 * - If every peak is claimed before anyone gets there, most peaks wins (ties share the win).
 */

export const TRAILS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const CLIMBERS_PER_TURN = 3;

/** Number of steps on a trail: 3 for trail 2, up to 13 for trail 7. */
export function trailLength(trail: number): number {
  return 13 - 2 * Math.abs(7 - trail);
}

/** Per-trail values are arrays indexed by trail number (index 0 and 1 are unused). */
const emptyTrails = (): number[] => Array.from({ length: 13 }, () => 0);

export type Phase = "roll" | "choose" | "decide" | "over";

export interface State {
  config: Config;
  players: PlayerInfo[];
  turn: TurnOrder;
  /** roll: must roll. choose: pick trails from the dice. decide: roll again or stop. */
  phase: Phase;
  /** Last roll, empty before the first roll of a turn. */
  dice: number[];
  /** Each player's camp step per trail (0 = no camp). */
  camps: Record<PlayerId, number[]>;
  /** This turn's climber step per trail (0 = no climber). */
  climbers: number[];
  /** Who claimed each trail's peak. */
  peaks: (PlayerId | null)[];
  winner: PlayerId | null;
  /** Climbers lost in the most recent fall, so the board can show them. Cleared on the next roll. */
  fallen: { player: PlayerId; climbers: number[] } | null;
  /** Where the last player to make camp had their camps before, to show the move. Cleared on the next roll. */
  campMove: { player: PlayerId; from: number[] } | null;
}

export type Move = { type: "roll" } | { type: "climb"; trails: number[] } | { type: "stop" };

// ---------------------------------------------------------------- setup

export function setup(ctx: SetupContext, config: Config): State {
  const ids = ctx.players.map((p) => p.id);
  // The rules have everyone roll for first player; a random seat is equivalent.
  const first = ctx.rng.int(0, ids.length - 1);
  return {
    config,
    players: ctx.players,
    turn: createTurnOrder(ids, first),
    phase: "roll",
    dice: [],
    camps: Object.fromEntries(ids.map((id) => [id, emptyTrails()])),
    climbers: emptyTrails(),
    peaks: Array.from({ length: 13 }, () => null),
    winner: null,
    fallen: null,
    campMove: null,
  };
}

// ---------------------------------------------------------------- rules helpers

export const activePlayer = (state: State): PlayerId => currentPlayer(state.turn);

const climberCount = (climbers: readonly number[]) => climbers.filter((h) => h > 0).length;

function campAt(state: State, player: PlayerId, trail: number): number {
  return state.camps[player]?.[trail] ?? 0;
}

/** Is another player's camp on this step? */
export function opponentCampOn(state: State, player: PlayerId, trail: number, step: number) {
  return state.players.some((p) => p.id !== player && campAt(state, p.id, trail) === step);
}

/** The step a climber moves to from `from`, applying the "skip" variant. */
function nextStep(state: State, player: PlayerId, trail: number, from: number): number {
  let step = from + 1;
  if (state.config.landingOnCamps === "skip") {
    // The top step can never hold another camp (that trail would be claimed), so this ends.
    while (step < trailLength(trail) && opponentCampOn(state, player, trail, step)) step++;
  }
  return step;
}

/** Move one climber up `trail` (placing a new one if needed). Returns null if not allowed. */
function climbOnce(state: State, climbers: number[], trail: number): number[] | null {
  if (state.peaks[trail] !== null) return null; // claimed trails are closed to everyone
  const player = activePlayer(state);
  const top = trailLength(trail);
  const current = climbers[trail] ?? 0;
  if (current === 0 && climberCount(climbers) >= CLIMBERS_PER_TURN) return null;
  const from = current > 0 ? current : campAt(state, player, trail);
  if (from >= top) return null;
  const next = [...climbers];
  next[trail] = nextStep(state, player, trail, from);
  return next;
}

/** Apply a climb choice to the climbers. Returns null if any step is not allowed. */
export function climb(state: State, trails: readonly number[]): number[] | null {
  let climbers: number[] | null = state.climbers;
  for (const t of trails) {
    if (!climbers) return null;
    climbers = climbOnce(state, climbers, t);
  }
  return climbers;
}

/** The three ways to split four dice into two pairs, as pair sums. */
export function pairings(dice: readonly number[]): [number, number][] {
  const [a = 0, b = 0, c = 0, d = 0] = dice;
  return [
    [a + b, c + d],
    [a + c, b + d],
    [a + d, b + c],
  ];
}

/** Dice indexes for the three ways to split four dice into two pairs. */
export const SPLITS = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [1, 3],
  ],
  [
    [0, 3],
    [1, 2],
  ],
] as const;

/** A legal climb plus how the dice make it, for showing the choice on the board. */
export interface DiceChoice {
  /** Trails to climb, sorted. Same trail twice for doubles like 7 & 7. */
  trails: number[];
  /** The two dice pairs (dice indexes) of this split. */
  pairs: readonly [readonly [number, number], readonly [number, number]];
  /** Sum of each pair. */
  sums: [number, number];
  /** Which pairs are used. A pair is unused when its trail can't be climbed. */
  uses: [boolean, boolean];
}

/**
 * Every climb the dice allow. If both sums of a pair can be climbed you must climb
 * both; otherwise you may climb either one that works. Duplicates are removed.
 */
export function diceChoices(state: State, dice: readonly number[]): DiceChoice[] {
  const seen = new Set<string>();
  const choices: DiceChoice[] = [];
  const add = (choice: DiceChoice) => {
    const key = choice.trails.join(",");
    if (seen.has(key)) return;
    seen.add(key);
    choices.push(choice);
  };
  for (const [i, [x, y]] of pairings(dice).entries()) {
    const pairs = SPLITS[i] as DiceChoice["pairs"];
    const sums: [number, number] = [x, y];
    if (climb(state, [x, y])) {
      add({ trails: [x, y].sort((a, b) => a - b), pairs, sums, uses: [true, true] });
    } else {
      if (climb(state, [x])) add({ trails: [x], pairs, sums, uses: [true, false] });
      if (y !== x && climb(state, [y])) add({ trails: [y], pairs, sums, uses: [false, true] });
    }
  }
  return choices;
}

/** Every trail choice the dice allow, sorted. */
export function climbOptions(state: State, dice: readonly number[]): number[][] {
  return diceChoices(state, dice)
    .map((c) => c.trails)
    .sort((p, q) => p.join(",").localeCompare(q.join(","), "en", { numeric: true }));
}

/** In the "mustRoll" variant you can't stop while a climber shares a step with another camp. */
export function mustRollAgain(state: State): boolean {
  if (state.config.landingOnCamps !== "mustRoll") return false;
  const player = activePlayer(state);
  return TRAILS.some((t) => {
    const step = state.climbers[t] ?? 0;
    return step > 0 && opponentCampOn(state, player, t, step);
  });
}

export function peaksClaimed(state: State, player: PlayerId): number {
  return state.peaks.filter((p) => p === player).length;
}

// ---------------------------------------------------------------- moves

export function climbLabel(trails: readonly number[]): string {
  if (trails.length === 1) return `Climb ${trails[0]} only`;
  if (trails[0] === trails[1]) return `Climb ${trails[0]} twice`;
  return `Climb ${trails[0]} & ${trails[1]}`;
}

export function getLegalMoves(state: State, player: PlayerId): LegalMove<Move>[] {
  if (state.phase === "over" || player !== activePlayer(state)) return [];
  switch (state.phase) {
    case "roll":
      return [{ move: { type: "roll" }, label: "Roll the dice", where: "board" }];
    case "choose":
      return climbOptions(state, state.dice).map((trails) => ({
        move: { type: "climb", trails },
        label: climbLabel(trails),
        where: "board" as const,
      }));
    case "decide": {
      const moves: LegalMove<Move>[] = [
        { move: { type: "roll" }, label: "Roll again", where: "board" },
      ];
      if (!mustRollAgain(state)) {
        moves.push({ move: { type: "stop" }, label: "Stop & make camp", where: "board" });
      }
      return moves;
    }
  }
}

function normalize(move: Move): Move {
  return move.type === "climb" && Array.isArray(move.trails)
    ? { ...move, trails: [...move.trails].sort((a, b) => a - b) }
    : move;
}

export function validateMove(state: State, player: PlayerId, move: Move): string | null {
  if (!isMove(move)) return "That move isn't allowed.";
  if (state.phase === "over") return "The game is over.";
  if (player !== activePlayer(state)) return "It's not your turn.";
  const key = JSON.stringify(normalize(move));
  const legal = getLegalMoves(state, player).some((m) => JSON.stringify(m.move) === key);
  return legal ? null : "That move isn't allowed right now.";
}

function endTurn(state: State): State {
  return { ...state, turn: nextTurn(state.turn), phase: "roll", climbers: emptyTrails() };
}

export function applyMove(state: State, player: PlayerId, move: Move, ctx: MoveContext): State {
  switch (move.type) {
    case "roll": {
      const dice = rollDice(ctx.rng, 4).values;
      const rolled: State = { ...state, dice, fallen: null, campMove: null };
      if (climbOptions(rolled, dice).length > 0) return { ...rolled, phase: "choose" };
      // No trail to climb: you fall and lose this turn's progress.
      return endTurn({ ...rolled, fallen: { player, climbers: state.climbers } });
    }
    case "climb": {
      const climbers = climb(state, move.trails);
      if (!climbers)
        throw new Error("applyMove: illegal climb (validateMove should have caught it)");
      return { ...state, climbers, phase: "decide" };
    }
    case "stop": {
      const camps = structuredClone(state.camps);
      const peaks = [...state.peaks];
      for (const trail of TRAILS) {
        const step = state.climbers[trail] ?? 0;
        if (step === 0) continue;
        (camps[player] as number[])[trail] = step;
        if (step === trailLength(trail)) {
          peaks[trail] = player;
          for (const p of state.players) if (p.id !== player) (camps[p.id] as number[])[trail] = 0;
        }
      }
      const from = [...(state.camps[player] ?? [])];
      const next: State = { ...state, camps, peaks, dice: [], campMove: { player, from } };
      if (peaksClaimed(next, player) >= state.config.peaksToWin) {
        return { ...next, climbers: emptyTrails(), phase: "over", winner: player };
      }
      // With every trail closed, every roll would be a fall: end the game here.
      if (TRAILS.every((t) => peaks[t] !== null)) {
        return { ...next, climbers: emptyTrails(), phase: "over", winner: null };
      }
      return endTurn(next);
    }
  }
}

// ---------------------------------------------------------------- views and text

export function getPlayerView(state: State, _viewer: Viewer): State {
  return state; // Peak has no hidden information.
}

const nameOf = (state: State, id: PlayerId) =>
  state.players.find((p) => p.id === id)?.name ?? "Someone";

const joinNames = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");

export function getResult(state: State): GameResult | null {
  if (state.phase !== "over") return null;
  const ranking = state.players
    .map((p) => ({ player: p.id, score: peaksClaimed(state, p.id) }))
    .sort((a, b) => b.score - a.score);
  if (state.winner) {
    return {
      winners: [state.winner],
      ranking,
      text: `${nameOf(state, state.winner)} wins with ${peaksClaimed(state, state.winner)} peaks!`,
    };
  }
  // Every peak was claimed before anyone reached the target.
  const best = ranking[0]?.score ?? 0;
  const winners = ranking.filter((r) => r.score === best).map((r) => r.player);
  const names = joinNames(winners.map((id) => nameOf(state, id)));
  return {
    winners,
    ranking,
    text:
      winners.length === 1
        ? `Every peak is claimed. ${names} wins with ${best} peaks!`
        : `Every peak is claimed. ${names} share the win with ${best} peaks!`,
  };
}

export function getStatus(state: State, viewer: Viewer): GameStatus {
  if (state.phase === "over") {
    const text = state.winner ? `${nameOf(state, state.winner)} wins!` : getResult(state)!.text;
    return { text, activePlayers: [] };
  }
  const active = activePlayer(state);
  const you = viewer === active;
  const name = nameOf(state, active);
  const text = {
    roll: you ? "Your turn: roll the dice" : `Waiting for ${name} to roll`,
    choose: you ? "Choose which trails to climb" : `${name} is choosing trails`,
    decide: you
      ? mustRollAgain(state)
        ? "You're on another camp: you must roll again"
        : "Roll again, or stop and make camp"
      : `${name} is deciding: push on or stop?`,
    over: "Game over",
  }[state.phase];
  return { text, activePlayers: [active] };
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
  const list = (trails: readonly number[]) => trails.join(", ");
  switch (move.type) {
    case "roll": {
      const dice = after.dice.join(" · ");
      const reveal = {
        highlight: ["dice"],
        revealAfterMs: DICE_ROLL_MS,
        pendingText: you ? "Rolling…" : `${who} is rolling…`,
      };
      if (!after.fallen) return { ...reveal, text: `${who} rolled ${dice}` };
      const lost = TRAILS.filter((t) => (after.fallen?.climbers[t] ?? 0) > 0);
      return {
        ...reveal,
        text: `${who} rolled ${dice}: no trail fits. ${you ? "You" : who} fell and lost this turn's climb${
          lost.length ? ` on ${list(lost)}` : ""
        }.`,
        highlight: ["dice", ...lost.map((t) => `fall-${t}`)],
        tone: "bad",
        flash: `${who} fell!`,
      };
    }
    case "climb": {
      const trails = [...move.trails].sort((a, b) => a - b);
      const what = trails[0] === trails[1] ? `${trails[0]} twice` : trails.join(" & ");
      return { text: `${who} climbed ${what}`, highlight: trails.map((t) => `trail-${t}`) };
    }
    case "stop": {
      const camped = TRAILS.filter((t) => (before.climbers[t] ?? 0) > 0);
      const claimed = TRAILS.filter((t) => before.peaks[t] === null && after.peaks[t] === player);
      const knockedOff = before.players.filter(
        (p) => p.id !== player && claimed.some((t) => campAt(before, p.id, t) > 0),
      );
      let text = `${who} made camp on ${list(camped)}`;
      if (claimed.length) text += ` and claimed peak ${claimed.join(" & ")}!`;
      if (knockedOff.length) {
        const names = knockedOff.map((p) => (p.id === viewer ? "your" : `${p.name}'s`));
        const joined = names.join(" and ");
        text += ` ${joined.charAt(0).toUpperCase()}${joined.slice(1)} camp${knockedOff.length > 1 ? "s were" : " was"} removed.`;
      }
      const highlight = [...camped.map((t) => `trail-${t}`), ...claimed.map((t) => `peak-${t}`)];
      if (!claimed.length) return { text, highlight };
      return {
        text,
        highlight,
        tone: "good",
        flash: `${who} claimed peak ${claimed.join(" & ")}!`,
      };
    }
  }
}
