import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { log } from "./log.js";

const port = Number(process.env.PORT ?? 3000);
// Works from both src/ (dev) and dist/ (prod): both sit one level below packages/server.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, "../../client/dist");

const { httpServer, io } = createApp({ clientDist });

httpServer.listen(port, () => {
  log("info", "listening", { url: `http://localhost:${port}` });
});

// Hosts send SIGTERM before replacing the container. Close sockets cleanly so
// browsers see a disconnect (and reconnect to the new server) instead of a hang.
let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log("info", "shutting_down", { signal });
  setTimeout(() => process.exit(0), 5000).unref();
  void io.close(() => process.exit(0));
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  log("error", "uncaught_exception", { err });
  process.exit(1);
});
