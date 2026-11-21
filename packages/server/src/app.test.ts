import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientToServerEvents, RoomView, ServerToClientEvents } from "@utopia/shared";
import { createApp } from "./app.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

describe("server app", () => {
  let close: (() => Promise<void>) | undefined;
  const clients: Client[] = [];

  afterEach(async () => {
    for (const c of clients.splice(0)) c.disconnect();
    await close?.();
  });

  async function start() {
    const app = createApp();
    await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
    close = () => new Promise((resolve) => void app.io.close(() => resolve()));
    const { port } = app.httpServer.address() as AddressInfo;
    return { url: `http://localhost:${port}`, port };
  }

  /** A browser with its own guest token, remembering the last room state it got. */
  function client(url: string, token: string) {
    const socket: Client = connect(url, { auth: { token }, transports: ["websocket"] });
    clients.push(socket);
    const states: RoomView[] = [];
    socket.on("room:state", (s) => states.push(s));
    const next = (pred: (s: RoomView) => boolean) =>
      new Promise<RoomView>((resolve) => {
        const found = states.findLast(pred);
        if (found) return resolve(found);
        const on = (s: RoomView) => {
          if (pred(s)) {
            socket.off("room:state", on);
            resolve(s);
          }
        };
        socket.on("room:state", on);
      });
    return { socket, states, next };
  }

  it("answers GET /health", async () => {
    const { url } = await start();
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("refuses connections without a guest token", async () => {
    const { url } = await start();
    const socket: Client = connect(url, { transports: ["websocket"] });
    clients.push(socket);
    const err = await new Promise<Error>((resolve) => socket.on("connect_error", resolve));
    expect(err.message).toBe("Missing guest token");
  });

  it("creates a room, seats two players, starts a game and plays a move", async () => {
    const { url } = await start();
    const ann = client(url, "ann-token-123");
    const bob = client(url, "bob-token-456");

    const created = await ann.socket.emitWithAck("room:create", { gameId: "peak", config: {} });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { code } = created;

    expect(await ann.socket.emitWithAck("room:watch", { code })).toEqual({ ok: true });
    expect(
      await ann.socket.emitWithAck("room:join", { code, name: "Ann", color: "#f97316" }),
    ).toEqual({ ok: true });
    expect(await bob.socket.emitWithAck("room:watch", { code: code.toLowerCase() })).toEqual({
      ok: true,
    });
    expect(
      await bob.socket.emitWithAck("room:join", { code, name: "Bob", color: "#38bdf8" }),
    ).toEqual({ ok: true });

    const lobby = await ann.next(
      (s) => s.players.length === 2 && s.players.every((p) => p.connected),
    );
    expect(lobby).toMatchObject({ code, youHost: true, you: "p1", hostId: "p1", game: null });

    expect(await bob.socket.emitWithAck("game:start", { code })).toMatchObject({ ok: false });
    expect(await ann.socket.emitWithAck("game:start", { code })).toEqual({ ok: true });

    const annGame = await ann.next((s) => !!s.game);
    const bobGame = await bob.next((s) => !!s.game);
    expect(annGame.game?.players.map((p) => p.name)).toEqual(["Ann", "Bob"]);
    const [mover, other] =
      annGame.game!.snapshot.status.activePlayers[0] === "p1" ? [ann, bob] : [bob, ann];
    const moves = (mover === ann ? annGame : bobGame).game!.snapshot.legalMoves;
    expect(moves.length).toBeGreaterThan(0);
    expect((other === ann ? annGame : bobGame).game!.snapshot.legalMoves).toEqual([]);

    const moved = await mover.socket.emitWithAck("game:move", {
      code,
      move: moves[0]!.move,
      version: 0,
    });
    expect(moved).toEqual({ ok: true });
    const after = await other.next((s) => (s.game?.version ?? 0) === 1);
    expect(after.game!.snapshot.recentActions).toHaveLength(1);
  });

  it("a refreshed browser gets its seat back; others see it reconnect", async () => {
    const { url } = await start();
    const ann = client(url, "ann-token-123");
    const created = await ann.socket.emitWithAck("room:create", { gameId: "peak", config: {} });
    if (!created.ok) throw new Error(created.error);
    const { code } = created;
    await ann.socket.emitWithAck("room:watch", { code });
    await ann.socket.emitWithAck("room:join", { code, name: "Ann", color: "#f97316" });

    const bob = client(url, "bob-token-456");
    await bob.socket.emitWithAck("room:watch", { code });
    await bob.socket.emitWithAck("room:join", { code, name: "Bob", color: "#38bdf8" });
    bob.socket.disconnect();
    await ann.next((s) => s.players[1]?.connected === false);

    const bobAgain = client(url, "bob-token-456");
    await bobAgain.socket.emitWithAck("room:watch", { code });
    const view = await bobAgain.next(() => true);
    expect(view.you).toBe("p2");
    await ann.next((s) => s.players[1]?.connected === true);
  });

  it("tells a removed player they're out", async () => {
    const { url } = await start();
    const ann = client(url, "ann-token-123");
    const created = await ann.socket.emitWithAck("room:create", { gameId: "peak", config: {} });
    if (!created.ok) throw new Error(created.error);
    const { code } = created;
    const bob = client(url, "bob-token-456");
    await bob.socket.emitWithAck("room:watch", { code });
    await bob.socket.emitWithAck("room:join", { code, name: "Bob", color: "#38bdf8" });
    const gone = new Promise((resolve) => bob.socket.on("room:gone", resolve));
    expect(await ann.socket.emitWithAck("room:kick", { code, player: "p1" })).toEqual({ ok: true });
    expect(await gone).toEqual({ code, reason: "The host removed you from the room." });
  });

  it("answers bad requests with an error instead of crashing", async () => {
    const { url } = await start();
    const ann = client(url, "ann-token-123");
    expect(await ann.socket.emitWithAck("room:watch", { code: "ZZZZ" })).toEqual({
      ok: false,
      error: "No room with that code.",
    });
    expect(
      await ann.socket.emitWithAck("room:join", {
        code: 42 as unknown as string,
        name: "",
        color: "",
      }),
    ).toEqual({
      ok: false,
      error: "No room with that code.",
    });
    expect(await ann.socket.emitWithAck("room:create", { gameId: "nope", config: null })).toEqual({
      ok: false,
      error:
        'The server doesn\'t have "nope" yet. Restart it with the latest build, then try again.',
    });
  });
});
