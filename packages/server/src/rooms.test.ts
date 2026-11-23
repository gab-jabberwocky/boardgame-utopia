import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { AnyGameModule, GameModule, PlayerId } from "@utopia/shared";
import { RoomManager, type RoomManagerOptions } from "./rooms.js";

/** A tiny game: take turns adding 1; first to `target` wins. Everyone has a secret. */
interface CountState {
  players: PlayerId[];
  turn: number;
  count: number;
  target: number;
  secrets: Record<PlayerId, number>;
}
const countGame: GameModule<CountState, { type: "add" }, { target: number }> = {
  id: "count",
  name: "Count",
  description: "Count to the target.",
  minPlayers: 2,
  maxPlayers: 3,
  configSchema: z.object({ target: z.number().int().min(1).default(3) }),
  setup: ({ players, rng }, config) => ({
    players: players.map((p) => p.id),
    turn: 0,
    count: 0,
    target: config.target,
    secrets: Object.fromEntries(players.map((p) => [p.id, rng.int(1, 1000)])),
  }),
  validateMove: (s, p) => (s.players[s.turn % s.players.length] === p ? null : "Not your turn."),
  applyMove: (s) => ({ ...s, turn: s.turn + 1, count: s.count + 1 }),
  getPlayerView: (s, viewer) => ({
    count: s.count,
    mySecret: viewer === "spectator" ? null : s.secrets[viewer],
  }),
  getResult: (s) =>
    s.count >= s.target
      ? { winners: [s.players[(s.turn - 1) % s.players.length]!], text: "Done" }
      : null,
  getStatus: (s) => ({ text: "Add one", activePlayers: [s.players[s.turn % s.players.length]!] }),
  describeMove: (_b, a, p, _m, viewer) => ({
    text: `${p === viewer ? "You" : p} added: ${a.count}`,
  }),
  getLegalMoves: () => [{ move: { type: "add" }, label: "Add 1" }],
};

/** Count, but with bugs: "boom" throws while checking, "crash" throws while applying. */
const buggyGame: typeof countGame = {
  ...countGame,
  id: "buggy",
  validateMove: (s, p, m) => {
    if ((m as { type: string }).type === "boom") throw new Error("validate bug");
    return countGame.validateMove(s, p, m);
  },
  applyMove: (s, p, m, ctx) => {
    if ((m as { type: string }).type === "crash") throw new Error("apply bug");
    return countGame.applyMove(s, p, m, ctx);
  },
  setup: (ctx, config) => {
    if (config.target === 99) throw new Error("setup bug");
    return countGame.setup(ctx, config);
  },
};

let clock = 0;
const errors: unknown[] = [];
const manager = (options: Partial<RoomManagerOptions> = {}) => {
  let seed = 0;
  return new RoomManager({
    games: [countGame, buggyGame] as unknown as AnyGameModule[],
    random: () => (seed = (seed * 9301 + 49297) % 233280) / 233280,
    now: () => clock,
    idleMs: 1000,
    onError: (err) => errors.push(err),
    ...options,
  });
};

/** A room created by "host-token" with Ann (host) and Bob seated. */
function roomWithTwo(gameId = "count", options: Partial<RoomManagerOptions> = {}) {
  const rooms = manager(options);
  const created = rooms.create("host-token", gameId, { target: 3 });
  if (!created.ok) throw new Error(created.error);
  const { code } = created;
  expect(rooms.join(code, "host-token", "Ann", "#f97316")).toEqual({ ok: true });
  expect(rooms.join(code, "bob-token", "Bob", "#38bdf8")).toEqual({ ok: true });
  return { rooms, code };
}

describe("rooms", () => {
  it("creates a room with a 4-letter code and parsed settings", () => {
    const rooms = manager();
    const res = rooms.create("t1", "count", {});
    expect(res.ok && res.code).toMatch(/^[A-Z]{4}$/);
    if (!res.ok) return;
    expect(rooms.view(res.code, "t1")).toMatchObject({
      gameId: "count",
      config: { target: 3 },
      youHost: true,
      you: null,
      players: [],
    });
    expect(rooms.create("t1", "nope", {})).toEqual({
      ok: false,
      error:
        'The server doesn\'t have "nope" yet. Restart it with the latest build, then try again.',
    });
    expect(rooms.create("t1", "", {})).toEqual({ ok: false, error: "Pick a game." });
    expect(rooms.create("t1", "count", { target: -1 })).toMatchObject({ ok: false });
  });

  it("seats players with unique names and colours, and lets them change them", () => {
    const { rooms, code } = roomWithTwo();
    expect(rooms.join(code, "cy-token", "ann", "#a3e635")).toEqual({
      ok: false,
      error: "“Ann” is already taken.",
    });
    expect(rooms.join(code, "cy-token", "Cy", "#38bdf8")).toEqual({
      ok: false,
      error: "Bob already has that colour.",
    });
    expect(rooms.join(code, "bob-token", "Bobby", "#a3e635")).toEqual({ ok: true });
    const view = rooms.view(code, "bob-token")!;
    expect(view.you).toBe("p2");
    expect(view.hostId).toBe("p1");
    expect(view.players.map((p) => p.name)).toEqual(["Ann", "Bobby"]);
  });

  it("tracks who is connected, and rejoins a refreshed browser to the same seat", () => {
    const { rooms, code } = roomWithTwo();
    rooms.connect(code, "bob-token");
    expect(rooms.view(code, "x")!.players.map((p) => p.connected)).toEqual([false, true]);
    rooms.disconnect(code, "bob-token");
    rooms.connect(code, "bob-token");
    expect(rooms.view(code, "bob-token")!.you).toBe("p2");
  });

  it("only the host starts, and only with a valid number of players", () => {
    const rooms = manager();
    const res = rooms.create("host-token", "count", {});
    if (!res.ok) throw new Error();
    rooms.join(res.code, "host-token", "Ann", "#f97316");
    expect(rooms.start(res.code, "host-token")).toEqual({
      ok: false,
      error: "Count needs 2–3 players.",
    });
    rooms.join(res.code, "bob-token", "Bob", "#38bdf8");
    expect(rooms.start(res.code, "bob-token")).toMatchObject({ ok: false });
    expect(rooms.start(res.code, "host-token")).toEqual({ ok: true });
  });

  it("plays moves in order, checking turn and version; each viewer sees only their own secret", () => {
    const { rooms, code } = roomWithTwo();
    rooms.start(code, "host-token");
    const ann = rooms.view(code, "host-token")!.game!;
    const bob = rooms.view(code, "bob-token")!.game!;
    const annSecret = (ann.snapshot.view as { mySecret: number }).mySecret;
    expect(annSecret).toBeGreaterThan(0);
    expect(JSON.stringify(bob)).not.toContain(`"mySecret":${annSecret}`);
    expect(ann.snapshot.legalMoves).toHaveLength(1);
    expect(bob.snapshot.legalMoves).toHaveLength(1); // getLegalMoves is the game's business

    expect(rooms.move(code, "bob-token", { type: "add" }, 0)).toEqual({
      ok: false,
      error: "Not your turn.",
    });
    expect(rooms.move(code, "host-token", { type: "add" }, 0)).toEqual({ ok: true });
    expect(rooms.move(code, "bob-token", { type: "add" }, 0)).toEqual({
      ok: false,
      error: "The game moved on. Have another look.",
    });
    expect(rooms.move(code, "bob-token", { type: "add" }, 1)).toEqual({ ok: true });
    const view = rooms.view(code, "host-token")!.game!;
    expect(view.version).toBe(2);
    expect(view.snapshot.recentActions.map((a) => a.text)).toEqual(["p2 added: 2", "You added: 1"]);
  });

  it("people who aren't in the game watch as spectators and can't join until it ends", () => {
    const { rooms, code } = roomWithTwo();
    rooms.start(code, "host-token");
    const watcher = rooms.view(code, "cy-token")!;
    expect(watcher.you).toBeNull();
    expect(watcher.game?.snapshot.view).toEqual({ count: 0, mySecret: null });
    expect(watcher.game?.snapshot.legalMoves).toEqual([]);
    expect(rooms.join(code, "cy-token", "Cy", "#a3e635")).toMatchObject({ ok: false });
    expect(rooms.move(code, "cy-token", { type: "add" }, 0)).toEqual({
      ok: false,
      error: "You're watching this game.",
    });
  });

  it("finished games stay on screen until the host goes back to the lobby", () => {
    const { rooms, code } = roomWithTwo();
    rooms.start(code, "host-token");
    for (const [token, v] of [
      ["host-token", 0],
      ["bob-token", 1],
      ["host-token", 2],
    ] as const) {
      expect(rooms.move(code, token, { type: "add" }, v)).toEqual({ ok: true });
    }
    expect(rooms.view(code, "bob-token")!.game!.snapshot.result?.text).toBe("Done");
    expect(rooms.move(code, "bob-token", { type: "add" }, 3)).toEqual({
      ok: false,
      error: "The game is over.",
    });
    expect(rooms.backToLobby(code, "bob-token")).toMatchObject({ ok: false });
    expect(rooms.backToLobby(code, "host-token")).toEqual({ ok: true });
    expect(rooms.view(code, "bob-token")!.game).toBeNull();
    expect(rooms.join(code, "cy-token", "Cy", "#a3e635")).toEqual({ ok: true });
  });

  it("the host can change the game settings in the lobby and remove players", () => {
    const { rooms, code } = roomWithTwo();
    expect(rooms.setGame(code, "bob-token", "count", { target: 5 })).toMatchObject({ ok: false });
    expect(rooms.setGame(code, "host-token", "count", { target: 5 })).toEqual({ ok: true });
    expect(rooms.view(code, "bob-token")!.config).toEqual({ target: 5 });
    expect(rooms.kick(code, "host-token", "p2")).toEqual({ ok: true, token: "bob-token" });
    expect(rooms.view(code, "bob-token")!.you).toBeNull();
  });

  it("when the host leaves, the next player becomes host", () => {
    const { rooms, code } = roomWithTwo();
    expect(rooms.leave(code, "host-token")).toEqual({ ok: true });
    expect(rooms.view(code, "bob-token")).toMatchObject({ youHost: true, hostId: "p2" });
  });

  it("removes rooms nobody has been connected to for a while", () => {
    const { rooms, code } = roomWithTwo();
    rooms.connect(code, "bob-token");
    clock += 5000;
    expect(rooms.sweep()).toBe(0);
    rooms.disconnect(code, "bob-token");
    clock += 5000;
    expect(rooms.sweep()).toBe(1);
    expect(rooms.has(code)).toBe(false);
  });

  it("a bug in a game rejects that action instead of taking the server down", () => {
    const { rooms, code } = roomWithTwo("buggy");
    errors.length = 0;
    expect(rooms.setGame(code, "host-token", "buggy", { target: 99 })).toEqual({ ok: true });
    expect(rooms.start(code, "host-token")).toMatchObject({ ok: false });
    expect(rooms.setGame(code, "host-token", "buggy", { target: 3 })).toEqual({ ok: true });
    expect(rooms.start(code, "host-token")).toEqual({ ok: true });
    expect(rooms.move(code, "host-token", { type: "boom" }, 0)).toMatchObject({ ok: false });
    expect(rooms.move(code, "host-token", { type: "crash" }, 0)).toMatchObject({ ok: false });
    expect(errors).toHaveLength(3);
    // Nothing changed, and the game carries on.
    expect(rooms.view(code, "host-token")!.game!.version).toBe(0);
    expect(rooms.move(code, "host-token", { type: "add" }, 0)).toEqual({ ok: true });
  });

  it("refuses oversized moves before the game sees them", () => {
    const { rooms, code } = roomWithTwo();
    rooms.start(code, "host-token");
    const big = { type: "add", pad: "x".repeat(5000) };
    expect(rooms.move(code, "host-token", big, 0)).toMatchObject({ ok: false });
    expect(rooms.view(code, "host-token")!.game!.version).toBe(0);
  });

  it("caps the number of rooms, overall and per host", () => {
    const rooms = manager({ maxRooms: 3, maxRoomsPerHost: 2 });
    expect(rooms.create("a-token", "count", {}).ok).toBe(true);
    expect(rooms.create("a-token", "count", {}).ok).toBe(true);
    expect(rooms.create("a-token", "count", {})).toMatchObject({ ok: false });
    expect(rooms.create("b-token", "count", {}).ok).toBe(true);
    expect(rooms.create("c-token", "count", {})).toMatchObject({ ok: false });
    expect(rooms.size).toBe(3);
  });

  it("gives up instead of looping forever when no free code turns up", () => {
    const rooms = manager({ random: () => 0 }); // every code comes out "AAAA"
    expect(rooms.create("a-token", "count", {}).ok).toBe(true);
    expect(rooms.create("b-token", "count", {})).toMatchObject({ ok: false });
  });

  it("removes rooms nobody ever sat down in much sooner", () => {
    const rooms = manager({ idleMs: 60_000, emptyIdleMs: 1000 });
    const res = rooms.create("a-token", "count", {});
    if (!res.ok) throw new Error(res.error);
    clock += 5000;
    expect(rooms.sweep()).toBe(1);
    expect(rooms.has(res.code)).toBe(false);
  });

  it("hands the host role to a connected player once the host has been away a while", () => {
    const { rooms, code } = roomWithTwo("count", { hostGraceMs: 1000 });
    rooms.connect(code, "host-token");
    rooms.connect(code, "bob-token");
    rooms.start(code, "host-token");
    rooms.disconnect(code, "host-token");
    clock += 500;
    expect(rooms.promoteHosts()).toEqual([]);
    clock += 600;
    expect(rooms.promoteHosts()).toEqual([code]);
    expect(rooms.view(code, "bob-token")).toMatchObject({ youHost: true, hostId: "p2" });
    // The new host can end the stuck game.
    expect(rooms.backToLobby(code, "bob-token")).toEqual({ ok: true });
  });

  it("keeps the host if they come back in time, or if nobody else is around", () => {
    const { rooms, code } = roomWithTwo("count", { hostGraceMs: 1000 });
    rooms.connect(code, "host-token");
    rooms.disconnect(code, "host-token");
    clock += 500;
    rooms.connect(code, "host-token");
    clock += 5000;
    expect(rooms.promoteHosts()).toEqual([]);
    rooms.disconnect(code, "host-token"); // Bob isn't connected either
    clock += 5000;
    expect(rooms.promoteHosts()).toEqual([]);
    expect(rooms.view(code, "host-token")).toMatchObject({ youHost: true });
  });
});
