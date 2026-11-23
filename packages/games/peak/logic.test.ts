import { createRng } from "@utopia/kit";
import type { Rng } from "@utopia/shared";
import { describe, expect, it } from "vitest";
import { configSchema, type Config } from "./config.js";
import {
  applyMove,
  climbOptions,
  diceChoices,
  describeMove,
  getLegalMoves,
  getResult,
  getStatus,
  pairings,
  setup,
  trailLength,
  validateMove,
  type Move,
  type State,
} from "./logic.js";

const players = [
  { id: "ann", name: "Ann", color: "#f97316" },
  { id: "bob", name: "Bob", color: "#38bdf8" },
];

/** A fresh 2-player game where Ann (seat 0) is to roll. */
function newGame(config: Partial<Config> = {}): State {
  const state = setup({ players, rng: createRng(1) }, configSchema.parse(config));
  return { ...state, turn: { ...state.turn, current: 0 } };
}

/** Set climbers/camps by trail number: { 6: 2 } puts something on step 2 of trail 6. */
function withSteps(steps: Record<number, number>): number[] {
  const out = Array.from({ length: 13 }, () => 0);
  for (const [t, s] of Object.entries(steps)) out[Number(t)] = s;
  return out;
}

/** An Rng whose dice come out as given. */
function riggedDice(...values: number[]): Rng {
  const rng = createRng(0);
  return { ...rng, int: () => values.shift() ?? 1 };
}

const roll = (state: State, ...dice: number[]) =>
  applyMove(state, "ann", { type: "roll" }, { rng: riggedDice(...dice) });

describe("board", () => {
  it("trails have 3 to 13 steps", () => {
    expect(trailLength(2)).toBe(3);
    expect(trailLength(7)).toBe(13);
    expect(trailLength(12)).toBe(3);
  });
});

describe("splitting the dice", () => {
  it("1-5-4-6 can make 6 & 10, 5 & 11, or 7 & 9 (rulebook example)", () => {
    const sums = pairings([1, 5, 4, 6]).map((p) => [...p].sort((a, b) => a - b));
    expect(sums).toEqual([
      [6, 10],
      [5, 11],
      [7, 9],
    ]);
  });

  it("explains which dice pairs each choice uses", () => {
    const state: State = { ...newGame(), climbers: withSteps({ 6: 1, 10: 1 }) };
    const fiveOnly = diceChoices(state, [2, 4, 3, 5]).find((c) => c.trails.join() === "5");
    // 2+3 = 5 is used; 4+5 = 9 can't be (no climber left once 5 is placed).
    expect(fiveOnly).toEqual({
      trails: [5],
      pairs: [
        [0, 2],
        [1, 3],
      ],
      sums: [5, 9],
      uses: [true, false],
    });
  });

  it("offers every pairing on a fresh turn", () => {
    expect(climbOptions(newGame(), [1, 5, 4, 6])).toEqual([
      [5, 11],
      [6, 10],
      [7, 9],
    ]);
  });
});

describe("placing and moving climbers", () => {
  it("rulebook example: with climbers on 6 and 10, rolling 2-4-3-5", () => {
    const state: State = { ...newGame(), climbers: withSteps({ 6: 1, 10: 1 }) };
    // 6 & 8 together; 5 or 9 alone (only one climber left); 7 twice.
    expect(climbOptions(state, [2, 4, 3, 5])).toEqual([[5], [6, 8], [7, 7], [9]]);
  });

  it("climbing 7 twice puts the new climber two steps up", () => {
    const state = { ...newGame(), phase: "choose" as const, dice: [2, 5, 3, 4] };
    const after = applyMove(state, "ann", { type: "climb", trails: [7, 7] }, { rng: createRng(1) });
    expect(after.climbers[7]).toBe(2);
  });

  it("must climb both trails when it can (climbers on 3 and 6, rolling 2-4-5-5)", () => {
    const state: State = { ...newGame(), climbers: withSteps({ 3: 1, 6: 1 }) };
    // 6 & 10 must be taken together; otherwise 7 or 9 alone.
    expect(climbOptions(state, [2, 4, 5, 5])).toEqual([[6, 10], [7], [9]]);
  });

  it("a new climber starts directly above your camp", () => {
    const base = newGame();
    const state: State = { ...base, camps: { ...base.camps, ann: withSteps({ 6: 3 }) } };
    const after = applyMove(
      { ...state, phase: "choose", dice: [1, 5, 4, 6] },
      "ann",
      { type: "climb", trails: [6, 10] },
      { rng: createRng(1) },
    );
    expect(after.climbers[6]).toBe(4);
    expect(after.climbers[10]).toBe(1);
  });

  it("climbers may share a step with another player's camp", () => {
    const base = newGame();
    const state: State = { ...base, camps: { ...base.camps, bob: withSteps({ 6: 1 }) } };
    expect(climbOptions(state, [1, 5, 4, 6])).toContainEqual([6, 10]);
  });
});

describe("falling (busting)", () => {
  it("a climber at the top can't move: rolling 2-4-5-5 with climbers on 3, 6 (top) and 8 falls", () => {
    const state: State = {
      ...newGame(),
      phase: "decide",
      climbers: withSteps({ 3: 2, 6: 11, 8: 4 }),
    };
    const after = roll(state, 2, 4, 5, 5);
    expect(after.turn.current).toBe(1);
    expect(after.phase).toBe("roll");
    expect(after.climbers.every((s) => s === 0)).toBe(true);
    expect(after.peaks[6]).toBeNull(); // the top climber did not claim the peak
  });

  it("falling keeps camps from earlier turns", () => {
    const base = newGame();
    const state: State = {
      ...base,
      phase: "decide",
      camps: { ...base.camps, ann: withSteps({ 5: 2 }) },
      climbers: withSteps({ 3: 2, 6: 11, 8: 4 }),
    };
    expect(roll(state, 2, 4, 5, 5).camps.ann?.[5]).toBe(2);
  });

  it("claimed trails are closed: with 6, 8 and 10 claimed, rolling 2-4-4-6 falls", () => {
    const base = newGame();
    const peaks = [...base.peaks];
    peaks[6] = "bob";
    peaks[8] = "bob";
    peaks[10] = "ann"; // even your own claimed trail is closed
    const after = roll({ ...base, peaks }, 2, 4, 4, 6);
    expect(after.turn.current).toBe(1);
  });
});

describe("stopping and winning", () => {
  it("making camp remembers where the camps were, until the next roll", () => {
    const base = newGame();
    const state: State = {
      ...base,
      phase: "decide",
      camps: { ...base.camps, ann: withSteps({ 6: 2 }) },
      climbers: withSteps({ 6: 5, 10: 1 }),
    };
    const after = applyMove(state, "ann", { type: "stop" }, { rng: createRng(1) });
    expect(after.campMove).toEqual({ player: "ann", from: withSteps({ 6: 2 }) });
    expect(after.camps.ann?.[6]).toBe(5);
    const nextRoll = applyMove(after, "bob", { type: "roll" }, { rng: riggedDice(1, 5, 4, 6) });
    expect(nextRoll.campMove).toBeNull();
  });

  it("stopping turns climbers into camps and passes the turn", () => {
    const state: State = { ...newGame(), phase: "decide", climbers: withSteps({ 6: 3, 10: 1 }) };
    const after = applyMove(state, "ann", { type: "stop" }, { rng: createRng(1) });
    expect(after.camps.ann?.[6]).toBe(3);
    expect(after.camps.ann?.[10]).toBe(1);
    expect(after.turn.current).toBe(1);
    expect(after.phase).toBe("roll");
  });

  it("reaching the top and stopping claims the peak and removes other camps there", () => {
    const base = newGame();
    const state: State = {
      ...base,
      phase: "decide",
      camps: { ...base.camps, bob: withSteps({ 2: 2 }) },
      climbers: withSteps({ 2: 3 }),
    };
    const after = applyMove(state, "ann", { type: "stop" }, { rng: createRng(1) });
    expect(after.peaks[2]).toBe("ann");
    expect(after.camps.bob?.[2]).toBe(0);
  });

  it("claiming the third peak wins", () => {
    const base = newGame();
    const peaks = [...base.peaks];
    peaks[2] = "ann";
    peaks[3] = "ann";
    const state: State = { ...base, peaks, phase: "decide", climbers: withSteps({ 12: 3 }) };
    const after = applyMove(state, "ann", { type: "stop" }, { rng: createRng(1) });
    expect(after.phase).toBe("over");
    expect(getResult(after)).toEqual({
      winners: ["ann"],
      ranking: [
        { player: "ann", score: 3 },
        { player: "bob", score: 0 },
      ],
      text: "Ann wins with 3 peaks!",
    });
    expect(getLegalMoves(after, "ann")).toEqual([]);
  });

  it("when every peak is claimed before anyone reaches the target, most peaks wins", () => {
    const four = [
      ...players,
      { id: "cy", name: "Cy", color: "#a3e635" },
      { id: "dee", name: "Dee", color: "#f472b6" },
    ];
    const base = setup({ players: four, rng: createRng(1) }, configSchema.parse({ peaksToWin: 5 }));
    // Ann 4, Bob 3, Cy 2, Dee 1; Dee claims trail 12, the last one.
    const owners = ["ann", "ann", "ann", "ann", "bob", "bob", "bob", "cy", "cy", "dee"];
    const peaks = [...base.peaks];
    owners.forEach((owner, i) => (peaks[i + 2] = owner));
    const turn = { ...base.turn, current: 3 };
    const state: State = { ...base, turn, peaks, phase: "decide", climbers: withSteps({ 12: 3 }) };
    const after = applyMove(state, "dee", { type: "stop" }, { rng: createRng(1) });
    expect(after.phase).toBe("over");
    expect(getResult(after)).toMatchObject({
      winners: ["ann"],
      text: "Every peak is claimed. Ann wins with 4 peaks!",
    });
    expect(getStatus(after, "ann")).toEqual({
      text: "Every peak is claimed. Ann wins with 4 peaks!",
      activePlayers: [],
    });
    expect(getLegalMoves(after, "ann")).toEqual([]);
  });

  it("all peaks claimed with a tie for most: the leaders share the win", () => {
    const three = [...players, { id: "cy", name: "Cy", color: "#a3e635" }];
    const base = setup(
      { players: three, rng: createRng(1) },
      configSchema.parse({ peaksToWin: 5 }),
    );
    // Ann 4, Bob 4, Cy 2 claimed; Cy claims trail 12, the last one.
    const owners = ["ann", "ann", "ann", "ann", "bob", "bob", "bob", "bob", "cy", "cy"];
    const peaks = [...base.peaks];
    owners.forEach((owner, i) => (peaks[i + 2] = owner));
    const cyTurn = { ...base.turn, current: 2 };
    const state: State = {
      ...base,
      turn: cyTurn,
      peaks,
      phase: "decide",
      climbers: withSteps({ 12: 3 }),
    };
    const after = applyMove(state, "cy", { type: "stop" }, { rng: createRng(1) });
    expect(getResult(after)).toMatchObject({
      winners: ["ann", "bob"],
      text: "Every peak is claimed. Ann and Bob share the win with 4 peaks!",
    });
  });

  it("peaksToWin raises the target", () => {
    const base = newGame({ peaksToWin: 4 });
    const peaks = [...base.peaks];
    peaks[2] = "ann";
    peaks[3] = "ann";
    const state: State = { ...base, peaks, phase: "decide", climbers: withSteps({ 12: 3 }) };
    expect(applyMove(state, "ann", { type: "stop" }, { rng: createRng(1) }).phase).toBe("roll");
  });

  it("no result while the game is running", () => {
    expect(getResult(newGame())).toBeNull();
  });
});

describe("variants", () => {
  it("skip: a climber jumps over another player's camp", () => {
    const base = newGame({ landingOnCamps: "skip" });
    const state: State = { ...base, camps: { ...base.camps, bob: withSteps({ 6: 1, 10: 1 }) } };
    const after = applyMove(
      { ...state, phase: "choose", dice: [1, 5, 4, 6] },
      "ann",
      { type: "climb", trails: [6, 10] },
      { rng: createRng(1) },
    );
    expect(after.climbers[6]).toBe(2);
    expect(after.climbers[10]).toBe(2);
  });

  it("mustRoll: can't stop while a climber shares a step with another camp", () => {
    const base = newGame({ landingOnCamps: "mustRoll" });
    const state: State = {
      ...base,
      phase: "decide",
      camps: { ...base.camps, bob: withSteps({ 6: 1 }) },
      climbers: withSteps({ 6: 1 }),
    };
    expect(getLegalMoves(state, "ann").map((m) => m.move)).toEqual([{ type: "roll" }]);
    expect(getStatus(state, "ann").text).toMatch(/must roll/);
  });

  it("mustRoll: can stop once the climber has moved past the camp", () => {
    const base = newGame({ landingOnCamps: "mustRoll" });
    const state: State = {
      ...base,
      phase: "decide",
      camps: { ...base.camps, bob: withSteps({ 6: 1 }) },
      climbers: withSteps({ 6: 2 }),
    };
    expect(getLegalMoves(state, "ann")).toHaveLength(2);
  });
});

describe("move validation", () => {
  it("rejects moves from the wrong player", () => {
    expect(validateMove(newGame(), "bob", { type: "roll" })).toBe("It's not your turn.");
  });

  it("rejects moves in the wrong phase", () => {
    expect(validateMove(newGame(), "ann", { type: "stop" })).not.toBeNull();
  });

  it("rejects trails the dice don't allow, accepts ones they do in any order", () => {
    const state = roll(newGame(), 1, 5, 4, 6);
    expect(validateMove(state, "ann", { type: "climb", trails: [6, 11] })).not.toBeNull();
    expect(validateMove(state, "ann", { type: "climb", trails: [10, 6] })).toBeNull();
  });

  it("only rolling is possible at the start of a turn (a one-tap action)", () => {
    expect(getLegalMoves(newGame(), "ann")).toEqual([
      { move: { type: "roll" }, label: "Roll the dice", where: "board" },
    ]);
    expect(getLegalMoves(newGame(), "bob")).toEqual([]);
  });
});

describe("status and descriptions", () => {
  it("tells the active player what to do and others who we wait for", () => {
    expect(getStatus(newGame(), "ann")).toEqual({
      text: "Your turn: roll the dice",
      activePlayers: ["ann"],
    });
    expect(getStatus(newGame(), "bob").text).toBe("Waiting for Ann to roll");
  });

  it("describes moves per viewer", () => {
    const before = newGame();
    const after = roll(before, 1, 5, 4, 6);
    const move: Move = { type: "roll" };
    expect(describeMove(before, after, "ann", move, "ann").text).toBe("You rolled 1 · 5 · 4 · 6");
    expect(describeMove(before, after, "ann", move, "bob").text).toBe("Ann rolled 1 · 5 · 4 · 6");
  });

  it("holds a roll's result back while the dice tumble", () => {
    const before = newGame();
    const d = describeMove(before, roll(before, 1, 5, 4, 6), "ann", { type: "roll" }, "bob");
    expect(d.revealAfterMs).toBeGreaterThan(0);
    expect(d.pendingText).toBe("Ann is rolling…");
  });

  it("a fall is bad news and keeps the lost climbers for the board", () => {
    const before: State = {
      ...newGame(),
      phase: "decide",
      climbers: withSteps({ 3: 2, 6: 11, 8: 4 }),
    };
    const after = roll(before, 2, 4, 5, 5);
    expect(after.fallen).toEqual({ player: "ann", climbers: before.climbers });
    const d = describeMove(before, after, "ann", { type: "roll" }, "bob");
    expect(d.tone).toBe("bad");
    expect(d.flash).toBe("Ann fell!");
    expect(d.text).toMatch(/lost this turn's climb on 3, 6, 8/);
    expect(d.highlight).toEqual(["dice", "fall-3", "fall-6", "fall-8"]);
  });

  it("the next roll clears the fall", () => {
    const before: State = {
      ...newGame(),
      phase: "decide",
      climbers: withSteps({ 3: 2, 6: 11, 8: 4 }),
    };
    const fell = roll(before, 2, 4, 5, 5);
    const next = applyMove(fell, "bob", { type: "roll" }, { rng: riggedDice(1, 5, 4, 6) });
    expect(next.fallen).toBeNull();
  });

  it("claiming a peak is good news and says whose camp was removed", () => {
    const base = newGame();
    const before: State = {
      ...base,
      phase: "decide",
      camps: { ...base.camps, bob: withSteps({ 2: 2 }) },
      climbers: withSteps({ 2: 3 }),
    };
    const after = applyMove(before, "ann", { type: "stop" }, { rng: createRng(1) });
    expect(describeMove(before, after, "ann", { type: "stop" }, "bob")).toEqual({
      text: "Ann made camp on 2 and claimed peak 2! Your camp was removed.",
      highlight: ["trail-2", "peak-2"],
      tone: "good",
      flash: "Ann claimed peak 2!",
    });
  });

  it("highlights the trails climbed", () => {
    const before = roll(newGame(), 1, 5, 4, 6);
    const move: Move = { type: "climb", trails: [6, 10] };
    const after = applyMove(before, "ann", move, { rng: createRng(1) });
    expect(describeMove(before, after, "ann", move, "bob")).toEqual({
      text: "Ann climbed 6 & 10",
      highlight: ["trail-6", "trail-10"],
    });
  });
});

describe("whole games", () => {
  it.each([1, 2, 3, 4, 5])("seed %i: random legal play always ends with a winner", (seed) => {
    const rng = createRng(seed);
    const four = ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase(), color: id }));
    let state = setup({ players: four, rng }, configSchema.parse({}));
    for (let i = 0; i < 20_000 && !getResult(state); i++) {
      const player = state.players[state.turn.current]!.id;
      const moves = getLegalMoves(state, player);
      expect(moves.length).toBeGreaterThan(0);
      // Stop half the time when allowed, so turns don't run forever.
      const stop = moves.find((m) => m.move.type === "stop");
      const choice = stop && rng.next() < 0.5 ? stop : rng.pick(moves);
      expect(validateMove(state, player, choice.move)).toBeNull();
      state = applyMove(state, player, choice.move, { rng });
      expect(JSON.parse(JSON.stringify(state))).toEqual(state); // stays plain JSON
    }
    expect(getResult(state)?.winners).toHaveLength(1);
  });
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    "seed %i: 4 players racing to 5 peaks never get stuck with every trail claimed",
    (seed) => {
      const rng = createRng(seed);
      const four = ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase(), color: id }));
      let state = setup({ players: four, rng }, configSchema.parse({ peaksToWin: 5 }));
      for (let i = 0; i < 50_000 && !getResult(state); i++) {
        const player = state.players[state.turn.current]!.id;
        const moves = getLegalMoves(state, player);
        const stop = moves.find((m) => m.move.type === "stop");
        const choice = stop && rng.next() < 0.5 ? stop : rng.pick(moves);
        state = applyMove(state, player, choice.move, { rng });
      }
      expect(getResult(state)).not.toBeNull();
    },
  );
});
