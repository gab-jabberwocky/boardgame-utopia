import { z } from "zod";

/** Glass has no settings yet: the standard wall and scoring. */
export const configSchema = z.object({});

export type Config = z.infer<typeof configSchema>;
