import type { GameModule } from "@utopia/shared";
import { configSchema, type Config } from "./config.js";
import * as logic from "./logic.js";

export type { Config } from "./config.js";
export type { Move, State, View } from "./logic.js";

export const bombBustersV2: GameModule<logic.State, logic.Move, Config> = {
  id: "bomb-busters-v2",
  name: "Bomb Busters",
  description: "Work together to identify and cut matching wires before the detonator runs out.",
  minPlayers: 2,
  maxPlayers: 5,
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

export default bombBustersV2;
