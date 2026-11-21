import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  Ack,
  ClientToServerEvents,
  PlayerId,
  RoomView,
  ServerToClientEvents,
} from "@utopia/shared";
import { guestToken } from "./guest";

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ClientSocket | null = null;

/** One connection per tab, opened on first use. In dev, Vite forwards it to the game server. */
export function getSocket(): ClientSocket {
  socket ??= io({ auth: { token: guestToken() } });
  return socket;
}

type Emit = (event: string, req: unknown) => Promise<Ack<object>>;

async function ask<T extends object = object>(event: keyof ClientToServerEvents, req: unknown) {
  const s = getSocket().timeout(8000);
  try {
    return (await (s.emitWithAck as unknown as Emit).call(s, event, req)) as Ack<T>;
  } catch {
    return { ok: false as const, error: "No answer from the server. Check your connection." };
  }
}

/** Every request the client makes. Each resolves to `{ ok: true }` or `{ ok: false, error }`. */
export const api = {
  create: (gameId: string, config: unknown) =>
    ask<{ code: string }>("room:create", { gameId, config }),
  watch: (code: string) => ask("room:watch", { code }),
  join: (code: string, name: string, color: string) => ask("room:join", { code, name, color }),
  leave: (code: string) => ask("room:leave", { code }),
  kick: (code: string, player: PlayerId) => ask("room:kick", { code, player }),
  setGame: (code: string, gameId: string, config: unknown) =>
    ask("room:setGame", { code, gameId, config }),
  start: (code: string) => ask("game:start", { code }),
  move: (code: string, move: unknown, version: number) => ask("game:move", { code, move, version }),
  backToLobby: (code: string) => ask("game:backToLobby", { code }),
};

/** Whether the connection to the server is up right now. */
export function useConnected(): boolean {
  const [connected, setConnected] = useState(() => getSocket().connected);
  useEffect(() => {
    const s = getSocket();
    const up = () => setConnected(true);
    const down = () => setConnected(false);
    s.on("connect", up);
    s.on("disconnect", down);
    return () => {
      s.off("connect", up);
      s.off("disconnect", down);
    };
  }, []);
  return connected;
}

/** Follow a room: its latest state for you, or why it can't be shown. Re-follows after reconnecting. */
export function useRoom(code: string): { room: RoomView | null; error: string | null } {
  const [state, setState] = useState<{ code: string; room: RoomView | null; error: string | null }>(
    { code, room: null, error: null },
  );
  useEffect(() => {
    const s = getSocket();
    const onState = (room: RoomView) => {
      if (room.code === code) setState({ code, room, error: null });
    };
    const onGone = (info: { code: string; reason: string }) => {
      if (info.code === code) setState({ code, room: null, error: info.reason });
    };
    const watch = () => {
      void api.watch(code).then((res) => {
        if (!res.ok) setState({ code, room: null, error: res.error });
      });
    };
    s.on("room:state", onState);
    s.on("room:gone", onGone);
    s.on("connect", watch);
    if (s.connected) watch();
    return () => {
      s.off("room:state", onState);
      s.off("room:gone", onGone);
      s.off("connect", watch);
    };
  }, [code]);
  return state.code === code ? state : { room: null, error: null };
}
