import type { GameModule } from "@utopia/shared";
import { configSchema, type Config } from "./config.js";
import * as logic from "./logic.js";

export type { Config } from "./config.js";
export type { Move, State, View } from "./logic.js";

export const triplets: GameModule<logic.State, logic.Move, Config> = {
  id: "triplets",
  name: "Triplets",
  description:
    "Reveal the lowest or highest cards around the table and remember where the trios hide.",
  minPlayers: 3,
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

export default triplets;
