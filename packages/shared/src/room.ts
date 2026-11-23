import type { PlayerId, PlayerInfo } from "./contract.js";
import type { Snapshot } from "./snapshot.js";

/** Room codes: 4 letters, without ones that are easy to mix up (I, L, O). */
export const ROOM_CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 4;
export const MAX_ROOM_PLAYERS = 10;

export const normalizeRoomCode = (code: string) => code.trim().toUpperCase();
export const isRoomCode = (code: string) =>
  code.length === ROOM_CODE_LENGTH && [...code].every((c) => ROOM_CODE_LETTERS.includes(c));

export interface RoomPlayer extends PlayerInfo {
  /** Has at least one open connection right now. */
  connected: boolean;
}

/** Everything one person sees of a room. */
export interface RoomView {
  code: string;
  gameId: string;
  /** Settings for the next (or current) game. */
  config: Record<string, unknown>;
  hostId: PlayerId | null;
  /** Seated players in seat order. */
  players: RoomPlayer[];
  /** Your seat, or null if you're only watching. */
  you: PlayerId | null;
  /** True if you created the room (you control it even before taking a seat). */
  youHost: boolean;
  /** Present while a game is on (or just finished): exactly what you may see. */
  game: RoomGame | null;
}

export interface RoomGame {
  gameId: string;
  /** Who is playing this game (seat order at the start). */
  players: PlayerInfo[];
  snapshot: Snapshot;
  /** Moves applied so far; send it back with each move. */
  version: number;
}

export type Ack<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Sent with the connection; a random id kept in the browser so a refresh keeps your seat. */
export interface SocketAuth {
  token: string;
}

export interface ClientToServerEvents {
  "room:create": (
    req: { gameId: string; config: unknown },
    ack: (res: Ack<{ code: string }>) => void,
  ) => void;
  /** Follow a room: you get `room:state` now and after every change. */
  "room:watch": (req: { code: string }, ack: (res: Ack) => void) => void;
  /** Take a seat, or change your name and colour. */
  "room:join": (
    req: { code: string; name: string; color: string },
    ack: (res: Ack) => void,
  ) => void;
  "room:leave": (req: { code: string }, ack: (res: Ack) => void) => void;
  /** Host: remove a player from the lobby. */
  "room:kick": (req: { code: string; player: PlayerId }, ack: (res: Ack) => void) => void;
  /** Host: pick the game and settings for the next game. */
  "room:setGame": (
    req: { code: string; gameId: string; config: unknown },
    ack: (res: Ack) => void,
  ) => void;
  "game:start": (req: { code: string }, ack: (res: Ack) => void) => void;
  "game:move": (
    req: { code: string; move: unknown; version: number },
    ack: (res: Ack) => void,
  ) => void;
  /** Host: end the game (or leave the result screen) and go back to the lobby. */
  "game:backToLobby": (req: { code: string }, ack: (res: Ack) => void) => void;
}

export interface ServerToClientEvents {
  "room:state": (room: RoomView) => void;
  /** You were removed from the room, or it no longer exists. */
  "room:gone": (info: { code: string; reason: string }) => void;
}
