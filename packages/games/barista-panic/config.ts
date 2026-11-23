import { z } from "zod";

export const configSchema = z.object({
  easyStart: z.boolean().default(false).meta({
    title: "Easy start",
    description:
      "Everyone starts with one of the 4 easiest orders on tab 1, for a less lucky start.",
  }),
});

export type Config = z.infer<typeof configSchema>;
