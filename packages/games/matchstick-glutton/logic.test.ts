import { createRng, createTurnOrder } from "@utopia/kit";
import { describe, expect, it } from "vitest";
import { configSchema, type Config } from "./config.js";
import {
  VALUES,
  applyMove,
  changeTo,
  describeMove,
  fullDeck,
  getLegalMoves,
  getPlayerView,
  getResult,
  getStatus,
  label,
  setup,
  validateMove,
  type Card,
  type Move,
  type State,
} from "./logic.js";

const PLAYERS = ["ann", "bob", "cy", "dee", "eve", "fay", "gus", "hal"].map((id) => ({
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  color: "#888",
}));

const newGame = (n = 3, config: Partial<Config> = {}, seed = 1): State => {
  const players = PLAYERS.slice(0, n);
  const s = setup({ players, rng: createRng(seed) }, configSchema.parse(config));
  return {
    ...s,
    turn: createTurnOrder(
      players.map((p) => p.id),
      0,
    ),
  };
};

let nextId = 1000;
const cards = (...digits: number[]): Card[] => digits.map((digit) => ({ id: nextId++, digit }));

/** Give everyone these hands (hex digits) and matchsticks. */
function rig(
  s: State,
  hands: Record<string, number[]>,
  sticks: Record<string, number> = {},
): State {
  return {
    ...s,
    hands: Object.fromEntries(s.players.map((p) => [p.id, cards(...(hands[p.id] ?? []))])),
    sticks: { ...s.sticks, ...sticks },
  };
}

const play = (s: State, player: string, move: Move): State => {
  const err = validateMove(s, player, move);
  if (err) throw new Error(`${player} ${JSON.stringify(move)}: ${err}`);
  return applyMove(s, player, move, { rng: createRng(7) });
};

/** Play the first `n` cards of the player's hand that can become `value`. */
function put(s: State, player: string, value: number, n = 1): State {
  const cost = (c: Card) => changeTo(c.digit, value)!.cost;
  const ids = s.hands[player]!.filter((c) => changeTo(c.digit, value))
    .sort((a, b) => cost(a) - cost(b))
    .slice(0, n)
    .map((c) => c.id);
  return play(s, player, { type: "play", cards: ids, value });
}
const pass = (s: State, p: string) => play(s, p, { type: "pass" });
const turn = (s: State) => s.turn.players[s.turn.current];

describe("cards and digits", () => {
  it("has 56 cards: 14 printed types, 4 of each", () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(56);
    expect(new Set(deck.map((c) => c.digit)).size).toBe(14);
  });

  it("matches the rulebook's examples of matchstick changes", () => {
    expect(changeTo(4, 9)).toMatchObject({ cost: 2, flipped: false }); // 4 + 2 sticks = 9
    expect(changeTo(4, 10)?.cost).toBe(2); // 4 can become A
    expect(changeTo(3, 14)).toMatchObject({ cost: 0, flipped: true }); // upside-down 3 = E
    expect(changeTo(6, 9)).toMatchObject({ cost: 0, flipped: true }); // upside-down 6 = 9
    expect(changeTo(1, 15)).toMatchObject({ flipped: true }); // a turned 1 can be F
    // 2 can only become 8 (or stay 2); only 1 can become F; 7 can't become F.
    expect(VALUES.filter((v) => v !== 2 && changeTo(2, v)).map(label)).toEqual(["8"]);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13].filter((d) => changeTo(d, 15))).toEqual([1]);
    expect(changeTo(7, 15)).toBeNull();
  });
});

describe("setup", () => {
  it("deals 15 each to 2–3 players and the whole deck to more; everyone starts with 1 stick", () => {
    expect(Object.values(newGame(2).hands).map((h) => h.length)).toEqual([15, 15]);
    expect(Object.values(newGame(3).hands).map((h) => h.length)).toEqual([15, 15, 15]);
    expect(Object.values(newGame(4).hands).map((h) => h.length)).toEqual([14, 14, 14, 14]);
    expect(Object.values(newGame(6).hands).flat()).toHaveLength(56);
    expect(newGame(3).sticks).toEqual({ ann: 1, bob: 1, cy: 1 });
  });
});

describe("a trick", () => {
  const base = () => rig(newGame(3), { ann: [4, 4, 5, 8], bob: [6, 6, 2, 7], cy: [0, 1, 3, 12] });

  it("the leader can't pass; followers play the same count, stronger", () => {
    let s = base();
    expect(validateMove(s, "ann", { type: "pass" })).toBe("You're leading: play something.");
    s = put(s, "ann", 4, 2);
    expect(getStatus(s, "bob").text).toBe("Beat 2 × 4, or pass");
    const bobSixes = s.hands.bob!.filter((c) => c.digit === 6).map((c) => c.id);
    expect(validateMove(s, "bob", { type: "play", cards: [bobSixes[0]!], value: 6 })).toBe(
      "Play 2 cards.",
    );
    expect(validateMove(s, "bob", { type: "play", cards: bobSixes, value: 9 })).toBeNull(); // 6 turned = 9
    s = play(s, "bob", { type: "play", cards: bobSixes, value: 9 });
    expect(turn(s)).toBe("cy");
  });

  it("matchsticks change a card's number and are paid from your own", () => {
    let s = put(base(), "ann", 5);
    const bobSeven = s.hands.bob!.find((c) => c.digit === 7)!;
    expect(validateMove(s, "bob", { type: "play", cards: [bobSeven.id], value: 8 })).toBe(
      "That needs 4 matchsticks; you have 1.",
    );
    s = play(s, "bob", { type: "play", cards: [bobSeven.id], value: 7 });
    s = { ...s, sticks: { ...s.sticks, cy: 2 } };
    const cyOne = s.hands.cy!.find((c) => c.digit === 1)!;
    expect(validateMove(s, "cy", { type: "play", cards: [cyOne.id], value: 12 })).toBeNull(); // turned 1 + 1 stick = C...
    s = play(s, "cy", { type: "play", cards: [cyOne.id], value: 12 });
    expect(s.sticks.cy).toBe(0);
  });

  it("passing takes a stick; when everyone else passed, the last player leads", () => {
    let s = put(base(), "ann", 8);
    s = pass(s, "bob");
    expect(s.sticks.bob).toBe(2);
    s = pass(s, "cy");
    expect(s.trick).toEqual([]);
    expect(turn(s)).toBe("ann");
  });

  it("you may pass and still play later in the same trick", () => {
    let s = rig(newGame(3), { ann: [4, 0], bob: [13, 2], cy: [12, 3] });
    s = put(s, "ann", 4);
    s = pass(s, "bob");
    s = put(s, "cy", 12);
    s = pass(s, "ann");
    s = put(s, "bob", 13); // d beats C, even though Bob passed earlier
    expect(s.trick.map((p) => label(p.value))).toEqual(["4", "C", "d"]);
  });
});

describe("special plays", () => {
  it("the strongest number ends the trick: everyone else takes a stick", () => {
    let s = rig(newGame(3), { ann: [15, 3], bob: [5], cy: [6] });
    s = put(s, "ann", 15);
    expect(s.sticks).toEqual({ ann: 1, bob: 2, cy: 2 });
    expect(s.trick).toEqual([]);
    expect(turn(s)).toBe("ann");
  });

  it("five of a kind is a revolution; a second one flips it back", () => {
    let s = rig(newGame(3), {
      ann: [4, 4, 4, 4, 4, 0],
      bob: [6, 6, 6, 6, 6, 2],
      cy: [1, 1, 1, 1, 1, 3],
    });
    s = put(s, "ann", 4, 5);
    expect(s.revolution).toBe(true);
    expect(describeMove(s, s, "ann", { type: "pass" }, "bob").flash).toBe("Revolution!");
    // Lower is stronger now: Bob's five 6s can't beat five 4s.
    expect(getLegalMoves(s, "bob").map((m) => m.move.type)).toEqual(["pass"]);
    s = pass(s, "bob");
    s = put(s, "cy", 1, 5); // five 1s beat five 4s, and flip the order back
    expect(s.revolution).toBe(false);
  });

  it("with the 4-card house rule, four of a kind is enough", () => {
    let s = rig(newGame(3, { revolution: "4 cards" }), { ann: [4, 4, 4, 4, 1], bob: [5], cy: [6] });
    s = put(s, "ann", 4, 4);
    expect(s.revolution).toBe(true);
  });
});

describe("going out", () => {
  it("no cards and no sticks: you're out, and the finishing order is the ranking", () => {
    let s = rig(newGame(3), { ann: [8], bob: [9, 9], cy: [0, 0] }, { ann: 0 });
    s = put(s, "ann", 8);
    expect(s.finished).toEqual(["ann"]);
    expect(getLegalMoves(s, "ann")).toEqual([]);
    expect(turn(s)).toBe("bob");
  });

  it("no cards but sticks left: return one per turn; then you're out", () => {
    let s = rig(newGame(3), { ann: [8], bob: [2], cy: [3] }, { ann: 1, bob: 1, cy: 1 });
    s = put(s, "ann", 8); // last card, 1 stick left
    s = pass(s, "bob");
    s = pass(s, "cy"); // trick over: ann leads but has no cards
    expect(getLegalMoves(s, "ann").map((m) => m.label)).toEqual(["Return a matchstick"]);
    s = play(s, "ann", { type: "return" });
    expect(s.finished).toEqual(["ann"]);
    expect(turn(s)).toBe("bob"); // the next player leads
    expect(s.trick).toEqual([]);
  });

  it("the game ends when one player is left", () => {
    let s = rig(newGame(2), { ann: [8], bob: [2, 3] }, { ann: 0 });
    s = put(s, "ann", 8);
    expect(getResult(s)).toMatchObject({
      winners: ["ann"],
      text: "Ann got rid of everything first and wins!",
    });
    expect(s.finished).toEqual(["ann", "bob"]);
  });
});

describe("views", () => {
  it("you see your hand only; others see how many cards you hold", () => {
    const s = newGame(3);
    const v = getPlayerView(s, "bob");
    expect(v.hand).toEqual(s.hands.bob);
    expect(v.handCounts).toEqual({ ann: 15, bob: 15, cy: 15 });
    expect(JSON.stringify(v)).not.toContain('"hands"');
  });
});

describe("random games", () => {
  it("always end, keeping every card accounted for", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const n = 2 + (seed % 7);
      let s = newGame(n, { revolution: seed % 3 ? "5 cards" : "4 cards" }, seed);
      const total = Object.values(s.hands).flat().length;
      const rng = createRng(seed * 11);
      for (let step = 0; step < 20000 && s.phase === "play"; step++) {
        const me = s.turn.players[s.turn.current]!;
        const moves = getLegalMoves(s, me);
        expect(moves.length).toBeGreaterThan(0);
        const plays = moves.filter((m) => m.move.type === "play");
        const pick = plays.length && rng.next() < 0.7 ? rng.pick(plays) : rng.pick(moves);
        s = play(s, me, pick.move);
        expect(Object.values(s.hands).flat().length).toBeLessThanOrEqual(total);
      }
      expect(getResult(s)).not.toBeNull();
      expect(s.finished).toHaveLength(n);
    }
  });
});
