import { z } from "zod";

export const configSchema = z.object({
  mode: z.enum(["Simple", "Spicy"]).default("Simple").meta({
    title: "Mode",
    description:
      "Simple: win with any 3 trios. Spicy: win with 2 connected trios (adding up to 7 or 7 apart). The 7 trio always wins.",
  }),
});

export type Config = z.infer<typeof configSchema>;
