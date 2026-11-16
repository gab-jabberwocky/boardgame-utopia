import type { Rng } from "@utopia/shared";

export interface DiceRoll {
  values: number[];
  total: number;
}

/** Roll `count` dice with `sides` sides each. */
export function rollDice(rng: Rng, count: number, sides = 6): DiceRoll {
  if (!Number.isInteger(count) || count < 0) throw new Error(`rollDice: bad count ${count}`);
  if (!Number.isInteger(sides) || sides < 1) throw new Error(`rollDice: bad sides ${sides}`);
  const values = Array.from({ length: count }, () => rng.int(1, sides));
  return { values, total: values.reduce((sum, v) => sum + v, 0) };
}

/** How long dice tumble on screen before the result is shown. */
export const DICE_ROLL_MS = 900;
