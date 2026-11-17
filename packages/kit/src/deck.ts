import type { Rng } from "@utopia/shared";

/**
 * A draw pile and a discard pile as plain data, safe to keep in game state.
 * `drawPile[0]` is the top card.
 */
export interface Deck<Card> {
  drawPile: Card[];
  discardPile: Card[];
}

/** A shuffled deck with an empty discard pile. */
export function createDeck<Card>(cards: readonly Card[], rng: Rng): Deck<Card> {
  return { drawPile: rng.shuffle(cards), discardPile: [] };
}

/** Shuffle the discard pile into the draw pile (under any cards still in it). */
export function reshuffleDiscard<Card>(deck: Deck<Card>, rng: Rng): Deck<Card> {
  return { drawPile: [...deck.drawPile, ...rng.shuffle(deck.discardPile)], discardPile: [] };
}

export interface DrawResult<Card> {
  deck: Deck<Card>;
  /** May be fewer than asked for if both piles ran out. */
  cards: Card[];
  /** True if the discard pile was shuffled in to keep drawing. */
  reshuffled: boolean;
}

/**
 * Draw `count` cards from the top. When the draw pile runs out, the discard pile
 * is shuffled to form a new one. Cards in play (not discarded) are never reshuffled.
 */
export function drawCards<Card>(deck: Deck<Card>, rng: Rng, count = 1): DrawResult<Card> {
  if (!Number.isInteger(count) || count < 0) throw new Error(`drawCards: bad count ${count}`);
  let current = deck;
  let reshuffled = false;
  const cards: Card[] = [];
  while (cards.length < count) {
    if (current.drawPile.length === 0) {
      if (current.discardPile.length === 0) break;
      current = reshuffleDiscard(current, rng);
      reshuffled = true;
    }
    const [top, ...rest] = current.drawPile;
    cards.push(top as Card);
    current = { ...current, drawPile: rest };
  }
  return { deck: current, cards, reshuffled };
}

/** Put cards face up on the discard pile. */
export function discardCards<Card>(deck: Deck<Card>, cards: readonly Card[]): Deck<Card> {
  return { ...deck, discardPile: [...deck.discardPile, ...cards] };
}
