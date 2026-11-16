import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
// Works from both src/ (dev) and dist/ (prod): both sit one level below packages/server.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, "../../client/dist");

const { httpServer } = createApp({ clientDist });

httpServer.listen(port, () => {
  console.log(`boardgame-utopia server listening on http://localhost:${port}`);
});
