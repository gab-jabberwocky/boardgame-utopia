# Glass

Tile-drafting game for 2–4 players: take coloured glass from the factories, fill your
pattern lines, and set tiles into your window for points.

| Term    | Meaning                                                                             |
| ------- | ----------------------------------------------------------------------------------- |
| Tiles   | 100: 20 each of amber, cobalt, ruby, jade, onyx (letters A C R J O in secret mode)  |
| Factory | 5 / 7 / 9 for 2 / 3 / 4 players, 4 tiles each per round from the bag                |
| Take    | All tiles of one colour from one factory (rest to the centre) or from the centre    |
| Marker  | First to take from the centre also takes it (a floor tile) and starts next round    |
| Lines   | 5 pattern lines holding 1–5 tiles; one colour each; not a colour already in its row |
| Floor   | Extras land here: −1 −1 −2 −2 −2 −3 −3; past 7 to the lid. Never below 0 points     |
| Tiling  | Round end: each full line sets one tile; alone 1, else row run + column run         |
| Lid     | Used tiles; refills the bag when it empties                                         |
| End     | After a round in which someone completes a wall row                                 |
| Bonuses | +2 per full row, +7 per full column, +10 per colour with all 5 placed               |
| Winner  | Most points; tie → more full rows; still tied → shared                              |

The wall uses the fixed colour pattern (each row shifted by one). Not yet: the
free-wall variant.

Files: `logic.ts` (rules), `config.ts` (no settings), `Board.tsx` (UI), `doc.ts`
(secret-mode text view), `logic.test.ts`.
