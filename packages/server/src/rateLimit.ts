/**
 * Token bucket: allows bursts of `burst` events, refilled at `perSecond`.
 * Generous enough for fast games; stops a script from flooding the server.
 */
export function createRateLimiter(burst: number, perSecond: number, now: () => number = Date.now) {
  let tokens = burst;
  let last = now();
  return () => {
    const t = now();
    tokens = Math.min(burst, tokens + ((t - last) / 1000) * perSecond);
    last = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}
