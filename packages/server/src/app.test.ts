import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("server app", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
  });

  it("answers GET /health", async () => {
    const { httpServer, io } = createApp();
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    close = () => new Promise((resolve) => void io.close(() => resolve()));

    const { port } = httpServer.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
