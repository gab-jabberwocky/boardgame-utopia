import { createRng } from "@utopia/kit";
import {
  MAX_ROOM_PLAYERS,
  RECENT_ACTIONS,
  ROOM_CODE_LENGTH,
  ROOM_CODE_LETTERS,
  buildSnapshot,
  firstFreeColor,
  validatePlayerChoice,
  type Ack,
  type AnyGameModule,
  type HistoryEntry,
  type PlayerId,
  type PlayerInfo,
  type RoomView,
} from "@utopia/shared";

/*
 * Rooms live in memory only (a redeploy ends them). A room has seats, a host, the
 * chosen game and settings, and at most one game in progress. Everything here is
 * plain logic with no sockets, so it can be tested directly.
 *
 * Players are known by a private token kept in their browser (so a refresh keeps the
 * seat) and shown to others under a public id ("p1", "p2", ...).
 */

interface Seat {
  token: string;
  info: PlayerInfo;
}

interface Match {
  module: AnyGameModule;
  players: PlayerInfo[];
  state: unknown;
  rngState: number;
  /** Moves applied so far. */
  version: number;
  /** The most recent moves, for the last-action strip and history. */
  history: HistoryEntry[];
}

export interface Room {
  code: string;
  gameId: string;
  config: Record<string, unknown>;
  hostToken: string;
  seats: Seat[];
  nextSeat: number;
  match: Match | null;
  /** Open connections per token. */
  connections: Map<string, number>;
  lastActive: number;
}

export interface RoomManagerOptions {
  games: readonly AnyGameModule[];
  /** For room codes and game seeds. */
  random?: () => number;
  now?: () => number;
  /** Rooms with nobody connected are removed after this long. */
  idleMs?: number;
}

const fail = (error: string) => ({ ok: false as const, error });
const ok = <T extends object>(extra: T = {} as T) => ({ ok: true as const, ...extra });

export class RoomManager {
  private rooms = new Map<string, Room>();
  private random: () => number;
  private now: () => number;
  private idleMs: number;

  constructor(private options: RoomManagerOptions) {
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.idleMs = options.idleMs ?? 6 * 60 * 60 * 1000;
  }

  has(code: string) {
    return this.rooms.has(code);
  }

  get size() {
    return this.rooms.size;
  }

  /** Shown when the page offers a game this server doesn't have (it needs a rebuild and restart). */
  private unknownGame(id: string) {
    return fail(
      id
        ? `The server doesn't have "${id}" yet. Restart it with the latest build, then try again.`
        : "Pick a game.",
    );
  }

  private game(id: string) {
    return this.options.games.find((g) => g.id === id);
  }

  private parseConfig(module: AnyGameModule, config: unknown) {
    const parsed = module.configSchema.safeParse(config ?? {});
    if (!parsed.success) return null;
    return (parsed.data ?? {}) as Record<string, unknown>;
  }

  private newCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_LETTERS[Math.floor(this.random() * ROOM_CODE_LETTERS.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }

  private touch(room: Room) {
    room.lastActive = this.now();
  }

  private seatOf(room: Room, token: string) {
    return room.seats.find((s) => s.token === token);
  }

  private inMatch(room: Room, id: PlayerId) {
    return !!room.match?.players.some((p) => p.id === id);
  }

  create(token: string, gameId: string, config: unknown): Ack<{ code: string }> {
    const module = this.game(gameId);
    if (!module) return this.unknownGame(gameId);
    const parsed = this.parseConfig(module, config);
    if (!parsed) return fail("Those settings aren't valid.");
    const code = this.newCode();
    this.rooms.set(code, {
      code,
      gameId,
      config: parsed,
      hostToken: token,
      seats: [],
      nextSeat: 1,
      match: null,
      connections: new Map(),
      lastActive: this.now(),
    });
    return ok({ code });
  }

  connect(code: string, token: string) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.connections.set(token, (room.connections.get(token) ?? 0) + 1);
    this.touch(room);
  }

  disconnect(code: string, token: string) {
    const room = this.rooms.get(code);
    if (!room) return;
    const n = (room.connections.get(token) ?? 0) - 1;
    if (n > 0) room.connections.set(token, n);
    else room.connections.delete(token);
    this.touch(room);
  }

  /** Take a seat, or change your name and colour. */
  join(code: string, token: string, name: string, color: string): Ack {
    const room = this.rooms.get(code);
    if (!room) return fail("This room no longer exists.");
    const seat = this.seatOf(room, token);
    const others = room.seats.filter((s) => s !== seat).map((s) => s.info);
    if (seat) {
      if (room.match && this.inMatch(room, seat.info.id)) {
        return fail("You can change your name and colour after this game.");
      }
      const choice = { id: seat.info.id, name: name.trim(), color };
      const problem = validatePlayerChoice(others, choice);
      if (problem) return fail(problem);
      seat.info = choice;
    } else {
      if (room.match) return fail("A game is on. You can watch, and join once it's over.");
      if (room.seats.length >= MAX_ROOM_PLAYERS) return fail("This room is full.");
      const choice = { id: `p${room.nextSeat}`, name: name.trim(), color };
      const problem = validatePlayerChoice(others, choice);
      if (problem) return fail(problem);
      room.seats.push({ token, info: choice });
      room.nextSeat += 1;
    }
    this.touch(room);
    return ok();
  }

  leave(code: string, token: string): Ack {
    const room = this.rooms.get(code);
    if (!room) return fail("This room no longer exists.");
    const seat = this.seatOf(room, token);
    if (!seat) return ok();
    if (room.match && this.inMatch(room, seat.info.id)) {
      return fail("You're in the current game. Ask the host to end it first.");
    }
    room.seats = room.seats.filter((s) => s !== seat);
    if (room.hostToken === token && room.seats[0]) room.hostToken = room.seats[0].token;
    this.touch(room);
    return ok();
  }

  /** Host only. Returns the removed player's token so their screens can be told. */
  kick(code: string, token: string, player: PlayerId): Ack<{ token: string }> {
    const room = this.rooms.get(code);
    if (!room) return fail("This room no longer exists.");
    if (room.hostToken !== token) return fail("Only the host can remove players.");
    const seat = room.seats.find((s) => s.info.id === player);
    if (!seat) return fail("That player already left.");
    if (seat.token === token) return fail("Use Leave to leave the room yourself.");
    if (room.match && this.inMatch(room, player)) return fail("They're in the current game.");
    room.seats = room.seats.filter((s) => s !== seat);
    this.touch(room);
    return ok({ token: seat.token });
  }

  setGame(code: string, token: string, gameId: string, config: unknown): Ack {
    const room = this.rooms.get(code);
    if (!room) return fail("This room no longer exists.");
    if (room.hostToken !== token) return fail("Only the host can choose the game.");
    if (room.match) return fail("Finish this game first.");
    const module = this.game(gameId);
    if (!module) return this.unknownGame(gameId);
    const parsed = this.parseConfig(module, config);
    if (!parsed) return fail("Those settings aren't valid.");
    room.gameId = gameId;
    room.config = parsed;
    this.touch(room);
    return ok();
  }

  start(code: string, token: string): Ack {
    const room = this.rooms.get(code);
    if (!room) return fail("This room no longer exists.");
    if (room.hostToken !== token) return fail("Only the host can start the game.");
    if (room.match) return fail("A game is already on.");
    const module = this.game(room.gameId);
    if (!module) return fail("That game isn't available any more.");
    const n = room.seats.length;
    if (n < module.minPlayers || n > module.maxPlayers) {
      return fail(
        module.minPlayers === module.maxPlayers
          ? `${module.name} needs exactly ${module.minPlayers} players.`
          : `${module.name} needs ${module.minPlayers}–${module.maxPlayers} players.`,
      );
    }
    const players = room.seats.map((s) => ({ ...s.info }));
    const rng = createRng(`${code}:${Math.floor(this.random() * 2 ** 32)}`);
    const config = this.parseConfig(module, room.config);
    if (!config) return fail("Those settings aren't valid.");
    const state = module.setup({ players, rng }, config);
    room.match = { module, players, state, rngState: rng.getState(), version: 0, history: [] };
    this.touch(room);
    return ok();
  }

  move(code: string, token: string, move: unknown, version: number): Ack {
    const room = this.rooms.get(code);
    if (!room) return fail("This room no longer exists.");
    const match = room.match;
    if (!match) return fail("No game is on.");
    const seat = this.seatOf(room, token);
    if (!seat || !this.inMatch(room, seat.info.id)) return fail("You're watching this game.");
    if (version !== match.version) return fail("The game moved on. Have another look.");
    const { module } = match;
    if (module.getResult(match.state)) return fail("The game is over.");
    const error = module.validateMove(match.state, seat.info.id, move);
    if (error) return fail(error);
    const rng = createRng(match.rngState);
    const after = module.applyMove(match.state, seat.info.id, move, { rng });
    match.history = [
      ...match.history,
      { before: match.state, after, player: seat.info.id, move },
    ].slice(-RECENT_ACTIONS);
    match.state = after;
    match.rngState = rng.getState();
    match.version += 1;
    this.touch(room);
    return ok();
  }

  backToLobby(code: string, token: string): Ack {
    const room = this.rooms.get(code);
    if (!room) return fail("This room no longer exists.");
    if (room.hostToken !== token) return fail("Only the host can end the game.");
    room.match = null;
    this.touch(room);
    return ok();
  }

  /** What this person sees: their own seat, and their own view of the game. */
  view(code: string, token: string): RoomView | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    const seat = this.seatOf(room, token);
    const host = this.seatOf(room, room.hostToken);
    const match = room.match;
    const viewer = seat && match && this.inMatch(room, seat.info.id) ? seat.info.id : "spectator";
    return {
      code: room.code,
      gameId: room.gameId,
      config: room.config,
      hostId: host?.info.id ?? null,
      players: room.seats.map((s) => ({ ...s.info, connected: room.connections.has(s.token) })),
      you: seat?.info.id ?? null,
      youHost: room.hostToken === token,
      game: match
        ? {
            gameId: match.module.id,
            players: match.players,
            version: match.version,
            snapshot: buildSnapshot(match.module, match.state, viewer, match.history),
          }
        : null,
    };
  }

  /** A suggested colour for someone about to join. */
  freeColor(code: string) {
    const room = this.rooms.get(code);
    return firstFreeColor(room?.seats.map((s) => s.info) ?? []);
  }

  /** Remove rooms nobody has been connected to for a while. Returns how many went. */
  sweep(): number {
    const cutoff = this.now() - this.idleMs;
    let removed = 0;
    for (const [code, room] of this.rooms) {
      if (room.connections.size === 0 && room.lastActive < cutoff) {
        this.rooms.delete(code);
        removed += 1;
      }
    }
    return removed;
  }
}
