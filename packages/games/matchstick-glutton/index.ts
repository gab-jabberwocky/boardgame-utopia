import type { GameModule } from "@utopia/shared";
import { configSchema, type Config } from "./config.js";
import * as logic from "./logic.js";

export type { Config } from "./config.js";
export type { Move, State, View } from "./logic.js";

export const matchstickGlutton: GameModule<logic.State, logic.Move, Config> = {
  id: "matchstick-glutton",
  name: "Matchstick Glutton",
  description:
    "Beat each play with stronger digital numbers, bending cards with matchsticks. Empty your hand and your sticks to win.",
  minPlayers: 2,
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

export default matchstickGlutton;
