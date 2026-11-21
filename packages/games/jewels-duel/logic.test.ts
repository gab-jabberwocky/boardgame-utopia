import { createRng, createTurnOrder } from "@utopia/kit";
import { describe, expect, it } from "vitest";
import { configSchema } from "./config.js";
import {
  COLORS,
  PRIVILEGES,
  SPIRAL,
  allTokens,
  applyMove,
  bonuses,
  colorPoints,
  crowns,
  describeMove,
  fullDeck,
  getLegalMoves,
  getPlayerView,
  getResult,
  getStatus,
  payment,
  points,
  setup,
  takeOptions,
  tokenCount,
  validateMove,
  type Card,
  type Move,
  type State,
  type TokenKind,
} from "./logic.js";

const PLAYERS = [
  { id: "ann", name: "Ann", color: "#f97316" },
  { id: "bob", name: "Bob", color: "#38bdf8" },
];

/** A fresh game where Ann goes first (so Bob holds the starting Privilege). */
function newGame(seed = 1): State {
  const s = setup({ players: PLAYERS, rng: createRng(seed) }, configSchema.parse({}));
  return {
    ...s,
    turn: createTurnOrder(["ann", "bob"], 0),
    seats: {
      ann: { ...s.seats.ann!, privileges: 0 },
      bob: { ...s.seats.bob!, privileges: 1 },
    },
  };
}

const play = (state: State, player: string, move: Move): State => {
  const error = validateMove(state, player, move);
  if (error) throw new Error(`${player} ${JSON.stringify(move)}: ${error}`);
  return applyMove(state, player, move, { rng: createRng(7) });
};

const CODES: Record<string, TokenKind | null> = {
  W: "white",
  B: "blue",
  G: "green",
  R: "red",
  K: "black",
  P: "pearl",
  O: "gold",
  ".": null,
};

/** Lay out the board from 5 rows like "WBGRK"; every other token goes in the bag. */
function withBoard(state: State, rows: string[]): State {
  const board = rows
    .join("")
    .split("")
    .map((ch) => CODES[ch] ?? null);
  const left = [...allTokens()];
  const held = Object.values(state.seats).flatMap((seat) =>
    (Object.entries(seat.tokens) as [TokenKind, number][]).flatMap(([t, n]) => Array(n).fill(t)),
  );
  for (const t of [...board.filter((t): t is TokenKind => !!t), ...held]) {
    left.splice(left.indexOf(t), 1);
  }
  return { ...state, board, bag: left };
}

function withTokens(state: State, player: string, tokens: Partial<Record<TokenKind, number>>) {
  const seat = state.seats[player]!;
  return {
    ...state,
    seats: { ...state.seats, [player]: { ...seat, tokens: { ...seat.tokens, ...tokens } } },
  };
}

const DECK = fullDeck();
const findCard = (pred: (c: Card) => boolean) => {
  const card = DECK.find(pred);
  if (!card) throw new Error("no such card");
  return card;
};

/** Give a player bought cards (for bonuses, points and crowns). */
function withCards(state: State, player: string, cards: Card[]): State {
  const seat = state.seats[player]!;
  const owned = cards.map((card) => ({ card, color: card.color === "wild" ? "red" : card.color }));
  return {
    ...state,
    seats: {
      ...state.seats,
      [player]: { ...seat, cards: [...seat.cards, ...(owned as State["seats"][string]["cards"])] },
    },
  };
}

/** Put a card in the first slot of its pyramid row. */
function inPyramid(state: State, card: Card): State {
  const row = [...state.pyramid[card.level]];
  row[0] = card;
  return { ...state, pyramid: { ...state.pyramid, [card.level]: row } };
}

const FULL = ["WBGRK", "WBGRK", "WBGRK", "WBGRK", "PPOOO"];

describe("components", () => {
  it("has 67 cards: 30, 24 and 13 per level, 7 of them wild", () => {
    expect(DECK).toHaveLength(67);
    expect([1, 2, 3].map((l) => DECK.filter((c) => c.level === l).length)).toEqual([30, 24, 13]);
    expect(DECK.filter((c) => c.color === "wild")).toHaveLength(7);
    expect(new Set(DECK.map((c) => c.id)).size).toBe(67);
  });

  it("has 25 tokens and a spiral covering every cell from the center", () => {
    const tokens = allTokens();
    expect(tokens).toHaveLength(25);
    expect(tokens.filter((t) => t === "gold")).toHaveLength(3);
    expect(tokens.filter((t) => t === "pearl")).toHaveLength(2);
    expect(SPIRAL[0]).toBe(12);
    expect([...SPIRAL].sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i));
  });
});

describe("setup", () => {
  it("lays out the pyramid, fills the board and gives the second player a Privilege", () => {
    const s = setup({ players: PLAYERS, rng: createRng(3) }, configSchema.parse({}));
    expect([3, 2, 1].map((l) => s.pyramid[l as 1 | 2 | 3].length)).toEqual([3, 4, 5]);
    expect(s.board.filter((t) => t !== null)).toHaveLength(25);
    expect(s.bag).toEqual([]);
    const first = s.turn.players[s.turn.current]!;
    const second = first === "ann" ? "bob" : "ann";
    expect(s.seats[first]!.privileges).toBe(0);
    expect(s.seats[second]!.privileges).toBe(1);
    expect(s.privilegeSupply).toBe(PRIVILEGES - 1);
  });
});

describe("taking tokens", () => {
  it("takes 1–3 tokens in an unbroken line, never Gold, never across a gap", () => {
    const board = withBoard(newGame(), ["WO...", "W....", ".R.B.", "...B.", "G.GGG"]).board;
    const opts = takeOptions(board).map((cells) => cells.join(","));
    expect(opts).toContain("20"); // single
    expect(opts).toContain("22,23,24"); // row
    expect(opts).toContain("13,18"); // column
    expect(opts).not.toContain("0,1"); // Gold
    expect(opts).not.toContain("20,21,22"); // gap
    expect(opts).not.toContain("0,5,10"); // gap below
    expect(opts).toContain("13,18,23"); // column of three
    expect(opts).toContain("18,22"); // diagonal ↙
    expect(opts).toContain("18,24"); // diagonal ↘
  });

  it("taking 3 of a color or 2 Pearls gives the opponent a Privilege", () => {
    let s = withBoard(newGame(), ["RRR..", ".....", "PP...", ".....", "....."]);
    s = play(s, "ann", { type: "take", cells: [0, 1, 2] });
    expect(s.seats.ann!.tokens.red).toBe(3);
    expect(s.seats.bob!.privileges).toBe(2);
    expect(s.turn.players[s.turn.current]).toBe("bob");
    s = play(s, "bob", { type: "take", cells: [10, 11] });
    expect(s.seats.ann!.privileges).toBe(1);
  });
});

describe("optional actions", () => {
  it("a Privilege takes any 1 non-Gold token, but only before refilling", () => {
    let s = withBoard(newGame(), ["RO...", ".....", ".....", ".....", "....."]);
    s = { ...s, turn: createTurnOrder(["ann", "bob"], 1) }; // Bob has the Privilege
    const privileged = getLegalMoves(s, "bob").filter((m) => m.move.type === "privilege");
    expect(privileged.map((m) => m.move)).toEqual([{ type: "privilege", cell: 0 }]);
    const refilled = play(s, "bob", { type: "replenish" });
    expect(getLegalMoves(refilled, "bob").some((m) => m.move.type === "privilege")).toBe(false);
    s = play(s, "bob", { type: "privilege", cell: 0 });
    expect(s.seats.bob!.tokens.red).toBe(1);
    expect(s.seats.bob!.privileges).toBe(0);
    expect(s.privilegeSupply).toBe(3);
    expect(s.turn.players[s.turn.current]).toBe("bob"); // still Bob's turn
  });

  it("refilling pours the bag onto empty cells in spiral order; the opponent gets a Privilege", () => {
    let s = withBoard(newGame(), ["WBGRK", "WBGRK", "WB.RK", "WBGRK", "PPOOO"]);
    expect(s.bag).toEqual(["green"]);
    s = play(s, "ann", { type: "replenish" });
    expect(s.board[12]).toBe("green");
    expect(s.bag).toEqual([]);
    expect(s.seats.bob!.privileges).toBe(2);
  });

  it("with no Privileges left in the supply, one is taken from the opponent", () => {
    let s = withBoard(
      newGame(),
      FULL.map((r, i) => (i === 0 ? "W...." : r)),
    );
    s = {
      ...s,
      privilegeSupply: 0,
      seats: { ...s.seats, ann: { ...s.seats.ann!, privileges: 2 } },
    };
    s = play(s, "ann", { type: "replenish" });
    expect(s.seats.ann!.privileges).toBe(1);
    expect(s.seats.bob!.privileges).toBe(2);
  });

  it("you must refill first if no main action is possible", () => {
    let s = withBoard(newGame(), [".....", ".....", ".....", ".....", "....."]);
    s = { ...s, pyramid: { 1: [], 2: [], 3: [] } };
    const moves = getLegalMoves(s, "ann").map((m) => m.move.type);
    expect(moves).toEqual(["replenish"]);
  });
});

describe("reserving", () => {
  it("takes a Gold and a pyramid card, which is replaced from the deck", () => {
    let s = withBoard(newGame(), FULL);
    const card = s.pyramid[2][1]!;
    const deckBefore = s.decks[2].drawPile.length;
    s = play(s, "ann", { type: "reserve", gold: 22, card: card.id });
    expect(s.seats.ann!.tokens.gold).toBe(1);
    expect(s.seats.ann!.reserved).toEqual([card]);
    expect(s.pyramid[2][1]?.id).not.toBe(card.id);
    expect(s.decks[2].drawPile).toHaveLength(deckBefore - 1);
  });

  it("can reserve the top of a deck, hidden from the opponent; at most 3", () => {
    let s = withBoard(newGame(), FULL);
    s = play(s, "ann", { type: "reserveDeck", gold: 22, level: 3 });
    const reserved = s.seats.ann!.reserved[0]!;
    expect(getPlayerView(s, "ann").seats.ann!.reserved).toEqual([reserved]);
    expect(getPlayerView(s, "bob").seats.ann!.reserved).toBeNull();
    expect(getPlayerView(s, "bob").seats.ann!.reservedLevels).toEqual([3]);
    const move = { type: "reserveDeck", gold: 22, level: 3 } as const;
    expect(describeMove(s, s, "ann", move, "bob").text).toBe(
      "Ann took a Gold and reserved a level 3 card from the deck.",
    );
    const full: State = {
      ...s,
      turn: createTurnOrder(["ann", "bob"], 0),
      seats: { ...s.seats, ann: { ...s.seats.ann!, reserved: [reserved, reserved, reserved] } },
    };
    expect(getLegalMoves(full, "ann").some((m) => m.move.type.startsWith("reserve"))).toBe(false);
  });
});

describe("buying", () => {
  it("pays the cost minus bonuses, using Gold for what's missing; tokens go to the bag", () => {
    // White L1 that costs 3 blue.
    const card = findCard((c) => c.level === 1 && c.color === "white" && c.crowns === 1);
    let s = withBoard(newGame(), FULL);
    s = inPyramid(s, card);
    s = withCards(s, "ann", [findCard((c) => c.level === 1 && c.color === "blue" && !c.crowns)]);
    s = withTokens(s, "ann", { blue: 1, gold: 1 });
    expect(payment(s.seats.ann!, card)).toEqual({ blue: 1, gold: 1 });
    const bag = s.bag.length;
    s = play(s, "ann", { type: "buy", card: card.id });
    expect(s.seats.ann!.tokens.blue).toBe(0);
    expect(s.seats.ann!.tokens.gold).toBe(0);
    expect(s.bag).toHaveLength(bag + 2);
    expect(bonuses(s.seats.ann!).white).toBe(1);
    expect(crowns(s.seats.ann!)).toBe(1);
    expect(s.pyramid[1][0]?.id).not.toBe(card.id);
  });

  it("a wild card needs a card with a bonus and joins its color", () => {
    const wild = findCard((c) => c.level === 2 && c.color === "wild" && !c.cost.pearl);
    let s = withBoard(newGame(), FULL);
    s = inPyramid(s, wild);
    s = withTokens(s, "ann", { blue: 3, black: 3, white: 3, red: 3 });
    expect(
      getLegalMoves(s, "ann").some((m) => m.move.type === "buy" && m.move.card === wild.id),
    ).toBe(false);
    s = withCards(s, "ann", [findCard((c) => c.level === 1 && c.color === "green")]);
    const buys = getLegalMoves(s, "ann").filter(
      (m) => m.move.type === "buy" && m.move.card === wild.id,
    );
    expect(buys.map((m) => m.move)).toEqual([{ type: "buy", card: wild.id, color: "green" }]);
    s = play(s, "ann", { type: "buy", card: wild.id, color: "green" });
    expect(bonuses(s.seats.ann!).green).toBe(2);
    expect(colorPoints(s.seats.ann!).green).toBe(wild.points);
  });
});

describe("card abilities", () => {
  const buy = (state: State, card: Card, tokens: Partial<Record<TokenKind, number>>) =>
    play(withTokens(inPyramid(state, card), "ann", tokens), "ann", { type: "buy", card: card.id });
  const costOf = (card: Card) => card.cost as Partial<Record<TokenKind, number>>;

  it("↻ gives another turn", () => {
    const card = findCard((c) => c.ability === "again" && c.level === 1);
    const s = buy(withBoard(newGame(), FULL), card, costOf(card));
    expect(s.turn.players[s.turn.current]).toBe("ann");
    expect(s.replenished).toBe(false);
  });

  it("+1 takes a token of the card's color: automatic if only one, a choice if several", () => {
    const card = findCard((c) => c.ability === "token" && c.level === 1 && c.color === "red");
    let s = buy(
      withBoard(newGame(), ["R....", ".....", ".....", ".....", "....."]),
      card,
      costOf(card),
    );
    expect(s.seats.ann!.tokens.red).toBe(1);
    s = buy(
      withBoard(newGame(), ["R...R", ".....", ".....", ".....", "....."]),
      card,
      costOf(card),
    );
    expect(s.pending).toEqual({ type: "pickToken", color: "red" });
    expect(getLegalMoves(s, "ann").map((m) => m.move)).toEqual([
      { type: "pickToken", cell: 0 },
      { type: "pickToken", cell: 4 },
    ]);
    s = play(s, "ann", { type: "pickToken", cell: 4 });
    expect(s.seats.ann!.tokens.red).toBe(1);
    expect(s.turn.players[s.turn.current]).toBe("bob");
  });

  it("📜 takes a Privilege", () => {
    const card = findCard((c) => c.ability === "privilege");
    const s = buy(withBoard(newGame(), FULL), card, costOf(card));
    expect(s.seats.ann!.privileges).toBe(1);
  });

  it("✋ takes a non-Gold token from the opponent: a choice if there are several kinds", () => {
    const card = findCard((c) => c.ability === "steal");
    let s = withTokens(withBoard(newGame(), FULL), "bob", { red: 1, gold: 2 });
    s = buy(s, card, costOf(card));
    expect(s.seats.bob!.tokens.red).toBe(0);
    expect(s.seats.ann!.tokens.red).toBe(1);
    expect(s.seats.bob!.tokens.gold).toBe(2);

    s = withTokens(withBoard(newGame(), FULL), "bob", { red: 1, pearl: 1 });
    s = buy(s, card, costOf(card));
    expect(getLegalMoves(s, "ann").map((m) => m.label)).toEqual(["Take 1 red", "Take 1 Pearl"]);
    s = play(s, "ann", { type: "steal", gem: "pearl" });
    expect(s.seats.ann!.tokens.pearl).toBe(1);
    expect(describeMove(s, s, "ann", { type: "steal", gem: "pearl" }, "bob").tone).toBe("bad");
  });
});

describe("crowns and Royal cards", () => {
  it("the 3rd crown earns a Royal card of your choice", () => {
    const crowned = DECK.filter((c) => c.crowns === 1 && c.level === 1).slice(0, 2);
    const third = DECK.filter((c) => c.crowns === 1 && c.level === 1)[2]!;
    let s = withCards(withBoard(newGame(), FULL), "ann", crowned);
    s = play(withTokens(inPyramid(s, third), "ann", third.cost), "ann", {
      type: "buy",
      card: third.id,
    });
    expect(s.pending).toEqual({ type: "royal" });
    expect(getStatus(s, "ann").text).toBe("Choose a Royal card");
    s = play(s, "ann", { type: "royal", id: 0 });
    expect(points(s.seats.ann!)).toBe(3);
    expect(s.royals).toHaveLength(3);
    expect(s.turn.players[s.turn.current]).toBe("bob");
  });

  it("a Royal card's ability is resolved", () => {
    const crowned = DECK.filter((c) => c.crowns === 1 && c.level === 1);
    let s = withCards(withBoard(newGame(), FULL), "ann", crowned.slice(0, 2));
    const third = crowned[2]!;
    s = play(withTokens(inPyramid(s, third), "ann", third.cost), "ann", {
      type: "buy",
      card: third.id,
    });
    s = play(s, "ann", { type: "royal", id: 3 }); // + another turn
    expect(s.turn.players[s.turn.current]).toBe("ann");
  });
});

describe("end of turn", () => {
  it("over 10 tokens, you return tokens of your choice to the bag", () => {
    let s = withTokens(withBoard(newGame(), FULL), "ann", { red: 4, blue: 4, white: 1 });
    s = play(s, "ann", { type: "take", cells: [0, 1, 2] });
    expect(tokenCount(s.seats.ann!)).toBe(12);
    expect(s.pending).toEqual({ type: "discard" });
    s = play(s, "ann", { type: "discard", token: "red" });
    expect(s.pending).toEqual({ type: "discard" });
    s = play(s, "ann", { type: "discard", token: "red" });
    expect(s.pending).toBeNull();
    expect(tokenCount(s.seats.ann!)).toBe(10);
    expect(s.turn.players[s.turn.current]).toBe("bob");
  });

  it("wins with 20 points, 10 crowns, or 10 points in one color", () => {
    const l3 = DECK.filter((c) => c.level === 3 && c.color !== "wild");
    const take: Move = { type: "take", cells: [0] };

    let s = withCards(withBoard(newGame(), FULL), "ann", l3.slice(0, 6)); // 4+3+4+3+4+3 = 21
    s = play(s, "ann", take);
    expect(getResult(s)?.text).toBe("Ann wins with 21 points!");
    expect(describeMove(s, s, "ann", take, "ann")).toMatchObject({ flash: "You win!" });

    const crowny = DECK.filter((c) => c.crowns === 2); // 5 colored + 3 wild, 2 crowns each, 3 pts
    s = withCards(withBoard(newGame(), FULL), "ann", crowny.slice(0, 5));
    s = { ...s, seats: { ...s.seats, ann: { ...s.seats.ann!, royalClaims: 2 } } };
    s = play(s, "ann", take);
    expect(getResult(s)?.text).toBe("Ann wins with 10 crowns!");

    const reds = DECK.filter((c) => c.color === "red" && c.points > 0);
    s = withCards(withBoard(newGame(), FULL), "ann", reds); // 1+1+2+2+1+1+4+3 = 15 in red
    s = play(s, "ann", take);
    expect(getResult(s)?.winners).toEqual(["ann"]);
  });
});

describe("views and status", () => {
  it("hides the decks and the opponent's reserve", () => {
    const view = getPlayerView(newGame(), "ann");
    expect(view.deckCounts).toEqual({ 1: 25, 2: 20, 3: 10 });
    expect(JSON.stringify(view)).not.toContain("drawPile");
  });

  it("says whose turn it is", () => {
    const s = newGame();
    expect(getStatus(s, "ann").text).toBe("Your turn: take tokens, reserve, or buy a card");
    expect(getStatus(s, "bob").text).toBe("Waiting for Ann");
  });
});

describe("random games", () => {
  it("keep 25 tokens, 3 Privileges and 67 cards, and mostly end with a winner", () => {
    let finished = 0;
    for (let seed = 1; seed <= 30; seed++) {
      let s = setup({ players: PLAYERS, rng: createRng(seed) }, configSchema.parse({}));
      const rng = createRng(seed * 13);
      for (let step = 0; step < 1500 && !getResult(s); step++) {
        const me = s.turn.players[s.turn.current]!;
        const moves = getLegalMoves(s, me);
        expect(moves.length).toBeGreaterThan(0);
        // Prefer buying, then taking 3, to keep games moving.
        const buys = moves.filter((m) => m.move.type === "buy");
        const takes = moves.filter((m) => m.move.type === "take" && m.move.cells.length >= 2);
        const pool =
          buys.length && rng.next() < 0.8 ? buys : takes.length && rng.next() < 0.7 ? takes : moves;
        s = play(s, me, rng.pick(pool).move);

        const held = Object.values(s.seats).reduce((n, seat) => n + tokenCount(seat), 0);
        expect(held + s.bag.length + s.board.filter((t) => t).length).toBe(25);
        const privileges = Object.values(s.seats).reduce((n, seat) => n + seat.privileges, 0);
        expect(privileges + s.privilegeSupply).toBe(3);
        const cards =
          Object.values(s.seats).reduce(
            (n, seat) => n + seat.cards.length + seat.reserved.length,
            0,
          ) +
          [1, 2, 3].reduce(
            (n, l) =>
              n +
              s.decks[l as 1 | 2 | 3].drawPile.length +
              s.pyramid[l as 1 | 2 | 3].filter((c) => c).length,
            0,
          );
        expect(cards).toBe(67);
        for (const seat of Object.values(s.seats)) {
          if (!s.pending) expect(tokenCount(seat)).toBeLessThanOrEqual(10);
        }
      }
      if (getResult(s)) finished++;
    }
    expect(finished).toBeGreaterThan(25);
    expect(COLORS).toHaveLength(5);
  });
});
