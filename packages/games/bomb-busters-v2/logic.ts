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
import { isMove } from "@utopia/kit";
import type { Config } from "./config.js";

/*
 * Bomb Busters (adapted from Yan Meng's port in packages/games/bomb-busters).
 *
 * A cooperative wire-cutting game. Every player holds one or two stands of wires,
 * sorted from low to high; only you see your own values. Wires are numbered 1–12
 * (four of each), plus yellow and red wires in some missions.
 * - Starting clues: in seat order, each player reveals one of their non-red wires.
 * - On your turn, call a value you hold on a teammate's wire:
 *   right → that wire is cut and you cut one of your own wires of that value;
 *   wrong → the wire becomes a public clue and the detonator ticks;
 *   red → the bomb explodes.
 * - Solo cut: if you hold every remaining copy of a value (2 or 4), cut them all.
 * - If only red wires are left on your stand, reveal them safely.
 * - The team wins when every wire is cut; it loses when the detonator runs out
 *   (one step per player) or a red wire is cut.
 *
 * Yellow wires sit between numbers at x.1 and red ones at x.5 (shown as such to whoever
 * can see them); calls name the colour, not the decimal.
 *
 * Our own additions. Power cards are a setting (on by default): Yan's missions 1–8 get
 * every tool whose number is in play plus Double Scan; Field ops F1–F8 bring their own
 * set and one twist each. With the setting off there are no power cards at all.
 * - Double Scan (personal, once per mission): call one value on 2 wires of one
 *   teammate. Either matching is a hit; the teammate picks which one is cut.
 *   On a miss the teammate puts the clue on one of the two. One red among them
 *   doesn't explode (the clue goes on the other); both red explodes.
 * - Tools: unlocked once 2 wires of their number are cut, used once, no action:
 *   Triple Scan (3 wires), Two-Tone Scan (2 values on 1 wire), Radar (public
 *   yes/no: does a teammate hold a value?), Dampener (arm before your call: a miss
 *   doesn't tick and red doesn't explode) and Swap Radios (swap one random wire
 *   with a teammate, privately).
 * - Each Field op has one twist rule.
 */

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
/** pick/place: the scanned teammate chooses which wire is cut, or gets the clue. */
export type Phase = "clues" | "play" | "own" | "pick" | "place" | "over";
export interface Marker {
  color: "yellow" | "red";
  position: number;
  /** Mission 8: several candidate positions, not all holding a wire. */
  uncertain: boolean;
  present: boolean;
}

export type ToolKind = "swap" | "tripleScan" | "radar" | "dampener" | "twoTone";
export type ScanTool = "double" | "tripleScan" | "twoTone";
export type Twist =
  | "extraFuse"
  | "noStartClues"
  | "silentMisses"
  | "shortFuse"
  | "noSolo"
  | "doubleTick"
  | "noRepeat"
  | "hiddenMarkers";

export interface Tool {
  kind: ToolKind;
  /** Usable once 2 wires of this number have been cut. */
  unlock: number;
  used: boolean;
}

export const TOOL_INFO: Record<ToolKind, { name: string; unlock: number; text: string }> = {
  swap: { name: "Swap Radios", unlock: 2, text: "Swap one random wire with a teammate." },
  tripleScan: {
    name: "Triple Scan",
    unlock: 4,
    text: "Your call: one value on 3 wires of one teammate.",
  },
  radar: {
    name: "Radar",
    unlock: 6,
    text: "Ask if a teammate holds a number. Everyone hears yes or no.",
  },
  dampener: {
    name: "Dampener",
    unlock: 7,
    text: "Arm before your call: a miss doesn't tick, red doesn't explode.",
  },
  twoTone: { name: "Two-Tone Scan", unlock: 9, text: "Your call: two values on one wire." },
};

export const DOUBLE_SCAN_TEXT =
  "Once per mission, your call: one value on 2 wires of one teammate.";

export const TWIST_INFO: Record<Twist, { name: string; text: string }> = {
  extraFuse: { name: "Extra fuse", text: "The detonator has one extra step." },
  noStartClues: { name: "Quiet start", text: "No starting clues." },
  silentMisses: {
    name: "Silent misses",
    text: "A wrong call ticks the detonator but gives no clue.",
  },
  shortFuse: { name: "Short fuse", text: "The detonator has one step fewer (at least 1)." },
  noSolo: { name: "Hands on", text: "No solo cuts while a teammate still has wires." },
  doubleTick: { name: "Twitchy dial", text: "Every miss ticks the detonator twice." },
  noRepeat: {
    name: "No echoes",
    text: "You can't call the value(s) just called, unless you hold nothing else.",
  },
  hiddenMarkers: { name: "Blackout", text: "Yellow and red markers stay hidden until the end." },
};

/** A teammate is choosing for a scan. `options` is private to that teammate. */
export interface Pending {
  kind: "pick" | "place";
  owner: PlayerId;
  caller: PlayerId;
  /** The scanned wires (public). */
  wireIds: string[];
  /** Pick: the wires that match. Place: the wires that aren't red. */
  options: string[];
}

/** What the last call or scan did, for the move text (public facts only). */
export type Outcome = "match" | "pick" | "miss" | "place" | "red" | "absorbed";

export interface State {
  mission: number;
  /** "Mission 4" or "Field op 3". */
  missionLabel: string;
  missionName: string;
  /** Wire numbers in play: 1 to this (four of each). */
  values: number;
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
  /** Public summary of the last move (never names a hidden value). */
  lastText: string;
  lastMove: Move | null;
  history: { player: PlayerId; value: WireValue; missed: boolean; turn: number }[];
  markers: Marker[];
  tools: Tool[];
  /** Whether Double Scan exists in this mission, and who has used theirs. */
  doubleScan: boolean;
  doubleScanUsed: PlayerId[];
  twist: Twist | null;
  /** The Dampener is armed for the active player's next call. */
  dampened: boolean;
  /** Values named by the most recent call (for the No echoes twist). */
  lastCalled: WireValue[];
  radar: { asker: PlayerId; target: PlayerId; value: number; answer: boolean }[];
  pending: Pending | null;
  outcome: Outcome | null;
  /** Wire ids swapped last (values stay hidden from everyone else). */
  lastSwap: { from: PlayerId; to: PlayerId; gave: string; got: string } | null;
}
export type Move =
  | { type: "clue"; wireId: string }
  | { type: "skipClue" }
  | { type: "call"; wireId: string; value: WireValue }
  | { type: "scan"; tool: ScanTool; wireIds: string[]; values: number[] }
  | { type: "choose"; wireId: string }
  | { type: "cutOwn"; wireId: string }
  | { type: "solo"; value: WireValue }
  | { type: "revealRed" }
  | { type: "radar"; target: PlayerId; value: number }
  | { type: "swap"; target: PlayerId }
  | { type: "dampen" };

/** A wire as someone sees it: hidden wires have no value, sort position or colour. */
export type ViewWire = Omit<Wire, "value" | "sort" | "color"> & {
  value?: WireValue;
  sort?: number;
  color?: "yellow" | "red";
};
export interface View extends Omit<State, "players" | "markers" | "pending"> {
  players: (Omit<Seat, "racks"> & { racks: ViewWire[][] })[];
  /** Mission 8 candidates: whether one really holds a wire is hidden until the end. */
  markers: (Omit<Marker, "present"> & { present?: boolean })[];
  /** Options are only shown to the teammate choosing. */
  pending: (Omit<Pending, "options"> & { options?: string[] }) | null;
  viewer: Viewer;
}

interface MissionInfo {
  label: string;
  name: string;
  values: number;
  yellow: number;
  red: number;
  yCandidates?: number;
  rCandidates?: number;
  tools?: ToolKind[];
  doubleScan?: boolean;
  twist?: Twist;
}

const INFO: Record<Config["mission"], MissionInfo & { number: number }> = {
  "1": { number: 1, label: "Mission 1", name: "Training, day 1", values: 6, yellow: 0, red: 0 },
  "2": { number: 2, label: "Mission 2", name: "Training, day 2", values: 8, yellow: 2, red: 0 },
  "3": { number: 3, label: "Mission 3", name: "Training, day 3", values: 10, yellow: 0, red: 1 },
  "4": {
    number: 4,
    label: "Mission 4",
    name: "First day in the field",
    values: 12,
    yellow: 2,
    red: 1,
  },
  "6": {
    number: 6,
    label: "Mission 6",
    name: "Third day in the field",
    values: 12,
    yellow: 4,
    red: 1,
  },
  "8": {
    number: 8,
    label: "Mission 8",
    name: "Final Exam",
    values: 12,
    yellow: 2,
    red: 1,
    yCandidates: 3,
    rCandidates: 2,
  },
  // Our own missions: one twist each, escalating.
  F1: {
    number: 101,
    label: "Field op 1",
    name: "Tool day",
    values: 8,
    yellow: 0,
    red: 1,
    tools: ["swap", "radar"],
    doubleScan: true,
    twist: "extraFuse",
  },
  F2: {
    number: 102,
    label: "Field op 2",
    name: "Quiet start",
    values: 10,
    yellow: 2,
    red: 1,
    tools: ["tripleScan", "radar"],
    doubleScan: true,
    twist: "noStartClues",
  },
  F3: {
    number: 103,
    label: "Field op 3",
    name: "Silent misses",
    values: 12,
    yellow: 2,
    red: 1,
    tools: ["dampener", "twoTone"],
    doubleScan: true,
    twist: "silentMisses",
  },
  F4: {
    number: 104,
    label: "Field op 4",
    name: "Short fuse",
    values: 12,
    yellow: 2,
    red: 2,
    tools: ["swap", "tripleScan", "dampener"],
    doubleScan: true,
    twist: "shortFuse",
  },
  F5: {
    number: 105,
    label: "Field op 5",
    name: "Hands on",
    values: 12,
    yellow: 4,
    red: 1,
    tools: ["swap", "radar", "twoTone"],
    doubleScan: false,
    twist: "noSolo",
  },
  F6: {
    number: 106,
    label: "Field op 6",
    name: "Twitchy dial",
    values: 12,
    yellow: 2,
    red: 1,
    yCandidates: 3,
    rCandidates: 2,
    tools: ["tripleScan", "radar", "dampener"],
    doubleScan: true,
    twist: "doubleTick",
  },
  F7: {
    number: 107,
    label: "Field op 7",
    name: "No echoes",
    values: 12,
    yellow: 3,
    red: 2,
    tools: ["swap", "dampener", "twoTone"],
    doubleScan: true,
    twist: "noRepeat",
  },
  F8: {
    number: 108,
    label: "Field op 8",
    name: "Blackout",
    values: 12,
    yellow: 2,
    red: 2,
    yCandidates: 4,
    rCandidates: 3,
    tools: ["swap", "tripleScan", "radar", "dampener", "twoTone"],
    doubleScan: true,
    twist: "hiddenMarkers",
  },
};

/** Mission setup facts, for the README and tests. */
export const MISSIONS = INFO;

export const allWires = (s: Pick<State, "players">) => s.players.flatMap((p) => p.racks.flat());
export const remaining = (s: Pick<State, "players">, player: PlayerId) =>
  s.players
    .find((p) => p.id === player)
    ?.racks.flat()
    .filter((w) => !w.cut) ?? [];
const wireAt = (s: State, id: string) => allWires(s).find((w) => w.id === id);
const ownerOf = (s: Pick<State, "players">, wireId: string) =>
  s.players.find((p) => p.racks.some((r) => r.some((w) => w.id === wireId)));
const counts = (s: State, value: WireValue) =>
  allWires(s).filter((w) => !w.cut && w.value === value).length;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const nameOf = (s: Pick<State, "players">, id: PlayerId) =>
  s.players.find((p) => p.id === id)?.name ?? "A player";

export const valueText = (v: WireValue) =>
  v === "YELLOW" ? "yellow" : v === "RED" ? "red" : `${v}`;

/** One wire you can see: "7", or "yellow 7.1" / "red 4.5" with its place between numbers. */
export const wireValueText = (w: { value: WireValue; sort?: number }) =>
  typeof w.value === "number" || w.sort === undefined
    ? valueText(w.value)
    : `${valueText(w.value)} ${w.sort.toFixed(1)}`;

/** "Bob's wire 3" (or "Bob's stand 2, wire 3" for players with two stands). */
export function wireName(
  s: Pick<State, "players">,
  wireId: string,
  viewer?: Viewer,
  /** Who is acting: their own wires read "their wire 3". */
  actor?: PlayerId,
): string {
  for (const p of s.players) {
    for (let r = 0; r < p.racks.length; r++) {
      const i = p.racks[r]!.findIndex((w) => w.id === wireId);
      if (i < 0) continue;
      const owner = p.id === viewer ? "your" : p.id === actor ? "their" : `${p.name}'s`;
      return p.racks.length > 1
        ? `${owner} stand ${r + 1}, wire ${i + 1}`
        : `${owner} wire ${i + 1}`;
    }
  }
  return "a wire";
}

/** "Bob's wires 2, 5" for a scan's wires (all on one teammate). */
export function wiresName(s: Pick<State, "players">, wireIds: string[], viewer?: Viewer) {
  const owner = ownerOf(s, wireIds[0] ?? "");
  if (!owner) return "some wires";
  const who = owner.id === viewer ? "your" : `${owner.name}'s`;
  const spots = wireIds.map((id) => {
    for (let r = 0; r < owner.racks.length; r++) {
      const i = owner.racks[r]!.findIndex((w) => w.id === id);
      if (i >= 0) return owner.racks.length > 1 ? `${r + 1}.${i + 1}` : `${i + 1}`;
    }
    return "?";
  });
  return `${who} wires ${spots.join(", ")}`;
}

/** Number of wires of this value already cut. */
export const cutCount = (s: Pick<State, "players">, value: number) =>
  allWires(s).filter((w) => w.cut && w.value === value).length;

export const toolUnlocked = (s: Pick<State, "players">, tool: Tool) =>
  cutCount(s, tool.unlock) >= 2;

export function toolReady(s: Pick<State, "players" | "tools">, kind: ToolKind) {
  const tool = s.tools.find((t) => t.kind === kind);
  return !!tool && !tool.used && toolUnlocked(s, tool);
}

export const doubleScanReady = (
  s: Pick<State, "doubleScan" | "doubleScanUsed">,
  player: PlayerId,
) => s.doubleScan && !s.doubleScanUsed.includes(player);

export function setup(ctx: SetupContext, config: Config): State {
  const info = INFO[config.mission];
  if (!info) throw new Error("Choose a supported mission.");
  const mission = info.number;
  const n = ctx.players.length;
  const yellow = mission === 4 && n === 2 ? 4 : info.yellow;
  const red = mission === 6 && n === 2 ? 2 : info.red;
  const deck: Wire[] = Array.from({ length: info.values * 4 }, (_, i) => ({
    id: `w${i}`,
    value: Math.floor(i / 4) + 1,
    cut: false,
    clue: false,
    sort: Math.floor(i / 4) + 1,
  }));
  const markers: Marker[] = [];
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
  if (yellow) specialPositions("yellow", yellow, info.yCandidates ?? yellow);
  if (red) specialPositions("red", red, info.rCandidates ?? red);
  markers.sort((a, b) => a.position - b.position || a.color.localeCompare(b.color));
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
  const twist = info.twist ?? null;
  const quiet = twist === "noStartClues";
  // Power cards: Field ops bring their own set; other missions get every card whose
  // number is in play, and everyone has a Double Scan.
  const powered = config.powerCards;
  const kinds = powered
    ? (info.tools ??
      (Object.keys(TOOL_INFO) as ToolKind[]).filter((k) => TOOL_INFO[k].unlock <= info.values))
    : [];
  return {
    mission,
    missionLabel: info.label,
    missionName: info.name,
    values: info.values,
    players,
    phase: quiet ? "play" : "clues",
    active: captain,
    captain,
    setupIndex: quiet ? n : 0,
    turn: 1,
    mistakes: 0,
    mistakeLimit: twist === "extraFuse" ? n + 1 : twist === "shortFuse" ? Math.max(1, n - 1) : n,
    pendingValue: null,
    pendingTarget: null,
    result: null,
    lastText: quiet
      ? "No starting clues on this mission. The captain calls first."
      : "Each player chooses one starting clue.",
    lastMove: null,
    history: [],
    markers,
    tools: kinds.map((kind) => ({ kind, unlock: TOOL_INFO[kind].unlock, used: false })),
    doubleScan: powered && (info.doubleScan ?? true),
    doubleScanUsed: [],
    twist,
    dampened: false,
    lastCalled: [],
    radar: [],
    pending: null,
    outcome: null,
    lastSwap: null,
  };
}

function next(s: State) {
  s.pending = null;
  s.dampened = false;
  if (allWires(s).every((w) => w.cut)) {
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

const teammatesHaveWires = (s: State, player: PlayerId) =>
  s.players.some((p) => p.id !== player && remaining(s, p.id).length > 0);

function canSolo(s: State, who: PlayerId, value: WireValue) {
  if (s.twist === "noSolo" && teammatesHaveWires(s, who)) return false;
  const own = remaining(s, who).filter((w) => w.value === value).length;
  return (own === 2 || own === 4) && own === counts(s, value);
}

/** No echoes: the values just called are blocked, unless you hold nothing else. */
function blockedValues(s: State, player: PlayerId): WireValue[] {
  if (s.twist !== "noRepeat" || !s.lastCalled.length) return [];
  const mine = new Set(remaining(s, player).map((w) => w.value));
  mine.delete("RED");
  const free = [...mine].filter((v) => !s.lastCalled.includes(v));
  return free.length ? s.lastCalled : [];
}

/** Wires this player may use as a starting clue. */
function clueOptions(s: State, player: PlayerId): Wire[] {
  return remaining(s, player).filter(
    (w) =>
      !w.clue &&
      w.value !== "RED" &&
      !(
        typeof w.value === "number" &&
        allWires(s).filter((x) => x.clue && x.value === w.value).length >= 2
      ),
  );
}

const SCAN_SIZE: Record<ScanTool, number> = { double: 2, tripleScan: 3, twoTone: 1 };
export const SCAN_NAME: Record<ScanTool, string> = {
  double: "Double Scan",
  tripleScan: "Triple Scan",
  twoTone: "Two-Tone Scan",
};

function validateScan(
  s: State,
  player: PlayerId,
  move: Extract<Move, { type: "scan" }>,
): string | null {
  if (move.tool === "double") {
    if (!doubleScanReady(s, player)) return "Your Double Scan isn't available.";
  } else if (!toolReady(s, move.tool)) return `${SCAN_NAME[move.tool]} isn't ready.`;
  const size = SCAN_SIZE[move.tool];
  const ids = Array.isArray(move.wireIds) ? move.wireIds : [];
  if (ids.length !== size || new Set(ids).size !== size)
    return `Pick ${size} different wire${size === 1 ? "" : "s"}.`;
  const owner = ownerOf(s, ids[0]!);
  if (!owner || owner.id === player) return "Pick wires on one teammate's stand.";
  for (const id of ids) {
    const w = wireAt(s, id);
    if (!w || w.cut || ownerOf(s, id)?.id !== owner.id)
      return "Pick uncut wires on one teammate's stand.";
  }
  const values = Array.isArray(move.values) ? move.values : [];
  const wanted = move.tool === "twoTone" ? 2 : 1;
  if (values.length !== wanted || new Set(values).size !== wanted)
    return move.tool === "twoTone" ? "Name two different numbers." : "Name one number.";
  const mine = remaining(s, player);
  for (const v of values) {
    if (typeof v !== "number") return "Scans name numbers, never yellow or red.";
    if (!mine.some((w) => w.value === v)) return "Call a value that you still hold.";
  }
  if (values.some((v) => blockedValues(s, player).includes(v)))
    return "No echoes: that value was just called.";
  return null;
}

export function validateMove(s: State, player: PlayerId, move: Move): string | null {
  if (!isMove(move)) return "That move isn't allowed.";
  if (s.phase === "over") return "This mission has ended.";
  if (s.phase === "own") {
    if (player !== s.active || move.type !== "cutOwn")
      return "The caller must cut a matching wire.";
    return remaining(s, player).some((w) => w.id === move.wireId && w.value === s.pendingValue)
      ? null
      : "Cut one of your matching uncut wires.";
  }
  if (s.phase === "pick" || s.phase === "place") {
    const p = s.pending!;
    if (player !== p.owner || move.type !== "choose")
      return `${nameOf(s, p.owner)} is choosing a scanned wire.`;
    return p.options.includes(move.wireId) ? null : "Choose one of the highlighted wires.";
  }
  if (s.phase === "clues") {
    if (player !== s.players[s.setupIndex]?.id) return "Choose a starting clue in seat order.";
    if (move.type === "skipClue") {
      return clueOptions(s, player).length === 0 ? null : "You can still place a clue.";
    }
    if (move.type !== "clue") return "Choose a starting clue in seat order.";
    const w = wireAt(s, move.wireId);
    if (!w || !remaining(s, player).some((x) => x.id === w.id) || w.clue || w.value === "RED")
      return "Choose one of your uncut non-red wires.";
    if (
      typeof w.value === "number" &&
      allWires(s).filter((x) => x.clue && x.value === w.value).length >= 2
    )
      return "Both clue tokens for that number are in use.";
    return null;
  }
  // Tools anyone can use, even out of turn.
  if (move.type === "radar") {
    if (!toolReady(s, "radar")) return "Radar isn't ready.";
    if (move.target === player || !s.players.some((p) => p.id === move.target))
      return "Ask about a teammate.";
    const max = Math.max(...allWires(s).map((w) => (typeof w.value === "number" ? w.value : 0)));
    return Number.isInteger(move.value) && move.value >= 1 && move.value <= max
      ? null
      : "Ask about a number on the wires.";
  }
  if (move.type === "swap") {
    if (!toolReady(s, "swap")) return "Swap Radios aren't ready.";
    if (move.target === player || !s.players.some((p) => p.id === move.target))
      return "Swap with a teammate.";
    return remaining(s, player).length && remaining(s, move.target).length
      ? null
      : "Both of you need an uncut wire to swap.";
  }
  if (player !== s.active) return "It is another player's turn.";
  if (move.type === "dampen")
    return toolReady(s, "dampener") && !s.dampened ? null : "The Dampener isn't ready.";
  if (move.type === "scan") return validateScan(s, player, move);
  if (move.type === "revealRed")
    return remaining(s, player).length > 0 && remaining(s, player).every((w) => w.value === "RED")
      ? null
      : "Reveal red only when every wire left in your stand is red.";
  if (move.type === "solo") {
    if (s.twist === "noSolo" && teammatesHaveWires(s, player))
      return "Hands on: no solo cuts while a teammate still has wires.";
    return canSolo(s, player, move.value)
      ? null
      : "A solo cut needs all remaining copies of that value in your hand.";
  }
  if (move.type !== "call") return "Choose a teammate wire to call.";
  const target = wireAt(s, move.wireId);
  if (
    !target ||
    target.cut ||
    !s.players.some((p) => p.id !== player && p.racks.some((r) => r.includes(target)))
  )
    return "Choose an uncut teammate wire.";
  if (move.value === "RED" || !remaining(s, player).some((w) => w.value === move.value))
    return "Call a value that you still hold.";
  if (blockedValues(s, player).includes(move.value))
    return "No echoes: that value was just called.";
  return null;
}

/** Advance the detonator for a miss; returns true if the bomb went off. */
function tick(s: State): boolean {
  s.mistakes += s.twist === "doubleTick" ? 2 : 1;
  if (s.mistakes < s.mistakeLimit) return false;
  s.phase = "over";
  s.result = "lost";
  s.lastText += " The detonator reached its limit.";
  return true;
}

/** A call or scan from `caller` on `wireIds` naming `values`. */
function resolveCall(
  s: State,
  caller: PlayerId,
  wireIds: string[],
  values: WireValue[],
  choose: boolean,
) {
  const wires = wireIds.map((id) => wireAt(s, id)!);
  const owner = ownerOf(s, wireIds[0]!)!.id;
  const hits = wires.filter((w) => values.includes(w.value));
  const name = nameOf(s, caller);
  s.lastCalled = values;
  const damp = s.dampened;
  s.dampened = false;
  for (const v of values)
    s.history.push({ player: caller, value: v, missed: !hits.length, turn: s.turn });

  if (hits.length) {
    if (choose) {
      // Always let the teammate choose, so nobody learns how many matched.
      s.phase = "pick";
      s.outcome = "pick";
      s.pending = { kind: "pick", owner, caller, wireIds, options: hits.map((w) => w.id) };
      s.lastText = `A match! ${nameOf(s, owner)} chooses which scanned wire is cut.`;
      return;
    }
    hitWire(s, hits[0]!);
    s.lastText = `Match! ${name} cuts one of their ${valueText(hits[0]!.value)} wires.`;
    return;
  }
  const safe = wires.filter((w) => w.value !== "RED");
  if (!safe.length) {
    if (damp) {
      s.outcome = "absorbed";
      s.lastText = "The Dampener absorbed the miss: no tick.";
      next(s);
      return;
    }
    wires.forEach((w) => {
      w.cut = true;
    });
    s.outcome = "red";
    s.phase = "over";
    s.result = "lost";
    s.lastText = "A red wire was cut. The bomb exploded.";
    return;
  }
  s.outcome = "miss";
  s.lastText = "No match.";
  if (!damp && tick(s)) {
    if (s.twist !== "silentMisses" && safe.length === 1) safe[0]!.clue = true;
    return;
  }
  if (s.twist === "silentMisses") {
    s.lastText = "No match. Silent misses: no clue.";
    next(s);
    return;
  }
  if (choose) {
    s.phase = "place";
    s.outcome = "place";
    s.pending = { kind: "place", owner, caller, wireIds, options: safe.map((w) => w.id) };
    s.lastText = `No match. ${nameOf(s, owner)} chooses which scanned wire gets the clue.`;
    return;
  }
  safe[0]!.clue = true;
  s.lastText = `No match: that wire is ${wireValueText(safe[0]!)}, now a public clue.`;
  next(s);
}

function hitWire(s: State, target: Wire) {
  target.cut = true;
  s.phase = "own";
  s.outcome = "match";
  s.pending = null;
  s.pendingValue = target.value;
  s.pendingTarget = target.id;
}

function swapWires(s: State, from: PlayerId, to: PlayerId, ctx: MoveContext) {
  const seatOf = (id: PlayerId) => s.players.find((p) => p.id === id)!;
  const pickRandom = (seat: Seat) => {
    const options = seat.racks.flatMap((rack, r) =>
      rack.map((w, i) => ({ w, r, i })).filter((x) => !x.w.cut),
    );
    return ctx.rng.pick(options);
  };
  const a = seatOf(from);
  const b = seatOf(to);
  const mine = pickRandom(a);
  const theirs = pickRandom(b);
  a.racks[mine.r]!.splice(mine.i, 1, theirs.w);
  b.racks[theirs.r]!.splice(theirs.i, 1, mine.w);
  for (const rack of [a.racks[mine.r]!, b.racks[theirs.r]!]) rack.sort((x, y) => x.sort - y.sort);
  s.lastSwap = { from, to, gave: mine.w.id, got: theirs.w.id };
}

export function applyMove(state: State, player: PlayerId, move: Move, ctx: MoveContext): State {
  const error = validateMove(state, player, move);
  if (error) throw new Error(error);
  const s = clone(state);
  s.lastMove = move;
  s.lastSwap = null;
  if (move.type !== "choose") s.outcome = null;
  const name = nameOf(s, player);
  const advanceClues = () => {
    s.setupIndex++;
    if (s.setupIndex === s.players.length) {
      s.phase = "play";
      s.active = s.captain;
      s.lastText = "Starting clues are placed. The captain makes the first call.";
    } else {
      s.active = s.players[s.setupIndex]!.id;
    }
  };
  switch (move.type) {
    case "clue":
      wireAt(s, move.wireId)!.clue = true;
      s.lastText = `${name} placed a starting clue.`;
      advanceClues();
      break;
    case "skipClue":
      s.lastText = `${name} had no wire left to use as a clue.`;
      advanceClues();
      break;
    case "call":
      resolveCall(s, player, [move.wireId], [move.value], false);
      break;
    case "scan":
      if (move.tool === "double") s.doubleScanUsed.push(player);
      else s.tools.find((t) => t.kind === move.tool)!.used = true;
      resolveCall(s, player, move.wireIds, move.values, move.tool !== "twoTone");
      break;
    case "choose": {
      const p = s.pending!;
      const w = wireAt(s, move.wireId)!;
      if (p.kind === "pick") {
        s.active = p.caller;
        hitWire(s, w);
        s.lastText = `Match! ${nameOf(s, p.caller)} cuts one of their ${valueText(w.value)} wires.`;
      } else {
        w.clue = true;
        s.lastText = `The clue goes on ${wireName(s, w.id)}: it's ${wireValueText(w)}.`;
        s.active = p.caller;
        next(s);
      }
      break;
    }
    case "cutOwn": {
      const target = wireAt(s, move.wireId)!;
      if (!remaining(s, player).some((w) => w.id === target.id && w.value === s.pendingValue))
        throw new Error("Choose one of your matching uncut wires.");
      target.cut = true;
      s.lastText = `A pair of ${valueText(target.value)} wires was safely cut.`;
      next(s);
      break;
    }
    case "solo":
      remaining(s, player)
        .filter((w) => w.value === move.value)
        .forEach((w) => {
          w.cut = true;
        });
      s.lastText = `Solo cut: all remaining ${valueText(move.value)} wires are clear.`;
      next(s);
      break;
    case "revealRed":
      remaining(s, player).forEach((w) => {
        w.cut = true;
      });
      s.lastText = `${name} safely revealed their last red wires.`;
      next(s);
      break;
    case "radar": {
      s.tools.find((t) => t.kind === "radar")!.used = true;
      const answer = remaining(s, move.target).some((w) => w.value === move.value);
      s.radar.push({ asker: player, target: move.target, value: move.value, answer });
      s.lastText = `Radar: does ${nameOf(s, move.target)} hold a ${move.value}? ${answer ? "Yes" : "No"}.`;
      break;
    }
    case "swap":
      s.tools.find((t) => t.kind === "swap")!.used = true;
      swapWires(s, player, move.target, ctx);
      s.lastText = `${name} and ${nameOf(s, move.target)} swapped one random wire each.`;
      break;
    case "dampen":
      s.tools.find((t) => t.kind === "dampener")!.used = true;
      s.dampened = true;
      s.lastText = `${name} armed the Dampener for their call.`;
      break;
  }
  return s;
}

export function getPlayerView(s: State, viewer: Viewer): View {
  const over = s.phase === "over";
  const { players: _players, markers, pending, ...table } = clone(s);
  return {
    ...table,
    viewer,
    markers:
      s.twist === "hiddenMarkers" && !over
        ? []
        : markers.map(({ present, ...m }) => (over || !m.uncertain ? { ...m, present } : m)),
    pending: pending
      ? over || pending.owner === viewer
        ? pending
        : {
            kind: pending.kind,
            owner: pending.owner,
            caller: pending.caller,
            wireIds: pending.wireIds,
          }
      : null,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      racks: p.racks.map((rack) =>
        rack.map((wire) => {
          const shown = p.id === viewer || wire.cut || wire.clue || over;
          if (shown) return { ...wire };
          // Hidden: no value, sort position or colour (yellow/red would give it away).
          return { id: wire.id, cut: wire.cut, clue: wire.clue };
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
  const name = nameOf(s, s.active);
  if (s.phase === "pick" || s.phase === "place") {
    const p = s.pending!;
    const mine = p.owner === viewer;
    return {
      text:
        s.phase === "pick"
          ? mine
            ? "A match! Choose which scanned wire is cut"
            : `${nameOf(s, p.owner)} is choosing which wire is cut`
          : mine
            ? "No match: choose which scanned wire gets the clue"
            : `${nameOf(s, p.owner)} is placing the clue`,
      activePlayers: [p.owner],
    };
  }
  const waiting = s.phase === "clues" ? s.players[s.setupIndex]?.id : s.active;
  const waitingName = s.players.find((p) => p.id === waiting)?.name ?? name;
  return {
    text:
      s.phase === "clues"
        ? waiting === viewer
          ? "Your turn: reveal one of your wires as a starting clue"
          : `${waitingName} is choosing a starting clue`
        : s.phase === "own"
          ? viewer === s.active
            ? `Match! Cut one of your ${valueText(s.pendingValue ?? 0)} wires`
            : `${name} is cutting a matching wire`
          : viewer === s.active
            ? "Your turn: call a value on a teammate's wire"
            : `Waiting for ${name} to make a call`,
    activePlayers: waiting ? [waiting] : [],
  };
}

function callText(before: State, after: State, head: string, viewer: Viewer): string {
  const misses = `Detonator ${after.mistakes}/${after.mistakeLimit}.`;
  switch (after.outcome) {
    case "match":
      return `${head}: match!`;
    case "pick": {
      const owner = after.pending!.owner;
      return `${head}: a match! ${owner === viewer ? "You choose" : `${nameOf(after, owner)} chooses`} which wire is cut.`;
    }
    case "red":
      return `${head}: a red wire! The bomb exploded.`;
    case "absorbed":
      return `${head}: no match. The Dampener absorbed it, no tick.`;
    case "place": {
      const owner = after.pending!.owner;
      return `${head}: no match. ${owner === viewer ? "You choose" : `${nameOf(after, owner)} chooses`} which wire gets the clue. ${misses}`;
    }
    case "miss": {
      // The wire that just became a clue (if any) is public.
      const clue = allWires(after).find(
        (w) => w.clue && !allWires(before).find((x) => x.id === w.id)?.clue,
      );
      const damp = before.dampened ? " (Dampener: no tick)" : "";
      return clue
        ? `${head}: no match, it's ${valueText(clue.value)}${damp}. ${misses}`
        : `${head}: no match${damp}. ${misses}`;
    }
    default:
      return head;
  }
}

export function describeMove(
  before: State,
  after: State,
  player: PlayerId,
  move: Move,
  viewer: Viewer,
): ActionDescription {
  const name = player === viewer ? "You" : nameOf(before, player);
  let text: string;
  switch (move.type) {
    case "clue": {
      const w = allWires(after).find((x) => x.id === move.wireId);
      text = `${name} revealed ${wireName(after, move.wireId, viewer, player)} as a clue: ${w ? wireValueText(w) : "?"}.`;
      break;
    }
    case "skipClue":
      text = `${name} had no wire left to use as a clue.`;
      break;
    case "call":
      text = callText(
        before,
        after,
        `${name} called ${valueText(move.value)} on ${wireName(before, move.wireId, viewer)}`,
        viewer,
      );
      break;
    case "scan": {
      const what =
        move.tool === "twoTone"
          ? `${move.values.map(valueText).join(" or ")} on ${wireName(before, move.wireIds[0]!, viewer)}`
          : `${valueText(move.values[0]!)} on ${wiresName(before, move.wireIds, viewer)}`;
      text = callText(before, after, `${name} used ${SCAN_NAME[move.tool]}: ${what}`, viewer);
      break;
    }
    case "choose": {
      const p = before.pending!;
      const w = allWires(after).find((x) => x.id === move.wireId)!;
      text =
        p.kind === "pick"
          ? `${name} cut ${wireName(before, move.wireId, viewer, player)} for the match.`
          : `${name} put the clue on ${wireName(before, move.wireId, viewer, player)}: it's ${wireValueText(w)}.`;
      break;
    }
    case "cutOwn":
      text = `${name} cut ${wireName(before, move.wireId, viewer, player)}: a pair of ${valueText(before.pendingValue ?? 0)}s is safe.`;
      break;
    case "solo":
      text = `${name} solo-cut every remaining ${valueText(move.value)}.`;
      break;
    case "revealRed":
      text = `${name} safely revealed the last red wires.`;
      break;
    case "radar": {
      const r = after.radar[after.radar.length - 1]!;
      const who = move.target === viewer ? "you" : nameOf(after, move.target);
      text = `${name} used Radar: does ${who} hold a ${move.value}? ${r.answer ? "Yes" : "No"}.`;
      break;
    }
    case "swap": {
      const sw = after.lastSwap!;
      const valueOf = (id: string) => valueText(allWires(before).find((w) => w.id === id)!.value);
      // Only the two players involved learn which values moved.
      if (viewer === sw.from)
        text = `You swapped your ${valueOf(sw.gave)} for ${nameOf(after, sw.to)}'s ${valueOf(sw.got)}.`;
      else if (viewer === sw.to)
        text = `${nameOf(after, sw.from)} swapped wires with you: you gave a ${valueOf(sw.got)} and got a ${valueOf(sw.gave)}.`;
      else text = `${name} and ${nameOf(after, sw.to)} swapped one random wire each.`;
      break;
    }
    case "dampen":
      text = `${name} armed the Dampener.`;
      break;
  }
  if (after.result === "won") text += " Every wire is cut. Mission accomplished!";
  const highlight = "wireId" in move ? [move.wireId] : "wireIds" in move ? [...move.wireIds] : [];
  const desc: ActionDescription = {
    text,
    highlight,
    tone: after.result === "lost" ? "bad" : after.result === "won" ? "good" : "normal",
  };
  if (after.result === "lost") return { ...desc, flash: "Bomb exploded" };
  if (after.result === "won") return { ...desc, flash: "Bomb defused!" };
  if (after.mistakes > before.mistakes) return { ...desc, tone: "bad" };
  return desc;
}

/** Up to 3 evenly spread windows of `size` uncut wires on a teammate (for Simulate). */
function sampleWindows(s: State, teammate: PlayerId, size: number): string[][] {
  const wires = remaining(s, teammate);
  if (wires.length < size) return [];
  const last = wires.length - size;
  const starts = Array.from(new Set([0, Math.floor(last / 2), last]));
  return starts.map((i) => wires.slice(i, i + size).map((w) => w.id));
}

export function getLegalMoves(s: State, player: PlayerId): LegalMove<Move>[] {
  if (s.phase === "over") return [];
  if (s.phase === "clues") {
    if (s.players[s.setupIndex]?.id !== player) return [];
    const options = clueOptions(s, player);
    if (options.length === 0)
      return [{ move: { type: "skipClue" }, label: "No clue possible: skip" }];
    return options.map((w) => ({
      move: { type: "clue", wireId: w.id },
      label: `Reveal ${wireName(s, w.id, player)} (${wireValueText(w)}) as your clue`,
      where: "board",
    }));
  }
  if (s.phase === "own")
    return player === s.active
      ? remaining(s, player)
          .filter((w) => w.value === s.pendingValue)
          .map((w) => ({
            move: { type: "cutOwn", wireId: w.id },
            label: `Cut ${wireName(s, w.id, player)} (${wireValueText(w)})`,
            where: "board",
          }))
      : [];
  if (s.phase === "pick" || s.phase === "place") {
    const p = s.pending!;
    if (player !== p.owner) return [];
    return p.options.map((id) => ({
      move: { type: "choose", wireId: id },
      label:
        p.kind === "pick"
          ? `Cut ${wireName(s, id, player)} for the match`
          : `Put the clue on ${wireName(s, id, player)}`,
      where: "board",
    }));
  }
  const moves: LegalMove<Move>[] = [];
  const teammates = s.players.filter((p) => p.id !== player);
  // Tools anyone may use at any time during play.
  if (toolReady(s, "radar")) {
    const max = Math.max(...allWires(s).map((w) => (typeof w.value === "number" ? w.value : 0)));
    for (const t of teammates)
      for (let v = 1; v <= max; v++)
        moves.push({
          move: { type: "radar", target: t.id, value: v },
          label: `Radar: does ${t.name} hold a ${v}?`,
          where: "board",
        });
  }
  if (toolReady(s, "swap") && remaining(s, player).length)
    for (const t of teammates)
      if (remaining(s, t.id).length)
        moves.push({
          move: { type: "swap", target: t.id },
          label: `Swap one random wire with ${t.name}`,
          where: "board",
        });
  if (player !== s.active) return moves;

  const mine = remaining(s, player);
  const blocked = blockedValues(s, player);
  const values = Array.from(new Set(mine.map((w) => w.value))).filter(
    (v) => v !== "RED" && !blocked.includes(v),
  );
  for (const value of values) {
    for (const target of allWires(s).filter((w) => !w.cut && !mine.some((x) => x.id === w.id)))
      moves.push({
        move: { type: "call", wireId: target.id, value },
        label: `Call ${valueText(value)} on ${wireName(s, target.id, player)}`,
        where: "board",
      });
  }
  if (toolReady(s, "dampener") && !s.dampened)
    moves.push({ move: { type: "dampen" }, label: "Arm the Dampener", where: "board" });
  // Scans: a few sample selections (the Board lets players pick any wires).
  const numbers = values.filter((v): v is number => typeof v === "number");
  const scans: ScanTool[] = [];
  if (doubleScanReady(s, player)) scans.push("double");
  if (toolReady(s, "tripleScan")) scans.push("tripleScan");
  for (const tool of scans)
    for (const t of teammates)
      for (const wireIds of sampleWindows(s, t.id, SCAN_SIZE[tool]))
        for (const v of numbers)
          moves.push({
            move: { type: "scan", tool, wireIds, values: [v] },
            label: `${SCAN_NAME[tool]}: ${v} on ${wiresName(s, wireIds, player)}`,
            where: "board",
          });
  if (toolReady(s, "twoTone") && numbers.length >= 2)
    for (const t of teammates)
      for (const wireIds of sampleWindows(s, t.id, 1))
        for (let i = 0; i + 1 < numbers.length; i++) {
          const pair = [numbers[i]!, numbers[i + 1]!];
          moves.push({
            move: { type: "scan", tool: "twoTone", wireIds, values: pair },
            label: `Two-Tone Scan: ${pair.join(" or ")} on ${wireName(s, wireIds[0]!, player)}`,
            where: "board",
          });
        }
  for (const value of Array.from(new Set(mine.map((w) => w.value))))
    if (canSolo(s, player, value))
      // On the board: the matching wires glow, and tapping one offers the solo cut.
      moves.push({
        move: { type: "solo", value },
        label: `Solo cut all ${valueText(value)}s`,
        where: "board",
      });
  if (mine.length && mine.every((w) => w.value === "RED"))
    moves.push({ move: { type: "revealRed" }, label: "Reveal your red wires" });
  return moves;
}
