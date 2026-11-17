import { z } from "zod";

export const configSchema = z.object({
  targetScore: z.number().int().min(50).max(500).default(200).meta({
    title: "Points to win",
    description: "The game ends after the round in which someone reaches this. 200 is standard.",
  }),
});

export type Config = z.infer<typeof configSchema>;
