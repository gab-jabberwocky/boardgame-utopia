import { describe, expect, it } from "vitest";
import { createDeck, discardCards, drawCards, reshuffleDiscard } from "./deck.js";
import { createRng } from "./rng.js";

const cards = [1, 2, 3, 4, 5];

describe("deck", () => {
  it("shuffles every card into the draw pile", () => {
    const deck = createDeck(cards, createRng(1));
    expect([...deck.drawPile].sort()).toEqual(cards);
    expect(deck.discardPile).toEqual([]);
  });

  it("is deterministic for a seed", () => {
    expect(createDeck(cards, createRng("a"))).toEqual(createDeck(cards, createRng("a")));
  });

  it("draws from the top without changing the original", () => {
    const deck = { drawPile: [1, 2, 3], discardPile: [] };
    const { deck: after, cards: drawn, reshuffled } = drawCards(deck, createRng(1), 2);
    expect(drawn).toEqual([1, 2]);
    expect(after.drawPile).toEqual([3]);
    expect(reshuffled).toBe(false);
    expect(deck.drawPile).toEqual([1, 2, 3]);
  });

  it("reshuffles the discard pile when the draw pile runs out", () => {
    const deck = { drawPile: [1], discardPile: [7, 8, 9] };
    const { deck: after, cards: drawn, reshuffled } = drawCards(deck, createRng(1), 3);
    expect(drawn[0]).toBe(1);
    expect(drawn.slice(1).every((c) => [7, 8, 9].includes(c))).toBe(true);
    expect(after.drawPile).toHaveLength(1);
    expect(after.discardPile).toEqual([]);
    expect(reshuffled).toBe(true);
  });

  it("returns fewer cards when both piles are empty", () => {
    const { cards: drawn } = drawCards({ drawPile: [1], discardPile: [] }, createRng(1), 3);
    expect(drawn).toEqual([1]);
  });

  it("discards face up and reshuffles under the remaining draw pile", () => {
    const deck = discardCards({ drawPile: [1], discardPile: [2] }, [3, 4]);
    expect(deck.discardPile).toEqual([2, 3, 4]);
    const reshuffled = reshuffleDiscard(deck, createRng(1));
    expect(reshuffled.drawPile[0]).toBe(1);
    expect([...reshuffled.drawPile].sort()).toEqual([1, 2, 3, 4]);
  });

  it("rejects a bad count", () => {
    expect(() => drawCards({ drawPile: [], discardPile: [] }, createRng(1), -1)).toThrow();
  });
});
