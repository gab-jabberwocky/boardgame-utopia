# Rules for coding agents

Read [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md) before scaffolding or making
architectural changes. The owner updates these rules often; they win over defaults.

## Scope

- When working on a game, only edit files inside `packages/games/<game-id>/`
  unless explicitly told otherwise.
- Start new games by copying `packages/games/_template/`.

## Game logic

- Game logic must stay pure: no `Math.random`, no `Date.now`, no `new Date()`,
  no I/O. All randomness comes from the seeded RNG passed in via context.
  ESLint enforces this in `packages/games/**` and `packages/kit/src/**`.
- State must be plain JSON-serializable data (no classes, Maps, Sets, functions).
- Hide other players' secret information in `getPlayerView`.
- Use `@utopia/kit` for randomness, dice, decks, and turn order. Do not
  reimplement them.
- Every rule change or bug fix adds or updates a test in `logic.test.ts`.
- Every game implements `getStatus` and `describeMove` with clear, short text,
  and `getResult` with a `text` that declares the winner. Implement
  `getLegalMoves` when the moves can be listed, so single-option turns become
  one tap. Text is per viewer and must not reveal hidden information.
- Never send moves without player action. Boards propose moves; the shell's
  `ActionBar` handles confirmation (see "Game screen feedback" in the brief).

## UI

- Mobile-first. Check new UI on a 375px-wide portrait viewport.

## Before opening a PR

```sh
npm run typecheck && npm run lint && npm test
```

`npm run format` fixes Prettier formatting issues reported by `npm run lint`.

## Repo conventions

- Workspace packages (`@utopia/*`) export TypeScript source directly; there is no
  per-package build. The server build bundles them into `packages/server/dist/index.js`.
- Tests live next to the code as `*.test.ts` and run with Vitest from the repo root.
- TypeScript is pinned to 6.0.x because typescript-eslint does not support 7 yet.
