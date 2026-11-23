# Jewels

Gem trading race for 2–4 players. Collect gems, buy cards that make later cards
cheaper, attract Patrons, and be the richest when someone reaches 15 points.

| Term    | Meaning                                                                         |
| ------- | ------------------------------------------------------------------------------- |
| Gems    | White, blue, green, red, black: 4 each (2 players), 5 (3), 7 (4); plus 5 Gold   |
| Cards   | 90 in 3 levels (40 / 30 / 20), 4 face up per level. Bonus colour, points, cost  |
| Take    | 3 gems of different colours (fewer only if fewer colours are left)              |
| Double  | 2 gems of one colour, only from a pile of 4 or more                             |
| Reserve | A face-up card or a deck's top card (hidden from others) + 1 Gold if any. Max 3 |
| Buy     | Cost minus your bonuses; Gold is wild; spent tokens go back; the slot refills   |
| Limit   | End your turn with at most 10 tokens (you choose what to return)                |
| Patron  | 10 in the game, players + 1 on the table. 3 points; visits at the end of a turn |
|         | when your bonuses meet the need. One per turn; your choice if several qualify   |
| End     | Someone reaches the target: finish the round so everyone has the same turns     |
| Winner  | Most points; tie → fewer cards bought; still tied → shared win                  |

House rule for safety: if no one can do anything, players pass; a full round of passes
ends the game.

The card and Patron lists are this game's own design (`DESIGNS` and `allPatrons` in
`logic.ts`), balanced by level and spread evenly over the colours.

Settings: points to win (default 15).

Files: `logic.ts` (rules and cards), `config.ts` (settings), `Board.tsx` (UI), `doc.ts`
(secret-mode text view), `logic.test.ts`.
