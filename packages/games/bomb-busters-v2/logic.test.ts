import { createRng } from "@utopia/kit";
import { describe, expect, it } from "vitest";
import { configSchema, type Config } from "./config.js";
import {
  MISSIONS,
  TOOL_INFO,
  allWires,
  applyMove,
  describeMove,
  getLegalMoves,
  getPlayerView,
  getResult,
  getStatus,
  remaining,
  setup,
  validateMove,
  wireValueText,
  type Move,
  type State,
  type ToolKind,
  type Wire,
  type WireValue,
} from "./logic.js";

const PLAYERS = ["a", "b", "c", "d", "e"].map((id) => ({
  id,
  name: id.toUpperCase(),
  color: "#888",
}));

const fresh = (mission: Config["mission"] = "1", n = 3, seed = 11, powerCards = true): State =>
  setup(
    { players: PLAYERS.slice(0, n), rng: createRng(seed) },
    configSchema.parse({ mission, powerCards }),
  );

const play = (s: State, player: string, move: Move): State => {
  const err = validateMove(s, player, move);
  if (err) throw new Error(`${player} ${JSON.stringify(move)}: ${err}`);
  return applyMove(s, player, move, { rng: createRng(1) });
};

/** Replace every stand with these values (one array per stand), in play, A to act. */
function rig(s: State, stands: Record<string, WireValue[][]>): State {
  let n = 0;
  const players = s.players.map((p) => ({
    ...p,
    racks: (stands[p.id] ?? [[]]).map((rack) =>
      rack.map((value): Wire => ({
        id: `t${n++}`,
        value,
        cut: false,
        clue: false,
        sort: typeof value === "number" ? value : value === "YELLOW" ? 5.1 : 5.5,
        ...(value === "YELLOW"
          ? { color: "yellow" as const }
          : value === "RED"
            ? { color: "red" as const }
            : {}),
      })),
    ),
  }));
  return { ...s, players, phase: "play", setupIndex: s.players.length, active: "a", mistakes: 0 };
}

const id = (s: State, player: string, stand: number, index: number) =>
  s.players.find((p) => p.id === player)!.racks[stand]![index]!.id;

describe("setup", () => {
  it("deals the mission's wires: 4 of each number, plus yellow and red", () => {
    const cases: [Config["mission"], number, number][] = [
      ["1", 3, 24],
      ["2", 3, 32 + 2],
      ["3", 3, 40 + 1],
      ["4", 3, 48 + 2 + 1],
      ["4", 2, 48 + 4 + 1], // 2 players: 4 yellow
      ["6", 3, 48 + 4 + 1],
      ["6", 2, 48 + 4 + 2], // 2 players: 2 red
      ["8", 4, 48 + 2 + 1],
    ];
    for (const [mission, n, total] of cases) expect(allWires(fresh(mission, n)).length).toBe(total);
  });

  it("gives 2 stands each with 2 players, 2 to the captain with 3, and 1 each with more", () => {
    expect(fresh("1", 2).players.map((p) => p.racks.length)).toEqual([2, 2]);
    expect(fresh("1", 3).players.map((p) => p.racks.length)).toEqual([2, 1, 1]);
    expect(fresh("1", 5).players.map((p) => p.racks.length)).toEqual([1, 1, 1, 1, 1]);
  });

  it("sorts every stand low to high and is the same for the same seed", () => {
    const s = fresh("4", 4);
    for (const rack of s.players.flatMap((p) => p.racks)) {
      expect(rack.map((w) => w.sort)).toEqual([...rack].map((w) => w.sort).sort((a, b) => a - b));
    }
    expect(fresh("4", 4)).toEqual(s);
  });

  it("mission 8 has uncertain markers: 3 yellow candidates for 2 wires, 2 red for 1", () => {
    const m = fresh("8", 4).markers;
    expect(m.filter((x) => x.color === "yellow")).toHaveLength(3);
    expect(m.filter((x) => x.color === "yellow" && x.present)).toHaveLength(2);
    expect(m.filter((x) => x.color === "red" && x.present)).toHaveLength(1);
    expect(m.every((x) => x.uncertain)).toBe(true);
  });
});

describe("hidden information", () => {
  it("other players' wires show no value, position or colour", () => {
    const s = fresh("4", 3);
    const coloured = s.players[1]!.racks.flat().find((w) => w.color);
    const view = getPlayerView(s, "a");
    for (const w of view.players[1]!.racks.flat()) {
      expect(w.value).toBeUndefined();
      expect(w.sort).toBeUndefined();
      expect(w.color).toBeUndefined();
    }
    expect(view.players[0]!.racks.flat().every((w) => w.value !== undefined)).toBe(true);
    if (coloured) expect(JSON.stringify(view.players[1])).not.toContain(coloured.color!);
  });

  it("spectators see no hidden values; everything is shown at the end", () => {
    const s = fresh("1", 3);
    expect(
      getPlayerView(s, "spectator")
        .players.flatMap((p) => p.racks.flat())
        .some((w) => w.value !== undefined),
    ).toBe(false);
    const over = { ...s, phase: "over" as const, result: "lost" as const };
    expect(
      getPlayerView(over, "spectator")
        .players.flatMap((p) => p.racks.flat())
        .every((w) => w.value !== undefined),
    ).toBe(true);
  });

  it("mission 8: which candidate markers really hold a wire stays hidden until the end", () => {
    const s = fresh("8", 4);
    expect(getPlayerView(s, "a").markers.every((m) => m.present === undefined)).toBe(true);
    const over = { ...s, phase: "over" as const, result: "won" as const };
    expect(getPlayerView(over, "a").markers.filter((m) => m.present)).toHaveLength(3);
  });
});

describe("starting clues", () => {
  it("go in seat order, never on red, and then the captain calls first", () => {
    let s = fresh("3", 3);
    const red = s.players[0]!.racks.flat().find((w) => w.value === "RED");
    if (red) expect(validateMove(s, "a", { type: "clue", wireId: red.id })).toMatch(/non-red/);
    const aWire = getLegalMoves(s, "a")[0]!.move;
    expect(validateMove(s, "b", aWire)).toMatch(/seat order/);
    s = play(s, "a", aWire);
    expect(getStatus(s, "b").text).toBe("Your turn: reveal one of your wires as a starting clue");
    s = play(s, "b", getLegalMoves(s, "b")[0]!.move);
    s = play(s, "c", getLegalMoves(s, "c")[0]!.move);
    expect(s.phase).toBe("play");
    expect(s.active).toBe("a");
    expect(allWires(s).filter((w) => w.clue)).toHaveLength(3);
  });

  it("only 2 clues per number; with nothing left to show, the player skips", () => {
    let s = rig(fresh("1", 3), { a: [[2, 2]], b: [[2, 3]], c: [[2, 4]] });
    s = { ...s, phase: "clues", setupIndex: 0, active: "a" };
    s = play(s, "a", { type: "clue", wireId: id(s, "a", 0, 0) });
    s = play(s, "b", { type: "clue", wireId: id(s, "b", 0, 0) });
    expect(validateMove(s, "c", { type: "clue", wireId: id(s, "c", 0, 0) })).toMatch(
      /Both clue tokens/,
    );
    expect(getLegalMoves(s, "c").map((m) => m.move.type)).toEqual(["clue"]);
    const stuck = rig(fresh("1", 3), { a: [["RED"]], b: [[1]], c: [[1]] });
    const clues = { ...stuck, phase: "clues" as const, setupIndex: 0 };
    expect(getLegalMoves(clues, "a").map((m) => m.label)).toEqual(["No clue possible: skip"]);
    expect(play(clues, "a", { type: "skipClue" }).setupIndex).toBe(1);
  });
});

describe("calls", () => {
  const base = () => rig(fresh("4", 3), { a: [[1, 3], [5]], b: [[3, 7]], c: [["RED", 9]] });

  it("a right call cuts the target, then the caller cuts their own match", () => {
    let s = play(base(), "a", { type: "call", wireId: id(base(), "b", 0, 0), value: 3 });
    expect(s.phase).toBe("own");
    expect(getStatus(s, "a").text).toBe("Match! Cut one of your 3 wires");
    expect(getLegalMoves(s, "a").map((m) => m.label)).toEqual(["Cut your stand 1, wire 2 (3)"]);
    expect(validateMove(s, "b", { type: "cutOwn", wireId: id(s, "a", 0, 1) })).toMatch(/caller/);
    s = play(s, "a", { type: "cutOwn", wireId: id(s, "a", 0, 1) });
    expect(remaining(s, "a").map((w) => w.value)).toEqual([1, 5]);
    expect(s.active).toBe("b");
  });

  it("the caller's own cut must be one of their uncut wires of the called value", () => {
    const s = play(base(), "a", { type: "call", wireId: id(base(), "b", 0, 0), value: 3 });
    const cut = (wireId: string) => validateMove(s, "a", { type: "cutOwn", wireId });
    expect(cut("no-such-wire")).toMatch(/matching/);
    expect(cut(id(s, "a", 0, 0))).toMatch(/matching/); // a 1, not a 3
    expect(cut(id(s, "b", 0, 1))).toMatch(/matching/); // someone else's wire
    expect(cut(id(s, "a", 0, 1))).toBeNull();
  });

  it("you can only call values you hold, never red, on a teammate's uncut wire", () => {
    const s = base();
    expect(validateMove(s, "a", { type: "call", wireId: id(s, "b", 0, 0), value: 7 })).toMatch(
      /still hold/,
    );
    expect(validateMove(s, "a", { type: "call", wireId: id(s, "a", 0, 0), value: 1 })).toMatch(
      /teammate/,
    );
    expect(validateMove(s, "b", { type: "call", wireId: id(s, "a", 0, 0), value: 3 })).toMatch(
      /another player/,
    );
  });

  it("a wrong call makes the wire a public clue and ticks the detonator; enough misses lose", () => {
    let s = play(base(), "a", { type: "call", wireId: id(base(), "b", 0, 1), value: 1 });
    expect(s.mistakes).toBe(1);
    expect(s.players[1]!.racks[0]![1]!.clue).toBe(true);
    expect(getPlayerView(s, "c").players[1]!.racks[0]![1]!.value).toBe(7);
    expect(s.active).toBe("b");
    s = { ...s, mistakes: 2, active: "a" };
    s = play(s, "a", { type: "call", wireId: id(s, "c", 0, 1), value: 1 });
    expect(getResult(s)).toEqual({ winners: [], text: "The bomb exploded. The team lost." });
  });

  it("a yellow wire is named with its place between numbers once it's public", () => {
    const s0 = rig(fresh("4", 3), { a: [[3]], b: [["YELLOW", 7]], c: [[6]] });
    // Hidden from teammates until revealed: no value and no decimal.
    expect(getPlayerView(s0, "a").players[1]!.racks[0]![0]).not.toHaveProperty("sort");
    const s = play(s0, "a", { type: "call", wireId: id(s0, "b", 0, 0), value: 3 });
    expect(s.lastText).toBe("No match: that wire is yellow 5.1, now a public clue.");
    expect(getPlayerView(s, "c").players[1]!.racks[0]![0]).toMatchObject({
      value: "YELLOW",
      sort: 5.1,
    });
    expect(wireValueText({ value: "RED", sort: 4.5 })).toBe("red 4.5");
    expect(wireValueText({ value: 7, sort: 7 })).toBe("7");
  });

  it("calling on a red wire explodes the bomb", () => {
    const s = play(base(), "a", { type: "call", wireId: id(base(), "c", 0, 0), value: 5 });
    expect(s.result).toBe("lost");
    expect(
      describeMove(base(), s, "a", { type: "call", wireId: id(base(), "c", 0, 0), value: 5 }, "b"),
    ).toMatchObject({
      text: "A called 5 on C's wire 1: a red wire! The bomb exploded.",
      flash: "Bomb exploded",
    });
  });
});

describe("solo cuts, red reveals and winning", () => {
  it("solo cut needs every remaining copy (2 or 4) of a value", () => {
    const s = rig(fresh("1", 3), { a: [[4, 4], [6]], b: [[6]], c: [[2]] });
    expect(
      getLegalMoves(s, "a")
        .filter((m) => m.move.type === "solo")
        .map((m) => m.label),
    ).toEqual(["Solo cut all 4s"]);
    // Offered by tapping the glowing wires, not as a separate button on the bar.
    expect(getLegalMoves(s, "a").find((m) => m.move.type === "solo")?.where).toBe("board");
    expect(validateMove(s, "a", { type: "solo", value: 6 })).toMatch(/solo cut/i);
    const after = play(s, "a", { type: "solo", value: 4 });
    expect(remaining(after, "a").map((w) => w.value)).toEqual([6]);
  });

  it("only red left: reveal them safely", () => {
    const s = rig(fresh("3", 3), { a: [["RED"]], b: [[1]], c: [[1]] });
    expect(getLegalMoves(s, "a").map((m) => m.move.type)).toEqual(["revealRed"]);
    expect(remaining(play(s, "a", { type: "revealRed" }), "a")).toEqual([]);
  });

  it("the team wins when every wire is cut", () => {
    let s = rig(fresh("1", 2), { a: [[2], []], b: [[2], []] });
    s = play(s, "a", { type: "call", wireId: id(s, "b", 0, 0), value: 2 });
    s = play(s, "a", { type: "cutOwn", wireId: id(s, "a", 0, 0) });
    expect(getResult(s)).toMatchObject({ winners: ["a", "b"], text: "The team defused the bomb!" });
  });
});

describe("text", () => {
  it("is per viewer and names wires by position, not hidden values", () => {
    const s = rig(fresh("1", 3), { a: [[1, 3]], b: [[3, 7]], c: [[9]] });
    const move: Move = { type: "call", wireId: id(s, "b", 0, 0), value: 3 };
    const after = play(s, "a", move);
    expect(describeMove(s, after, "a", move, "a").text).toBe("You called 3 on B's wire 1: match!");
    expect(describeMove(s, after, "a", move, "b").text).toBe("A called 3 on your wire 1: match!");
    expect(getStatus(after, "c").text).toBe("A is cutting a matching wire");
    const cut: Move = { type: "cutOwn", wireId: id(after, "a", 0, 1) };
    const done = play(after, "a", cut);
    expect(describeMove(after, done, "a", cut, "c").text).toBe(
      "A cut their wire 2: a pair of 3s is safe.",
    );
    expect(describeMove(after, done, "a", cut, "a").text).toBe(
      "You cut your wire 2: a pair of 3s is safe.",
    );
  });
});

describe("random games", () => {
  it("always end, keep every wire, and always offer a move", () => {
    const missions = Object.keys(MISSIONS) as Config["mission"][];
    for (let seed = 1; seed <= 56; seed++) {
      const n = 2 + (seed % 4);
      let s = fresh(missions[seed % missions.length]!, n, seed);
      const total = allWires(s).length;
      const rng = createRng(seed * 7);
      for (let step = 0; step < 3000 && !getResult(s); step++) {
        const who = getStatus(s, "spectator").activePlayers[0]!;
        const moves = getLegalMoves(s, who);
        expect(moves.length).toBeGreaterThan(0);
        // Prefer safe-looking moves so some games are won, not just exploded.
        const safe = moves.filter((m) => m.move.type !== "call");
        s = play(s, who, (safe.length && rng.next() < 0.7 ? rng.pick(safe) : rng.pick(moves)).move);
        expect(allWires(s)).toHaveLength(total);
      }
      expect(getResult(s)).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------- our additions

/** Make these tools usable: two wires of each unlock value, already cut, on A's first stand. */
function unlock(s: State, ...kinds: ToolKind[]): State {
  const a = s.players[0]!;
  const extra = kinds.flatMap((k) =>
    [0, 1].map((i): Wire => ({
      id: `cut-${k}-${i}`,
      value: TOOL_INFO[k].unlock,
      cut: true,
      clue: false,
      sort: TOOL_INFO[k].unlock,
    })),
  );
  return {
    ...s,
    players: [
      { ...a, racks: [[...a.racks[0]!, ...extra], ...a.racks.slice(1)] },
      ...s.players.slice(1),
    ],
  };
}

const scan = (
  tool: "double" | "tripleScan" | "twoTone",
  wireIds: string[],
  values: number[],
): Move => ({
  type: "scan",
  tool,
  wireIds,
  values,
});

describe("field ops: setup", () => {
  it("each Field op deals its wires and sets its tools, Double Scan and twist", () => {
    for (const key of ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"] as const) {
      const m = MISSIONS[key];
      const s = fresh(key, 4);
      expect(allWires(s)).toHaveLength(m.values * 4 + m.yellow + m.red);
      expect(s.tools.map((t) => t.kind)).toEqual(m.tools);
      expect(s.doubleScan).toBe(m.doubleScan);
      expect(s.twist).toBe(m.twist);
      expect(s.missionLabel).toBe(`Field op ${key.slice(1)}`);
    }
  });

  it("uncertain wires: F6 has 3 yellow candidates for 2, F8 has 3 red candidates for 2", () => {
    const f6 = fresh("F6", 4).markers;
    expect(f6.filter((m) => m.color === "yellow")).toHaveLength(3);
    expect(f6.filter((m) => m.color === "yellow" && m.present)).toHaveLength(2);
    const f8 = fresh("F8", 4).markers;
    expect(f8.filter((m) => m.color === "red")).toHaveLength(3);
    expect(f8.filter((m) => m.color === "red" && m.present)).toHaveLength(2);
  });

  it("twists change the fuse and the start", () => {
    expect(fresh("F1", 3).mistakeLimit).toBe(4); // extra fuse
    expect(fresh("F4", 3).mistakeLimit).toBe(2); // short fuse
    expect(fresh("F4", 2).mistakeLimit).toBe(1); // never below 1
    const quiet = fresh("F2", 3);
    expect(quiet.phase).toBe("play"); // no starting clues
    expect(getStatus(quiet, "a").text).toBe("Your turn: call a value on a teammate's wire");
  });

  it("power cards are on by default: Yan's missions get every card whose number is in play", () => {
    expect(configSchema.parse({}).powerCards).toBe(true);
    const kinds = (key: Config["mission"]) => fresh(key, 3).tools.map((t) => t.kind);
    expect(kinds("1")).toEqual(["swap", "tripleScan", "radar"]); // numbers 1–6
    expect(kinds("2")).toEqual(["swap", "tripleScan", "radar", "dampener"]); // 1–8
    for (const key of ["3", "4", "6", "8"] as const)
      expect(kinds(key)).toEqual(["swap", "tripleScan", "radar", "dampener", "twoTone"]);
    for (const key of ["1", "2", "3", "4", "6", "8"] as const) {
      const s = fresh(key, 3);
      expect(s.doubleScan).toBe(true);
      expect(s.twist).toBeNull();
      expect(s.tools.every((t) => t.unlock <= s.values && !t.used)).toBe(true);
    }
    // Field ops keep their own set.
    expect(fresh("F3", 3).tools.map((t) => t.kind)).toEqual(["dampener", "twoTone"]);
    expect(fresh("F5", 3).doubleScan).toBe(false);
  });

  it("with power cards off there are none, in any mission", () => {
    for (const key of ["1", "4", "8", "F1", "F8"] as const) {
      const s = fresh(key, 3, 11, false);
      expect(s.tools).toEqual([]);
      expect(s.doubleScan).toBe(false);
      expect(getLegalMoves(s, s.active).some((m) => m.move.type === "scan")).toBe(false);
    }
  });

  it("knows how many numbers are in play", () => {
    expect([fresh("1").values, fresh("2").values, fresh("3").values, fresh("8").values]).toEqual([
      6, 8, 10, 12,
    ]);
  });
});

describe("Double Scan", () => {
  const base = () =>
    rig(fresh("F2", 3), { a: [[2, 5, 9], [11]], b: [[3, 5, 8]], c: [["RED", 6, "RED"]] });

  it("one match: the teammate confirms which wire is cut, then the caller cuts theirs", () => {
    let s = base();
    s = play(s, "a", scan("double", [id(s, "b", 0, 0), id(s, "b", 0, 1)], [5]));
    expect(s.phase).toBe("pick");
    expect(getStatus(s, "b").text).toBe("A match! Choose which scanned wire is cut");
    expect(getStatus(s, "c").text).toBe("B is choosing which wire is cut");
    // Only the teammate sees which of the scanned wires match.
    expect(getPlayerView(s, "b").pending?.options).toEqual([id(s, "b", 0, 1)]);
    expect(getPlayerView(s, "c").pending?.options).toBeUndefined();
    expect(getPlayerView(s, "c").pending?.wireIds).toHaveLength(2);
    expect(validateMove(s, "b", { type: "choose", wireId: id(s, "b", 0, 0) })).toMatch(
      /highlighted/,
    );
    s = play(s, "b", { type: "choose", wireId: id(s, "b", 0, 1) });
    expect(s.phase).toBe("own");
    s = play(s, "a", { type: "cutOwn", wireId: id(s, "a", 0, 1) });
    expect(s.active).toBe("b");
    expect(s.doubleScanUsed).toEqual(["a"]);
  });

  it("both match: the teammate picks one, and only that one is cut", () => {
    let s = rig(fresh("F3", 3), { a: [[5], [11]], b: [[5, 5]], c: [[6]] });
    s = play(s, "a", scan("double", [id(s, "b", 0, 0), id(s, "b", 0, 1)], [5]));
    expect(getPlayerView(s, "b").pending?.options).toHaveLength(2);
    s = play(s, "b", { type: "choose", wireId: id(s, "b", 0, 1) });
    expect(s.players[1]!.racks[0]!.map((w) => w.cut)).toEqual([false, true]);
  });

  it("a miss ticks once and the teammate chooses which scanned wire gets the clue", () => {
    let s = base();
    s = play(s, "a", scan("double", [id(s, "b", 0, 0), id(s, "b", 0, 2)], [9]));
    expect(s.phase).toBe("place");
    expect(s.mistakes).toBe(1);
    s = play(s, "b", { type: "choose", wireId: id(s, "b", 0, 2) });
    expect(s.players[1]!.racks[0]![2]!.clue).toBe(true);
    expect(s.players[1]!.racks[0]![0]!.clue).toBe(false);
    expect(s.active).toBe("b");
  });

  it("one red among the two doesn't explode; the clue can only go on the other", () => {
    let s = base();
    s = play(s, "a", scan("double", [id(s, "c", 0, 0), id(s, "c", 0, 1)], [9]));
    expect(s.result).toBeNull();
    expect(s.phase).toBe("place");
    expect(s.pending?.options).toEqual([id(s, "c", 0, 1)]);
  });

  it("both red explodes", () => {
    const s = play(
      base(),
      "a",
      scan("double", [id(base(), "c", 0, 0), id(base(), "c", 0, 2)], [9]),
    );
    expect(s.result).toBe("lost");
  });

  it("once per player per mission, numbers only, on one teammate's wires", () => {
    let s = base();
    const pair = [id(s, "b", 0, 0), id(s, "b", 0, 2)];
    expect(validateMove(s, "a", scan("double", pair, [4]))).toMatch(/still hold/);
    expect(
      validateMove(s, "a", {
        type: "scan",
        tool: "double",
        wireIds: pair,
        values: ["YELLOW" as unknown as number],
      }),
    ).toMatch(/numbers/);
    expect(validateMove(s, "a", scan("double", [id(s, "b", 0, 0), id(s, "c", 0, 1)], [5]))).toMatch(
      /one teammate/,
    );
    s = play(s, "a", scan("double", pair, [9]));
    s = play(s, "b", { type: "choose", wireId: id(s, "b", 0, 0) });
    s = { ...s, active: "a" };
    expect(validateMove(s, "a", scan("double", [id(s, "b", 0, 1), id(s, "b", 0, 2)], [5]))).toMatch(
      /isn't available/,
    );
    expect(
      validateMove(
        rig(fresh("4", 3, 11, false), { a: [[5]], b: [[3, 8]], c: [[6]] }),
        "a",
        scan("double", pair, [5]),
      ),
    ).toMatch(/isn't available/);
  });
});

describe("tools", () => {
  it("unlock once 2 wires of their number are cut, then work once", () => {
    let s = rig(fresh("F2", 3), { a: [[5, 7, 7], [9]], b: [[1, 5, 7, 8]], c: [[6]] });
    const three = [id(s, "b", 0, 0), id(s, "b", 0, 1), id(s, "b", 0, 2)];
    expect(validateMove(s, "a", scan("tripleScan", three, [7]))).toMatch(/isn't ready/);
    s = unlock(s, "tripleScan");
    expect(
      getLegalMoves(s, "a").some((m) => m.move.type === "scan" && m.move.tool === "tripleScan"),
    ).toBe(true);
    s = play(s, "a", scan("tripleScan", three, [7]));
    expect(s.phase).toBe("pick");
    s = play(s, "b", { type: "choose", wireId: id(s, "b", 0, 2) });
    s = play(s, "a", { type: "cutOwn", wireId: id(s, "a", 0, 1) });
    s = { ...s, active: "a" };
    expect(validateMove(s, "a", scan("tripleScan", three, [5]))).toMatch(/isn't ready/);
  });

  it("Two-Tone Scan: two values on one wire; the caller cuts their own of the matching value", () => {
    let s = unlock(rig(fresh("F3", 3), { a: [[3, 8], [12]], b: [[8, 10]], c: [[6]] }), "twoTone");
    const wire = id(s, "b", 0, 0);
    expect(validateMove(s, "a", scan("twoTone", [wire], [3, 4]))).toMatch(/still hold/);
    s = play(s, "a", scan("twoTone", [wire], [3, 8]));
    expect(s.phase).toBe("own");
    expect(s.pendingValue).toBe(8);
    const miss = play(
      unlock(rig(fresh("F3", 3), { a: [[3, 8], [12]], b: [[8, 10]], c: [[6]] }), "twoTone"),
      "a",
      scan("twoTone", [id(s, "b", 0, 1)], [3, 8]),
    );
    expect(miss.phase).toBe("play"); // no choice for a single wire
    expect(miss.mistakes).toBe(1);
  });

  it("Radar: anyone, even out of turn; the answer is public; yellow and red count as no", () => {
    let s = unlock(
      rig(fresh("F1", 3), { a: [[1, 4], [8]], b: [["YELLOW", 5]], c: [["RED"]] }),
      "radar",
    );
    expect(getLegalMoves(s, "c").some((m) => m.move.type === "radar")).toBe(true);
    s = play(s, "c", { type: "radar", target: "b", value: 5 });
    expect(s.radar[0]).toEqual({ asker: "c", target: "b", value: 5, answer: true });
    expect(s.active).toBe("a"); // no action used
    expect(describeMove(s, s, "c", { type: "radar", target: "b", value: 5 }, "a").text).toBe(
      "C used Radar: does B hold a 5? Yes.",
    );
    expect(validateMove(s, "a", { type: "radar", target: "b", value: 1 })).toMatch(/isn't ready/);
    const again = unlock(
      rig(fresh("F1", 3), { a: [[1], []], b: [["YELLOW"]], c: [["RED"]] }),
      "radar",
    );
    expect(play(again, "a", { type: "radar", target: "c", value: 5 }).radar[0]!.answer).toBe(false);
  });

  it("Dampener: armed by the caller; a miss doesn't tick; red doesn't explode; works once", () => {
    let s = unlock(
      rig(fresh("F3", 3), { a: [[2, 7], [9]], b: [[3]], c: [["RED", 6]] }),
      "dampener",
    );
    expect(validateMove(s, "b", { type: "dampen" })).toMatch(/another player/);
    s = play(s, "a", { type: "dampen" });
    expect(s.active).toBe("a");
    s = play(s, "a", { type: "call", wireId: id(s, "c", 0, 0), value: 2 });
    expect(s.result).toBeNull();
    expect(s.mistakes).toBe(0);
    expect(s.players[2]!.racks[0]![0]!).toMatchObject({ cut: false, clue: false });
    let t = unlock(
      rig(fresh("F4", 3), { a: [[2, 7], [9]], b: [[3]], c: [["RED", 6]] }),
      "dampener",
    );
    t = play(t, "a", { type: "dampen" });
    t = play(t, "a", { type: "call", wireId: id(t, "b", 0, 0), value: 2 });
    expect(t.mistakes).toBe(0);
    expect(t.players[1]!.racks[0]![0]!.clue).toBe(true); // the clue still goes down
    t = { ...t, active: "a" };
    expect(validateMove(t, "a", { type: "dampen" })).toMatch(/isn't ready/);
    t = play(t, "a", { type: "call", wireId: id(t, "c", 0, 1), value: 2 });
    expect(t.mistakes).toBe(1); // spent: the next miss ticks
  });

  it("Swap Radios: one random wire each, clues travel with their wire, values stay private", () => {
    let s = unlock(rig(fresh("F1", 3), { a: [[1, 4], [8]], b: [[5]], c: [[6]] }), "swap");
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === "b" ? { ...p, racks: [[{ ...p.racks[0]![0]!, clue: true }]] } : p,
      ),
    };
    const before = s;
    s = play(s, "c", { type: "swap", target: "b" });
    expect(allWires(s)).toHaveLength(allWires(before).length);
    expect(remaining(s, "c").map((w) => w.value)).toEqual([5]);
    expect(remaining(s, "c")[0]!.clue).toBe(true);
    expect(remaining(s, "b").map((w) => w.value)).toEqual([6]);
    const move: Move = { type: "swap", target: "b" };
    expect(describeMove(before, s, "c", move, "c").text).toBe("You swapped your 6 for B's 5.");
    expect(describeMove(before, s, "c", move, "b").text).toBe(
      "C swapped wires with you: you gave a 5 and got a 6.",
    );
    expect(describeMove(before, s, "c", move, "a").text).toBe(
      "C and B swapped one random wire each.",
    );
  });
});

describe("twists", () => {
  it("Silent misses: a wrong call ticks but places no clue", () => {
    const s0 = rig(fresh("F3", 3), { a: [[2], [9]], b: [[3]], c: [[6]] });
    const s = play(s0, "a", { type: "call", wireId: id(s0, "b", 0, 0), value: 2 });
    expect(s.mistakes).toBe(1);
    expect(s.players[1]!.racks[0]![0]!.clue).toBe(false);
  });

  it("Hands on: no solo cuts while a teammate still has wires", () => {
    const s = rig(fresh("F5", 3), { a: [[4, 4], [6]], b: [[6]], c: [[2]] });
    expect(validateMove(s, "a", { type: "solo", value: 4 })).toMatch(/Hands on/);
    const last = rig(fresh("F5", 3), { a: [[4, 4], []], b: [[]], c: [[]] });
    expect(validateMove(last, "a", { type: "solo", value: 4 })).toBeNull();
  });

  it("Twitchy dial: every miss ticks twice", () => {
    const s0 = rig(fresh("F6", 4), { a: [[2]], b: [[3]], c: [[6]], d: [[7]] });
    expect(play(s0, "a", { type: "call", wireId: id(s0, "b", 0, 0), value: 2 }).mistakes).toBe(2);
  });

  it("No echoes: you can't call the value just called, unless you hold nothing else", () => {
    let s = rig(fresh("F7", 3), { a: [[3], [12]], b: [[3, 5]], c: [[3]] });
    s = play(s, "a", { type: "call", wireId: id(s, "c", 0, 0), value: 3 });
    s = play(s, "a", { type: "cutOwn", wireId: id(s, "a", 0, 0) });
    expect(s.active).toBe("b");
    expect(validateMove(s, "b", { type: "call", wireId: id(s, "a", 1, 0), value: 3 })).toMatch(
      /No echoes/,
    );
    expect(validateMove(s, "b", { type: "call", wireId: id(s, "a", 1, 0), value: 5 })).toBeNull();
    const only = { ...rig(fresh("F7", 3), { a: [[3]], b: [[3]], c: [[9]] }), lastCalled: [3] };
    expect(
      validateMove(only, "a", { type: "call", wireId: id(only, "b", 0, 0), value: 3 }),
    ).toBeNull();
  });

  it("Blackout: yellow and red markers stay hidden until the end", () => {
    const s = fresh("F8", 4);
    expect(s.markers.length).toBeGreaterThan(0);
    expect(getPlayerView(s, "a").markers).toEqual([]);
    expect(getPlayerView({ ...s, phase: "over", result: "lost" }, "a").markers.length).toBe(
      s.markers.length,
    );
  });
});

describe("untrusted moves on Field ops", () => {
  it("junk and broken copies of real moves return errors instead of throwing", () => {
    const bad: unknown[] = [undefined, null, -1, 1.5, 999, "x", {}, [], [999], ["x", "y"]];
    for (const key of ["F1", "F4", "F5", "F8"] as const) {
      const rng = createRng(`junk-${key}`);
      // Unlock every tool so tool moves show up in the legal lists.
      let s = unlock(fresh(key, 4, 3), "swap", "tripleScan", "radar", "dampener", "twoTone");
      for (let step = 0; step < 80 && !s.result; step++) {
        const legal = s.players.flatMap((p) =>
          getLegalMoves(s, p.id).map((m) => ({ player: p.id, move: m.move })),
        );
        for (const { player, move } of legal.slice(0, 40)) {
          for (const junk of [null, 0, "x", [], {}, { type: 1 }])
            expect(validateMove(s, player, junk as unknown as Move)).toBeTypeOf("string");
          for (const field of Object.keys(move).filter((k) => k !== "type"))
            for (const b of bad) {
              const broken = { ...move, [field]: b } as unknown as Move;
              let error: string | null = "";
              expect(() => (error = validateMove(s, player, broken))).not.toThrow();
              if (error === null)
                expect(() => applyMove(s, player, broken, { rng: createRng(1) })).not.toThrow();
            }
        }
        if (!legal.length) break;
        const { player, move } = rng.pick(legal);
        s = applyMove(s, player, move, { rng });
      }
    }
  });
});
