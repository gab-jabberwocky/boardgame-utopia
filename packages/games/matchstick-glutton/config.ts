import { z } from "zod";

export const configSchema = z.object({
  revolution: z.enum(["5 cards", "4 cards"]).default("5 cards").meta({
    title: "Revolution",
    description: "How many cards of one number flip the strength order. 4 is a popular house rule.",
  }),
});

export type Config = z.infer<typeof configSchema>;
