import type { ZodType } from "zod";

export type PlayerId = string;
/** Who is looking at the game: a seated player or a spectator. */
export type Viewer = PlayerId | "spectator";

export interface PlayerInfo {
  id: PlayerId;
  name: string;
  /** CSS colour chosen in the lobby, unique per room (see PLAYER_COLORS). */
  color: string;
}

/** Seeded random generator. Implemented by `createRng` in `@utopia/kit`. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Returns a shuffled copy. */
  shuffle<T>(items: readonly T[]): T[];
  /** Serializable state. `createRng(rng.getState())` continues the same sequence. */
  getState(): number;
}

export interface SetupContext {
  /** Players in seat order. */
  players: PlayerInfo[];
  rng: Rng;
}

export interface MoveContext {
  rng: Rng;
}

export interface GameStatus {
  /** "Your turn: roll the dice", "Waiting for Bob". */
  text: string;
  /** Who the game is waiting on (can be several, or none when the game is over). */
  activePlayers: PlayerId[];
}

export interface ActionDescription {
  /** "Alice rolled 4 · 6 · 1 · 3". */
  text: string;
  /** Ids of board elements the Board should highlight until the next move. */
  highlight?: string[];
  /** How the action is styled: "bad" for setbacks (red), "good" for big wins (gold). */
  tone?: "normal" | "good" | "bad";
  /** Short headline flashed over the screen for big moments: "Bob fell!". */
  flash?: string;
  /**
   * Hold the result back for this long (e.g. while dice tumble). Meanwhile the shell
   * shows `pendingText` and the Board gets `revealing: true`.
   */
  revealAfterMs?: number;
  /** Shown while the result is held back: "Bob is rolling…". */
  pendingText?: string;
}

export interface GameResult {
  /** Empty means no winner. */
  winners: PlayerId[];
  ranking?: { player: PlayerId; score?: number }[];
  /** "Alice wins with 3 peaks", "Draw". */
  text: string;
}

export interface LegalMove<Move> {
  move: Move;
  /** Short button text: "Roll the dice", "Climb 6 & 10". */
  label: string;
  /**
   * "bar" (default): the shell's ActionBar shows a button for it.
   * "board": the game's Board shows and confirms this choice itself.
   */
  where?: "bar" | "board";
}

/**
 * Every game exports exactly one object implementing this.
 * All functions must be pure: no Math.random, no Date.now, no I/O.
 */
export interface GameModule<State, Move, Config> {
  id: string;
  name: string;
  /** One sentence shown when picking a game. */
  description: string;
  minPlayers: number;
  maxPlayers: number;
  configSchema: ZodType<Config>;

  setup(ctx: SetupContext, config: Config): State;
  /** Returns an error message, or null if the move is allowed. */
  validateMove(state: State, player: PlayerId, move: Move): string | null;
  applyMove(state: State, player: PlayerId, move: Move, ctx: MoveContext): State;
  /** Remove anything this viewer must not see. */
  getPlayerView(state: State, viewer: Viewer): unknown;
  /** null while the game is still being played. */
  getResult(state: State): GameResult | null;

  getStatus(state: State, viewer: Viewer): GameStatus;
  describeMove(
    before: State,
    after: State,
    player: PlayerId,
    move: Move,
    viewer: Viewer,
  ): ActionDescription;
  /** Every move this player may make now. A single entry makes it a one-tap action. */
  getLegalMoves?(state: State, player: PlayerId): LegalMove<Move>[];
}

/** A game module with its types erased, as used by the server and the game shell. */
export type AnyGameModule = GameModule<unknown, unknown, unknown>;

/** Props every game's Board component receives from the game shell. */
export interface BoardProps<View, Move> {
  view: View;
  viewer: Viewer;
  players: PlayerInfo[];
  /** From the last action's `highlight`. */
  highlight: readonly string[];
  /** Moves this viewer may make now (empty when it's not their turn). */
  legalMoves: readonly LegalMove<Move>[];
  /** The move waiting for confirmation, if any. Boards can preview it. */
  proposed: Move | null;
  /** Suggest a move. The shell asks the player to confirm it before sending. */
  propose(move: Move, label: string): void;
  /** Clear the proposed move. */
  cancel(): void;
  /**
   * Send a move now. Only call this from the player's own tap on a confirm
   * button (or the single available choice). Never send moves automatically.
   */
  submit(move: Move): void;
  /** True while the last action's result is held back (dice tumbling). */
  revealing: boolean;
}
