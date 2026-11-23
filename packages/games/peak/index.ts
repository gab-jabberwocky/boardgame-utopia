import type { GameModule } from "@utopia/shared";
import { configSchema, type Config } from "./config.js";
import * as logic from "./logic.js";

export type { Config } from "./config.js";
export type { Move, State } from "./logic.js";

export const peak: GameModule<logic.State, logic.Move, Config> = {
  id: "peak",
  name: "Peak",
  description: "Push your luck up 11 mountain trails. Stop to make camp, or risk a fall.",
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

export default peak;
