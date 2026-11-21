import { z } from "zod";

export const configSchema = z.object({
  peaksToWin: z.number().int().min(3).max(5).default(3).meta({
    title: "Peaks to win",
    description: "Try 4 or 5 for a longer game with 2 or 3 players.",
  }),
  landingOnCamps: z
    .enum(["share", "skip", "mustRoll"])
    .default("share")
    .meta({
      title: "Landing on another player's camp",
      optionLabels: {
        share: "Share the space",
        skip: "Skip over it",
        mustRoll: "Must roll again",
      },
    }),
});

export type Config = z.infer<typeof configSchema>;
