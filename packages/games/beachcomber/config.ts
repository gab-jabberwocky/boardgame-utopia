import { z } from "zod";

export const configSchema = z.object({
  length: z.enum(["Standard", "Long"]).default("Standard").meta({
    title: "Game length",
    description: "Standard: 40 / 35 / 30 points with 2 / 3 / 4 players. Long doubles it.",
  }),
});

export type Config = z.infer<typeof configSchema>;
