import type { GameModule } from "@utopia/shared";
import { configSchema, type Config } from "./config.js";
import * as logic from "./logic.js";

export type { Config } from "./config.js";
export type { Move, State, View } from "./logic.js";

export const baristaPanic: GameModule<logic.State, logic.Move, Config> = {
  id: "barista-panic",
  name: "Barista Panic",
  description:
    "Walk the counter for ingredients, fill your cups and serve orders before they go stale.",
  minPlayers: 2,
  maxPlayers: 4,
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

export default baristaPanic;
