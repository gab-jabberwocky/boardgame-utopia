import type {
  ActionDescription,
  AnyGameModule,
  GameResult,
  GameStatus,
  LegalMove,
  PlayerId,
  Viewer,
} from "./contract.js";

/** One applied move, kept so it can be described to each viewer. */
export interface HistoryEntry {
  before: unknown;
  after: unknown;
  player: PlayerId;
  move: unknown;
}

/** Everything one viewer needs to draw the game screen. */
export interface Snapshot {
  view: unknown;
  status: GameStatus;
  result: GameResult | null;
  legalMoves: LegalMove<unknown>[];
  /** Most recent first. */
  recentActions: ActionDescription[];
}

export const RECENT_ACTIONS = 20;

export function buildSnapshot(
  game: AnyGameModule,
  state: unknown,
  viewer: Viewer,
  history: readonly HistoryEntry[],
): Snapshot {
  const result = game.getResult(state);
  const legalMoves =
    viewer === "spectator" || result ? [] : (game.getLegalMoves?.(state, viewer) ?? []);
  return {
    view: game.getPlayerView(state, viewer),
    status: game.getStatus(state, viewer),
    result,
    legalMoves,
    recentActions: history
      .slice(-RECENT_ACTIONS)
      .reverse()
      .map((h) => game.describeMove(h.before, h.after, h.player, h.move, viewer)),
  };
}

/** Moves are compared by value (they are plain JSON). */
export function sameMove(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
