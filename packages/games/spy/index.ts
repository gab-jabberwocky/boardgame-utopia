import type { GameModule } from "@utopia/shared";
import { configSchema, type Config } from "./config.js";
import * as logic from "./logic.js";

export type { Config } from "./config.js";
export type { Move, State, View } from "./logic.js";

export const spy: GameModule<logic.State, logic.Move, Config> = {
  id: "spy",
  name: "Spy",
  description:
    "Find the secret word with yes/no questions, then catch the Insider who knew it all along.",
  minPlayers: 4,
  maxPlayers: 8,
  configSchema,
  setup: logic.setup,
  validateMove: logic.validateMove,
  applyMove: logic.applyMove,
  getPlayerView: logic.getPlayerView,
  getResult: logic.getResult,
  getStatus: logic.getStatus,
  describeMove: logic.describeMove,
  getLegalMoves: logic.getLegalMoves,
};

export default spy;
