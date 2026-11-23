import { z } from "zod";

/** Yan's training missions keep their numbers; our own missions are Field ops F1–F8. */
export const MISSION_IDS = [
  "1",
  "2",
  "3",
  "4",
  "6",
  "8",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
] as const;

export const configSchema = z.object({
  mission: z
    .enum(MISSION_IDS)
    .default("1")
    .meta({
      title: "Mission",
      optionLabels: {
        "1": "Mission 1 · Training, day 1",
        "2": "Mission 2 · Training, day 2",
        "3": "Mission 3 · Training, day 3",
        "4": "Mission 4 · First day in the field",
        "6": "Mission 6 · Third day in the field",
        "8": "Mission 8 · Final Exam",
        F1: "Field op 1 · Tool day",
        F2: "Field op 2 · Quiet start",
        F3: "Field op 3 · Silent misses",
        F4: "Field op 4 · Short fuse",
        F5: "Field op 5 · Hands on",
        F6: "Field op 6 · Twitchy dial",
        F7: "Field op 7 · No echoes",
        F8: "Field op 8 · Blackout",
      },
    }),
  powerCards: z.boolean().default(true).meta({
    title: "Power cards",
    description:
      "One-use power cards that unlock when 2 wires of their number are cut, plus a once-per-mission Double Scan each. Field ops bring their own set. Off: no power cards.",
  }),
});

export type Config = z.infer<typeof configSchema>;
