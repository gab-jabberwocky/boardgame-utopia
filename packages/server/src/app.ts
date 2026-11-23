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
import { log as defaultLog } from "./log.js";
import { createRateLimiter } from "./rateLimit.js";
import { RoomManager } from "./rooms.js";

export interface AppOptions {
  /** Folder with the built client. Served as static files with an SPA fallback, if it exists. */
  clientDist?: string;
  /** Games on offer (defaults to every game in the catalog). */
  games?: readonly AnyGameModule[];
  /** Where log lines go (defaults to JSON lines on stdout/stderr). */
  log?: typeof defaultLog;
}

interface SocketData {
  token: string;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type AnyAck = (res: Ack<object>) => void;

const SWEEP_MS = 10 * 60 * 1000;
const HOST_CHECK_MS = 15 * 1000;
/** Socket.IO's default is 1 MB; nothing we receive comes close to this. */
const MAX_MESSAGE_BYTES = 64 * 1024;
const SERVER_ERROR = "Something went wrong on the server. Try again.";

export function createApp(options: AppOptions = {}) {
  const log = options.log ?? defaultLog;
  const app = express();
  app.disable("x-powered-by");

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
    { maxHttpBufferSize: MAX_MESSAGE_BYTES },
  );
  const rooms = new RoomManager({
    games: options.games ?? GAME_MODULES,
    onError: (err, context) => log("error", "game_error", { err, ...context }),
  });

  const sweeper = setInterval(() => {
    const removed = rooms.sweep();
    if (removed) log("info", "rooms_swept", { removed, open: rooms.size });
  }, SWEEP_MS);
  const hostCheck = setInterval(() => {
    for (const code of rooms.promoteHosts()) {
      log("info", "host_promoted", { code });
      broadcast(code);
    }
  }, HOST_CHECK_MS);
  sweeper.unref();
  hostCheck.unref();
  httpServer.on("close", () => {
    clearInterval(sweeper);
    clearInterval(hostCheck);
  });

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

  /** Send one socket its own view of a room. */
  function sendView(socket: GameSocket, code: string) {
    try {
      const view = rooms.view(code, socket.data.token);
      if (view) socket.emit("room:state", view);
    } catch (err) {
      log("error", "view_error", { err, code });
    }
  }

  /** Send everyone following a room their own view of it. */
  function broadcast(code: string) {
    for (const id of io.sockets.adapter.rooms.get(code) ?? []) {
      const socket = io.sockets.sockets.get(id) as GameSocket | undefined;
      if (socket) sendView(socket, code);
    }
  }

  io.on("connection", (socket: GameSocket) => {
    const { token } = socket.data;
    let watching: string | null = null;

    // Refuse floods, and never let a throwing handler take the process down.
    const allow = createRateLimiter(40, 10);
    socket.use(([, ...args], next) => {
      const ack = args.at(-1);
      const reply = typeof ack === "function" ? (ack as AnyAck) : () => {};
      if (!allow()) return reply({ ok: false, error: "Slow down a little." });
      next();
    });
    const listen = <E extends keyof ClientToServerEvents>(
      event: E,
      handler: ClientToServerEvents[E],
    ) => {
      const guarded = (...args: unknown[]) => {
        try {
          (handler as (...args: unknown[]) => void)(...args);
        } catch (err) {
          log("error", "handler_error", { err, event });
          const ack = args.at(-1);
          if (typeof ack === "function") (ack as AnyAck)({ ok: false, error: SERVER_ERROR });
        }
      };
      socket.on(event, guarded as never);
    };

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

    listen("room:create", (req, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const res = rooms.create(token, str(req?.gameId), req?.config);
      if (res.ok) log("info", "room_created", { code: res.code, gameId: str(req?.gameId) });
      reply(res);
    });

    listen("room:watch", (req, ack) => {
      const code = codeOf(req);
      const reply = typeof ack === "function" ? ack : () => {};
      if (!code || !rooms.has(code)) return reply({ ok: false, error: "No room with that code." });
      reply({ ok: true });
      if (watching === code) {
        sendView(socket, code); // nothing changed for anyone else
        return;
      }
      stopWatching();
      watching = code;
      void socket.join(code);
      rooms.connect(code, token);
      broadcast(code);
    });

    listen("room:join", (req, ack) => {
      handle(ack, codeOf(req), (code) => rooms.join(code, token, str(req?.name), str(req?.color)));
    });

    listen("room:leave", (req, ack) => {
      handle(ack, codeOf(req), (code) => rooms.leave(code, token));
    });

    listen("room:kick", (req, ack) => {
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

    listen("room:setGame", (req, ack) => {
      handle(ack, codeOf(req), (code) => rooms.setGame(code, token, str(req?.gameId), req?.config));
    });

    listen("game:start", (req, ack) => {
      const res = handle(ack, codeOf(req), (code) => rooms.start(code, token));
      if (res?.ok) log("info", "game_started", { code: codeOf(req) });
    });

    listen("game:move", (req, ack) => {
      const version = typeof req?.version === "number" ? req.version : -1;
      handle(ack, codeOf(req), (code) => rooms.move(code, token, req?.move, version));
    });

    listen("game:backToLobby", (req, ack) => {
      handle(ack, codeOf(req), (code) => rooms.backToLobby(code, token));
    });

    socket.on("disconnect", stopWatching);
  });

  return { httpServer, io, rooms };
}
