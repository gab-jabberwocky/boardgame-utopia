import { createRng, createTurnOrder } from "@utopia/kit";
import { describe, expect, it } from "vitest";
import { configSchema, type Config } from "./config.js";
import {
  COLOURS,
  applyMove,
  cardScore,
  colourBonus,
  describeMove,
  fullDeck,
  getLegalMoves,
  getPlayerView,
  getResult,
  getStatus,
  setup,
  targetScore,
  validateMove,
  type Card,
  type Colour,
  type Kind,
  type Move,
  type State,
} from "./logic.js";

const PLAYERS = ["ann", "bob", "cy", "dee"].map((id) => ({
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  color: "#888",
}));

const DECK = fullDeck();

/** Fresh game, Ann to play, with the deck and piles as given (rest of the deck below). */
function newGame(n = 3, config: Partial<Config> = {}, seed = 1): State {
  const players = PLAYERS.slice(0, n);
  const s = setup({ players, rng: createRng(seed) }, configSchema.parse(config));
  return {
    ...s,
    turn: createTurnOrder(
      players.map((p) => p.id),
      0,
    ),
  };
}

/** Take real cards of these kinds (and colours) out of a fresh deck. */
function pick(...specs: (Kind | [Kind, Colour])[]): Card[] {
  const pool = [...DECK];
  return specs.map((spec) => {
    const [kind, colour] = Array.isArray(spec) ? spec : [spec, undefined];
    const i = pool.findIndex((c) => c.kind === kind && (!colour || c.colour === colour));
    if (i < 0) throw new Error(`no ${kind} ${colour ?? ""}`);
    return pool.splice(i, 1)[0]!;
  });
}

/** Set hands; the deck becomes every other card (top = last), piles as given. */
function rig(
  s: State,
  hands: Record<string, Card[]>,
  piles: [Card[], Card[]] = [[], []],
  deckTop: Card[] = [],
): State {
  const used = new Set(
    [...Object.values(hands).flat(), ...piles.flat(), ...deckTop].map((c) => c.id),
  );
  const rest = DECK.filter((c) => !used.has(c.id));
  return {
    ...s,
    hands: Object.fromEntries(s.players.map((p) => [p.id, hands[p.id] ?? []])),
    piles,
    deck: [...rest, ...[...deckTop].reverse()],
    step: "draw",
  };
}

const play = (s: State, player: string, move: Move, seed = 7): State => {
  const err = validateMove(s, player, move);
  if (err) throw new Error(`${player} ${JSON.stringify(move)}: ${err}`);
  return applyMove(s, player, move, { rng: createRng(seed) });
};
const turnOf = (s: State) => s.turn.players[s.turn.current];
const kinds = (cards: Card[]) => cards.map((c) => c.kind);

describe("cards", () => {
  it("has 58 cards with the right counts", () => {
    expect(DECK).toHaveLength(58);
    const n = (k: Kind) => DECK.filter((c) => c.kind === k).length;
    expect([n("gull"), n("surfer"), n("fisher"), n("pirate"), n("parrot")]).toEqual([
      9, 8, 7, 5, 5,
    ]);
    expect([n("pebble"), n("sandDollar"), n("puffin"), n("lifeguard")]).toEqual([6, 5, 3, 2]);
    expect([
      n("surfShack"),
      n("fishMarket"),
      n("puffinCliff"),
      n("watchtower"),
      n("pearl"),
    ]).toEqual([1, 1, 1, 1, 4]);
    const colours = COLOURS.map((c) => DECK.filter((d) => d.colour === c).length);
    expect(colours).toEqual([9, 9, 8, 8, 5, 4, 4, 4, 3, 3, 1]);
  });

  it("targets 40 / 35 / 30 points, doubled for a long game", () => {
    const config = configSchema.parse({});
    expect([2, 3, 4].map((n) => targetScore(n, config))).toEqual([40, 35, 30]);
    expect(targetScore(2, configSchema.parse({ length: "Long" }))).toBe(80);
  });
});

describe("scoring", () => {
  it("each pair of duo cards is 1 point, in hand or played", () => {
    const hand = pick("gull", "gull", "gull", "fisher", "pirate", "parrot", "surfer");
    expect(cardScore(hand, []).duos).toBe(2);
    expect(cardScore([], [pick("surfer", "surfer")]).duos).toBe(1);
  });

  it("collectors follow their tables", () => {
    const score = (k: Kind, n: number) => cardScore(pick(...Array<Kind>(n).fill(k)), []).collectors;
    expect([1, 2, 3, 4, 5, 6].map((n) => score("pebble", n))).toEqual([0, 2, 4, 6, 8, 10]);
    expect([1, 2, 3, 4, 5].map((n) => score("sandDollar", n))).toEqual([0, 3, 6, 9, 12]);
    expect([1, 2, 3].map((n) => score("puffin", n))).toEqual([1, 3, 5]);
    expect([1, 2].map((n) => score("lifeguard", n))).toEqual([0, 5]);
  });

  it("multipliers score per card of their kind, played ones included", () => {
    expect(cardScore(pick("surfShack", "surfer"), [pick("surfer", "surfer")]).multipliers).toBe(3);
    expect(cardScore(pick("fishMarket", "fisher", "fisher"), []).multipliers).toBe(2);
    expect(cardScore(pick("puffinCliff", "puffin", "puffin"), []).multipliers).toBe(4);
    expect(cardScore(pick("watchtower", "lifeguard", "lifeguard"), []).multipliers).toBe(6);
    expect(cardScore(pick("watchtower"), []).multipliers).toBe(0);
  });

  it("each Pearl scores a different colour: most common first", () => {
    const hand = pick(
      "pearl",
      "pearl",
      ["gull", "navy"],
      ["surfer", "navy"],
      ["fisher", "navy"],
      ["gull", "sky"],
      ["surfer", "sky"],
      ["pebble", "black"],
    );
    // navy 3, sky 2, white (the pearls) 2, black 1: 3 + 2
    expect(cardScore(hand, []).pearls).toBe(5);
    expect(colourBonus(hand)).toBe(3);
  });
});

describe("a turn", () => {
  it("draw 2, keep 1, discard the other; an empty pile must take it", () => {
    let s = rig(newGame(), {}, [pick("pebble"), []], pick("gull", "puffin"));
    s = play(s, "ann", { type: "draw" });
    expect(kinds(getPlayerView(s, "ann").drawn)).toEqual(["gull", "puffin"]);
    expect(getPlayerView(s, "bob").drawn).toEqual([]);
    const labels = getLegalMoves(s, "ann").map((m) => m.label);
    expect(labels).toEqual([
      "Keep Gull, Puffin to the right pile",
      "Keep Puffin, Gull to the right pile",
    ]);
    const gull = s.drawn[0]!;
    s = play(s, "ann", { type: "keep", card: gull.id, pile: 1 });
    expect(kinds(s.hands.ann!)).toEqual(["gull"]);
    expect(kinds(s.piles[1])).toEqual(["puffin"]);
    expect(s.step).toBe("act");
  });

  it("or take the top of a discard pile; then end the turn", () => {
    let s = rig(newGame(), {}, [pick("pebble", "lifeguard"), pick("gull")]);
    s = play(s, "ann", { type: "take", pile: 0 });
    expect(kinds(s.hands.ann!)).toEqual(["lifeguard"]);
    s = play(s, "ann", { type: "end" });
    expect(turnOf(s)).toBe("bob");
    expect(s.step).toBe("draw");
  });

  it("other players see pile tops only, and only counts of your hand", () => {
    const s = rig(newGame(), { ann: pick("pebble", "puffin") }, [pick("gull", "fisher"), []]);
    const v = getPlayerView(s, "bob");
    expect(v.pileTops[0]?.kind).toBe("fisher");
    expect(v.pileCounts).toEqual([2, 0]);
    expect(v.handCounts.ann).toBe(2);
    expect(v.hand).toEqual([]);
    expect(JSON.stringify(v)).not.toContain('"hands"');
    expect(v.pilesOpen).toBeNull();
  });
});

describe("duos", () => {
  const acting = (
    hands: Record<string, Card[]>,
    piles: [Card[], Card[]] = [pick("pebble"), []],
  ) => {
    let s = rig(newGame(), hands, piles);
    s = play(s, "ann", { type: "take", pile: 0 });
    return s;
  };

  it("Gulls: take any card from a discard pile, hidden from the others", () => {
    let s = acting({ ann: pick("gull", "gull") }, [
      pick("pebble", "watchtower", "puffin"),
      pick("surfer"),
    ]);
    s = play(s, "ann", { type: "duo", duo: "gull" });
    expect(getPlayerView(s, "ann").pilesOpen?.[0].map((c) => c.kind)).toEqual([
      "pebble",
      "watchtower",
    ]);
    expect(getPlayerView(s, "bob").pilesOpen).toBeNull();
    const tower = s.piles[0].find((c) => c.kind === "watchtower")!;
    const before = s;
    s = play(s, "ann", { type: "scavenge", card: tower.id });
    expect(kinds(s.hands.ann!)).toContain("watchtower");
    expect(s.played.ann).toHaveLength(1);
    expect(describeMove(before, s, "ann", { type: "scavenge", card: tower.id }, "bob").text).toBe(
      "Ann took a card from the left pile.",
    );
  });

  it("Surfers: take another turn", () => {
    let s = acting({ ann: pick("surfer", "surfer") });
    s = play(s, "ann", { type: "duo", duo: "surfer" });
    s = play(s, "ann", { type: "end" });
    expect(turnOf(s)).toBe("ann");
    expect(s.step).toBe("draw");
  });

  it("Fishers: draw the top card of the deck", () => {
    let s = rig(newGame(), { ann: pick("fisher", "fisher") }, [pick("pebble"), []], pick("puffin"));
    s = play(s, "ann", { type: "take", pile: 0 });
    s = play(s, "ann", { type: "duo", duo: "fisher" });
    expect(kinds(s.hands.ann!)).toEqual(["pebble", "puffin"]);
  });

  it("Pirate + Parrot: steal a random card; only thief and victim see which", () => {
    let s = acting({ ann: pick("pirate", "parrot"), bob: pick("lifeguard") });
    s = play(s, "ann", { type: "duo", duo: "pirate" });
    expect(getLegalMoves(s, "ann").map((m) => m.label)).toEqual(["Steal from Bob"]);
    const before = s;
    s = play(s, "ann", { type: "steal", target: "bob" });
    expect(kinds(s.hands.ann!)).toContain("lifeguard");
    expect(s.hands.bob).toEqual([]);
    const move: Move = { type: "steal", target: "bob" };
    expect(describeMove(before, s, "ann", move, "bob")).toMatchObject({
      text: "Ann stole Lifeguard (pink) from you.",
      tone: "bad",
    });
    expect(describeMove(before, s, "ann", move, "cy").text).toBe("Ann stole a card from Bob.");
  });

  it("a duo with nothing to take still scores, without effect", () => {
    let s = acting({ ann: pick("pirate", "parrot") });
    s = play(s, "ann", { type: "duo", duo: "pirate" });
    expect(s.step).toBe("act");
    expect(s.played.ann).toHaveLength(1);
  });
});

describe("ending a round", () => {
  /** Ann holds 2 Lifeguards (5) + 2 Gull pair (1) + Pebble x2 (2) = 8 points. */
  const ready = (bobHand: Card[]) => {
    let s = rig(
      newGame(3),
      {
        ann: pick(
          ["lifeguard", "pink"],
          ["lifeguard", "orange"],
          ["gull", "navy"],
          ["gull", "sky"],
          ["pebble", "navy"],
        ),
        bob: bobHand,
      },
      [pick(["pebble", "sky"]), []],
    );
    s = play(s, "ann", { type: "take", pile: 0 });
    return s;
  };

  it("needs 7 card points to call", () => {
    const s = ready([]);
    expect(getLegalMoves(s, "ann").map((m) => m.move.type)).toEqual([
      "duo",
      "end",
      "stop",
      "lastChance",
    ]);
    const short = rig(newGame(), { ann: pick("pebble") }, [pick("puffin"), []]);
    expect(
      getLegalMoves(play(short, "ann", { type: "take", pile: 0 }), "ann").map((m) => m.move.type),
    ).toEqual(["end"]);
  });

  it("Stop: everyone scores their cards, no colour bonus", () => {
    let s = ready(pick("puffin", "puffin"));
    s = play(s, "ann", { type: "stop" });
    expect(s.lastRound).toEqual({ ann: 8, bob: 3, cy: 0 });
    expect(s.step).toBe("roundOver");
    expect(turnOf(s)).toBe("bob"); // next round starts left of the caller
    expect(getPlayerView(s, "cy").shownHands.ann).toHaveLength(6);
  });

  it("Last chance won: caller scores cards + colour bonus, others only their colour bonus", () => {
    let s = ready(pick("puffin", "puffin"));
    s = play(s, "ann", { type: "lastChance" });
    expect(turnOf(s)).toBe("bob");
    for (const p of ["bob", "cy"]) {
      s = play(s, p, { type: "draw" });
      s = play(s, p, getLegalMoves(s, p)[0]!.move);
      s = play(s, p, { type: "end" });
    }
    expect(s.step).toBe("roundOver");
    // Ann: 8 points + colour bonus 2 (navy or sky)
    expect(s.lastRound!.ann).toBe(10);
    expect(s.lastRound!.bob).toBeLessThanOrEqual(2);
  });

  it("Last chance lost: caller gets only the colour bonus, others score their cards", () => {
    let s = ready(pick("puffin", "puffin", "puffin", "puffinCliff"));
    // Bob: 3 Puffins (5) + Cliff (6) = 11 > Ann's 8
    s = play(s, "ann", { type: "lastChance" });
    s = play(s, "bob", { type: "draw" });
    s = play(s, "bob", getLegalMoves(s, "bob")[0]!.move);
    expect(getPlayerView(s, "cy").shownHands.bob).toBeUndefined();
    s = play(s, "bob", { type: "end" });
    expect(getPlayerView(s, "cy").shownHands.bob).toBeDefined(); // safe and shown
    s = play(s, "cy", { type: "draw" });
    s = play(s, "cy", getLegalMoves(s, "cy")[0]!.move);
    s = play(s, "cy", { type: "end" });
    expect(s.lastRound!.ann).toBeLessThan(8);
    expect(s.lastRound!.bob).toBeGreaterThanOrEqual(11);
    expect(describeMove(s, s, "cy", { type: "end" }, "ann").text).toContain("The bet failed.");
  });

  it("a deck that runs out ends the round with no scoring", () => {
    let s = rig(newGame(), {}, [pick("pebble"), []]);
    s = { ...s, deck: s.deck.slice(-1) };
    s = play(s, "ann", { type: "draw" });
    expect(getLegalMoves(s, "ann")).toHaveLength(1); // only one card to keep
    s = play(s, "ann", getLegalMoves(s, "ann")[0]!.move);
    s = play(s, "ann", { type: "end" });
    expect(s.step).toBe("roundOver");
    expect(s.lastRound).toBeNull();
    expect(s.totals).toEqual({ ann: 0, bob: 0, cy: 0 });
    s = play(s, "bob", { type: "nextRound" });
    expect(s.round).toBe(2);
    expect(s.hands.ann).toEqual([]);
    expect(s.deck.length + s.piles[0].length + s.piles[1].length).toBe(58);
  });
});

describe("winning", () => {
  it("holding all 4 Pearls wins at once", () => {
    const pearls = pick("pearl", "pearl", "pearl", "pearl");
    let s = rig(newGame(), { ann: pearls.slice(0, 3) }, [[pearls[3]!], []]);
    s = play(s, "ann", { type: "take", pile: 0 });
    expect(getResult(s)).toMatchObject({
      winners: ["ann"],
      text: "Ann found all 4 Pearls and wins!",
    });
  });

  it("reaching the target ends the game; a tie goes to the bigger round", () => {
    let s = rig(newGame(2), { ann: pick("lifeguard", "lifeguard", "watchtower") }, [
      pick("pebble"),
      [],
    ]);
    s = { ...s, totals: { ann: 20, bob: 31 } };
    s = play(s, "ann", { type: "take", pile: 0 });
    s = play(s, "ann", { type: "stop" }); // ann 5 + 6 = 11 → 31, bob 0 → 31
    expect(s.totals).toEqual({ ann: 31, bob: 31 });
    expect(s.step).toBe("roundOver"); // 31 < 40
    s = {
      ...s,
      totals: { ann: 29, bob: 40 },
      step: "act",
      turn: createTurnOrder(["ann", "bob"], 0),
    };
    s = play(s, "ann", { type: "stop" });
    expect(getResult(s)?.winners).toEqual(["ann"]); // 40 each, Ann scored more this round
  });

  it("status and texts per viewer", () => {
    const s = rig(newGame(), {}, [pick("pebble"), []]);
    expect(getStatus(s, "ann").text).toBe("Your turn: draw 2 or take a discard");
    expect(getStatus(s, "bob").text).toBe("Ann is drawing");
  });
});

describe("random games", () => {
  it("always end and keep all 58 cards", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const n = 2 + (seed % 3);
      let s = newGame(n, {}, seed);
      const rng = createRng(seed * 7);
      for (let step = 0; step < 20000 && s.step !== "over"; step++) {
        const options = s.players.flatMap((p) =>
          getLegalMoves(s, p.id).map((m) => ({ p: p.id, m: m.move })),
        );
        expect(options.length).toBeGreaterThan(0);
        const calls = options.filter((o) => o.m.type === "stop" || o.m.type === "lastChance");
        const pick1 = calls.length && rng.next() < 0.5 ? rng.pick(calls) : rng.pick(options);
        s = applyMove(s, pick1.p, pick1.m, { rng: createRng(seed * 1000 + step) });
        const total =
          s.deck.length +
          s.piles[0].length +
          s.piles[1].length +
          s.drawn.length +
          Object.values(s.hands).flat().length +
          Object.values(s.played).flat(2).length;
        expect(total).toBe(58);
      }
      expect(s.step).toBe("over");
    }
  });
});
