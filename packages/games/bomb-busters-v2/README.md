# Bomb Busters

Cooperative wire-cutting game for 2–5 players. Work out which wires your teammates
hold and cut them in matching pairs before the detonator runs out.

Adapted from Yan Meng's original in `packages/games/bomb-busters` (unchanged). This copy
keeps Yan's rules and missions, adds power cards (a setting, on by default) and brings the
module up to this repo's game standard.

| Term        | Meaning                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| Wires       | 1–12 (four of each; fewer numbers in early missions), plus yellow (x.1) and red (x.5) wires between them |
| Stands      | 2 each with 2 players; the captain has 2 with 3 players; otherwise 1 each                                |
| Order       | Every stand is sorted low to high; only you see your own values                                          |
| Clues       | In seat order, reveal one non-red wire; at most 2 clues per number                                       |
| Call        | Name a value you hold on a teammate's wire                                                               |
| Right       | Their wire is cut, then you cut one of yours of that value                                               |
| Wrong       | The wire becomes a public clue and the detonator ticks (one step per player)                             |
| Red         | Calling on a red wire explodes the bomb                                                                  |
| Solo        | Holding every remaining copy (2 or 4) of a value: cut them all                                           |
| Reveal red  | Only red wires left on your stands: reveal them safely                                                   |
| Win         | Every wire cut. Lose: detonator full or a red wire cut                                                   |
| Double Scan | Power card: once per player, name one blue value on 2 wires of one teammate                              |
| Power cards | Unlock when 2 wires of their number are cut; once each; no action. Setting, on by default                |
| Twist       | Field ops: one special rule, shown at the top of the board                                               |

### Our rulings

| Case                   | Ruling                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Double/Triple Scan hit | The teammate privately chooses which matching wire is cut (always asked, so nobody learns how many matched); the caller then cuts one of theirs                                                                    |
| Scan miss              | The detonator ticks once; the teammate chooses which scanned non-red wire gets the clue                                                                                                                            |
| Scan with red          | One or two reds plus a non-red: no explosion, the clue goes on a non-red. All scanned wires red: it explodes                                                                                                       |
| Two-Tone Scan          | Two values on one wire; a match cuts it and the caller cuts one of their wires of the matching value                                                                                                               |
| Radar                  | Any player, any time in play, even out of turn. Public yes/no; yellow and red count as no                                                                                                                          |
| Swap Radios            | Any player, any time in play. One random uncut wire each way; clues travel with their wire; only the two players see the values                                                                                    |
| Dampener               | The active player arms it before a call or scan. That call: a miss doesn't tick, and all-red doesn't explode (no clue then). A non-red miss still gets its clue. Spent by the next call, or at the end of the turn |
| Clue tokens            | Starting clues stay capped at 2 per number; clues from wrong calls (yellow ones too) are never limited                                                                                                             |

### Missions

| #   | Name                   | Wires                           | Power cards                               | Twist                                   |
| --- | ---------------------- | ------------------------------- | ----------------------------------------- | --------------------------------------- |
| 1   | Training, day 1        | 1–6                             | Swap, Triple Scan, Radar, Double Scan     | —                                       |
| 2   | Training, day 2        | 1–8, 2 yellow                   | Those of 1, Dampener                      | —                                       |
| 3   | Training, day 3        | 1–10, 1 red                     | All five, Double Scan                     | —                                       |
| 4   | First day in the field | 1–12, 2 yellow, 1 red           | All five, Double Scan                     | —                                       |
| 6   | Third day in the field | 1–12, 4 yellow, 1 red           | All five, Double Scan                     | —                                       |
| 8   | Final Exam             | 1–12, 2 of 3 yellow, 1 of 2 red | All five, Double Scan                     | —                                       |
| F1  | Tool day               | 1–8, 1 red                      | Swap, Radar, Double Scan                  | Extra fuse: +1 detonator step           |
| F2  | Quiet start            | 1–10, 2 yellow, 1 red           | Triple Scan, Radar, Double Scan           | No starting clues                       |
| F3  | Silent misses          | 1–12, 2 yellow, 1 red           | Dampener, Two-Tone, Double Scan           | Wrong calls give no clue                |
| F4  | Short fuse             | 1–12, 2 yellow, 2 red           | Swap, Triple Scan, Dampener, Double Scan  | −1 detonator step (min 1)               |
| F5  | Hands on               | 1–12, 4 yellow, 1 red           | Swap, Radar, Two-Tone                     | No solo cuts while a teammate has wires |
| F6  | Twitchy dial           | 1–12, 2 of 3 yellow, 1 of 2 red | Triple Scan, Radar, Dampener, Double Scan | Every miss ticks twice                  |
| F7  | No echoes              | 1–12, 3 yellow, 2 red           | Swap, Dampener, Two-Tone, Double Scan     | Can't call the value just called        |
| F8  | Blackout               | 1–12, 2 of 4 yellow, 2 of 3 red | All five, Double Scan                     | Yellow/red markers hidden until the end |

Tool unlock numbers: Swap Radios 2, Triple Scan 4, Radar 6, Dampener 7, Two-Tone Scan 9.
Missions 1–8 get every power card whose number is in play; Field ops bring their own set.
With the Power cards setting off, there are none (Yan's original rules). The power cards,
Double Scan and Field ops are our own designs.

## Changes from the original

- Hidden information: other players' hidden wires no longer carry their colour (which
  gave yellow and red wires away), and mission 8's markers no longer say which
  candidates really hold a wire until the game ends.
- Text is per viewer ("You called 3 on Bea's wire 2") and names wires by position.
- Board: your stands as a panel in your colour, teammates compact; tap a teammate's
  wire, pick a value, then confirm; sticky confirm strip; detonator dots; "wires left
  per number" now counts cut wires (the original counted only values you could see);
  rules reference table; secret-mode text view (`doc.ts`). Yellow and red wires show
  their place between numbers (3.1, 4.5), and the counter lists them in order among
  the numbers. Stands stay on one row, or split into two even rows when long. Calls
  can start from your own wire; soloable wires glow green.
- If a player has no wire they can use as a starting clue, they skip (the original
  could get stuck).
- A red wire hit by a call is shown as cut.
- Tests: setup per mission and player count, hidden information, every rule, every
  tool and twist, and seeded random games across all 14 missions.
- Field ops F1–F8, Double Scan and five power cards (our additions, see above).

## Still to do

The tutorial missions' special exceptions from Yan's notes. Our own generic tools and
Double Scan above stand in for the shared equipment and personal scanner ideas.

Files: `logic.ts` (rules), `config.ts` (mission), `Board.tsx` (UI), `doc.ts`
(secret mode), `logic.test.ts`.
