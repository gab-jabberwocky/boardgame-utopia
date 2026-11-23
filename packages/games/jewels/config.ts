import { z } from "zod";

export const configSchema = z.object({
  pointsToWin: z.number().int().min(10).max(21).default(15).meta({
    title: "Points to win",
    description:
      "Reaching this ends the game after the round, so everyone gets the same turns. 15 is standard.",
  }),
});

export type Config = z.infer<typeof configSchema>;
