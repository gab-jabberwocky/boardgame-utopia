import { createRng, createTurnOrder } from "@utopia/kit";
import { describe, expect, it } from "vitest";
import { configSchema, type Config } from "./config.js";
import {
  DEAL,
  applyMove,
  connections,
  describeMove,
  fullDeck,
  getLegalMoves,
  getPlayerView,
  getResult,
  getStatus,
  setup,
  validateMove,
  winOf,
  type Move,
  type State,
} from "./logic.js";

const PLAYERS = [
  { id: "jack", name: "Jack", color: "#f97316" },
  { id: "micah", name: "Micah", color: "#38bdf8" },
  { id: "miriam", name: "Miriam", color: "#a3e635" },
  { id: "dee", name: "Dee", color: "#f472b6" },
  { id: "eve", name: "Eve", color: "#facc15" },
  { id: "fay", name: "Fay", color: "#c084fc" },
];

function newGame(count = 3, config: Partial<Config> = {}, seed = 1): State {
  const players = PLAYERS.slice(0, count);
  const s = setup({ players, rng: createRng(seed) }, configSchema.parse(config));
  return {
    ...s,
    turn: createTurnOrder(
      players.map((p) => p.id),
      0,
    ),
  };
}

/** Set everyone's hand (sorted for you) and the middle. */
function rig(state: State, hands: Record<string, number[]>, middle: number[]): State {
  return {
    ...state,
    hands: Object.fromEntries(
      state.players.map((p) => [p.id, [...(hands[p.id] ?? [])].sort((a, b) => a - b)]),
    ),
    middle,
  };
}

const play = (state: State, player: string, move: Move): State => {
  const error = validateMove(state, player, move);
  if (error) throw new Error(`${player} ${JSON.stringify(move)}: ${error}`);
  return applyMove(state, player, move, { rng: createRng(7) });
};

const ask = (s: State, player: string, target: string, end: "low" | "high") =>
  play(s, player, { type: "reveal", target, end });
const flip = (s: State, player: string, slot: number) => play(s, player, { type: "flip", slot });
const whoseTurn = (s: State) => s.turn.players[s.turn.current];

/** The rulebook's 3-player examples. */
const example = () =>
  rig(
    newGame(3),
    {
      jack: [1, 4, 8, 9, 10, 11, 12, 12, 12],
      micah: [3, 3, 5, 6, 7, 8, 9, 10, 11],
      miriam: [2, 2, 4, 5, 6, 7, 8, 9, 10],
    },
    [2, 1, 1, 3, 4, 5, 6, 7, 11],
  );

describe("cards and setup", () => {
  it("has 36 cards, three of each number", () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(36);
    for (let v = 1; v <= 12; v++) expect(deck.filter((c) => c === v)).toHaveLength(3);
  });

  it("deals by player count, hands sorted low to high", () => {
    for (const n of [3, 4, 5, 6]) {
      const s = newGame(n);
      const { hand, middle } = DEAL[n]!;
      for (const p of s.players) {
        expect(s.hands[p.id]).toHaveLength(hand);
        expect(s.hands[p.id]).toEqual([...s.hands[p.id]!].sort((a, b) => a - b));
      }
      expect(s.middle).toHaveLength(middle);
      expect(n * hand + middle).toBeLessThanOrEqual(36);
    }
  });

  it("connects numbers that add up to 7 or are 7 apart", () => {
    expect(connections(2)).toEqual([5, 9]);
    expect(connections(3)).toEqual([4, 10]);
    expect(connections(6)).toEqual([1]);
    expect(connections(12)).toEqual([5]);
    expect(connections(7)).toEqual([]);
  });
});

describe("revealing", () => {
  it("Jack asks Micah for his lowest (3), then Miriam for hers (2): no match", () => {
    let s = ask(example(), "jack", "micah", "low");
    expect(s.revealed.map((r) => r.value)).toEqual([3]);
    s = ask(s, "jack", "miriam", "low");
    expect(s.phase).toBe("mismatch");
    expect(getLegalMoves(s, "jack").map((m) => m.label)).toEqual(["Put the cards back"]);
    expect(getStatus(s, "micah").text).toBe("No match for Jack");
    s = play(s, "jack", { type: "putBack" });
    expect(s.revealed).toEqual([]);
    expect(s.hands.micah?.[0]).toBe(3);
    expect(whoseTurn(s)).toBe("micah");
  });

  it("Miriam flips a 2 in the middle, then her lowest twice: a trio of 2s", () => {
    let s = { ...example(), turn: createTurnOrder(["jack", "micah", "miriam"], 2) };
    s = flip(s, "miriam", 0);
    s = ask(s, "miriam", "miriam", "low");
    expect(getStatus(s, "miriam").text).toBe("Find 1 more 2");
    s = ask(s, "miriam", "miriam", "low");
    expect(s.trios.miriam).toEqual([2]);
    expect(s.hands.miriam).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(s.middle[0]).toBeNull();
    expect(whoseTurn(s)).toBe("jack");
  });

  it("asking the same player again shows their next card in", () => {
    let s = ask(example(), "jack", "jack", "high");
    s = ask(s, "jack", "jack", "high");
    expect(s.revealed.map((r) => r.value)).toEqual([12, 12]);
    s = ask(s, "jack", "jack", "high");
    expect(s.trios.jack).toEqual([12]);
  });

  it("a hand can't show more cards than it has", () => {
    let s = rig(newGame(3), { jack: [5], micah: [5, 5] }, [1]);
    s = ask(s, "jack", "jack", "low");
    const own = getLegalMoves(s, "jack").filter(
      (m) => m.move.type === "reveal" && m.move.target === "jack",
    );
    expect(own).toEqual([]);
  });

  it("with an empty hand you still play from the middle and other hands", () => {
    const s = rig(newGame(3), { micah: [4, 9], miriam: [4] }, [4, 1]);
    const targets = getLegalMoves(s, "jack").map((m) =>
      m.move.type === "reveal" ? m.move.target : m.move.type,
    );
    expect(targets).toEqual(["micah", "micah", "miriam", "miriam", "flip", "flip"]);
  });
});

describe("winning", () => {
  it("Simple: three trios, or the 7 trio", () => {
    expect(winOf([2, 9], "Simple")).toBeNull();
    expect(winOf([2, 9, 11], "Simple")).toEqual({ how: "three" });
    expect(winOf([7], "Simple")).toEqual({ how: "seven" });
  });

  it("Spicy: two connected trios, or the 7 trio", () => {
    expect(winOf([2, 3, 11], "Spicy")).toBeNull();
    expect(winOf([9, 2], "Spicy")).toEqual({ how: "pair", trios: [2, 9] });
    expect(winOf([7], "Spicy")).toEqual({ how: "seven" });
  });

  it("collecting the 7 trio ends the game at once", () => {
    let s = rig(newGame(3), { jack: [7], micah: [7], miriam: [7] }, [1]);
    s = ask(s, "jack", "micah", "low");
    s = ask(s, "jack", "miriam", "high");
    s = ask(s, "jack", "jack", "low");
    expect(s.phase).toBe("over");
    expect(getResult(s)).toMatchObject({ winners: ["jack"], text: "Jack wins with the 7 trio!" });
    expect(describeMove(s, s, "jack", { type: "flip", slot: 0 }, "jack").flash).toBe("You win!");
    expect(getLegalMoves(s, "micah")).toEqual([]);
  });
});

describe("hidden information", () => {
  it("you see your own hand only; middle cards only while face up", () => {
    let s = example();
    s = flip(s, "jack", 4);
    const view = getPlayerView(s, "micah");
    expect(view.hand).toEqual(s.hands.micah);
    expect(view.handCounts).toEqual({ jack: 9, micah: 9, miriam: 9 });
    expect(view.middle.filter((m) => m !== "down")).toEqual([4]);
    expect(JSON.stringify(view)).not.toContain("hands");
  });

  it("the move log never names revealed numbers, only trios", () => {
    let s = example();
    const before = s;
    s = ask(s, "jack", "micah", "high");
    expect(
      describeMove(before, s, "jack", { type: "reveal", target: "micah", end: "high" }, "miriam")
        .text,
    ).toBe("Jack revealed Micah's highest card.");
    expect(
      describeMove(before, s, "jack", { type: "reveal", target: "micah", end: "high" }, "micah")
        .text,
    ).toBe("Jack revealed your highest card.");
    const after = ask(s, "jack", "jack", "low");
    expect(
      describeMove(s, after, "jack", { type: "reveal", target: "jack", end: "low" }, "micah"),
    ).toMatchObject({
      text: "Jack revealed their own lowest card. No match.",
      tone: "bad",
    });
  });
});

describe("random games", () => {
  it("always end, and every card is in a hand, the middle or a trio", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const n = 3 + (seed % 4);
      let s = setup(
        { players: PLAYERS.slice(0, n), rng: createRng(seed) },
        configSchema.parse({ mode: seed % 2 ? "Simple" : "Spicy" }),
      );
      const rng = createRng(seed * 17);
      for (let step = 0; step < 60000 && !getResult(s); step++) {
        const me = s.turn.players[s.turn.current]!;
        const moves = getLegalMoves(s, me);
        expect(moves.length).toBeGreaterThan(0);
        s = play(s, me, rng.pick(moves).move);
        const cards =
          Object.values(s.hands).flat().length +
          s.middle.filter((c) => c !== null).length +
          Object.values(s.trios).flat().length * 3;
        expect(cards).toBe(n * DEAL[n]!.hand + DEAL[n]!.middle);
      }
      expect(getResult(s)).not.toBeNull();
    }
  });
});
