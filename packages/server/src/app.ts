import { createServer, type Server as HttpServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import { Server as SocketServer, type Socket } from "socket.io";
import { GAME_MODULES } from "@utopia/catalog";
import {
  isRoomCode,
  normalizeRoomCode,
  type Ack,
  type AnyGameModule,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@utopia/shared";
import { RoomManager } from "./rooms.js";

export interface AppOptions {
  /** Folder with the built client. Served as static files with an SPA fallback, if it exists. */
  clientDist?: string;
  /** Games on offer (defaults to every game in the catalog). */
  games?: readonly AnyGameModule[];
}

interface SocketData {
  token: string;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type AnyAck = (res: Ack<object>) => void;

const SWEEP_MS = 10 * 60 * 1000;

export function createApp(options: AppOptions = {}) {
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

  const httpServer: HttpServer = createServer(app);
  const io = new SocketServer<ClientToServerEvents, ServerToClientEvents, object, SocketData>(
    httpServer,
  );
  const rooms = new RoomManager({ games: options.games ?? GAME_MODULES });

  const sweeper = setInterval(() => rooms.sweep(), SWEEP_MS);
  sweeper.unref();
  httpServer.on("close", () => clearInterval(sweeper));

  // Every connection carries the guest token kept in the browser.
  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token === "string" && /^[\w-]{8,64}$/.test(token)) {
      socket.data.token = token;
      next();
    } else {
      next(new Error("Missing guest token"));
    }
  });

  /** Send everyone following a room their own view of it. */
  function broadcast(code: string) {
    for (const id of io.sockets.adapter.rooms.get(code) ?? []) {
      const socket = io.sockets.sockets.get(id) as GameSocket | undefined;
      const view = socket && rooms.view(code, socket.data.token);
      if (socket && view) socket.emit("room:state", view);
    }
  }

  io.on("connection", (socket: GameSocket) => {
    const { token } = socket.data;
    let watching: string | null = null;

    const stopWatching = () => {
      if (!watching) return;
      const code = watching;
      watching = null;
      void socket.leave(code);
      rooms.disconnect(code, token);
      broadcast(code);
    };

    /** Run a room action from this socket, answer it, and update everyone if it worked. */
    const handle = <R extends Ack<object>>(
      ack: unknown,
      code: string | null,
      act: (code: string) => R,
    ) => {
      const reply = typeof ack === "function" ? (ack as AnyAck) : () => {};
      if (!code || !rooms.has(code)) return reply({ ok: false, error: "No room with that code." });
      const res = act(code);
      reply(res);
      if (res.ok) broadcast(code);
      return res;
    };

    const codeOf = (req: unknown) => {
      const raw = (req as { code?: unknown } | null)?.code;
      if (typeof raw !== "string") return null;
      const code = normalizeRoomCode(raw);
      return isRoomCode(code) ? code : null;
    };
    const str = (v: unknown) => (typeof v === "string" ? v : "");

    socket.on("room:create", (req, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      reply(rooms.create(token, str(req?.gameId), req?.config));
    });

    socket.on("room:watch", (req, ack) => {
      const code = codeOf(req);
      const reply = typeof ack === "function" ? ack : () => {};
      if (!code || !rooms.has(code)) return reply({ ok: false, error: "No room with that code." });
      if (watching !== code) {
        stopWatching();
        watching = code;
        void socket.join(code);
        rooms.connect(code, token);
      }
      reply({ ok: true });
      broadcast(code);
    });

    socket.on("room:join", (req, ack) => {
      handle(ack, codeOf(req), (code) => rooms.join(code, token, str(req?.name), str(req?.color)));
    });

    socket.on("room:leave", (req, ack) => {
      handle(ack, codeOf(req), (code) => rooms.leave(code, token));
    });

    socket.on("room:kick", (req, ack) => {
      handle(ack, codeOf(req), (code) => {
        const res = rooms.kick(code, token, str(req?.player));
        if (res.ok) {
          // Tell the removed player's screens, and stop sending them this room.
          for (const id of io.sockets.adapter.rooms.get(code) ?? []) {
            const other = io.sockets.sockets.get(id) as GameSocket | undefined;
            if (other?.data.token === res.token) {
              other.emit("room:gone", { code, reason: "The host removed you from the room." });
            }
          }
        }
        return res.ok ? { ok: true as const } : res;
      });
    });

    socket.on("room:setGame", (req, ack) => {
      handle(ack, codeOf(req), (code) => rooms.setGame(code, token, str(req?.gameId), req?.config));
    });

    socket.on("game:start", (req, ack) => {
      handle(ack, codeOf(req), (code) => rooms.start(code, token));
    });

    socket.on("game:move", (req, ack) => {
      const version = typeof req?.version === "number" ? req.version : -1;
      handle(ack, codeOf(req), (code) => rooms.move(code, token, req?.move, version));
    });

    socket.on("game:backToLobby", (req, ack) => {
      handle(ack, codeOf(req), (code) => rooms.backToLobby(code, token));
    });

    socket.on("disconnect", stopWatching);
  });

  return { httpServer, io, rooms };
}
