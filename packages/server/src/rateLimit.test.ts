import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rateLimit.js";

describe("createRateLimiter", () => {
  it("allows a burst, then refills over time", () => {
    let clock = 0;
    const allow = createRateLimiter(3, 2, () => clock);
    expect([allow(), allow(), allow(), allow()]).toEqual([true, true, true, false]);
    clock += 500; // one token back
    expect([allow(), allow()]).toEqual([true, false]);
    clock += 60_000; // never more than the burst
    expect([allow(), allow(), allow(), allow()]).toEqual([true, true, true, false]);
  });
});
