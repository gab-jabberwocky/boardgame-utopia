import { describe, expect, it } from "vitest";
import { rollDice } from "./dice.js";
import { createRng } from "./rng.js";

describe("rollDice", () => {
  it("rolls the requested number of dice and totals them", () => {
    const roll = rollDice(createRng(5), 4);
    expect(roll.values).toHaveLength(4);
    expect(roll.total).toBe(roll.values.reduce((a, b) => a + b, 0));
    for (const v of roll.values) expect(v).toBeGreaterThanOrEqual(1);
    for (const v of roll.values) expect(v).toBeLessThanOrEqual(6);
  });

  it("supports any number of sides", () => {
    const roll = rollDice(createRng(5), 50, 20);
    expect(Math.max(...roll.values)).toBeLessThanOrEqual(20);
  });

  it("is reproducible with the same seed", () => {
    expect(rollDice(createRng("x"), 4)).toEqual(rollDice(createRng("x"), 4));
  });

  it("rejects bad input", () => {
    expect(() => rollDice(createRng(1), -1)).toThrow();
    expect(() => rollDice(createRng(1), 2, 0)).toThrow();
  });
});
