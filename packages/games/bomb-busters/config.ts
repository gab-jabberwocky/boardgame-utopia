import { z } from "zod";

export const configSchema = z.object({
  mission: z
    .enum(["1", "2", "3", "4", "6", "8"])
    .default("1")
    .meta({
      title: "Training mission",
      optionLabels: {
        "1": "Mission 1 · Training, day 1",
        "2": "Mission 2 · Training, day 2",
        "3": "Mission 3 · Training, day 3",
        "4": "Mission 4 · First day in the field",
        "6": "Mission 6 · Third day in the field",
        "8": "Mission 8 · Final Exam",
      },
    }),
});

export type Config = z.infer<typeof configSchema>;
