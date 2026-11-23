# Jewels Duel

Two-player gem trading game. Take tokens from a shared board, buy cards that give
permanent discounts, and race to 20 points, 10 crowns, or 10 points in one color.

| Term      | Meaning                                                                         |
| --------- | ------------------------------------------------------------------------------- |
| Tokens    | 25 on a 5×5 board: 4 each of white, blue, green, red, black; 2 Pearls; 3 Gold   |
| Cards     | 67 in 3 levels (30 / 24 / 13); a pyramid of 5 / 4 / 3 is face up                |
| Privilege | 3 in the game. Spend one to take any 1 non-Gold token (before refilling)        |
| Refill    | Optional: pour the bag onto empty spaces (spiral from the center); opponent +📜 |
| Take      | Up to 3 non-Gold tokens in a straight, unbroken line. 3 alike or 2 Pearls: +📜  |
| Reserve   | Take 1 Gold and a pyramid card or a deck's top card (hidden). Max 3 reserved    |
| Buy       | Pay the cost minus your bonuses; Gold is wild; spent tokens go to the bag       |
| Abilities | ↻ another turn · +◆ token of the card's color · 📜 Privilege · ✋ steal a token |
| Wild 🌈   | Joins the color of one of your cards (needs a card with a bonus)                |
| Crowns    | Your 3rd and 6th crown each earn a Royal card (points, some with an ability)    |
| Limit     | End your turn with at most 10 tokens                                            |
| Win       | At the end of your turn: 20 points, 10 crowns, or 10 points on one color        |

The card list is this game's own design: the rulebook gives the rules but not the
individual cards, so costs, points and abilities can be retuned in `logic.ts`.
Payment is automatic (matching tokens first, Gold for the rest).

Files: `logic.ts` (rules and cards), `config.ts` (no settings yet), `Board.tsx` (UI),
`logic.test.ts`.
