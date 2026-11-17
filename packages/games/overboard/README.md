# Overboard

Push-your-luck card game for 2–10 players. Draw cards into your hold, bank them, or go
overboard on a duplicate. First to 200 (after a full round) wins.

| Term      | Meaning                                                                       |
| --------- | ----------------------------------------------------------------------------- |
| Deck      | 94 cards: one 0, one 1, two 2s … twelve 12s, +2/+4/+6/+8/+10, ×2, 9 actions   |
| Hit       | Take the top card                                                             |
| Stay      | Bank this round's points and sit out the rest of the round                    |
| Overboard | A second card with the same number: 0 points this round                       |
| Full hold | 7 different numbers: +15, and the round ends for everyone at once             |
| Anchor    | Action: the target banks their points and is out of the round                 |
| Riptide   | Action: the target takes 3 cards; Anchors/Riptides drawn meanwhile wait       |
| Life Ring | Action: keep it; it cancels one duplicate. A spare must be passed on          |
| Scoring   | Sum of numbers, ×2 if you have it, then + bonus cards, then +15 for full hold |

Action cards go to any active player (yourself included). Each new round is dealt by
the player left of the last dealer; used cards are discarded, not shuffled back, until
the deck runs out.

Settings: points to win (default 200).

Files: `logic.ts` (rules), `config.ts` (settings), `Board.tsx` (UI), `logic.test.ts`.
