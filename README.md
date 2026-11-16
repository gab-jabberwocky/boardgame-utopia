# boardgame-utopia

A private website for playing board games with friends. Guests only, no accounts.
See [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md) for the design and
[AGENTS.md](AGENTS.md) for coding rules.

## Setup

Requires Node 22 (see `.nvmrc`).

```sh
npm install
npm run dev
```

`npm run dev` starts the game server on http://localhost:3000 and the client on
http://localhost:5173. Open the client URL. To test from a phone on the same
Wi-Fi, use the "Network" URL that Vite prints.

## Scripts

| Script              | What it does                             |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Server and client with live reload       |
| `npm run typecheck` | TypeScript checks for every package      |
| `npm run lint`      | ESLint and Prettier check                |
| `npm run format`    | Fix formatting with Prettier             |
| `npm test`          | Run all Vitest tests                     |
| `npm run build`     | Build client and server for production   |
| `npm start`         | Run the production build (after `build`) |

## Packages

| Package           | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `packages/shared` | Types, the GameModule contract, socket event types |
| `packages/kit`    | Reusable game logic and UI components              |
| `packages/server` | Socket.IO server, rooms, lobby; serves the client  |
| `packages/client` | React app                                          |
| `packages/games`  | One folder per game                                |
