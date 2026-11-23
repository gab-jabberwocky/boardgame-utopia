import type { GameModule } from "@utopia/shared";
import { configSchema, type Config } from "./config.js";
import * as logic from "./logic.js";

export type { Config } from "./config.js";
export type { Move, State, View } from "./logic.js";

export const jewels: GameModule<logic.State, logic.Move, Config> = {
  id: "jewels",
  name: "Jewels",
  description:
    "Collect gems, buy cards that make the next ones cheaper, and court Patrons. First to 15 ends the round.",
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

export default jewels;
