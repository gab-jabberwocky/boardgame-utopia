# Beachcomber

Set-collection card game for 2–4 players. Draw beach finds, play pairs for their
tricks, collect sets, and end the round when you think you're ahead.

| Term            | Meaning                                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deck            | 58 cards in 11 colours. Hands start empty; two piles start with one card each                                                                                          |
| Turn            | Draw 2, keep 1, discard 1 (to an empty pile if any) — or take a pile's top card                                                                                        |
| Pairs           | 1 point each, in hand or played. Play them for an effect:                                                                                                              |
| Gull + Gull     | Look through a discard pile and take any card                                                                                                                          |
| Surfer ×2       | Take another turn                                                                                                                                                      |
| Fisher ×2       | Draw the top card of the deck                                                                                                                                          |
| Pirate + Parrot | Steal a random card from another player                                                                                                                                |
| Sets            | Pebble 0/2/4/6/8/10 · Sand Dollar 0/3/6/9/12 · Puffin 1/3/5 · Lifeguard 0/5                                                                                            |
| Bonus cards     | Surf Shack 1 per Surfer · Fish Market 1 per Fisher · Puffin Cliff 2 per Puffin · Watchtower 3 per Lifeguard                                                            |
| Pearl           | Cards of your most common colour (each Pearl a different colour). All 4 wins                                                                                           |
| End a round     | With 7+ card points: Stop (all score their cards, no colour bonus) or Last chance                                                                                      |
| Last chance     | Others get one final turn (then their hand is safe). Caller still highest or tied: caller scores cards + colour bonus, others only colour bonus. Otherwise the reverse |
| Deck out        | If the deck is empty at the end of a turn, the round scores nothing                                                                                                    |
| Win             | 40 / 35 / 30 points (2 / 3 / 4 players); tie: higher score in the last round                                                                                           |

The colour of each card is this game's own assignment (the totals per colour match the
published counts, with green at 5). No extra turns during Last chance.

Settings: game length (standard, or long: double the target).

Files: `logic.ts` (rules), `config.ts` (settings), `Board.tsx` (UI), `doc.ts` (text
view), `logic.test.ts`.
