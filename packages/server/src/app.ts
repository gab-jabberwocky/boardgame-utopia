import { createServer, type Server as HttpServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import { Server as SocketServer } from "socket.io";

export interface AppOptions {
  /** Folder with the built client. Served as static files with an SPA fallback, if it exists. */
  clientDist?: string;
}

export function createApp(options: AppOptions = {}): { httpServer: HttpServer; io: SocketServer } {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const { clientDist } = options;
  if (clientDist && existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  const httpServer = createServer(app);
  const io = new SocketServer(httpServer);

  io.on("connection", (socket) => {
    // Room manager and lobby events arrive in build step 3.
    socket.emit("hello", { serverTime: Date.now() });
  });

  return { httpServer, io };
}
