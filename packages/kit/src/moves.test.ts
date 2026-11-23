import { describe, expect, it } from "vitest";
import { isMove } from "./moves.js";

describe("isMove", () => {
  it("accepts objects with a string type", () => {
    expect(isMove({ type: "roll" })).toBe(true);
    expect(isMove({ type: "climb", trails: [6, 8] })).toBe(true);
  });

  it("rejects anything else a client could send", () => {
    for (const junk of [
      null,
      undefined,
      0,
      "roll",
      true,
      [],
      [{ type: "roll" }],
      {},
      { type: 1 },
    ]) {
      expect(isMove(junk)).toBe(false);
    }
  });
});
