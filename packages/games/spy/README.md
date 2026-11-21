# Spy

Social deduction for 4–8 players: find the secret word with yes/no questions, then
catch the Insider who knew it all along. All talking happens out loud; the app deals
the roles, shows the word to the right people, runs the timer and counts the votes.

| Term       | Meaning                                                                         |
| ---------- | ------------------------------------------------------------------------------- |
| Roles      | 1 Master (everyone knows who), 1 Insider (secret), the rest Commons             |
| Word       | Seen by the Master and the Insider. The Master may draw another before starting |
| Questions  | Ask the Master yes/no questions; answers only YES, NO or I DON'T KNOW           |
| Found      | The Master taps who said the word (the Guesser). Time runs out: everyone loses  |
| Discussion | As long as the questions took (like flipping the hourglass)                     |
| Vote 1     | All but the Guesser: is the Guesser the Insider? Ties are not a majority        |
| Vote 2     | Everyone points at a suspect (not themselves or the Master); tie → Guesser      |

| Vote 1                | Guesser is the Insider | Guesser is not |
| --------------------- | ---------------------- | -------------- |
| Majority says Insider | Master & Commons win   | Insider wins   |
| No majority           | Insider wins           | Go to vote 2   |

Vote 2: most votes on the Insider → Master and Commons win; otherwise the Insider wins.

The timer runs on each device and is a guide: the Master calls time.

Settings: minutes for questions (default 5).

Not yet: the advanced variant where there might be no Insider. The word list is this
game's own (`WORDS` in `logic.ts`).

Files: `logic.ts` (rules and words), `config.ts` (settings), `Board.tsx` (UI),
`logic.test.ts`.
