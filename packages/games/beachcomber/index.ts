import type { GameModule } from "@utopia/shared";
import { configSchema, type Config } from "./config.js";
import * as logic from "./logic.js";

export type { Config } from "./config.js";
export type { Move, State, View } from "./logic.js";

export const beachcomber: GameModule<logic.State, logic.Move, Config> = {
  id: "beachcomber",
  name: "Beachcomber",
  description:
    "Collect beach finds, play pairs for their tricks, and call the round at the right moment.",
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

export default beachcomber;
