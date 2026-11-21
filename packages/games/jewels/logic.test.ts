import { createRng, createTurnOrder } from "@utopia/kit";
import { describe, expect, it } from "vitest";
import { configSchema, type Config } from "./config.js";
import {
  COLORS,
  GOLD,
  allPatrons,
  applyMove,
  bonuses,
  describeMove,
  fullDeck,
  getLegalMoves,
  getPlayerView,
  getResult,
  getStatus,
  payment,
  points,
  setup,
  tokenCount,
  validateMove,
  type Card,
  type Move,
  type State,
  type TokenKind,
} from "./logic.js";

const PLAYERS = ["ann", "bob", "cy", "dee"].map((id) => ({
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  color: "#888",
}));

/** A fresh game where Ann goes first. */
function newGame(n = 2, config: Partial<Config> = {}, seed = 1): State {
  const players = PLAYERS.slice(0, n);
  const s = setup({ players, rng: createRng(seed) }, configSchema.parse(config));
  return {
    ...s,
    turn: createTurnOrder(
      players.map((p) => p.id),
      0,
    ),
    firstSeat: 0,
  };
}

const play = (s: State, player: string, move: Move): State => {
  const err = validateMove(s, player, move);
  if (err) throw new Error(`${player} ${JSON.stringify(move)}: ${err}`);
  return applyMove(s, player, move, { rng: createRng(7) });
};

const DECK = fullDeck();
const card = (pred: (c: Card) => boolean) => DECK.find(pred)!;

function give(
  s: State,
  player: string,
  tokens: Partial<Record<TokenKind, number>>,
  cards: Card[] = [],
): State {
  const seat = s.seats[player]!;
  const supply = { ...s.supply };
  for (const [t, k] of Object.entries(tokens) as [TokenKind, number][])
    supply[t] -= k - seat.tokens[t];
  return {
    ...s,
    supply,
    seats: {
      ...s.seats,
      [player]: {
        ...seat,
        tokens: { ...seat.tokens, ...tokens },
        cards: [...seat.cards, ...cards],
      },
    },
  };
}

/** Put a card in the first market slot of its level. */
function inMarket(s: State, c: Card): State {
  const row = [...s.market[c.level]];
  row[0] = c;
  return { ...s, market: { ...s.market, [c.level]: row } };
}

const turnOf = (s: State) => s.turn.players[s.turn.current];

describe("components and setup", () => {
  it("has 90 cards (40/30/20), evenly spread over colours, and 10 Patrons", () => {
    expect([1, 2, 3].map((l) => DECK.filter((c) => c.level === l).length)).toEqual([40, 30, 20]);
    for (const c of COLORS) expect(DECK.filter((d) => d.color === c)).toHaveLength(18);
    expect(allPatrons()).toHaveLength(10);
  });

  it("sets up gems by player count, 4 cards per level and players+1 Patrons", () => {
    expect([2, 3, 4].map((n) => newGame(n).supply.red)).toEqual([4, 5, 7]);
    const s = newGame(3);
    expect(s.supply.gold).toBe(GOLD);
    expect([1, 2, 3].map((l) => s.market[l as 1].length)).toEqual([4, 4, 4]);
    expect(s.patrons).toHaveLength(4);
  });
});

describe("taking gems", () => {
  it("takes 3 different colours, in any order", () => {
    let s = newGame();
    expect(validateMove(s, "ann", { type: "take", colors: ["red", "white", "blue"] })).toBeNull();
    s = play(s, "ann", { type: "take", colors: ["red", "white", "blue"] });
    expect(s.seats.ann!.tokens).toMatchObject({ red: 1, white: 1, blue: 1 });
    expect(s.supply.red).toBe(3);
    expect(turnOf(s)).toBe("bob");
  });

  it("takes 2 of one colour only from a pile of 4 or more", () => {
    let s = newGame();
    s = play(s, "ann", { type: "double", color: "green" });
    expect(s.supply.green).toBe(2);
    expect(validateMove(s, "bob", { type: "double", color: "green" })).toMatch(/isn't allowed/);
  });

  it("with fewer than 3 colours left, takes what's there", () => {
    const s = { ...newGame(), supply: { white: 0, blue: 0, green: 0, red: 2, black: 1, gold: 5 } };
    const takes = getLegalMoves(s, "ann").filter((m) => m.move.type === "take");
    expect(takes.map((m) => m.label)).toEqual(["Take red, black"]);
  });
});

describe("reserving", () => {
  it("reserves a market card with a Gold; the slot refills", () => {
    let s = newGame();
    const target = s.market[2][1]!;
    s = play(s, "ann", { type: "reserve", card: target.id });
    expect(s.seats.ann!.reserved).toEqual([target]);
    expect(s.seats.ann!.tokens.gold).toBe(1);
    expect(s.market[2][1]!.id).not.toBe(target.id);
  });

  it("reserves the top of a deck, hidden from others; at most 3", () => {
    let s = play(newGame(), "ann", { type: "reserveDeck", level: 3 });
    expect(getPlayerView(s, "bob").seats.ann!.reserved).toBeNull();
    expect(getPlayerView(s, "bob").seats.ann!.reservedLevels).toEqual([3]);
    expect(describeMove(s, s, "ann", { type: "reserveDeck", level: 3 }, "bob").text).toBe(
      "Ann reserved a level 3 card from the deck and took a Gold.",
    );
    const r = s.seats.ann!.reserved[0]!;
    s = {
      ...s,
      turn: createTurnOrder(["ann", "bob"], 0),
      seats: { ...s.seats, ann: { ...s.seats.ann!, reserved: [r, r, r] } },
    };
    expect(getLegalMoves(s, "ann").some((m) => m.move.type.startsWith("reserve"))).toBe(false);
  });

  it("no Gold left: you still reserve, without a Gold", () => {
    let s = { ...newGame(), supply: { ...newGame().supply, gold: 0 } };
    s = play(s, "ann", { type: "reserveDeck", level: 1 });
    expect(s.seats.ann!.tokens.gold).toBe(0);
  });
});

describe("buying", () => {
  it("pays cost minus bonuses, Gold for the rest; spent tokens go back", () => {
    const target = card((c) => c.level === 1 && c.color === "white" && c.cost.blue === 3); // 3 blue
    const blueCard = card((c) => c.color === "blue" && c.level === 1);
    let s = inMarket(give(newGame(), "ann", { blue: 1, gold: 1 }, [blueCard]), target);
    expect(payment(s.seats.ann!, target)).toEqual({ blue: 1, gold: 1 });
    const supplyBlue = s.supply.blue;
    s = play(s, "ann", { type: "buy", card: target.id });
    expect(s.seats.ann!.tokens.blue).toBe(0);
    expect(s.supply.blue).toBe(supplyBlue + 1);
    expect(bonuses(s.seats.ann!).white).toBe(1);
  });
});

describe("end of turn", () => {
  it("over 10 tokens: return tokens of your choice", () => {
    let s = give(newGame(4), "ann", { white: 3, blue: 3, green: 3 });
    s = play(s, "ann", { type: "take", colors: ["red", "black", "white"] });
    expect(tokenCount(s.seats.ann!)).toBe(12);
    expect(getStatus(s, "ann").text).toBe("Too many tokens: return 2");
    s = play(s, "ann", { type: "discard", token: "white" });
    expect(turnOf(s)).toBe("ann");
    s = play(s, "ann", { type: "discard", token: "white" });
    expect(turnOf(s)).toBe("bob");
  });

  it("a Patron visits if your bonuses meet the need; one per turn, your choice", () => {
    let s = newGame();
    const [p1, p2] = [s.patrons[0]!, s.patrons[1]!];
    const needs = { ...p1.needs } as Record<string, number>;
    for (const [c, k] of Object.entries(p2.needs)) needs[c] = Math.max(needs[c] ?? 0, k);
    const owned = Object.entries(needs).flatMap(([c, k]) =>
      DECK.filter((d) => d.color === c && d.points === 0).slice(0, k),
    );
    s = give(s, "ann", {}, owned);
    s = play(s, "ann", { type: "take", colors: ["white", "blue", "green"] });
    expect(s.pending).toEqual({ type: "patron", options: [p1.id, p2.id] });
    s = play(s, "ann", { type: "patron", id: p2.id });
    expect(s.seats.ann!.patrons).toEqual([p2]);
    expect(s.patrons.some((p) => p.id === p1.id)).toBe(true); // still there for later
    expect(turnOf(s)).toBe("bob");
  });

  it("reaching the target finishes the round; most points wins, ties go to fewer cards", () => {
    const big = DECK.filter((c) => c.level === 3).slice(0, 4); // 4+4+5+3 = 16
    let s = give(newGame(3), "bob", {}, big);
    s = play(s, "ann", { type: "take", colors: ["white", "blue", "green"] });
    s = play(s, "bob", { type: "take", colors: ["white", "blue", "green"] });
    expect(s.finalRound).toBe(true);
    expect(s.phase).toBe("play");
    s = play(s, "cy", { type: "take", colors: ["white", "blue", "green"] });
    expect(getResult(s)).toMatchObject({ winners: ["bob"], text: "Bob wins with 16 points!" });

    // A tie on points: fewer cards wins.
    let t = give(give(newGame(2), "ann", {}, big), "bob", {}, [
      ...big.slice(0, 3),
      ...DECK.filter((c) => c.level === 3 && c.points === 3).slice(0, 1),
      card((c) => c.level === 1 && c.points === 0),
    ]);
    t = play(t, "ann", { type: "take", colors: ["white", "blue", "green"] });
    t = play(t, "bob", { type: "take", colors: ["white", "blue", "red"] });
    expect(points(t.seats.ann!)).toBe(points(t.seats.bob!));
    expect(getResult(t)?.winners).toEqual(["ann"]);
  });

  it("if nobody can do anything, players pass, and a full round of passes ends the game", () => {
    const empty = { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 };
    const s0 = newGame();
    const full = (st: State, id: string) => ({
      ...st.seats[id]!,
      reserved: [DECK[0]!, DECK[1]!, DECK[2]!],
    });
    let s: State = { ...s0, supply: empty, seats: { ann: full(s0, "ann"), bob: full(s0, "bob") } };
    expect(getLegalMoves(s, "ann").map((m) => m.label)).toEqual(["Pass (nothing possible)"]);
    s = play(s, "ann", { type: "pass" });
    s = play(s, "bob", { type: "pass" });
    expect(s.phase).toBe("over");
  });
});

describe("hidden information", () => {
  it("decks and others' reserves stay hidden", () => {
    const view = getPlayerView(newGame(), "ann");
    expect(view.deckCounts).toEqual({ 1: 36, 2: 26, 3: 16 });
    expect(JSON.stringify(view)).not.toContain("drawPile");
  });
});

describe("random games", () => {
  it("end, keep every token and card, and respect the 10-token limit", () => {
    let ended = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const n = 2 + (seed % 3);
      let s = newGame(n, {}, seed);
      const tokens = 5 * s.supply.red + s.supply.gold;
      const rng = createRng(seed * 5);
      for (let step = 0; step < 3000 && s.phase === "play"; step++) {
        const me = turnOf(s)!;
        const moves = getLegalMoves(s, me);
        expect(moves.length).toBeGreaterThan(0);
        const buys = moves.filter((m) => m.move.type === "buy");
        const takes = moves.filter((m) => m.move.type === "take" || m.move.type === "double");
        const pool = buys.length ? buys : takes.length && rng.next() < 0.85 ? takes : moves;
        s = play(s, me, rng.pick(pool).move);
        const held = Object.values(s.seats).reduce((k, seat) => k + tokenCount(seat), 0);
        const supply = Object.values(s.supply).reduce((a, b) => a + b, 0);
        expect(held + supply).toBe(tokens);
        const cards =
          Object.values(s.seats).reduce(
            (k, seat) => k + seat.cards.length + seat.reserved.length,
            0,
          ) +
          [1, 2, 3].reduce(
            (k, l) => k + s.decks[l as 1].drawPile.length + s.market[l as 1].filter(Boolean).length,
            0,
          );
        expect(cards).toBe(90);
        if (!s.pending)
          for (const seat of Object.values(s.seats))
            expect(tokenCount(seat)).toBeLessThanOrEqual(10);
      }
      if (getResult(s)) ended++;
    }
    expect(ended).toBe(30);
  });
});
