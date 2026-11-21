# Barista Panic

Coffee-shop game for 2–4 players. Walk your barista across the ingredient counter, pour
what you pick up into your 3 cups, and serve orders before they go stale. Serving
orders also floods your neighbours with new ones.

| Term     | Meaning                                                                             |
| -------- | ----------------------------------------------------------------------------------- |
| Counter  | 4×4 grid (A1–D4), 8 ingredients twice each. Tokens: 18 coffee, 12 of each other     |
| Orders   | 80 cards, 3–4 ingredients each. ★ specialty orders give a Rush token when served    |
| Start    | Starter: 2 orders on tab 1, 1 on tab 2. Others: 1 + 1. Place baristas, take a token |
| Upgrade  | Start of turn: spend 3 completed orders. Diagonal steps, Crowd, Corner, Specialty   |
| Walk     | 1–3 steps up/down/left/right, taking each cell's ingredient. Rush token = +1 step   |
| Baristas | You may pass over others (taking the ingredient) but not stop on them               |
| Pour     | Ingredients go into cups (and stay) or back to the supply. You may empty cups       |
| Serve    | A cup exactly matching an order completes it; the cup's tokens go back              |
| Too many | Each order served gives the next 2 players a new order on tab 1 (2p: the opponent)  |
| Time     | End of turn: orders move a tab; off tab 4 = penalty and a Rush token                |
| End      | Deck empty, 5 penalties, or no orders left: finish the round                        |
| Score    | +1 per completed order, +2 per upgrade, −1 per penalty. Ties: orders, then Rush     |

2 players: 2 baristas each (move one per turn), the Crowd bonus counts your own other
barista, and you draw an order at the end of each turn.

Settings: Easy start (everyone starts with one of the 4 easiest orders).

The counter layout and the 80 orders are this game's own design (the official card
list isn't public); the published component counts are kept.

Files: `logic.ts` (rules), `config.ts`, `Board.tsx` (UI), `doc.ts` (secret-mode text),
`logic.test.ts`.
