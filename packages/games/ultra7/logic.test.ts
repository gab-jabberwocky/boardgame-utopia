import { createRng } from "@utopia/kit";
import { describe, expect, it } from "vitest";
import { configSchema, type Config } from "./config.js";
import {
  applyMove,
  bustChance,
  cardsInPlay,
  decider,
  describeMove,
  fullDeck,
  getLegalMoves,
  getPlayerView,
  getResult,
  getStatus,
  handScore,
  nextCardOdds,
  setup,
  validateMove,
  type ActionKind,
  type Card,
  type Hand,
  type Move,
  type State,
} from "./logic.js";

const players = [
  { id: "ann", name: "Ann", color: "#f97316" },
  { id: "bob", name: "Bob", color: "#38bdf8" },
  { id: "cy", name: "Cy", color: "#a3e635" },
];

/** A fresh game where Cy deals, so Ann is dealt first and plays first. */
function newGame(config: Partial<Config> = {}, who = players): State {
  const state = setup({ players: who, rng: createRng(1) }, configSchema.parse(config));
  return { ...state, dealer: who.length - 1 };
}

type Spec = number | `+${number}` | "x2" | ActionKind;

function matches(card: Card, spec: Spec): boolean {
  if (typeof spec === "number") return card.kind === "number" && card.value === spec;
  if (spec === "x2") return card.kind === "double";
  if (spec.startsWith("+")) return card.kind === "bonus" && card.value === Number(spec.slice(1));
  return card.kind === "action" && card.action === spec;
}

/** Put these cards on top of the draw pile, in this order. */
function rig(state: State, ...specs: Spec[]): State {
  const pile = [...state.deck.drawPile];
  const top = specs.map((spec) => {
    const i = pile.findIndex((c) => matches(c, spec));
    if (i < 0) throw new Error(`rig: no ${spec} left in the draw pile`);
    return pile.splice(i, 1)[0] as Card;
  });
  return { ...state, deck: { ...state.deck, drawPile: [...top, ...pile] } };
}

const play = (state: State, player: string, move: Move): State => {
  const error = validateMove(state, player, move);
  if (error) throw new Error(`${player} ${JSON.stringify(move)}: ${error}`);
  return applyMove(state, player, move, { rng: createRng(7) });
};
const deal = (state: State, ...specs: Spec[]) =>
  play(rig(state, ...specs), decider(state) ?? "", { type: "deal" });
const hit = (state: State, player: string, ...specs: Spec[]) =>
  play(rig(state, ...specs), player, { type: "hit" });
const target = (state: State, player: string, who: string) =>
  play(state, player, { type: "target", target: who });

const values = (hand: Hand | undefined) =>
  hand?.numbers.map((c) => (c.kind === "number" ? c.value : -1));

/** A hand for scoring tests. */
function hand(numbers: number[], extras: Spec[] = [], standing: Hand["standing"] = "stayed"): Hand {
  const deck = fullDeck();
  const take = (spec: Spec) => deck.find((c) => matches(c, spec)) as Card;
  return {
    numbers: numbers.map(take),
    extras: extras.map(take),
    lifeRing: null,
    standing,
    bustCard: null,
  };
}

describe("the deck", () => {
  it("has 94 cards: 79 numbers, 6 score cards, 9 actions", () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(94);
    expect(deck.filter((c) => c.kind === "number")).toHaveLength(79);
    expect(deck.filter((c) => c.kind === "number" && c.value === 12)).toHaveLength(12);
    expect(deck.filter((c) => c.kind === "number" && c.value === 1)).toHaveLength(1);
    expect(deck.filter((c) => c.kind === "number" && c.value === 0)).toHaveLength(1);
    expect(deck.filter((c) => c.kind === "bonus" || c.kind === "double")).toHaveLength(6);
    expect(deck.filter((c) => c.kind === "action")).toHaveLength(9);
    expect(new Set(deck.map((c) => c.id)).size).toBe(94);
  });
});

describe("scoring (rulebook examples)", () => {
  it("11 + 5 + 12 with +4 is 32", () => {
    expect(handScore(hand([11, 5, 12], ["+4"]))).toBe(32);
  });
  it("×2 doubles the numbers first, then bonuses are added", () => {
    expect(handScore(hand([3, 11, 5, 7, 10]))).toBe(36);
    expect(handScore(hand([3, 11, 5, 7, 10], ["x2"]))).toBe(72);
    expect(handScore(hand([3, 11, 5, 7, 10], ["+10"]))).toBe(46);
    expect(handScore(hand([3, 11, 5, 7, 10], ["+10", "x2"]))).toBe(82);
  });
  it("seven different numbers score 15 more", () => {
    expect(handScore(hand([3, 11, 5, 7, 10, 9, 4], [], "fullHold"))).toBe(64);
  });
  it("a bonus card alone still scores, ×2 alone doesn't", () => {
    expect(handScore(hand([], ["+6"]))).toBe(6);
    expect(handScore(hand([], ["x2"]))).toBe(0);
  });
  it("going overboard scores nothing", () => {
    expect(handScore(hand([12, 11], ["+10"], "bust"))).toBe(0);
  });
});

describe("dealing", () => {
  it("the dealer deals one card to each player, starting on their left", () => {
    const s = deal(newGame(), 5, 8, 12);
    expect(values(s.hands.ann)).toEqual([5]);
    expect(values(s.hands.bob)).toEqual([8]);
    expect(values(s.hands.cy)).toEqual([12]);
    expect(decider(s)).toBe("ann");
    expect(getLegalMoves(s, "ann").map((m) => m.label)).toEqual(["Hit", "Stay · bank 5"]);
  });

  it("only the dealer may deal", () => {
    expect(validateMove(newGame(), "ann", { type: "deal" })).toMatch(/not your turn/);
  });

  it("an action card pauses the deal until it is played", () => {
    let s = deal(newGame(), 5, "anchor", 12);
    expect(s.pending).toMatchObject({ type: "target", player: "bob" });
    expect(s.hands.cy?.numbers).toEqual([]); // dealing waits
    s = target(s, "bob", "ann");
    expect(s.hands.ann?.standing).toBe("anchored");
    expect(values(s.hands.cy)).toEqual([12]);
    // Ann is out, so Bob plays first; he has no card in front of him, so he must hit.
    expect(decider(s)).toBe("bob");
    expect(getLegalMoves(s, "bob").map((m) => m.label)).toEqual(["Hit"]);
  });

  it("a player anchored before their deal is skipped", () => {
    let s = deal(newGame(), "anchor", 7, 9);
    s = target(s, "ann", "bob");
    expect(s.hands.bob?.numbers).toEqual([]);
    expect(values(s.hands.cy)).toEqual([7]);
  });
});

describe("hit and stay", () => {
  it("a duplicate number sends you overboard and the turn moves on", () => {
    let s = deal(newGame(), 5, 8, 12);
    s = hit(s, "ann", 5);
    expect(s.hands.ann?.standing).toBe("bust");
    expect(decider(s)).toBe("bob");
  });

  it("staying banks your points and you sit out the rest of the round", () => {
    let s = deal(newGame(), 5, 8, 12);
    s = hit(s, "ann", "+4");
    s = play(s, "bob", { type: "stay" });
    expect(s.hands.bob?.standing).toBe("stayed");
    expect(decider(s)).toBe("cy");
    s = play(s, "cy", { type: "stay" });
    expect(decider(s)).toBe("ann"); // Bob is skipped from now on
  });

  it("the round ends when nobody is left, and scores are added", () => {
    let s = deal(newGame(), 5, 8, 12);
    s = hit(s, "ann", "+4");
    s = play(s, "bob", { type: "stay" });
    s = hit(s, "cy", 12);
    s = play(s, "ann", { type: "stay" });
    expect(s.phase).toBe("roundOver");
    expect(s.roundScores).toEqual({ ann: 9, bob: 8, cy: 0 });
    expect(s.totals).toEqual({ ann: 9, bob: 8, cy: 0 });
  });

  it("the next dealer is on the old dealer's left, and old cards are discarded", () => {
    let s = deal(newGame(), 5, 8, 12);
    s = play(s, "ann", { type: "stay" });
    s = play(s, "bob", { type: "stay" });
    s = play(s, "cy", { type: "stay" });
    expect(getLegalMoves(s, "ann").map((m) => m.label)).toEqual(["Deal round 2"]);
    const drawBefore = s.deck.drawPile.length;
    s = deal(s, 1, 2, 3);
    expect(s.round).toBe(2);
    expect(s.dealer).toBe(0);
    expect(values(s.hands.bob)).toEqual([1]); // Bob is left of Ann
    expect(decider(s)).toBe("bob");
    expect(s.deck.drawPile).toHaveLength(drawBefore - 3);
    expect(s.deck.discardPile.filter((c) => c.kind === "number").length).toBe(3);
  });
});

describe("full hold", () => {
  it("seven different numbers end the round at once for everyone, +15", () => {
    let s = deal(newGame(), 1, 12, 11);
    s = hit(s, "ann", 2);
    s = hit(s, "bob", 10);
    s = play(s, "cy", { type: "stay" });
    for (const [a, b] of [
      [3, 9],
      [4, 8],
      [5, 0],
      [6, 6],
    ] as const) {
      s = hit(s, "ann", a);
      s = hit(s, "bob", b);
    }
    expect(s.phase).toBe("play");
    s = hit(s, "ann", 7);
    expect(s.hands.ann?.standing).toBe("fullHold");
    expect(s.phase).toBe("roundOver");
    // Ann: 1+2+...+7 = 28, +15. Bob was still in and banks what he had; Cy stayed on 11.
    expect(s.roundScores).toEqual({ ann: 43, bob: 45, cy: 11 });
    expect(describeMove(s, s, "ann", { type: "hit" }, "bob")).toMatchObject({
      tone: "good",
      flash: "Ann filled the hold! +15",
    });
  });
});

describe("life ring", () => {
  it("cancels a duplicate: both cards are discarded and you stay in", () => {
    let s = deal(newGame(), 5, 8, 12);
    s = hit(s, "ann", "lifeRing");
    expect(s.hands.ann?.lifeRing).not.toBeNull();
    s = play(s, "bob", { type: "stay" });
    s = play(s, "cy", { type: "stay" });
    s = hit(s, "ann", 5);
    expect(s.hands.ann?.standing).toBe("active");
    expect(s.hands.ann?.lifeRing).toBeNull();
    expect(values(s.hands.ann)).toEqual([5]);
    expect(s.deck.discardPile.map((c) => c.kind)).toEqual(["action", "number"]);
  });

  it("a spare Life Ring is discarded when nobody can take it", () => {
    let s = deal(newGame(), "lifeRing", 8, 12);
    s = play(s, "ann", { type: "stay" });
    s = hit(s, "bob", "lifeRing");
    s = play(s, "cy", { type: "stay" });
    // Ann and Cy stayed, so Bob's spare has nowhere to go.
    s = hit(s, "bob", "lifeRing");
    expect(s.pending).toBeNull();
    expect(s.events.some((e) => e.type === "fizzle")).toBe(true);
    expect(s.deck.discardPile.at(-1)).toMatchObject({ kind: "action", action: "lifeRing" });
  });

  it("a spare Life Ring is offered to other active players", () => {
    let s = deal(newGame(), "lifeRing", 8, 12);
    s = hit(s, "ann", "lifeRing");
    expect(s.pending).toMatchObject({ type: "giveRing", player: "ann" });
    expect(getLegalMoves(s, "ann").map((m) => m.label)).toEqual([
      "Give it to Bob",
      "Give it to Cy",
    ]);
    s = target(s, "ann", "cy");
    expect(s.hands.cy?.lifeRing).not.toBeNull();
    expect(decider(s)).toBe("bob");
  });
});

describe("anchor", () => {
  it("can be played on yourself to bank your points", () => {
    let s = deal(newGame(), 10, 8, 12);
    s = hit(s, "ann", "anchor");
    expect(getLegalMoves(s, "ann").map((m) => m.label)).toEqual([
      "Anchor yourself",
      "Anchor Bob",
      "Anchor Cy",
    ]);
    s = target(s, "ann", "ann");
    expect(s.hands.ann?.standing).toBe("anchored");
    expect(decider(s)).toBe("bob");
  });

  it("must be played on yourself when nobody else is active", () => {
    let s = deal(newGame(), 10, 8, 12);
    s = play(s, "ann", { type: "stay" });
    s = play(s, "bob", { type: "stay" });
    s = hit(s, "cy", "anchor");
    expect(getLegalMoves(s, "cy").map((m) => m.label)).toEqual(["Anchor yourself"]);
    s = target(s, "cy", "cy");
    expect(s.phase).toBe("roundOver");
    expect(s.roundScores).toEqual({ ann: 10, bob: 8, cy: 12 });
  });
});

describe("riptide", () => {
  it("makes the target take three cards", () => {
    let s = deal(newGame(), 10, 8, 12);
    s = rig(s, "riptide", 1, 2, 3);
    s = play(s, "ann", { type: "hit" });
    s = target(s, "ann", "bob");
    expect(values(s.hands.bob)).toEqual([8, 1, 2, 3]);
    expect(decider(s)).toBe("bob"); // Ann's turn is over
  });

  it("stops as soon as the target goes overboard", () => {
    let s = deal(newGame(), 10, 8, 12);
    s = rig(s, "riptide", 8, 2, 3);
    s = play(s, "ann", { type: "hit" });
    const drawBefore = s.deck.drawPile.length;
    s = target(s, "ann", "bob");
    expect(s.hands.bob?.standing).toBe("bust");
    expect(s.deck.drawPile.length).toBe(drawBefore - 1);
  });

  it("anchors drawn during it are played after all three cards", () => {
    let s = deal(newGame(), 10, 8, 12);
    s = rig(s, "riptide", "anchor", 1, 2);
    s = play(s, "ann", { type: "hit" });
    s = target(s, "ann", "bob");
    expect(values(s.hands.bob)).toEqual([8, 1, 2]);
    expect(s.pending).toMatchObject({ type: "target", player: "bob" });
    s = target(s, "bob", "cy");
    expect(s.hands.cy?.standing).toBe("anchored");
    expect(decider(s)).toBe("bob");
  });

  it("held cards are discarded if the target goes overboard", () => {
    let s = deal(newGame(), 10, 8, 12);
    s = rig(s, "riptide", "anchor", 8);
    s = play(s, "ann", { type: "hit" });
    s = target(s, "ann", "bob");
    expect(s.hands.bob?.standing).toBe("bust");
    expect(s.pending).toBeNull();
    expect(s.deck.discardPile.some((c) => c.kind === "action" && c.action === "anchor")).toBe(true);
  });

  it("a Life Ring drawn during it is kept and can save the next card", () => {
    let s = deal(newGame(), 10, 8, 12);
    s = rig(s, "riptide", "lifeRing", 8, 4);
    s = play(s, "ann", { type: "hit" });
    s = target(s, "ann", "bob");
    expect(s.hands.bob?.standing).toBe("active");
    expect(values(s.hands.bob)).toEqual([8, 4]);
  });

  it("chains: a held Riptide is played after the first one finishes", () => {
    let s = deal(newGame(), 10, 8, 12);
    s = rig(s, "riptide", "riptide", 1, 2, 3, 4, 5);
    s = play(s, "ann", { type: "hit" });
    s = target(s, "ann", "bob");
    expect(values(s.hands.bob)).toEqual([8, 1, 2]);
    s = target(s, "bob", "cy");
    expect(values(s.hands.cy)).toEqual([12, 3, 4, 5]);
  });
});

describe("running out of cards", () => {
  it("reshuffles only the discards; cards in front of players stay put", () => {
    let s = deal(newGame(), 5, 8, 12);
    const discarded = s.deck.drawPile.slice(1);
    s = { ...s, deck: { drawPile: s.deck.drawPile.slice(0, 1), discardPile: discarded } };
    s = play(s, "ann", { type: "hit" });
    s = play(s, "bob", { type: "hit" });
    expect(s.events[0]).toEqual({ type: "reshuffle" });
    expect(values(s.hands.ann)?.[0]).toBe(5);
    expect(s.deck.discardPile).toEqual([]);
  });

  it("ends the round, banking everyone still in, if no cards are left at all", () => {
    let s = deal(newGame(), 5, 8, 12);
    s = { ...s, deck: { drawPile: [], discardPile: [] } };
    s = play(s, "ann", { type: "hit" });
    expect(s.events.map((e) => e.type)).toEqual(["deckEmpty", "roundEnd"]);
    expect(s.roundScores).toEqual({ ann: 5, bob: 8, cy: 12 });
  });
});

describe("end of game", () => {
  function finishRoundWith(state: State, totals: Record<string, number>): State {
    let s = { ...deal(state, 1, 2, 3), totals };
    for (const id of ["ann", "bob", "cy"]) s = play(s, id, { type: "stay" });
    return s;
  }

  it("ends after the round where someone reaches the target; highest total wins", () => {
    const s = finishRoundWith(newGame(), { ann: 199, bob: 150, cy: 10 });
    expect(s.phase).toBe("over");
    expect(getResult(s)).toMatchObject({ winners: ["ann"], text: "Ann wins with 200 points!" });
    expect(getResult(s)?.ranking?.map((r) => r.player)).toEqual(["ann", "bob", "cy"]);
    expect(getStatus(s, "bob").activePlayers).toEqual([]);
    expect(getLegalMoves(s, "ann")).toEqual([]);
  });

  it("a tie at the top shares the win", () => {
    const s = finishRoundWith(newGame({ targetScore: 50 }), { ann: 60, bob: 59, cy: 0 });
    expect(getResult(s)).toMatchObject({ winners: ["ann", "bob"] });
  });

  it("keeps playing while nobody has reached the target", () => {
    const s = finishRoundWith(newGame(), { ann: 10, bob: 10, cy: 10 });
    expect(getResult(s)).toBeNull();
  });
});

describe("what players see", () => {
  it("hides the order of the draw pile", () => {
    const s = deal(newGame(), 5, 8, 12);
    const view = getPlayerView(s, "ann");
    expect(view).not.toHaveProperty("deck");
    expect(view.drawCount).toBe(91);
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(s.deck.drawPile.slice(0, 3)));
  });

  it("counts cards from public information only", () => {
    const s = deal(newGame(), 12, 12, 5);
    const view = getPlayerView(s, "ann");
    const odds = nextCardOdds(view);
    expect(odds.total).toBe(91);
    expect(odds.counts[12]).toBe(10);
    expect(bustChance(view, "cy")).toBeCloseTo(4 / 91);
  });

  it("describes moves per viewer, with a red flash for going overboard", () => {
    const before = deal(newGame(), 5, 8, 12);
    const after = hit(before, "ann", 5);
    const forAnn = describeMove(before, after, "ann", { type: "hit" }, "ann");
    const forBob = describeMove(before, after, "ann", { type: "hit" }, "bob");
    expect(forAnn.text).toBe("You hit: 5. A second 5! You went overboard.");
    expect(forBob.text).toBe("Ann hit: 5. A second 5! Ann went overboard.");
    expect(forBob).toMatchObject({ tone: "bad", flash: "Ann went overboard!" });
    expect(forBob.revealAfterMs).toBeGreaterThan(0);
    expect(forBob.pendingText).toBe("Ann is drawing…");
  });

  it("status text names who the game is waiting on", () => {
    const s = deal(newGame(), 5, 8, 12);
    expect(getStatus(s, "ann")).toEqual({
      text: "Your turn: hit or stay?",
      activePlayers: ["ann"],
    });
    expect(getStatus(s, "bob").text).toBe("Ann is deciding: hit or stay?");
    expect(getStatus(newGame(), "ann").text).toBe("Waiting for Cy to deal");
  });

  it("rejects moves out of turn", () => {
    const s = deal(newGame(), 5, 8, 12);
    expect(validateMove(s, "bob", { type: "hit" })).toMatch(/not your turn/);
    expect(validateMove(s, "ann", { type: "target", target: "bob" })).toMatch(/isn't allowed/);
  });
});

describe("random games", () => {
  it("always finish, never lose a card, and card counting matches the real deck", () => {
    for (let seed = 0; seed < 60; seed++) {
      const who = players.concat(
        seed % 3 === 0
          ? Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: "#fff" }))
          : [],
      );
      const rng = createRng(seed);
      let s = setup({ players: who, rng }, configSchema.parse({ targetScore: 150 }));
      let moves = 0;
      while (!getResult(s)) {
        const actor = decider(s);
        expect(actor).not.toBeNull();
        const legal = getLegalMoves(s, actor as string);
        expect(legal.length).toBeGreaterThan(0);
        const { move } = rng.pick(legal);
        expect(validateMove(s, actor as string, move)).toBeNull();
        s = applyMove(s, actor as string, move, { rng });

        const ids = [...s.deck.drawPile, ...s.deck.discardPile, ...cardsInPlay(s)].map((c) => c.id);
        expect(ids.sort((a, b) => a - b)).toEqual(fullDeck().map((c) => c.id));
        const view = getPlayerView(s, "spectator");
        const odds = nextCardOdds(view);
        const deckNumbers = (s.deck.drawPile.length ? s.deck.drawPile : s.deck.discardPile).filter(
          (c) => c.kind === "number",
        ).length;
        expect(odds.counts.reduce((a, b) => a + b, 0)).toBe(deckNumbers);
        expect(++moves).toBeLessThan(5000);
      }
    }
  });
});
