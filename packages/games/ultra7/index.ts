import type { GameModule } from "@utopia/shared";
import { configSchema, type Config } from "./config.js";
import * as logic from "./logic.js";

export type { Config } from "./config.js";
export type { Move, State, View } from "./logic.js";

export const ultra7: GameModule<logic.State, logic.Move, Config> = {
  id: "ultra7",
  name: "Ultra 7",
  description: "Draw cards to fill your hold, bank your haul, or go overboard on a duplicate.",
  minPlayers: 2,
  maxPlayers: 10,
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

export default ultra7;
