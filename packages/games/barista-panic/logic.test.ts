import { createRng, createTurnOrder } from "@utopia/kit";
import { describe, expect, it } from "vitest";
import { configSchema, type Config } from "./config.js";
import {
  COUNTER,
  INGREDIENTS,
  RECIPES,
  RUSH_TOKENS,
  SUPPLY,
  applyMove,
  cellName,
  checkPath,
  describeMove,
  fullDeck,
  getLegalMoves,
  getPlayerView,
  getResult,
  getStatus,
  pathGains,
  setup,
  validateMove,
  type Move,
  type OrderCard,
  type State,
} from "./logic.js";

const PLAYERS = ["ann", "bob", "cy", "dee"].map((id) => ({
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  color: "#888",
}));

const fresh = (n = 3, config: Partial<Config> = {}, seed = 1): State =>
  setup({ players: PLAYERS.slice(0, n), rng: createRng(seed) }, configSchema.parse(config));

/** A game past setup: Ann (seat 0) starts, baristas where given, empty tabs and cups. */
function ready(n = 3, meeples: Record<string, number[]> = {}): State {
  const s = fresh(n);
  const ids = s.players.map((p) => p.id);
  const areas = Object.fromEntries(
    ids.map((id, i) => [
      id,
      {
        ...s.areas[id]!,
        tabs: [[], [], [], []],
        cups: [[], [], []],
        meeples: meeples[id] ?? (n === 2 ? [i * 2, i * 2 + 1] : [i]),
      },
    ]),
  );
  return {
    ...s,
    start: 0,
    turn: createTurnOrder(ids, 0),
    phase: "move",
    placeQueue: [],
    supply: { ...SUPPLY },
    areas,
  } as State;
}

let nextId = 500;
const card = (name: string): OrderCard => ({
  id: nextId++,
  recipe: RECIPES.findIndex((r) => r.name === name),
});

function withOrders(s: State, player: string, tab: number, ...names: string[]): State {
  const area = s.areas[player]!;
  const tabs = area.tabs.map((t, i) => (i === tab ? [...t, ...names.map(card)] : t));
  return { ...s, areas: { ...s.areas, [player]: { ...area, tabs } } };
}

function patch(s: State, player: string, change: Partial<State["areas"][string]>): State {
  return { ...s, areas: { ...s.areas, [player]: { ...s.areas[player]!, ...change } } };
}

const play = (s: State, player: string, move: Move): State => {
  const err = validateMove(s, player, move);
  if (err) throw new Error(`${player} ${JSON.stringify(move)}: ${err}`);
  return applyMove(s, player, move, { rng: createRng(9) });
};

const cell = (name: string) => "ABCD".indexOf(name[0]!) + (Number(name[1]) - 1) * 4;
const walk = (s: State, p: string, ...cells: string[]) =>
  play(s, p, { type: "move", meeple: 0, path: cells.map(cell) });

describe("components", () => {
  it("has 80 orders (4 easy starters), 3–4 ingredients each, and 102 ingredient tokens", () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(80);
    expect(
      deck.filter((c) => ["Ristretto", "Espresso"].includes(RECIPES[c.recipe]!.name)),
    ).toHaveLength(4);
    for (const r of RECIPES) expect(r.needs.length).toBeGreaterThanOrEqual(3);
    for (const r of RECIPES) expect(r.needs.length).toBeLessThanOrEqual(4);
    expect(Object.values(SUPPLY).reduce((a, b) => a + b, 0)).toBe(102);
    expect(INGREDIENTS.every((i) => COUNTER.filter((c) => c === i).length === 2)).toBe(true);
  });
});

describe("setup", () => {
  it("deals 2 + 1 orders to the starter and 1 + 1 to everyone else", () => {
    const s = fresh(3);
    const starter = s.players[s.start]!.id;
    for (const p of s.players) {
      const tabs = s.areas[p.id]!.tabs.map((t) => t.length);
      expect(tabs).toEqual(p.id === starter ? [2, 1, 0, 0] : [1, 1, 0, 0]);
    }
    expect(s.deck.drawPile).toHaveLength(80 - 7);
  });

  it("places baristas anticlockwise from the starter's right; no sharing; the ingredient goes in a cup", () => {
    let s = fresh(3);
    const ids = s.players.map((p) => p.id);
    const expected = [1, 2, 3].map((k) => ids[(s.start - k + 6) % 3]);
    expect(s.placeQueue).toEqual(expected);
    s = play(s, expected[0]!, { type: "place", cell: 0 });
    expect(s.areas[expected[0]!]!.cups[0]).toEqual(["coffee"]);
    expect(
      getLegalMoves(s, expected[1]!).some((m) => m.move.type === "place" && m.move.cell === 0),
    ).toBe(false);
    s = play(s, expected[1]!, { type: "place", cell: 1 });
    s = play(s, expected[2]!, { type: "place", cell: 2 });
    expect(s.phase).toBe("move");
    expect(getStatus(s, ids[s.start]!).text).toBe("Your turn: walk 1–3 steps");
  });

  it("2 players: each places 2 baristas, non-starter first", () => {
    const s = fresh(2);
    const ids = s.players.map((p) => p.id);
    const other = ids[(s.start + 1) % 2]!;
    expect(s.placeQueue).toEqual([other, ids[s.start], other, ids[s.start]]);
  });

  it("easy start: everyone begins with an easy order on tab 1", () => {
    const s = fresh(4, { easyStart: true });
    for (const p of s.players) {
      expect(
        s.areas[p.id]!.tabs[0]!.some((c) =>
          ["Ristretto", "Espresso"].includes(RECIPES[c.recipe]!.name),
        ),
      ).toBe(true);
    }
    expect(
      s.deck.drawPile.some((c) => ["Ristretto", "Espresso"].includes(RECIPES[c.recipe]!.name)),
    ).toBe(false);
  });
});

describe("walking", () => {
  it("1–3 orthogonal steps, taking each cell's ingredient", () => {
    const s = ready(3);
    expect(checkPath(s, "ann", 0, [cell("B2")])).toMatch(/not next to/); // diagonal from A1
    expect(checkPath(s, "ann", 0, [])).toBe("Take at least one step.");
    expect(checkPath(s, "ann", 0, [4, 8, 12, 13])).toMatch(/Not enough steps/);
    const after = walk(s, "ann", "A2", "A3", "A4");
    expect(after.held).toEqual(["tea", "water", "ice"]);
    expect(after.areas.ann!.meeples).toEqual([cell("A4")]);
  });

  it("may pass over other baristas (and still take their ingredient) but not stop on them", () => {
    const s = ready(3); // ann A1, bob B1, cy C1
    expect(checkPath(s, "ann", 0, [cell("B1")])).toBe("You can't stop on another barista.");
    const after = walk(s, "ann", "B1", "B2");
    expect(after.held).toEqual(["milk", "caramel"]);
  });

  it("Rush tokens buy extra steps, and are spent", () => {
    let s = patch(ready(3), "ann", { rush: 1 });
    s = { ...s, rushSupply: RUSH_TOKENS - 1 };
    s = walk(s, "ann", "A2", "A3", "A4", "B4");
    expect(s.areas.ann!.rush).toBe(0);
    expect(s.rushSupply).toBe(RUSH_TOKENS);
  });

  it("takes as many as the supply has left", () => {
    const s = { ...ready(3), supply: { ...SUPPLY, tea: 0 } };
    expect(walk(s, "ann", "A2").held).toEqual([]);
  });
});

describe("upgrades", () => {
  const withDone = (s: State, k: number) =>
    patch(s, "ann", { done: Array.from({ length: k }, () => card("Latte")) });

  it("cost 3 completed orders, at the start of the turn, worth 2 points each", () => {
    let s = withDone(ready(3), 3);
    s = play(s, "ann", { type: "upgrade", upgrade: "diagonal" });
    expect(s.areas.ann!.done).toHaveLength(0);
    expect(s.spent).toHaveLength(3);
    expect(validateMove(s, "ann", { type: "upgrade", upgrade: "corners" })).toBe(
      "You need 3 completed orders.",
    );
    expect(checkPath(s, "ann", 0, [cell("B2")])).toBeNull(); // diagonal now
  });

  it("corner, specialty and crowd bonuses double, and stack", () => {
    let s = ready(3, { ann: [cell("A2")], bob: [cell("A1")], cy: [cell("D4")] });
    s = patch(s, "ann", { upgrades: ["corners", "crowd"] });
    expect(pathGains(s, "ann", 0, [cell("A1"), cell("A2")])).toEqual([
      "coffee",
      "coffee",
      "coffee",
      "coffee",
      "tea",
    ]);
    s = patch(s, "ann", { upgrades: ["specialty"] });
    expect(pathGains(s, "ann", 0, [cell("B2")])).toEqual(["caramel", "caramel"]);
  });

  it("2 players: the crowd bonus counts your own other barista", () => {
    const s = patch(
      ready(2, { ann: [cell("A1"), cell("B1")], bob: [cell("D4"), cell("C4")] }),
      "ann",
      {
        upgrades: ["crowd"],
      },
    );
    expect(pathGains(s, "ann", 0, [cell("B1"), cell("B2")])).toEqual(["milk", "milk", "caramel"]);
  });
});

describe("pouring and serving", () => {
  it("empty cups first, pour into cups, put the rest back; tokens stay in their cup", () => {
    let s = patch({ ...ready(3), supply: { ...SUPPLY, ice: SUPPLY.ice - 1 } }, "ann", {
      cups: [["ice"], [], []],
    });
    s = walk(s, "ann", "A2", "A3");
    expect(validateMove(s, "ann", { type: "pour", empty: [], add: [["coffee"], [], []] })).toBe(
      "You don't have that ingredient.",
    );
    s = play(s, "ann", { type: "pour", empty: [0], add: [["tea"], [], []] });
    expect(s.areas.ann!.cups).toEqual([["tea"], [], []]);
    expect(s.supply.water).toBe(SUPPLY.water); // put back
    expect(s.supply.ice).toBe(SUPPLY.ice); // emptied back
  });

  it("serves exact matches only; specialty orders give a Rush token", () => {
    let s = withOrders(ready(3), "ann", 1, "Latte", "Mocha");
    s = patch(s, "ann", {
      cups: [
        ["coffee", "milk"],
        ["coffee", "chocolate", "milk", "steam"],
        ["steam", "milk", "coffee"],
      ],
    });
    s = walk(s, "ann", "A2");
    s = play(s, "ann", { type: "pour", empty: [], add: [[], [], []] });
    const labels = getLegalMoves(s, "ann").map((m) => m.label);
    expect(labels).toEqual([
      "Serve cup 2: Mocha (tab 2)",
      "Serve cup 3: Latte (tab 2)",
      "End turn",
    ]);
    const mocha = s.areas.ann!.tabs[1]!.find((c) => RECIPES[c.recipe]!.name === "Mocha")!;
    s = play(s, "ann", { type: "serve", cup: 1, card: mocha.id });
    expect(s.areas.ann!.done).toHaveLength(1);
    expect(s.areas.ann!.cups[1]).toEqual([]);
    expect(s.areas.ann!.rush).toBe(1);
  });

  it("every served order sends a new order to the next two players", () => {
    let s = withOrders(ready(4), "ann", 0, "Latte");
    s = patch(s, "ann", { cups: [["coffee", "milk", "steam"], [], []] });
    s = walk(s, "ann", "A2");
    s = play(s, "ann", { type: "pour", empty: [], add: [[], [], []] });
    s = play(s, "ann", { type: "serve", cup: 0, card: s.areas.ann!.tabs[0]![0]!.id });
    s = play(s, "ann", { type: "endTurn" });
    expect(s.areas.bob!.tabs[0]).toHaveLength(1);
    expect(s.areas.cy!.tabs[0]).toHaveLength(1);
    expect(s.areas.dee!.tabs[0]).toHaveLength(0);
    expect(s.turn.players[s.turn.current]).toBe("bob");
  });
});

describe("time, penalties and the end", () => {
  const passTurn = (s: State, p: string) => {
    const free = getLegalMoves(s, p).find((m) => m.move.type === "move")!.move;
    s = play(s, p, free);
    s = play(s, p, { type: "pour", empty: [], add: [[], [], []] });
    return play(s, p, { type: "endTurn" });
  };

  it("orders move one tab per turn; tab 4 orders become penalties and give Rush tokens", () => {
    let s = withOrders(withOrders(ready(3), "ann", 3, "Latte", "Mocha"), "ann", 0, "Americano");
    s = passTurn(s, "ann");
    expect(s.areas.ann!.tabs.map((t) => t.length)).toEqual([0, 1, 0, 0]);
    expect(s.areas.ann!.penalties).toHaveLength(2);
    expect(s.areas.ann!.rush).toBe(2);
  });

  it("2 players: you also draw a new order at the end of your turn", () => {
    let s = withOrders(ready(2), "bob", 0, "Latte");
    s = passTurn(s, "ann");
    expect(s.areas.ann!.tabs[0]).toHaveLength(1);
  });

  it("5 penalties start the last round, which finishes before the game ends", () => {
    let s = withOrders(ready(3), "bob", 3, "Latte", "Latte", "Latte", "Latte", "Latte");
    s = withOrders(s, "cy", 0, "Mocha");
    s = passTurn(s, "ann");
    expect(s.closed).toBe(false);
    s = passTurn(s, "bob");
    expect(s.closed).toBe(true);
    expect(getStatus(s, "cy").text).toBe("Your turn: walk 1–3 steps (last round)");
    s = passTurn(s, "cy");
    expect(s.phase).toBe("over");
    expect(getResult(s)).toMatchObject({ text: "Ann and Cy share the win with 0 points!" });
  });

  it("an empty order deck starts the last round", () => {
    let s = withOrders(ready(3), "ann", 0, "Latte");
    s = { ...s, deck: { drawPile: [card("Latte")], discardPile: [] } };
    s = patch(s, "ann", { cups: [["coffee", "milk", "steam"], [], []] });
    s = walk(s, "ann", "A2");
    s = play(s, "ann", { type: "pour", empty: [], add: [[], [], []] });
    s = play(s, "ann", { type: "serve", cup: 0, card: s.areas.ann!.tabs[0]![0]!.id });
    s = play(s, "ann", { type: "endTurn" });
    expect(s.closed).toBe(true);
    expect(describeMove(s, s, "ann", { type: "endTurn" }, "bob").flash).toBe("Last round!");
  });

  it("scores +1 per order, +2 per upgrade, −1 per penalty; ties go to more orders, then Rush tokens", () => {
    let s = patch(ready(2), "ann", {
      done: [card("Latte"), card("Latte")],
      penalties: [card("Latte")],
    });
    s = patch(s, "bob", { upgrades: ["corners"], penalties: [card("Latte")] }); // ann 1, bob 1
    s = { ...s, phase: "over" };
    expect(getResult(s)?.winners).toEqual(["ann"]); // more completed orders
  });
});

describe("move text", () => {
  it("a quiet end of turn still says what happened", () => {
    let s = withOrders(ready(3), "bob", 0, "Latte");
    s = walk(s, "ann", "A2");
    s = play(s, "ann", { type: "pour", empty: [], add: [[], [], []] });
    const after = play(s, "ann", { type: "endTurn" });
    expect(describeMove(s, after, "ann", { type: "endTurn" }, "bob").text).toBe(
      "Ann ended the turn; orders moved one tab along.",
    );
  });
});

describe("views", () => {
  it("hide only the order of the deck", () => {
    const v = getPlayerView(ready(3), "bob");
    expect(v.deckCount).toBeGreaterThan(0);
    expect(JSON.stringify(v)).not.toContain("drawPile");
    expect(v.areas.ann).toBeDefined();
    expect(cellName(15)).toBe("D4");
  });
});

describe("random games", () => {
  it("always end, keeping every token, order card and Rush token", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const n = 2 + (seed % 3);
      let s = fresh(n, { easyStart: seed % 4 === 0 }, seed);
      const removed =
        80 -
        s.deck.drawPile.length -
        Object.values(s.areas).reduce((k, a) => k + a.tabs.flat().length, 0);
      const rng = createRng(seed * 7);
      for (let step = 0; step < 20000 && s.phase !== "over"; step++) {
        const who = s.phase === "place" ? s.placeQueue[0]! : s.turn.players[s.turn.current]!;
        const moves = getLegalMoves(s, who);
        expect(moves.length).toBeGreaterThan(0);
        const serves = moves.filter((m) => m.move.type === "serve");
        const pick = serves.length
          ? serves[0]!
          : moves[0]!.move.type === "pour"
            ? moves[0]!
            : rng.pick(moves);
        s = play(s, who, pick.move);
        const tokens =
          Object.values(s.supply).reduce((a, b) => a + b, 0) +
          s.held.length +
          Object.values(s.areas).reduce((k, a) => k + a.cups.flat().length, 0);
        expect(tokens).toBe(102);
        const cards =
          s.deck.drawPile.length +
          s.spent.length +
          Object.values(s.areas).reduce(
            (k, a) => k + a.tabs.flat().length + a.done.length + a.penalties.length,
            0,
          );
        expect(cards + removed).toBe(80);
        expect(s.rushSupply + Object.values(s.areas).reduce((k, a) => k + a.rush, 0)).toBe(
          RUSH_TOKENS,
        );
      }
      expect(getResult(s)).not.toBeNull();
    }
  });
});
