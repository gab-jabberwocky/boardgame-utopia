# Dinner Dash

Cooperative memory game for 2–6 players. Memorize the café order together, then call
out the items everyone else is holding. Clear 7 levels of ever bigger orders to win.

Like poker, each player sees only their own hand; others show as face-down cards with a
count. Calls are spoken out loud and checked by the players: the holder taps the card
to serve it into the pool, or the caller taps "Nobody has it". The game enforces who
may serve and that the first holder clockwise from the caller serves.

| Term  | Meaning                                                                  |
| ----- | ------------------------------------------------------------------------ |
| Deck  | 84 order cards: 42 menu items, 2 of each                                 |
| Order | Level × players cards, read out once, then shuffled and dealt out evenly |
| Call  | Say an item out loud. Clockwise from you, the first other holder serves  |
| Pool  | Served cards, face up for all, stacked by item: "Latte ×2"               |
| Miss  | Nobody else holds it: the caller loses their ⭐ and shows ❌             |
| Clear | Enough empty hands (1 with 2 players, 2 with 3–4, 3 with 5–6)            |
| Lose  | Everyone is out of stars                                                 |
| Stars | 1 each (2 each with 2 players), refilled every level                     |

Players out of stars can't call, but still serve their cards.

Settings: levels to clear (default 7).

Not yet: ability cards (left to the players for now) and the competitive variant. The
menu items are this game's own; the real counts per item may differ from other editions.

Files: `logic.ts` (rules), `config.ts` (settings), `Board.tsx` (UI), `logic.test.ts`.
