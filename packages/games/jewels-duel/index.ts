import type { GameModule } from "@utopia/shared";
import { configSchema, type Config } from "./config.js";
import * as logic from "./logic.js";

export type { Config } from "./config.js";
export type { Move, State, View } from "./logic.js";

export const jewelsDuel: GameModule<logic.State, logic.Move, Config> = {
  id: "jewels-duel",
  name: "Jewels Duel",
  description: "Two jewelers race to 20 points, 10 crowns, or 10 points in one color.",
  minPlayers: 2,
  maxPlayers: 2,
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

export default jewelsDuel;
