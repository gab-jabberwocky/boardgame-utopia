import type { GameModule } from "@utopia/shared";
import { configSchema, type Config } from "./config.js";
import * as logic from "./logic.js";

export type { Config } from "./config.js";
export type { Move, State, View } from "./logic.js";

export const dinnerDash: GameModule<logic.State, logic.Move, Config> = {
  id: "dinner-dash",
  name: "Dinner Dash",
  description: "Memorize the café order together, then call out what everyone else is holding.",
  minPlayers: 2,
  maxPlayers: 6,
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

export default dinnerDash;
