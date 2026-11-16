import { describe, expect, it } from "vitest";
import {
  activePlayers,
  createTurnOrder,
  currentPlayer,
  eliminate,
  nextTurn,
  reverseDirection,
  skipNext,
} from "./turns.js";

const abc = () => createTurnOrder(["a", "b", "c"]);

describe("turns", () => {
  it("starts with the chosen first player", () => {
    expect(currentPlayer(createTurnOrder(["a", "b", "c"], 2))).toBe("c");
  });

  it("rejects empty or out-of-range setups", () => {
    expect(() => createTurnOrder([])).toThrow();
    expect(() => createTurnOrder(["a"], 1)).toThrow();
  });

  it("moves to the next player and wraps around", () => {
    let t = abc();
    t = nextTurn(t);
    expect(currentPlayer(t)).toBe("b");
    t = nextTurn(nextTurn(t));
    expect(currentPlayer(t)).toBe("a");
  });

  it("skips the next player", () => {
    expect(currentPlayer(skipNext(abc()))).toBe("c");
  });

  it("reverses direction", () => {
    expect(currentPlayer(nextTurn(reverseDirection(abc())))).toBe("c");
  });

  it("passes over eliminated players", () => {
    const t = eliminate(abc(), "b");
    expect(activePlayers(t)).toEqual(["a", "c"]);
    expect(currentPlayer(nextTurn(t))).toBe("c");
  });

  it("does not mutate the input", () => {
    const t = abc();
    nextTurn(t);
    eliminate(t, "b");
    expect(t).toEqual(abc());
  });
});
