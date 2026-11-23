# Triplets

Memory card game for 3–6 players. Reveal cards one at a time to find three of a kind;
a miss sends everything back face down, so remember what you saw.

| Term   | Meaning                                                                               |
| ------ | ------------------------------------------------------------------------------------- |
| Deck   | 36 cards, three each of 1–12                                                          |
| Deal   | 3 players: 9 each, 9 middle · 4: 7 / 8 · 5: 6 / 6 · 6: 5 / 6. Hands sorted, hidden    |
| Reveal | The lowest or highest card of any hand (yours too), or any face-down middle card      |
| Again  | Asking the same hand again shows its next card in                                     |
| Miss   | A different number ends your turn; tap "Put the cards back" once everyone has seen it |
| Trio   | Three alike: keep them and end your turn                                              |
| Win    | Simple: 3 trios. Spicy: 2 connected trios. The 7 trio always wins                     |

Spicy connections: two numbers are connected if they add up to 7 or are 7 apart
(2 with 5 and 9, 3 with 4 and 10, 6 with 1 …), worked out from the rulebook's examples.

The move log never names revealed numbers (only trios): remembering them is the game.

Not yet: the team variant for 4 or 6 players.

Files: `logic.ts` (rules), `config.ts` (mode), `Board.tsx` (UI), `logic.test.ts`.
