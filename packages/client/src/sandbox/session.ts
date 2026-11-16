import { createRng } from "@utopia/kit";
import type { HistoryEntry, PlayerId, PlayerInfo } from "@utopia/shared";
import type { GameEntry } from "../games";

/*
 * Pure sandbox session logic: start a game, apply moves, rewind, and simulate.
 * No React here, so it can be unit tested.
 */

export interface Session {
  game: GameEntry;
  players: PlayerInfo[];
  seed: string;
  /** states[0] is the setup state; each move appends one. */
  states: { state: unknown; rngState: number }[];
  /** history[i] is the move that turned states[i] into states[i + 1]. */
  history: HistoryEntry[];
}

export function startSession(
  game: GameEntry,
  settings: Record<string, unknown>,
  players: PlayerInfo[],
  seed: string,
): Session {
  const rng = createRng(seed);
  const config = game.module.configSchema.parse(settings);
  const state = game.module.setup({ players, rng }, config);
  return { game, players, seed, states: [{ state, rngState: rng.getState() }], history: [] };
}

export const moveCount = (session: Session) => session.history.length;

/** The game as it was after `moves` moves (0 = right after setup). */
export function stateAfter(session: Session, moves: number): unknown {
  return session.states[moves]?.state;
}

/** Apply a move. Returns the new session, or an error message if the move is not allowed. */
export function applySessionMove(
  session: Session,
  player: PlayerId,
  move: unknown,
): Session | string {
  const { module } = session.game;
  const current = session.states[session.states.length - 1];
  if (!current) return "No game in progress.";
  const err = module.validateMove(current.state, player, move);
  if (err) return err;
  const rng = createRng(current.rngState);
  const after = module.applyMove(current.state, player, move, { rng });
  return {
    ...session,
    states: [...session.states, { state: after, rngState: rng.getState() }],
    history: [...session.history, { before: current.state, after, player, move }],
  };
}

/** Keep only the first `moves` moves (used by undo and "play from here"). */
export function truncate(session: Session, moves: number): Session {
  const n = Math.max(0, Math.min(moves, moveCount(session)));
  return {
    ...session,
    states: session.states.slice(0, n + 1),
    history: session.history.slice(0, n),
  };
}

/** Simulation needs the game to list its legal moves. */
export const canSimulate = (session: Session) => Boolean(session.game.module.getLegalMoves);

/**
 * Play random legal moves until the game ends (or `maxMoves` is reached).
 * The random picks are seeded from the session seed, so the same seed and
 * starting point always simulate the same game.
 */
export function simulate(session: Session, maxMoves = 5000): Session {
  const { module } = session.game;
  if (!module.getLegalMoves) return session;
  const bot = createRng(`${session.seed}:bot:${moveCount(session)}`);
  let s = session;
  for (let i = 0; i < maxMoves; i++) {
    const state = stateAfter(s, moveCount(s));
    if (module.getResult(state)) break;
    const player = module.getStatus(state, "spectator").activePlayers[0];
    if (!player) break;
    const moves = module.getLegalMoves(state, player);
    if (moves.length === 0) break;
    const next = applySessionMove(s, player, bot.pick(moves).move);
    if (typeof next === "string") throw new Error(`Simulation picked an illegal move: ${next}`);
    s = next;
  }
  return s;
}
