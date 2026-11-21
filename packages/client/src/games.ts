import type { ComponentType } from "react";
import type { AnyGameModule, BoardProps, GameModule, PlayerId, Viewer } from "@utopia/shared";
import peak from "@utopia/game-peak";
import PeakBoard, { playerDecor as peakDecor, docView as peakDoc } from "@utopia/game-peak/Board";
import ultra7 from "@utopia/game-ultra7";
import Ultra7Board, {
  playerDecor as ultra7Decor,
  docView as ultra7Doc,
} from "@utopia/game-ultra7/Board";
import jewelsDuel from "@utopia/game-jewels-duel";
import JewelsDuelBoard, {
  playerDecor as jewelsDuelDecor,
  docView as jewelsDuelDoc,
} from "@utopia/game-jewels-duel/Board";
import dinnerDash from "@utopia/game-dinner-dash";
import matchstickGlutton from "@utopia/game-matchstick-glutton";
import MatchstickGluttonBoard, {
  playerDecor as matchstickGluttonDecor,
  docView as matchstickGluttonDoc,
} from "@utopia/game-matchstick-glutton/Board";
import jewels from "@utopia/game-jewels";
import JewelsBoard, {
  playerDecor as jewelsDecor,
  docView as jewelsDoc,
} from "@utopia/game-jewels/Board";
import glass from "@utopia/game-glass";
import GlassBoard, {
  playerDecor as glassDecor,
  docView as glassDoc,
} from "@utopia/game-glass/Board";
import beachcomber from "@utopia/game-beachcomber";
import BeachcomberBoard, {
  playerDecor as beachcomberDecor,
  docView as beachcomberDoc,
} from "@utopia/game-beachcomber/Board";
import baristaPanic from "@utopia/game-barista-panic";
import BaristaPanicBoard, {
  playerDecor as baristaPanicDecor,
  docView as baristaPanicDoc,
} from "@utopia/game-barista-panic/Board";
import spy from "@utopia/game-spy";
import SpyBoard, { playerDecor as spyDecor, docView as spyDoc } from "@utopia/game-spy/Board";
import triplets from "@utopia/game-triplets";
import TripletsBoard, {
  playerDecor as tripletsDecor,
  docView as tripletsDoc,
} from "@utopia/game-triplets/Board";
import DinnerDashBoard, {
  playerDecor as dinnerDashDecor,
  docView as dinnerDashDoc,
} from "@utopia/game-dinner-dash/Board";

export interface PlayerDecor {
  /** Short score or note per player, shown in the player list. */
  scores?: Record<PlayerId, string | number>;
}

/** Plain-text lines describing the table, for secret mode's document view. */
export type DocView<V> = (view: V, viewer: Viewer) => string[];

/** A game as the client sees it: rules plus its Board UI, with types erased. */
export interface GameEntry {
  module: AnyGameModule;
  Board: ComponentType<BoardProps<unknown, unknown>>;
  playerDecor?: (view: unknown) => PlayerDecor;
  /** Secret mode text view; without one, the view data is shown as an outline. */
  docView?: DocView<unknown>;
}

function defineGame<S, M, C, V>(
  module: GameModule<S, M, C>,
  Board: ComponentType<BoardProps<V, M>>,
  playerDecor?: (view: V) => PlayerDecor,
  docView?: DocView<V>,
): GameEntry {
  return {
    module: module as unknown as AnyGameModule,
    Board: Board as unknown as ComponentType<BoardProps<unknown, unknown>>,
    playerDecor: playerDecor as ((view: unknown) => PlayerDecor) | undefined,
    docView: docView as DocView<unknown> | undefined,
  };
}

/** Every playable game. Add new games here. */
export const GAMES: GameEntry[] = [
  defineGame(peak, PeakBoard, peakDecor, peakDoc),
  defineGame(ultra7, Ultra7Board, ultra7Decor, ultra7Doc),
  defineGame(dinnerDash, DinnerDashBoard, dinnerDashDecor, dinnerDashDoc),
  defineGame(jewelsDuel, JewelsDuelBoard, jewelsDuelDecor, jewelsDuelDoc),
  defineGame(triplets, TripletsBoard, tripletsDecor, tripletsDoc),
  defineGame(spy, SpyBoard, spyDecor, spyDoc),
  defineGame(
    matchstickGlutton,
    MatchstickGluttonBoard,
    matchstickGluttonDecor,
    matchstickGluttonDoc,
  ),
  defineGame(jewels, JewelsBoard, jewelsDecor, jewelsDoc),
  defineGame(glass, GlassBoard, glassDecor, glassDoc),
  defineGame(beachcomber, BeachcomberBoard, beachcomberDecor, beachcomberDoc),
  defineGame(baristaPanic, BaristaPanicBoard, baristaPanicDecor, baristaPanicDoc),
];

export const findGame = (id: string) => GAMES.find((g) => g.module.id === id);
