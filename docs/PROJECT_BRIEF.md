# boardgame-utopia — Project Brief

This is the source of truth for decisions made before development started.
Coding agents: read this fully before scaffolding or making architectural changes.

## Goal

A private website for playing board games with friends. Not public-facing,
but reachable by URL. Players are guests only: no accounts, no login.

## Team

- **Owner / overseer:** sets code guidelines, reviews and merges every PR.
- **Game developer:** strong board game knowledge, not a software background.
  Builds and fixes game logic using coding agents. Must be able to work
  entirely inside one game's folder without touching lobby or networking code.

## Constraints

- Up to 10 players per lobby. Usually only 1 active session at a time.
- Mobile-first: most players will be on phones, in portrait.
- Hosts pick game settings before starting (variant, player count, options).
- No database. All room and game state lives in server memory.
  A redeploy ends active games; that is accepted.

## Stack

| Part        | Choice                                         |
|-------------|------------------------------------------------|
| Language    | TypeScript everywhere, strict mode             |
| Repo        | npm workspaces monorepo                        |
| Client      | React + Vite + Tailwind CSS                    |
| Server      | Node + Socket.IO (no Colyseus, no boardgame.io)|
| Validation  | Zod (also drives auto-generated settings forms)|
| Tests       | Vitest                                         |
| Lint/format | ESLint + Prettier                              |
| Node        | 22 LTS                                         |
| Hosting     | Single Docker container on Render or Railway (not yet decided) |

## Repo structure

```
boardgame-utopia/
├── AGENTS.md               # rules for coding agents (owner updates often)
├── CLAUDE.md               # one line pointing to AGENTS.md
├── docs/PROJECT_BRIEF.md   # this file
├── packages/
│   ├── shared/             # types, the GameModule contract, socket event types
│   ├── kit/                # reusable game component library (see below)
│   ├── server/             # Socket.IO, room manager, lobby; serves built client
│   ├── client/             # React app: home, lobby, game shell, /sandbox
│   └── games/
│       ├── _template/      # copied to start every new game
│       └── <game-id>/
│           ├── logic.ts        # pure rules only
│           ├── config.ts       # Zod settings schema
│           ├── Board.tsx       # this game's UI
│           ├── logic.test.ts
│           └── index.ts        # exports the GameModule
├── Dockerfile
├── .dockerignore
└── .github/workflows/{ci.yml,deploy.yml}
```

Root npm scripts required by CI: `typecheck`, `lint`, `test`, `build`, `dev`.
Server builds to `packages/server/dist/index.js`, listens on `process.env.PORT`
(default 3000), serves `packages/client/dist`, and exposes `GET /health`.

## The GameModule contract

Every game exports exactly one object implementing this. The server is generic
and knows nothing about specific games.

```ts
export interface GameModule<State, Move, Config> {
  id: string;
  name: string;
  description: string;      // one sentence shown when picking a game
  minPlayers: number;
  maxPlayers: number;
  configSchema: ZodSchema<Config>;
  setup(ctx: SetupContext, config: Config): State;   // ctx has players + seeded rng
  validateMove(state: State, player: PlayerId, move: Move): string | null;
  applyMove(state: State, player: PlayerId, move: Move, ctx: MoveContext): State;
  getPlayerView(state: State, player: PlayerId | "spectator"): unknown;
  getResult(state: State): GameResult | null;         // null = still playing

  // Player feedback (see "Game screen feedback" below)
  getStatus(state: State, viewer: Viewer): GameStatus;
  describeMove(before: State, after: State, player: PlayerId, move: Move,
               viewer: Viewer): ActionDescription;
  // Every move this player may make now, with button text. One entry = one-tap action.
  getLegalMoves?(state: State, player: PlayerId): { move: Move; label: string }[];
}

type Viewer = PlayerId | "spectator";

interface GameStatus {
  text: string;                 // "Roll the dice", "Waiting for Bob to play"
  activePlayers: PlayerId[];    // who the game is waiting on (can be several)
}

interface ActionDescription {
  text: string;                 // "Alice rolled 4 + 6 and moved to Park Lane"
  highlight?: string[];         // ids of board elements the Board should highlight
  tone?: "normal" | "good" | "bad"; // styles the strip: gold for big wins, red for setbacks
  flash?: string;               // short headline popped over the screen: "Bob fell!"
  revealAfterMs?: number;       // hold the result back (dice tumbling) ...
  pendingText?: string;         // ... showing this meanwhile: "Bob is rolling…"
}

interface GameResult {
  winners: PlayerId[];          // empty = no winner (e.g. everyone lost)
  ranking?: { player: PlayerId; score?: number }[];
  text: string;                 // "Alice wins with 42 points", "Draw"
}
```

Rules for game logic:
- Pure functions. No `Math.random`, no `Date.now`, no I/O. All randomness comes
  from the seeded RNG passed in via context.
- State must be plain JSON-serializable data (no classes, Maps, functions).
- Hidden information (hands, decks) is removed in `getPlayerView`. The client
  must never receive another player's hidden data.
- The server is authoritative: it validates every move before applying it.
- `describeMove` and `getStatus` are called per viewer, so text never leaks
  hidden info ("You drew the Queen of Hearts" vs "Alice drew a card").

## Game screen feedback

The game shell (in `client`, not in each game) provides these for every game,
using kit components. Games only supply the data through the contract above.

1. **Last action.** After every move the server calls `describeMove` and sends
   each player their version. The shell shows it in a strip above the board
   ("Alice rolled 4 + 6"), and the Board highlights the elements listed in
   `highlight` (for example a pulsing outline) until the next move. Tapping the
   strip opens the recent action history (last ~20 entries).
2. **Status banner.** `TurnBanner` shows `getStatus` text at the top:
   "Your turn: roll the dice" (accented when the viewer is in `activePlayers`)
   or "Waiting for Bob". `PlayerList` marks the active players.
3. **Game over.** When `getResult` returns a result, the shell shows a game over
   screen over the board: winner(s) declared, ranking with scores if given,
   and for the host a "Back to lobby" button. The final board stays viewable.
4. **Action confirmation.** Moves are proposed, then confirmed:
   - Tapping something on the board (Board calls `propose(move, label)`) or one
     of the listed legal-move buttons proposes a move. `ActionBar` then shows
     "Confirm: Play 7 of Hearts" with Confirm and Cancel. Nothing is sent to
     the server until Confirm.
   - If `getLegalMoves` returns exactly one move, there is nothing to choose,
     so the confirm step is skipped. The player still has to tap the single
     big action button ("Roll dice") themselves, so they see what they did.
     Moves are never executed automatically on a player's behalf.
   - A legal move marked `where: "board"` is shown and confirmed by the game's
     Board itself (e.g. dice combinations, with Confirm right above them). The
     bottom bar hides when only board moves are available.
5. **Suspense and big moments.** Dice tumble (kit `DiceTray`) for `revealAfterMs`;
   until then the banner, last-action strip and buttons show `pendingText` and
   the Board gets `revealing: true`, so nobody sees the result early. Actions
   with a `flash` pop a headline (kit `EventFlash`): red for setbacks, gold for
   big wins. The strip and history are coloured by `tone`.
6. **Large screens.** Phones get the portrait column. From 640px wide the game
   area widens (up to 72rem) and Boards can switch to a wide layout with
   Tailwind container queries (`@2xl:`). −/+ zoom controls (remembered per
   device) scale the whole game screen; Boards that size by `dvh` divide by
   the `--stage-zoom` CSS variable.

## Kit: reusable game component library (`packages/kit`)

Shared building blocks so every game is built the same way. All logic pieces
are pure and use the seeded RNG.

Logic:
- `rng` — seeded random generator (`int`, `pick`, `shuffle`); state is serializable
- `dice` — roll N dice of any sides, return values and total
- `deck` — create, shuffle, draw, deal to players, discard pile, reshuffle discard
- `turns` — turn order with next, skip, reverse direction, eliminate player
- `phases` — simple named phase/step tracking within a round
- `grid` — 2D board coordinates, neighbors, bounds (for tile/board games)

UI (React, mobile-first, large touch targets), imported from `@utopia/kit/ui`
so the server never pulls in React:
- `Die`, `DiceTray`
- `Card`, `Hand` (fanned, tap to select), `CardPile`
- `PlayerList` (whose turn, scores, works for 10 players on a phone)
- `TurnBanner` (status text), `LastAction` (last move strip + history)
- `ActionBar` (bottom-pinned primary actions, propose → confirm flow)
- `GameOver` (winner declaration, ranking, back to lobby)
- `SettingsForm` (auto-generated from a Zod schema)

Every kit function has unit tests. Games import from `@utopia/kit`; they do not
reimplement shuffling, dice, or turn order.

## Lobby flow

1. Home: "Create game" or "Join with code".
2. Create: pick a game from the library, fill the settings form (generated from
   `configSchema`, including player count), get a 4-letter room code + share link.
3. Join: enter code or open link, enter a display name and pick a colour
   (kit `PlayerChoice`, palette `PLAYER_COLORS` in shared). Names (ignoring case)
   and colours are unique per room: taken colours are crossed out, clashes are
   explained, and the server re-checks with `validatePlayerChoice`. New players
   get the first free colour by default. Games use `player.color` for pieces.
4. Guest identity: random guest ID stored in the browser so a refresh or locked
   phone rejoins the same seat. In dev, use per-tab storage so each tab is a
   separate player.
5. Host sees joined players and presses Start when player count is valid.
6. Host can return the room to the lobby after a game ends to play again.

## Testing mode (sandbox)

Route `/sandbox`, available only in `npm run dev`. Not part of production builds.

- Runs game logic directly in the browser; no server needed.
- Pick game, settings, and player count (fake players P1–P10).
- Seat switcher: view and act as any player, seeing exactly their view.
- God view: full state including hidden info (JSON inspector + board).
- Side-by-side mode: several player views at once on wide screens.
- Undo, restart, move log, and a seed input to replay the same shuffle.
- Replay: step through any game move by move (← → keys, Home/End, Space to
  auto-play, or on-screen buttons), seeing exactly what each seat saw. Tap a
  move in the log to jump to it; "Play from here" drops later moves.
- Simulate: play random legal moves to the end (from the start or the current
  move), then replay them. Seeded, so the same seed gives the same game. Needs
  the game to implement `getLegalMoves`.

Also supported: running the dev server and joining from multiple tabs, or from
a phone on the same Wi-Fi (`vite --host`), to test real networking.

## Deployment

Already written: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`,
`Dockerfile`, `.dockerignore`.

- PRs run typecheck, lint, test, build, and a Docker build.
- Merge to `main` reruns checks, then deploys via Render deploy hook
  (`RENDER_DEPLOY_HOOK_URL` secret) or Railway CLI (`RAILWAY_TOKEN` secret +
  `RAILWAY_SERVICE` variable). The host's own auto-deploy must be off.
- `main` is protected: PR required, "Typecheck, lint, test, build" must pass.

## Initial AGENTS.md rules (owner will expand)

- When working on a game, only edit files inside `packages/games/<game-id>/`
  unless explicitly told otherwise.
- Game logic must stay pure (see contract rules above).
- Use `@utopia/kit` for randomness, dice, decks, and turn order.
- Every rule change or bug fix adds or updates a test in `logic.test.ts`.
- Check new UI on a 375px-wide portrait viewport.
- Run `npm run typecheck && npm run lint && npm test` before opening a PR.
- Start new games by copying `packages/games/_template/`.

## Build order

1. Monorepo scaffold, tooling, root scripts; CI passes on an empty project.
2. `shared` contract types + `kit` logic modules with tests.
3. Server: room manager, Socket.IO events, lobby, generic move handling.
4. Client: home, create/join, lobby, game shell; mobile-first layout.
5. `kit` UI components.
6. `_template` game + one small example game end to end.
7. Sandbox.
8. AGENTS.md, CLAUDE.md, README with dev setup for the game developer.

## Open decisions

- Hosting: Render (free, sleeps when idle) vs Railway (~$5/month, always on).
- First real game to implement after the example.
