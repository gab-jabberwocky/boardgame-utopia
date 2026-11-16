import { describe, expect, it } from "vitest";
import { createRng } from "./rng.js";

describe("createRng", () => {
  it("gives the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(
      Array.from({ length: 5 }, () => b.next()),
    );
  });

  it("accepts text seeds", () => {
    expect(createRng("party").int(1, 1000)).toBe(createRng("party").int(1, 1000));
    expect(createRng("party").next()).not.toBe(createRng("other").next());
  });

  it("resumes from getState", () => {
    const a = createRng(7);
    a.next();
    const resumed = createRng(a.getState());
    expect(resumed.next()).toBe(a.next());
  });

  it("int stays in range and hits both ends", () => {
    const rng = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("int rejects bad ranges", () => {
    expect(() => createRng(1).int(5, 1)).toThrow();
  });

  it("pick returns an item and rejects empty lists", () => {
    expect(["a", "b"]).toContain(createRng(3).pick(["a", "b"]));
    expect(() => createRng(3).pick([])).toThrow();
  });

  it("shuffle returns a permutation without changing the input", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = createRng(9).shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort()).toEqual(input);
  });
});
