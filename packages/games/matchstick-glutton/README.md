# Matchstick Glutton

Climbing card game for 2–8 players with digital-clock numbers 0–F. Beat each play with
a stronger set, bend cards into other numbers with matchsticks, and get rid of all
your cards and all your matchsticks to win.

| Term       | Meaning                                                                           |
| ---------- | --------------------------------------------------------------------------------- |
| Deck       | 56 cards: 0 1 2 3 4 5 6 7 8 A b C d F, 4 each (3 doubles as E, 6 as 9)            |
| Deal       | 2–3 players: 15 cards each. 4+: the whole deck. Everyone starts with 1 matchstick |
| Lead       | Play 1–5 cards of one number (the leader can't pass)                              |
| Beat       | Same number of cards, stronger number. Order: 0 weakest … F strongest             |
| Pass       | Take a matchstick. You may still play later in the same trick                     |
| Change     | Turn a card upside down and/or add your own matchsticks as segments               |
| Trick      | When all others passed, the last player clears it and leads                       |
| Top number | Playing the strongest number ends the trick; everyone else takes a matchstick     |
| Revolution | 5 of a kind (4 with the house rule) reverses the order; another one reverses back |
| Out        | No cards and no matchsticks. No cards left: return 1 matchstick per turn          |

Changes use 7-segment digits: a card can become any number whose segments include
all of its own (upright or upside down); each new segment costs one matchstick
(a 4 plus 2 sticks is a 9; an upside-down 3 is an E; only a 1 can become F).
Worked out from the rulebook's examples, which this rule reproduces.

Settings: revolution with 5 cards (standard) or 4.

Files: `logic.ts` (rules), `config.ts` (settings), `Board.tsx` (UI), `logic.test.ts`.
