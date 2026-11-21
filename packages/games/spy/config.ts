import { z } from "zod";

export const configSchema = z.object({
  minutes: z.number().int().min(1).max(10).default(5).meta({
    title: "Minutes for questions",
    description: "The Master calls time. The discussion then gets as long as the questions took.",
  }),
});

export type Config = z.infer<typeof configSchema>;
