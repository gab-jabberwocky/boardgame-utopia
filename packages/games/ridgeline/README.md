# Ridgeline

Push-your-luck dice game for 2–4 players: climb 11 trails (2–12) with pairs of dice,
stop to make camp, or fall and lose the turn's progress. First to claim 3 peaks wins.

| Term    | Meaning                                                         |
| ------- | --------------------------------------------------------------- |
| Trail   | A column, numbered 2–12. Trail 7 has 13 steps, 2 and 12 have 3. |
| Climber | One of the 3 temporary markers used during a turn               |
| Camp    | A player's saved progress on a trail                            |
| Fall    | A roll with no legal climb: this turn's climbers are removed    |
| Peak    | The top step. A camp there claims the trail for good            |

Settings: peaks to win (3–5) and what happens when landing on another camp
(share the space, skip over it, or must roll again).

Files: `logic.ts` (rules), `config.ts` (settings), `Board.tsx` (UI), `logic.test.ts`.
