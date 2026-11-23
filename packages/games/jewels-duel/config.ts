import { z } from "zod";

/** Jewels Duel has no settings yet: the victory goals are fixed (20 points, 10 crowns, 10 in one color). */
export const configSchema = z.object({});

export type Config = z.infer<typeof configSchema>;
