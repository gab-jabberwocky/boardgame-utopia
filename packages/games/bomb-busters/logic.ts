import type {
  ActionDescription,
  GameResult,
  GameStatus,
  LegalMove,
  MoveContext,
  PlayerId,
  SetupContext,
  Viewer,
} from "@utopia/shared";
import type { Config } from "./config.js";

export type WireValue = number | "YELLOW" | "RED";
export interface Wire {
  id: string;
  value: WireValue;
  cut: boolean;
  clue: boolean;
  color?: "yellow" | "red";
  sort: number;
}
interface Seat {
  id: PlayerId;
  name: string;
  racks: Wire[][];
}
export type Phase = "clues" | "play" | "own" | "over";
export interface State {
  mission: number;
  missionName: string;
  players: Seat[];
  phase: Phase;
  active: PlayerId;
  captain: PlayerId;
  setupIndex: number;
  turn: number;
  mistakes: number;
  mistakeLimit: number;
  pendingValue: WireValue | null;
  pendingTarget: string | null;
  result: "won" | "lost" | null;
  lastText: string;
  lastMove: Move | null;
  history: { player: PlayerId; value: WireValue; missed: boolean; turn: number }[];
  markers: { color: "yellow" | "red"; position: number; uncertain: boolean; present: boolean }[];
}
export type Move =
  | { type: "clue"; wireId: string }
  | { type: "call"; wireId: string; value: WireValue }
  | { type: "cutOwn"; wireId: string }
  | { type: "solo"; value: WireValue }
  | { type: "revealRed" };
export type ViewWire = Omit<Wire, "value" | "sort"> & { value?: WireValue; sort?: number };
export interface View extends Omit<State, "players"> {
  players: (Omit<Seat, "racks"> & { racks: ViewWire[][] })[];
  viewer: Viewer;
}

const INFO: Record<
  number,
  {
    name: string;
    values: number;
    yellow: number;
    red: number;
    yCandidates?: number;
    rCandidates?: number;
  }
> = {
  1: { name: "Training, day 1", values: 6, yellow: 0, red: 0 },
  2: { name: "Training, day 2", values: 8, yellow: 2, red: 0 },
  3: { name: "Training, day 3", values: 10, yellow: 0, red: 1 },
  4: { name: "First day in the field", values: 12, yellow: 2, red: 1 },
  6: { name: "Third day in the field", values: 12, yellow: 4, red: 1 },
  8: { name: "Final Exam", values: 12, yellow: 2, red: 1, yCandidates: 3, rCandidates: 2 },
};
const all = (s: State) => s.players.flatMap((p) => p.racks.flat());
const remaining = (s: State, player: PlayerId) =>
  s.players
    .find((p) => p.id === player)
    ?.racks.flat()
    .filter((w) => !w.cut) ?? [];
const wireAt = (s: State, id: string) => all(s).find((w) => w.id === id);
const counts = (s: State, value: WireValue) =>
  all(s).filter((w) => !w.cut && w.value === value).length;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function setup(ctx: SetupContext, config: Config): State {
  const mission = Number(config.mission);
  const info = INFO[mission];
  if (!info) throw new Error("Choose a supported training mission.");
  const n = ctx.players.length;
  const yellow = mission === 4 && n === 2 ? 4 : info.yellow;
  const red = mission === 6 && n === 2 ? 2 : info.red;
  const specialPositions = (color: "yellow" | "red", count: number, candidates: number) => {
    const positions = ctx.rng.shuffle(Array.from({ length: 11 }, (_, i) => i + 1));
    const selected = positions.slice(0, candidates);
    selected.slice(0, count).forEach((position) =>
      deck.push({
        id: `w${deck.length}`,
        value: color === "yellow" ? "YELLOW" : "RED",
        cut: false,
        clue: false,
        color,
        sort: position + (color === "yellow" ? 0.1 : 0.5),
      }),
    );
    selected.forEach((position, i) =>
      markers.push({ color, position, uncertain: candidates > count, present: i < count }),
    );
  };
  const deck: Wire[] = Array.from({ length: info.values * 4 }, (_, i) => ({
    id: `w${i}`,
    value: Math.floor(i / 4) + 1,
    cut: false,
    clue: false,
    sort: Math.floor(i / 4) + 1,
  }));
  const markers: State["markers"] = [];
  if (yellow) specialPositions("yellow", yellow, info.yCandidates ?? yellow);
  if (red) specialPositions("red", red, info.rCandidates ?? red);
  const dealt = ctx.rng.shuffle(deck);
  const players: Seat[] = ctx.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    racks: Array.from({ length: n === 2 || (n === 3 && i === 0) ? 2 : 1 }, () => []),
  }));
  const racks = players.flatMap((p) => p.racks);
  dealt.forEach((wire, i) => racks[i % racks.length]?.push(wire));
  racks.forEach((rack) => rack.sort((a, b) => a.sort - b.sort));
  let pos = 0;
  racks.forEach((rack) =>
    rack.forEach((wire) => {
      wire.id = `wire-${pos++}`;
    }),
  );
  const captain = ctx.players[0]!.id;
  return {
    mission,
    missionName: info.name,
    players,
    phase: "clues",
    active: captain,
    captain,
    setupIndex: 0,
    turn: 1,
    mistakes: 0,
    mistakeLimit: n,
    pendingValue: null,
    pendingTarget: null,
    result: null,
    lastText: "Each player chooses one starting clue.",
    lastMove: null,
    history: [],
    markers,
  };
}

function next(s: State) {
  if (all(s).every((w) => w.cut)) {
    s.phase = "over";
    s.result = "won";
    s.lastText = "Every wire is cut. Mission accomplished!";
    return;
  }
  let i = s.players.findIndex((p) => p.id === s.active);
  for (let step = 1; step <= s.players.length; step++) {
    i = (i + 1) % s.players.length;
    if (remaining(s, s.players[i]!.id).length) {
      s.active = s.players[i]!.id;
      break;
    }
  }
  s.turn++;
  s.phase = "play";
  s.pendingValue = null;
  s.pendingTarget = null;
}
function canSolo(s: State, who: PlayerId, value: WireValue) {
  const own = remaining(s, who).filter((w) => w.value === value).length;
  return (own === 2 || own === 4) && own === counts(s, value);
}

export function validateMove(s: State, player: PlayerId, move: Move): string | null {
  if (s.phase === "over") return "This mission has ended.";
  if (s.phase === "own")
    return player === s.active && move.type === "cutOwn"
      ? null
      : "The caller must cut a matching wire.";
  if (s.phase === "clues") {
    if (player !== s.players[s.setupIndex]?.id || move.type !== "clue")
      return "Choose a starting clue in seat order.";
    const w = wireAt(s, move.wireId);
    if (!w || !remaining(s, player).some((x) => x.id === w.id) || w.clue || w.value === "RED")
      return "Choose one of your uncut non-red wires.";
    if (
      typeof w.value === "number" &&
      all(s).filter((x) => x.clue && x.value === w.value).length >= 2
    )
      return "Both clue tokens for that number are in use.";
    return null;
  }
  if (player !== s.active) return "It is another player's turn.";
  if (move.type === "revealRed")
    return remaining(s, player).length > 0 && remaining(s, player).every((w) => w.value === "RED")
      ? null
      : "Reveal red only when every wire left in your stand is red.";
  if (move.type === "solo")
    return canSolo(s, player, move.value)
      ? null
      : "A solo cut needs all remaining copies of that value in your hand.";
  if (move.type !== "call") return "Choose a teammate wire to call.";
  const target = wireAt(s, move.wireId);
  if (
    !target ||
    target.cut ||
    !s.players.some((p) => p.id !== player && p.racks.some((r) => r.includes(target)))
  )
    return "Choose an uncut teammate wire.";
  if (!remaining(s, player).some((w) => w.value === move.value))
    return "Call a value that you still hold.";
  return null;
}

export function applyMove(state: State, player: PlayerId, move: Move, _ctx: MoveContext): State {
  const error = validateMove(state, player, move);
  if (error) throw new Error(error);
  const s = clone(state);
  s.lastMove = move;
  if (move.type === "clue") {
    wireAt(s, move.wireId)!.clue = true;
    s.setupIndex++;
    if (s.setupIndex === s.players.length) {
      s.phase = "play";
      s.active = s.captain;
      s.lastText = "Starting clues are placed. The captain makes the first call.";
    } else {
      s.active = s.players[s.setupIndex]!.id;
      s.lastText = `${s.players[s.setupIndex - 1]!.name} placed a starting clue.`;
    }
  } else if (move.type === "call") {
    const target = wireAt(s, move.wireId)!;
    if (target.value === move.value) {
      target.cut = true;
      s.phase = "own";
      s.pendingValue = move.value;
      s.pendingTarget = target.id;
      s.history.push({ player, value: move.value, missed: false, turn: s.turn });
      s.lastText = "Match! The caller chooses a matching wire to cut.";
    } else if (target.value === "RED") {
      s.history.push({ player, value: move.value, missed: true, turn: s.turn });
      s.phase = "over";
      s.result = "lost";
      s.lastText = "A red wire was cut. The bomb exploded.";
    } else {
      target.clue = true;
      s.mistakes++;
      s.history.push({ player, value: move.value, missed: true, turn: s.turn });
      s.lastText = `No match. The wire was ${target.value}; it is now a public clue.`;
      if (s.mistakes >= s.mistakeLimit) {
        s.phase = "over";
        s.result = "lost";
        s.lastText += " The detonator reached its limit.";
      } else next(s);
    }
  } else if (move.type === "cutOwn") {
    const target = wireAt(s, move.wireId)!;
    if (!remaining(s, player).some((w) => w.id === target.id && w.value === s.pendingValue))
      throw new Error("Choose one of your matching uncut wires.");
    target.cut = true;
    s.lastText = `A pair of ${target.value} wires was safely cut.`;
    next(s);
  } else if (move.type === "solo") {
    remaining(s, player)
      .filter((w) => w.value === move.value)
      .forEach((w) => {
        w.cut = true;
      });
    s.lastText = `Solo cut: all remaining ${move.value} wires are clear.`;
    next(s);
  } else {
    remaining(s, player).forEach((w) => {
      w.cut = true;
    });
    s.lastText = "All remaining red wires in this hand were safely revealed.";
    next(s);
  }
  return s;
}

export function getPlayerView(s: State, viewer: Viewer): View {
  return {
    ...clone(s),
    viewer,
    players: s.players.map((p) => ({
      ...p,
      racks: p.racks.map((rack) =>
        rack.map((wire) => {
          const publicWire = p.id === viewer || wire.cut || wire.clue || s.phase === "over";
          if (publicWire) return { ...wire };
          const { value: _value, sort: _sort, ...hidden } = wire;
          return hidden;
        }),
      ),
    })),
  };
}
export function getResult(s: State): GameResult | null {
  if (s.phase !== "over") return null;
  return s.result === "won"
    ? { winners: s.players.map((p) => p.id), text: "The team defused the bomb!" }
    : { winners: [], text: "The bomb exploded. The team lost." };
}
export function getStatus(s: State, viewer: Viewer): GameStatus {
  if (s.phase === "over") return { text: getResult(s)!.text, activePlayers: [] };
  const name = s.players.find((p) => p.id === s.active)?.name ?? "A player";
  const waiting = s.phase === "clues" ? s.players[s.setupIndex]?.id : s.active;
  const waitingName = s.players.find((p) => p.id === waiting)?.name ?? name;
  return {
    text:
      s.phase === "clues"
        ? `${waiting === viewer ? "Your turn" : `${waitingName}'s turn`}: place a starting clue`
        : s.phase === "own"
          ? `${viewer === s.active ? "Your turn" : `${name}'s turn`}: cut a matching wire`
          : `${viewer === s.active ? "Your turn" : `Waiting for ${name}`}: make a call`,
    activePlayers: waiting ? [waiting] : [],
  };
}
export function describeMove(
  before: State,
  after: State,
  player: PlayerId,
  move: Move,
  viewer: Viewer,
): ActionDescription {
  const name = before.players.find((p) => p.id === player)?.name ?? "A player";
  const you = player === viewer;
  return {
    text: you ? after.lastText : `${name}: ${after.lastText}`,
    highlight:
      move.type === "call" || move.type === "clue" || move.type === "cutOwn" ? [move.wireId] : [],
    tone: after.result === "lost" ? "bad" : after.result === "won" ? "good" : "normal",
    flash:
      after.result === "lost"
        ? "Bomb exploded"
        : after.result === "won"
          ? "Bomb defused!"
          : undefined,
  };
}
export function getLegalMoves(s: State, player: PlayerId): LegalMove<Move>[] {
  if (s.phase === "over") return [];
  if (s.phase === "clues")
    return s.players[s.setupIndex]?.id === player
      ? remaining(s, player)
          .filter((w) => w.value !== "RED" && !w.clue)
          .map((w) => ({
            move: { type: "clue", wireId: w.id },
            label: `Place clue on stand wire ${w.id}`,
          }))
      : [];
  if (s.phase === "own")
    return player === s.active
      ? remaining(s, player)
          .filter((w) => w.value === s.pendingValue)
          .map((w) => ({
            move: { type: "cutOwn", wireId: w.id },
            label: `Cut your ${s.pendingValue} wire`,
          }))
      : [];
  if (player !== s.active) return [];
  const moves: LegalMove<Move>[] = [];
  for (const own of remaining(s, player)) {
    if (typeof own.value === "number" || own.value === "YELLOW")
      for (const target of all(s).filter(
        (w) => !w.cut && !remaining(s, player).some((x) => x.id === w.id),
      ))
        moves.push({
          move: { type: "call", wireId: target.id, value: own.value },
          label: `Call ${own.value} on teammate wire`,
        });
  }
  for (const value of Array.from(new Set(remaining(s, player).map((w) => w.value))))
    if (canSolo(s, player, value))
      moves.push({ move: { type: "solo", value }, label: `Solo cut ${value}` });
  if (remaining(s, player).length && remaining(s, player).every((w) => w.value === "RED"))
    moves.push({ move: { type: "revealRed" }, label: "Reveal your red wires" });
  return moves;
}
