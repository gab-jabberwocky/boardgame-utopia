import { createRng, createTurnOrder } from "@utopia/kit";
import { describe, expect, it } from "vitest";
import { configSchema } from "./config.js";
import {
  CENTRE,
  COLORS,
  FLOOR,
  SIZE,
  applyMove,
  describeMove,
  endBonus,
  floorPenalty,
  getLegalMoves,
  getPlayerView,
  getResult,
  getStatus,
  setup,
  tileScore,
  validateMove,
  wallColor,
  wallColumn,
  type Color,
  type Move,
  type PlayerBoard,
  type State,
} from "./logic.js";
import { docView } from "./doc.js";

const PLAYERS = ["ann", "bob", "cy", "dee"].map((id) => ({
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  color: "#888",
}));

function newGame(n = 2, seed = 1): State {
  const players = PLAYERS.slice(0, n);
  const s = setup({ players, rng: createRng(seed) }, configSchema.parse({}));
  return {
    ...s,
    turn: createTurnOrder(
      players.map((p) => p.id),
      0,
    ),
    starter: "ann",
  };
}

const play = (s: State, player: string, move: Omit<Move, "type">): State => {
  const m: Move = { type: "take", ...move };
  const err = validateMove(s, player, m);
  if (err) throw new Error(`${player} ${JSON.stringify(m)}: ${err}`);
  return applyMove(s, player, m, { rng: createRng(5) });
};

/** Set the factories and centre by hand. */
const rig = (s: State, factories: Color[][], centre: Color[] = []): State => ({
  ...s,
  factories,
  centre,
});

const wallOf = (cells: [number, number][]) => {
  const wall = Array.from({ length: SIZE * SIZE }, () => false);
  for (const [r, c] of cells) wall[r * SIZE + c] = true;
  return wall;
};

const board = (s: State, id: string) => s.boards[id]!;
const totalTiles = (s: State) =>
  s.bag.drawPile.length +
  s.bag.discardPile.length +
  s.factories.flat().length +
  s.centre.length +
  Object.values(s.boards).reduce(
    (n, b) =>
      n +
      b.lines.reduce((k, l) => k + l.count, 0) +
      b.wall.filter(Boolean).length +
      b.floor.filter((t) => t !== "marker").length,
    0,
  );

describe("setup", () => {
  it("fills 5/7/9 factories with 4 tiles each and keeps 100 tiles", () => {
    for (const [n, f] of [
      [2, 5],
      [3, 7],
      [4, 9],
    ] as const) {
      const s = newGame(n);
      expect(s.factories).toHaveLength(f);
      expect(s.factories.every((x) => x.length === 4)).toBe(true);
      expect(totalTiles(s)).toBe(100);
      expect(s.markerInCentre).toBe(true);
    }
  });

  it("uses a shifted colour pattern on the wall", () => {
    for (let r = 0; r < SIZE; r++) {
      expect(new Set(Array.from({ length: SIZE }, (_, c) => wallColor(r, c))).size).toBe(5);
      for (const color of COLORS) expect(wallColor(r, wallColumn(r, color))).toBe(color);
    }
    expect(wallColor(1, 1)).toBe(wallColor(0, 0));
  });
});

describe("drafting", () => {
  it("takes every tile of one colour from a factory; the rest go to the centre", () => {
    let s = rig(newGame(), [
      ["ruby", "ruby", "jade", "amber"],
      ["onyx", "onyx", "onyx", "onyx"],
    ]);
    s = play(s, "ann", { source: 0, color: "ruby", line: 2 });
    expect(board(s, "ann").lines[2]).toEqual({ color: "ruby", count: 2 });
    expect(s.factories[0]).toEqual([]);
    expect(s.centre.sort()).toEqual(["amber", "jade"]);
    expect(s.turn.players[s.turn.current]).toBe("bob");
  });

  it("the first to take from the centre gets the first-player marker on their floor", () => {
    let s = rig(newGame(), [["onyx", "onyx", "onyx", "onyx"]], ["jade", "jade", "amber"]);
    expect(getLegalMoves(s, "ann").find((m) => m.move.source === CENTRE)?.label).toMatch(
      /first-player marker/,
    );
    s = play(s, "ann", { source: CENTRE, color: "jade", line: 1 });
    expect(board(s, "ann").floor).toEqual(["marker"]);
    expect(s.nextFirst).toBe("ann");
    expect(s.markerInCentre).toBe(false);
    s = play(s, "bob", { source: CENTRE, color: "amber", line: 0 });
    expect(board(s, "bob").floor).toEqual([]);
  });

  it("extra tiles overflow to the floor, and past 7 floor spaces to the lid", () => {
    let s = rig(newGame(), [
      ["cobalt", "cobalt", "cobalt", "cobalt"],
      ["onyx", "amber", "amber", "amber"],
    ]);
    s = play(s, "ann", { source: 0, color: "cobalt", line: 1 });
    expect(board(s, "ann").lines[1]).toEqual({ color: "cobalt", count: 2 });
    expect(board(s, "ann").floor).toEqual(["cobalt", "cobalt"]);
    const full: State = {
      ...rig(s, [["onyx", "onyx", "onyx", "onyx"], ["ruby"]]),
      boards: {
        ...s.boards,
        bob: { ...board(s, "bob"), floor: ["ruby", "ruby", "ruby", "ruby", "ruby"] },
      },
    };
    const lid = full.bag.discardPile.length;
    const after = play(full, "bob", { source: 0, color: "onyx", line: FLOOR });
    expect(board(after, "bob").floor).toHaveLength(7);
    expect(after.bag.discardPile.length).toBe(lid + 2);
  });

  it("refuses lines holding another colour, full lines, and colours already on that wall row", () => {
    const base = rig(newGame(), [["ruby", "ruby", "jade", "jade"]]);
    const b: PlayerBoard = {
      ...board(base, "ann"),
      lines: [
        { color: "jade", count: 1 },
        { color: "amber", count: 1 },
        { color: null, count: 0 },
        { color: null, count: 0 },
        { color: null, count: 0 },
      ],
      wall: wallOf([[2, wallColumn(2, "ruby")]]),
    };
    const s: State = { ...base, boards: { ...base.boards, ann: b } };
    expect(validateMove(s, "ann", { type: "take", source: 0, color: "ruby", line: 0 })).toBe(
      "Line 1 already holds jade.",
    );
    expect(validateMove(s, "ann", { type: "take", source: 0, color: "jade", line: 0 })).toBe(
      "Line 1 is full.",
    );
    expect(validateMove(s, "ann", { type: "take", source: 0, color: "ruby", line: 2 })).toBe(
      "Your wall already has ruby in row 3.",
    );
    expect(
      validateMove(s, "ann", { type: "take", source: 0, color: "ruby", line: FLOOR }),
    ).toBeNull();
    const rubyLines = getLegalMoves(s, "ann")
      .filter((m) => m.move.color === "ruby")
      .map((m) => m.move.line);
    expect(rubyLines).toEqual([3, 4, FLOOR]);
  });

  it("labels moves unambiguously", () => {
    const s = rig(newGame(), [["ruby", "ruby", "jade", "amber"]]);
    const labels = getLegalMoves(s, "ann").map((m) => m.label);
    expect(labels).toContain("Take 2 ruby from factory 1 → line 4");
    expect(labels).toContain("Take 2 ruby from factory 1 → line 1 (1 to the floor)");
    expect(labels).toContain("Take 1 jade from factory 1 → the floor");
  });
});

describe("scoring", () => {
  it("a lone tile scores 1; runs score their length; both directions add up", () => {
    expect(tileScore(wallOf([[2, 2]]), 2, 2)).toBe(1);
    expect(
      tileScore(
        wallOf([
          [2, 1],
          [2, 2],
          [2, 3],
        ]),
        2,
        2,
      ),
    ).toBe(3);
    expect(
      tileScore(
        wallOf([
          [1, 2],
          [2, 2],
        ]),
        2,
        2,
      ),
    ).toBe(2);
    // Row run of 3 and column run of 2: 3 + 2.
    expect(
      tileScore(
        wallOf([
          [2, 1],
          [2, 2],
          [2, 3],
          [1, 2],
        ]),
        2,
        2,
      ),
    ).toBe(5);
  });

  it("floor penalties: -1 -1 -2 -2 -2 -3 -3, the marker counts", () => {
    expect(floorPenalty(["marker"])).toBe(-1);
    expect(floorPenalty(["ruby", "ruby", "ruby"])).toBe(-4);
    expect(floorPenalty(Array.from({ length: 7 }, () => "jade" as const))).toBe(-14);
  });

  it("end bonuses: +2 per row, +7 per column, +10 per complete colour", () => {
    const row = { ...newGame().boards.ann!, wall: wallOf([0, 1, 2, 3, 4].map((c) => [0, c])) };
    expect(endBonus(row)).toBe(2);
    const col = { ...row, wall: wallOf([0, 1, 2, 3, 4].map((r) => [r, 0])) };
    expect(endBonus(col)).toBe(7);
    const amber = { ...row, wall: wallOf([0, 1, 2, 3, 4].map((r) => [r, wallColumn(r, "amber")])) };
    expect(endBonus(amber)).toBe(10);
  });

  it("at the end of a round full lines tile the wall, leftovers go to the lid, the marker holder starts", () => {
    let s = rig(newGame(), [["ruby", "ruby", "jade", "jade"]], ["amber"]);
    s = play(s, "ann", { source: 0, color: "ruby", line: 1 }); // line 2 full (2 ruby)
    s = play(s, "bob", { source: CENTRE, color: "jade", line: 0 }); // 1 jade on line 1, + 1 to floor, + marker
    const lidBefore = s.bag.discardPile.length;
    s = play(s, "ann", { source: CENTRE, color: "amber", line: 0 });
    // Round over: Ann tiles ruby (row 2) and amber (row 1); Bob tiles jade (row 1).
    expect(board(s, "ann").wall.filter(Boolean)).toHaveLength(2);
    expect(board(s, "bob").score).toBe(0); // 1 for the tile, -1 marker, -1 jade on the floor → 0
    expect(s.bag.discardPile.length).toBeGreaterThan(lidBefore);
    expect(s.round).toBe(2);
    expect(s.turn.players[s.turn.current]).toBe("bob");
    expect(s.factories.every((f) => f.length === 4)).toBe(true);
    expect(
      describeMove(s, s, "ann", { type: "take", source: CENTRE, color: "amber", line: 0 }, "ann")
        .text,
    ).toMatch(/Round 1 scored: You \+\d+; Bob \+1, floor -2/);
  });
});

describe("end of game", () => {
  it("ends after a round in which a row is completed; higher score wins, tie → more full rows", () => {
    const s0 = rig(newGame(), [["onyx", "cobalt", "cobalt", "cobalt"]]);
    const ann = board(s0, "ann");
    // Ann's top row lacks only amber's column; line 1 waits for amber.
    const amberCol = wallColumn(0, "amber");
    const s: State = {
      ...s0,
      factories: [["amber", "onyx", "onyx", "onyx"]],
      boards: {
        ann: {
          ...ann,
          wall: wallOf([0, 1, 2, 3, 4].filter((c) => c !== amberCol).map((c) => [0, c])),
        },
        bob: board(s0, "bob"),
      },
    };
    let after = play(s, "ann", { source: 0, color: "amber", line: 0 });
    after = play(after, "bob", { source: CENTRE, color: "onyx", line: 2 });
    expect(after.phase).toBe("over");
    const result = getResult(after)!;
    expect(result.winners).toEqual(["ann"]);
    expect(board(after, "ann").score).toBe(5 + 2); // row of 5, +2 row bonus
    expect(getStatus(after, "bob").text).toBe(result.text);
  });

  it("refills the bag from the lid when it runs out", () => {
    let s = newGame();
    s = { ...s, bag: { drawPile: [], discardPile: ["ruby", "ruby", "jade", "jade", "jade"] } };
    s = rig(s, [["onyx"]]);
    s = play(s, "ann", { source: 0, color: "onyx", line: 0 });
    expect(s.factories.flat().length).toBe(5);
    expect(s.bag.discardPile).toHaveLength(0);
  });
});

describe("views", () => {
  it("hides only the bag order", () => {
    const v = getPlayerView(newGame(), "bob");
    expect(v.bagCount).toBe(100 - 20);
    expect(JSON.stringify(v)).not.toContain("drawPile");
    expect(docView(v, "bob")[1]).toMatch(/^F1: [ACRJO]( [ACRJO]){3}$/);
  });
});

describe("random games", () => {
  it("always end and conserve 100 tiles", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const n = 2 + (seed % 3);
      let s = newGame(n, seed);
      const rng = createRng(seed * 7);
      for (let step = 0; step < 3000 && s.phase === "draft"; step++) {
        const me = s.turn.players[s.turn.current]!;
        const moves = getLegalMoves(s, me);
        expect(moves.length).toBeGreaterThan(0);
        // Prefer real lines over the floor, so games end like real ones.
        const lines = moves.filter((m) => m.move.line !== FLOOR);
        const pick = lines.length && rng.next() < 0.9 ? rng.pick(lines) : rng.pick(moves);
        s = applyMove(s, me, pick.move, { rng });
        expect(totalTiles(s)).toBe(100);
      }
      expect(s.phase).toBe("over");
      expect(getResult(s)?.winners.length).toBeGreaterThan(0);
    }
  });
});
