import type { ComponentType } from "react";
import type { AnyGameModule, BoardProps, GameModule, PlayerId } from "@utopia/shared";
import ridgeline from "@utopia/game-ridgeline";
import RidgelineBoard, { playerDecor as ridgelineDecor } from "@utopia/game-ridgeline/Board";

export interface PlayerDecor {
  /** Short score or note per player, shown in the player list. */
  scores?: Record<PlayerId, string | number>;
}

/** A game as the client sees it: rules plus its Board UI, with types erased. */
export interface GameEntry {
  module: AnyGameModule;
  Board: ComponentType<BoardProps<unknown, unknown>>;
  playerDecor?: (view: unknown) => PlayerDecor;
}

function defineGame<S, M, C, V>(
  module: GameModule<S, M, C>,
  Board: ComponentType<BoardProps<V, M>>,
  playerDecor?: (view: V) => PlayerDecor,
): GameEntry {
  return {
    module: module as unknown as AnyGameModule,
    Board: Board as unknown as ComponentType<BoardProps<unknown, unknown>>,
    playerDecor: playerDecor as ((view: unknown) => PlayerDecor) | undefined,
  };
}

/** Every playable game. Add new games here. */
export const GAMES: GameEntry[] = [defineGame(ridgeline, RidgelineBoard, ridgelineDecor)];

export const findGame = (id: string) => GAMES.find((g) => g.module.id === id);
