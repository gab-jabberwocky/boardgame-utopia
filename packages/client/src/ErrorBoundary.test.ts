import { describe, expect, it } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

type S = { failed: boolean; failedKey: unknown };
const props = (resetKey: unknown) => ({ resetKey, children: null, fallback: () => null });

/** What React does: derive from props, then (on a throw) from the error, then props again. */
function step(state: S, resetKey: unknown, throws = false): S {
  let next = { ...state, ...ErrorBoundary.getDerivedStateFromProps(props(resetKey), state) };
  if (throws && !next.failed) {
    next = { ...next, ...ErrorBoundary.getDerivedStateFromError() };
    next = { ...next, ...ErrorBoundary.getDerivedStateFromProps(props(resetKey), next) };
  }
  return next;
}

describe("ErrorBoundary", () => {
  it("shows the fallback until the reset key changes, then tries again", () => {
    let s: S = { failed: false, failedKey: undefined };
    s = step(s, 3);
    expect(s.failed).toBe(false);
    s = step(s, 3, true); // the Board throws at version 3
    expect(s.failed).toBe(true);
    s = step(s, 3); // a re-render with the same version keeps the fallback
    expect(s.failed).toBe(true);
    s = step(s, 4); // the next move arrives
    expect(s.failed).toBe(false);
  });

  it("without a reset key it stays on the fallback", () => {
    let s: S = { failed: false, failedKey: undefined };
    s = step(s, undefined, true);
    s = step(s, undefined);
    expect(s.failed).toBe(true);
  });
});
