import { z } from "zod";

export const configSchema = z.object({
  levels: z.number().int().min(1).max(7).default(7).meta({
    title: "Levels to clear",
    description: "Each level's order has one more card per player. 7 is a full shift.",
  }),
});

export type Config = z.infer<typeof configSchema>;
