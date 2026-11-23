import { createRng } from "@utopia/kit";
import { describe, expect, it } from "vitest";
import { configSchema, type Config } from "./config.js";
import {
  MENU,
  applyMove,
  decider,
  describeMove,
  fullDeck,
  getLegalMoves,
  getPlayerView,
  getResult,
  getStatus,
  handsToEmpty,
  setup,
  validateMove,
  type Move,
  type OrderCard,
  type State,
} from "./logic.js";

const PLAYERS = [
  { id: "ann", name: "Ann", color: "#f97316" },
  { id: "bob", name: "Bob", color: "#38bdf8" },
  { id: "cy", name: "Cy", color: "#a3e635" },
  { id: "dee", name: "Dee", color: "#f472b6" },
  { id: "eve", name: "Eve", color: "#facc15" },
  { id: "fay", name: "Fay", color: "#c084fc" },
];

const newGame = (count = 4, config: Partial<Config> = {}, seed = 1): State =>
  setup({ players: PLAYERS.slice(0, count), rng: createRng(seed) }, configSchema.parse(config));

const play = (state: State, player: string, move: Move): State => {
  const error = validateMove(state, player, move);
  if (error) throw new Error(`${player} ${JSON.stringify(move)}: ${error}`);
  return applyMove(state, player, move, { rng: createRng(7) });
};

const item = (name: string) => {
  const i = MENU.findIndex((m) => m.name === name);
  if (i < 0) throw new Error(`no menu item ${name}`);
  return i;
};

/** Take and hand out the current level's order. */
function startPlay(state: State): State {
  const taker = decider(state)!;
  return play(play(state, taker, { type: "takeOrder" }), taker, { type: "handOut" });
}

/** Replace everyone's hand with these menu items (and the order to match). */
function withHands(state: State, hands: Record<string, string[]>): State {
  const used = new Map<number, number>();
  const card = (name: string): OrderCard => {
    const i = item(name);
    const copy = used.get(i) ?? 0;
    used.set(i, copy + 1);
    return { id: i * 2 + copy, item: i };
  };
  const dealt = Object.fromEntries(state.players.map((p) => [p.id, (hands[p.id] ?? []).map(card)]));
  return { ...state, hands: dealt, order: Object.values(dealt).flat() };
}

/**
 * The caller says an item out loud. If someone else holds it they tap it to serve it
 * (here: the first holder in seat order, which may not be first in line); otherwise
 * the caller says nobody has it.
 */
function call(state: State, caller: string, name: string): State {
  const i = item(name);
  const holder = state.players.find(
    (p) => p.id !== caller && state.hands[p.id]?.some((c) => c.item === i),
  );
  if (!holder) return play(state, caller, { type: "miss" });
  const card = state.hands[holder.id]!.find((c) => c.item === i)!;
  return play(state, holder.id, { type: "serve", card: card.id });
}

const onlyType = (moves: { move: Move; label: string }[], type: Move["type"]) =>
  moves.filter((m) => m.move.type === type).map((m) => m.label);

const names = (cards: OrderCard[]) => cards.map((c) => MENU[c.item]!.name);

describe("cards", () => {
  it("has 84 order cards: 42 menu items, two of each", () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(84);
    expect(MENU).toHaveLength(42);
    expect(new Set(deck.map((c) => c.id)).size).toBe(84);
    for (let i = 0; i < MENU.length; i++) {
      expect(deck.filter((c) => c.item === i)).toHaveLength(2);
    }
  });

  it("has unique menu names", () => {
    expect(new Set(MENU.map((m) => m.name)).size).toBe(MENU.length);
  });
});

describe("setup", () => {
  it("gives each player one star", () => {
    const s = newGame(4);
    expect(s.phase).toBe("ready");
    expect(s.level).toBe(1);
    expect(decider(s)).toBe("ann");
    expect(s.stars).toEqual({ ann: 1, bob: 1, cy: 1, dee: 1 });
  });

  it("gives 2 stars each with 2 players", () => {
    expect(newGame(2).stars).toEqual({ ann: 2, bob: 2 });
  });

  it("needs 1, 2 or 3 empty hands depending on the player count", () => {
    expect([2, 3, 4, 5, 6].map(handsToEmpty)).toEqual([1, 2, 2, 3, 3]);
  });
});

describe("taking and handing out the order", () => {
  it("shows everyone the order (level × players cards) while memorizing", () => {
    let s = newGame(4);
    expect(getLegalMoves(s, "ann").map((m) => m.label)).toEqual(["Take the level 1 order"]);
    expect(getLegalMoves(s, "bob")).toEqual([]);
    s = play(s, "ann", { type: "takeOrder" });
    expect(s.phase).toBe("order");
    expect(s.order).toHaveLength(4);
    expect(getPlayerView(s, "bob").order).toEqual(s.order);
    expect(getLegalMoves(s, "ann").map((m) => m.label)).toEqual(["Hand out the order"]);
  });

  it("deals the order evenly and hides it, starting left of the order taker", () => {
    let s = newGame(4);
    s = play(play(s, "ann", { type: "takeOrder" }), "ann", { type: "handOut" });
    const ordered = [...s.order].map((c) => c.id).sort();
    const dealt = Object.values(s.hands)
      .flat()
      .map((c) => c.id)
      .sort();
    expect(dealt).toEqual(ordered);
    for (const p of ["ann", "bob", "cy", "dee"]) expect(s.hands[p]).toHaveLength(1);
    expect(s.phase).toBe("play");
    expect(decider(s)).toBe("bob");

    const view = getPlayerView(s, "bob");
    expect(view.order).toBeNull();
    expect(view.hand).toEqual(s.hands.bob);
    expect(view.handCounts).toEqual({ ann: 1, bob: 1, cy: 1, dee: 1 });
    expect(JSON.stringify(view)).not.toContain('"hands"');
    expect(getPlayerView(s, "spectator").hand).toEqual([]);
  });
});

describe("calling orders", () => {
  const four = () =>
    withHands(startPlay(newGame(4, { levels: 3 })), {
      ann: ["Latte", "Mocha"],
      bob: ["Iced Latte", "Waffles"],
      cy: ["Latte", "Croissant"],
      dee: ["Iced Latte", "Lemonade"],
    });

  it("the first player clockwise from the caller who holds it serves it", () => {
    let s = four();
    expect(decider(s)).toBe("bob");
    s = call(s, "bob", "Iced Latte"); // Bob holds one too, but it's Dee's that counts
    expect(names(s.hands.dee!)).toEqual(["Lemonade"]);
    expect(names(s.hands.bob!)).toEqual(["Iced Latte", "Waffles"]);
    expect(s.served.map((x) => x.holder)).toEqual(["dee"]);
    expect(decider(s)).toBe("cy");
  });

  it("with two holders, the first one clockwise serves, whoever taps", () => {
    const before = four();
    const annLatte = before.hands.ann!.find((c) => c.item === item("Latte"))!;
    let s = play(before, "ann", { type: "serve", card: annLatte.id }); // Cy is first in line
    expect(names(s.hands.cy!)).toEqual(["Croissant"]);
    expect(names(s.hands.ann!)).toEqual(["Latte", "Mocha"]);
    const move = { type: "serve", card: annLatte.id } as const;
    expect(describeMove(before, s, "ann", move, "ann").text).toBe(
      "Cy served Latte for Bob. Cy was first in line, so you keep yours.",
    );
    expect(describeMove(before, s, "ann", move, "dee").text).toBe("Cy served Latte for Bob.");
    s = call(s, "cy", "Latte");
    expect(names(s.hands.ann!)).toEqual(["Mocha"]);
  });

  it("offers one Serve per item you hold, and only the caller can say nobody has it", () => {
    const s = four();
    expect(onlyType(getLegalMoves(s, "bob"), "miss")).toEqual(["Nobody has it"]);
    expect(onlyType(getLegalMoves(s, "bob"), "serve")).toEqual([]);
    expect(onlyType(getLegalMoves(s, "ann"), "serve")).toEqual(["Serve Latte", "Serve Mocha"]);
    expect(validateMove(s, "cy", { type: "miss" })).toBe("Only the caller can say that.");
    const bobs = s.hands.bob![0]!.id;
    expect(validateMove(s, "bob", { type: "serve", card: bobs })).toBe(
      "You can't serve your own order.",
    );
  });

  it("if nobody else has it, the caller loses their star", () => {
    let s = four();
    s = call(s, "bob", "Waffles"); // only Bob has Waffles
    expect(s.stars.bob).toBe(0);
    expect(names(s.hands.bob!)).toEqual(["Iced Latte", "Waffles"]);
    expect(decider(s)).toBe("cy");
  });

  it("players out of stars are skipped, but still serve", () => {
    let s = call(four(), "bob", "Pancakes"); // miss: Bob is out
    s = call(s, "cy", "Waffles"); // served by Bob
    expect(names(s.hands.bob!)).toEqual(["Iced Latte"]);
    s = call(s, "dee", "Mocha");
    s = call(s, "ann", "Croissant");
    expect(decider(s)).toBe("cy"); // Bob is skipped
  });

  it("clears the level once enough hands are empty, and the next taker is to the left", () => {
    let s = four();
    s = call(s, "bob", "Lemonade");
    s = call(s, "cy", "Iced Latte"); // Dee's: Dee is empty
    s = call(s, "dee", "Pancakes"); // miss: Dee is out of stars
    expect(s.phase).toBe("play");
    s = call(s, "ann", "Croissant");
    s = call(s, "bob", "Latte"); // Cy's: Cy is empty, 2 hands empty
    expect(s.phase).toBe("ready");
    expect(s.cleared).toBe(1);
    expect(s.level).toBe(2);
    expect(decider(s)).toBe("bob");
    s = play(s, "bob", { type: "takeOrder" });
    expect(s.order).toHaveLength(8);
    expect(s.stars).toEqual({ ann: 1, bob: 1, cy: 1, dee: 1 });
    expect(s.served).toEqual([]);
  });

  it("with 2 players one empty hand clears the level; a miss costs one of two stars", () => {
    let s = withHands(startPlay(newGame(2, { levels: 2 })), {
      ann: ["Mint Tea"],
      bob: ["Fruit Cup"],
    });
    s = call(s, "bob", "Espresso");
    expect(s.stars.bob).toBe(1);
    s = call(s, "ann", "Fruit Cup");
    expect(s.phase).toBe("ready");
    expect(s.level).toBe(2);
  });

  it("is lost when nobody has a star left", () => {
    let s = four();
    for (const p of ["bob", "cy", "dee", "ann"]) s = call(s, p, "Pancakes");
    expect(s.phase).toBe("lost");
    expect(getResult(s)).toEqual({
      winners: [],
      text: "The rush wins on level 1. You cleared 0 of 3.",
    });
    expect(getPlayerView(s, "ann").leftovers?.bob).toEqual(s.hands.bob);
    expect(getLegalMoves(s, "ann")).toEqual([]);
  });

  it("is won by clearing the last level", () => {
    let s = withHands(startPlay(newGame(3, { levels: 1 })), {
      ann: ["Latte"],
      bob: ["Mocha"],
      cy: ["Waffles"],
    });
    s = call(s, "bob", "Waffles");
    s = call(s, "cy", "Latte");
    expect(s.phase).toBe("won");
    expect(getResult(s)).toEqual({
      winners: ["ann", "bob", "cy"],
      text: "Everyone wins! You cleared all 1 level.",
    });
    expect(describeMove(s, s, "cy", { type: "miss" }, "ann")).toMatchObject({
      tone: "good",
      flash: "Shift complete!",
    });
  });
});

describe("views and text", () => {
  it("says who to wait for, per viewer", () => {
    let s = newGame(4);
    expect(getStatus(s, "ann").text).toBe("Take the level 1 order (4 items)");
    expect(getStatus(s, "bob").text).toBe("Waiting for Ann to take the level 1 order");
    s = play(s, "ann", { type: "takeOrder" });
    expect(getStatus(s, "bob").text).toBe("Memorize the order! Ann hands it out soon");
    s = play(s, "ann", { type: "handOut" });
    expect(getStatus(s, "bob")).toEqual({
      text: "Your turn: say an order out loud",
      activePlayers: ["bob"],
    });
    expect(getStatus(s, "cy").text).toBe("Bob is ordering: serve it if you have it");
    expect(getStatus(s, "spectator").text).toBe("Bob is ordering");
  });

  it("describes calls, with a red strip for misses", () => {
    const before = withHands(startPlay(newGame(4)), {
      ann: ["Latte"],
      bob: ["Mocha"],
      cy: ["Waffles"],
      dee: ["Croissant"],
    });
    const hit = call(before, "bob", "Waffles");
    const serve = { type: "serve", card: before.hands.cy![0]!.id } as const;
    expect(describeMove(before, hit, "cy", serve, "cy").text).toBe("You served Waffles for Bob.");
    expect(describeMove(before, hit, "cy", serve, "bob").text).toBe("Cy served Waffles for you.");
    const miss = call(before, "bob", "Pancakes");
    expect(describeMove(before, miss, "bob", { type: "miss" }, "bob")).toMatchObject({
      text: "Nobody had your order. You are out of stars.",
      tone: "bad",
      flash: "Out of stars!",
    });
    expect(describeMove(before, miss, "bob", { type: "miss" }, "ann").text).toBe(
      "Nobody had Bob's order. Bob is out of stars.",
    );
  });
});

describe("random games", () => {
  it("always end, keep every card accounted for, and never leak hands", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const count = 2 + (seed % 5);
      let s = newGame(count, {}, seed);
      const rng = createRng(seed * 31);
      for (let step = 0; step < 2000 && !getResult(s); step++) {
        const options = s.players.flatMap((p) =>
          getLegalMoves(s, p.id).map((m) => ({ player: p.id, move: m.move })),
        );
        expect(options.length).toBeGreaterThan(0);
        const pick = rng.pick(options);
        s = play(s, pick.player, pick.move);
        if (s.phase === "play") {
          const all = [...Object.values(s.hands).flat(), ...s.served.map((x) => x.card)];
          expect(all.map((c) => c.id).sort()).toEqual(s.order.map((c) => c.id).sort());
          const me = s.players[0]!.id;
          const view = getPlayerView(s, me);
          expect(view.hand).toEqual(s.hands[me]);
          expect(view.order).toBeNull();
          expect(view.leftovers).toBeNull();
          expect(Object.keys(view)).not.toContain("hands");
        }
      }
      expect(getResult(s)).not.toBeNull();
    }
  });
});
