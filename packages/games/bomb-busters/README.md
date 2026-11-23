# Bomb Busters

This is the platform-native TypeScript port of the local Bomb Busters prototype. It follows the `GameModule` boundary: deterministic setup consumes the platform seeded RNG, moves are validated on the server, and `getPlayerView` removes opponents' uncut wire values and sort positions.

## Current port scope

The first port implements missions 1, 2, 3, 4, 6, and 8 setup, starting clues, ordinary dual calls, private-hand filtering, wrong-call clues and detonator loss, matching cuts, solo cuts, safe red reveal, status/action text, and a mobile-first React board.

This is not yet feature-complete with the standalone prototype. Shared equipment cards, the personal Double Detector, Walkie-Talkies exchanges, mission 8 candidate-marker presentation, and the tutorial mission-specific exceptions still need to be ported and tested before treating this module as a complete replacement. Add each rule change with a focused `logic.test.ts` case.

## Registering the module

Per the repository's `AGENTS.md`, game code stays in this folder. To make the game appear in the site, the repo owner must add these imports in `packages/client/src/games.ts` and append `defineGame(bombBusters, BombBustersBoard, bombBustersDecor)` to `GAMES`:

```ts
import bombBusters from "@utopia/game-bomb-busters";
import BombBustersBoard, { playerDecor as bombBustersDecor } from "@utopia/game-bomb-busters/Board";
```

The repository currently has no `packages/games/_template/`, despite the instructions referring to it; this package follows the existing `overboard` and `ridgeline` examples.
