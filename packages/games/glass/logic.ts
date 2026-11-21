import {
  createDeck,
  createTurnOrder,
  currentPlayer,
  discardCards,
  drawCards,
  nextTurn,
  type Deck,
  type TurnOrder,
} from "@utopia/kit";
import type {
  ActionDescription,
  GameResult,
  GameStatus,
  LegalMove,
  MoveContext,
  PlayerId,
  PlayerInfo,
  SetupContext,
  Viewer,
} from "@utopia/shared";
import type { Config } from "./config.js";

/*
 * Glass: draft coloured glass tiles and set them into your window.
 *
 * - 100 tiles, 20 of each of 5 colours, start in a bag. Each round, every factory gets
 *   4 tiles (5/7/9 factories for 2/3/4 players).
 * - On your turn take every tile of one colour from one factory (the rest slide to the
 *   centre) or from the centre (the first to do so also takes the first-player marker,
 *   which counts as a floor tile). Put them all in one pattern line (lines hold 1–5),
 *   one colour per line, never a colour already in that wall row; extras fall to the
 *   floor (−1 −1 −2 −2 −2 −3 −3). You may drop them all on the floor.
 * - When the factories and centre are empty, each full line sets one tile into the wall
 *   (fixed colour pattern) and scores: 1 alone, else the length of its row run plus its
 *   column run. Floor penalties follow (never below 0). The marker holder starts next.
 * - The game ends after a round in which someone completes a wall row. Bonuses: +2 per
 *   full row, +7 per full column, +10 per colour with all 5 placed. Ties: more full rows.
 */

// ---------------------------------------------------------------- tiles

export const COLORS = ["amber", "cobalt", "ruby", "jade", "onyx"] as const;
export type Color = (typeof COLORS)[number];
export const LETTER: Record<Color, string> = {
  amber: "A",
  cobalt: "C",
  ruby: "R",
  jade: "J",
  onyx: "O",
};

export const SIZE = 5;
export const PER_COLOR = 20;
export const PER_FACTORY = 4;
export const FLOOR_PENALTIES = [-1, -1, -2, -2, -2, -3, -3] as const;
export const factoryCount = (players: number) => 2 * players + 1;

/** The colour of each wall square: each row is the one above shifted right by one. */
export const wallColor = (row: number, col: number): Color => COLORS[(col - row + SIZE) % SIZE]!;
export const wallColumn = (row: number, color: Color) => (COLORS.indexOf(color) + row) % SIZE;

export function allTiles(): Color[] {
  return COLORS.flatMap((c) => Array.from({ length: PER_COLOR }, () => c));
}

// ---------------------------------------------------------------- state

export interface PatternLine {
  color: Color | null;
  count: number;
}

export type FloorTile = Color | "marker";

export interface PlayerBoard {
  lines: PatternLine[];
  /** 25 squares, row by row: true once a tile is set. */
  wall: boolean[];
  floor: FloorTile[];
  score: number;
}

/** -1 is the centre; 0.. are factories. */
export type Source = number;
export const CENTRE = -1;
/** -1 is the floor; 0..4 are pattern lines. */
export const FLOOR = -1;

export interface Tiling {
  player: PlayerId;
  row: number;
  color: Color;
  points: number;
}

export type GameEvent =
  | {
      type: "took";
      player: PlayerId;
      source: Source;
      color: Color;
      count: number;
      line: number;
      toFloor: number;
      marker: boolean;
    }
  | { type: "roundScored"; round: number; tilings: Tiling[]; penalties: Record<PlayerId, number> }
  | { type: "bonus"; player: PlayerId; rows: number; cols: number; colors: number; points: number }
  | { type: "newRound"; round: number; first: PlayerId }
  | { type: "over" };

export interface Table {
  config: Config;
  players: PlayerInfo[];
  phase: "draft" | "over";
  round: number;
  turn: TurnOrder;
  factories: Color[][];
  centre: Color[];
  markerInCentre: boolean;
  boards: Record<PlayerId, PlayerBoard>;
  /** Who took the marker this round (starts the next one). */
  nextFirst: PlayerId | null;
  /** Who started this round (starts again if nobody took the marker). */
  starter: PlayerId;
}

export interface State extends Table {
  /** drawPile is the bag (order hidden), discardPile the box lid. */
  bag: Deck<Color>;
  events: GameEvent[];
}

export interface View extends Table {
  bagCount: number;
  lidCount: number;
}

export type Move = { type: "take"; source: Source; color: Color; line: number };

// ---------------------------------------------------------------- setup

const emptyBoard = (): PlayerBoard => ({
  lines: Array.from({ length: SIZE }, () => ({ color: null, count: 0 })),
  wall: Array.from({ length: SIZE * SIZE }, () => false),
  floor: [],
  score: 0,
});

function fillFactories(s: State, rng: MoveContext["rng"]) {
  s.factories = Array.from({ length: factoryCount(s.players.length) }, () => {
    const drawn = drawCards(s.bag, rng, PER_FACTORY);
    s.bag = drawn.deck;
    return drawn.cards;
  });
  s.centre = [];
  s.markerInCentre = true;
  s.nextFirst = null;
}

export function setup(ctx: SetupContext, config: Config): State {
  const ids = ctx.players.map((p) => p.id);
  if (ids.length < 2 || ids.length > 4) throw new Error("Glass is for 2–4 players");
  const s: State = {
    config,
    players: ctx.players,
    phase: "draft",
    round: 1,
    turn: createTurnOrder(ids, ctx.rng.int(0, ids.length - 1)),
    factories: [],
    centre: [],
    markerInCentre: true,
    boards: Object.fromEntries(ids.map((id) => [id, emptyBoard()])),
    nextFirst: null,
    starter: "",
    bag: createDeck(allTiles(), ctx.rng),
    events: [],
  };
  fillFactories(s, ctx.rng);
  s.starter = currentPlayer(s.turn);
  return s;
}

// ---------------------------------------------------------------- helpers

export const nameOf = (t: Pick<Table, "players">, id: PlayerId) =>
  t.players.find((p) => p.id === id)?.name ?? id;

export const hasOnWall = (board: PlayerBoard, row: number, color: Color) =>
  board.wall[row * SIZE + wallColumn(row, color)] === true;

/** Can these tiles go into this pattern line (0-based)? */
export function canPlace(board: PlayerBoard, line: number, color: Color): boolean {
  const l = board.lines[line];
  if (!l) return false;
  if (hasOnWall(board, line, color)) return false;
  if (l.color !== null && l.color !== color) return false;
  return l.count < line + 1;
}

export const sourceTiles = (t: Pick<Table, "factories" | "centre">, source: Source) =>
  source === CENTRE ? t.centre : (t.factories[source] ?? []);

/** Points for a tile just set at (row, col): 1 alone, else the row run plus the column run. */
export function tileScore(wall: readonly boolean[], row: number, col: number): number {
  const at = (r: number, c: number) =>
    r >= 0 && r < SIZE && c >= 0 && c < SIZE && wall[r * SIZE + c];
  let h = 1;
  for (let c = col - 1; at(row, c); c--) h++;
  for (let c = col + 1; at(row, c); c++) h++;
  let v = 1;
  for (let r = row - 1; at(r, col); r--) v++;
  for (let r = row + 1; at(r, col); r++) v++;
  if (h > 1 && v > 1) return h + v;
  return h > 1 ? h : v;
}

export function floorPenalty(floor: readonly FloorTile[]): number {
  return floor.slice(0, FLOOR_PENALTIES.length).reduce((n, _, i) => n + FLOOR_PENALTIES[i]!, 0);
}

export const fullRows = (b: PlayerBoard) =>
  Array.from({ length: SIZE }, (_, r) => r).filter((r) =>
    b.wall.slice(r * SIZE, r * SIZE + SIZE).every(Boolean),
  ).length;

export const fullCols = (b: PlayerBoard) =>
  Array.from({ length: SIZE }, (_, c) => c).filter((c) =>
    Array.from({ length: SIZE }, (_, r) => b.wall[r * SIZE + c]).every(Boolean),
  ).length;

export const fullColors = (b: PlayerBoard) =>
  COLORS.filter((color) =>
    Array.from({ length: SIZE }, (_, r) => r).every((r) => hasOnWall(b, r, color)),
  ).length;

export const endBonus = (b: PlayerBoard) => 2 * fullRows(b) + 7 * fullCols(b) + 10 * fullColors(b);

const sourceName = (source: Source) => (source === CENTRE ? "the centre" : `factory ${source + 1}`);
const lineName = (line: number) => (line === FLOOR ? "the floor" : `line ${line + 1}`);

export function moveLabel(t: Table, player: PlayerId, move: Move): string {
  const count = sourceTiles(t, move.source).filter((c) => c === move.color).length;
  const board = t.boards[player]!;
  let extra = "";
  if (move.line !== FLOOR) {
    const l = board.lines[move.line]!;
    const over = Math.max(0, count - (move.line + 1 - l.count));
    if (over) extra = ` (${over} to the floor)`;
  }
  const marker = move.source === CENTRE && t.markerInCentre ? " + first-player marker" : "";
  return `Take ${count} ${move.color} from ${sourceName(move.source)} → ${lineName(move.line)}${extra}${marker}`;
}

// ---------------------------------------------------------------- moves

export function getLegalMoves(state: State, player: PlayerId): LegalMove<Move>[] {
  if (state.phase !== "draft" || currentPlayer(state.turn) !== player) return [];
  const board = state.boards[player]!;
  const moves: LegalMove<Move>[] = [];
  const sources = [...state.factories.map((_, i) => i), CENTRE];
  for (const source of sources) {
    const tiles = sourceTiles(state, source);
    for (const color of COLORS) {
      if (!tiles.includes(color)) continue;
      for (let line = 0; line < SIZE; line++) {
        if (!canPlace(board, line, color)) continue;
        const move: Move = { type: "take", source, color, line };
        moves.push({ move, label: moveLabel(state, player, move), where: "board" });
      }
      const floor: Move = { type: "take", source, color, line: FLOOR };
      moves.push({ move: floor, label: moveLabel(state, player, floor), where: "board" });
    }
  }
  return moves;
}

export function validateMove(state: State, player: PlayerId, move: Move): string | null {
  if (state.phase === "over") return "The game is over.";
  if (currentPlayer(state.turn) !== player) return "It's not your turn.";
  if (move?.type !== "take") return "That move isn't allowed.";
  const { source, color, line } = move;
  if (
    source !== CENTRE &&
    !(Number.isInteger(source) && source >= 0 && source < state.factories.length)
  ) {
    return "Pick a factory or the centre.";
  }
  if (!COLORS.includes(color)) return "Pick a colour.";
  if (!sourceTiles(state, source).includes(color)) return `No ${color} there.`;
  if (line === FLOOR) return null;
  if (!Number.isInteger(line) || line < 0 || line >= SIZE) return "Pick a line.";
  const board = state.boards[player]!;
  const l = board.lines[line]!;
  if (hasOnWall(board, line, color)) return `Your wall already has ${color} in row ${line + 1}.`;
  if (l.color !== null && l.color !== color) return `Line ${line + 1} already holds ${l.color}.`;
  if (l.count >= line + 1) return `Line ${line + 1} is full.`;
  return null;
}

/** Put tiles on the floor; past 7 they go to the lid. */
function toFloor(s: State, board: PlayerBoard, tiles: FloorTile[]) {
  for (const t of tiles) {
    if (board.floor.length < FLOOR_PENALTIES.length || t === "marker") board.floor.push(t);
    else s.bag = discardCards(s.bag, [t]);
  }
}

function scoreRound(s: State) {
  const tilings: Tiling[] = [];
  const penalties: Record<PlayerId, number> = {};
  for (const p of s.players) {
    const b = s.boards[p.id]!;
    b.lines.forEach((l, row) => {
      if (l.color === null || l.count < row + 1) return;
      const col = wallColumn(row, l.color);
      b.wall[row * SIZE + col] = true;
      const points = tileScore(b.wall, row, col);
      b.score += points;
      tilings.push({ player: p.id, row, color: l.color, points });
      s.bag = discardCards(
        s.bag,
        Array.from({ length: row }, () => l.color as Color),
      );
      b.lines[row] = { color: null, count: 0 };
    });
    const penalty = floorPenalty(b.floor);
    penalties[p.id] = penalty;
    b.score = Math.max(0, b.score + penalty);
    s.bag = discardCards(
      s.bag,
      b.floor.filter((t): t is Color => t !== "marker"),
    );
    b.floor = [];
  }
  s.events.push({ type: "roundScored", round: s.round, tilings, penalties });
}

function endRound(s: State, rng: MoveContext["rng"]) {
  scoreRound(s);
  const first = s.nextFirst ?? s.starter;
  if (s.players.some((p) => fullRows(s.boards[p.id]!) > 0)) {
    finishGame(s);
    return;
  }
  s.round += 1;
  fillFactories(s, rng);
  if (s.factories.every((f) => f.length === 0)) {
    finishGame(s); // no tiles left anywhere to draft
    return;
  }
  s.starter = first;
  s.turn = { ...s.turn, current: s.turn.players.indexOf(first) };
  s.events.push({ type: "newRound", round: s.round, first });
}

function finishGame(s: State) {
  for (const p of s.players) {
    const b = s.boards[p.id]!;
    const points = endBonus(b);
    b.score += points;
    s.events.push({
      type: "bonus",
      player: p.id,
      rows: fullRows(b),
      cols: fullCols(b),
      colors: fullColors(b),
      points,
    });
  }
  s.phase = "over";
  s.events.push({ type: "over" });
}

export function applyMove(state: State, player: PlayerId, move: Move, ctx: MoveContext): State {
  const s = structuredClone(state);
  s.events = [];
  const board = s.boards[player]!;
  const tiles = sourceTiles(s, move.source);
  const taken = tiles.filter((c) => c === move.color);
  const rest = tiles.filter((c) => c !== move.color);
  let marker = false;
  if (move.source === CENTRE) {
    s.centre = rest;
    if (s.markerInCentre) {
      marker = true;
      s.markerInCentre = false;
      s.nextFirst = player;
      toFloor(s, board, ["marker"]);
    }
  } else {
    s.factories[move.source] = [];
    s.centre.push(...rest);
  }
  let placed = 0;
  if (move.line !== FLOOR) {
    const l = board.lines[move.line]!;
    placed = Math.min(taken.length, move.line + 1 - l.count);
    board.lines[move.line] = { color: move.color, count: l.count + placed };
  }
  const over = taken.slice(placed);
  toFloor(s, board, over);
  s.events.push({
    type: "took",
    player,
    source: move.source,
    color: move.color,
    count: taken.length,
    line: move.line,
    toFloor: over.length,
    marker,
  });
  const empty = s.factories.every((f) => f.length === 0) && s.centre.length === 0;
  if (empty) endRound(s, ctx.rng);
  else s.turn = nextTurn(s.turn);
  return s;
}

// ---------------------------------------------------------------- views and text

export function getPlayerView(state: State, _viewer: Viewer): View {
  const { bag, events: _events, ...table } = state;
  return { ...table, bagCount: bag.drawPile.length, lidCount: bag.discardPile.length };
}

function ranking(t: Table) {
  return t.players
    .map((p) => ({ player: p.id, score: t.boards[p.id]!.score, rows: fullRows(t.boards[p.id]!) }))
    .sort((a, b) => b.score - a.score || b.rows - a.rows);
}

export function getResult(state: State): GameResult | null {
  if (state.phase !== "over") return null;
  const ranked = ranking(state);
  const best = ranked[0]!;
  const winners = ranked
    .filter((r) => r.score === best.score && r.rows === best.rows)
    .map((r) => r.player);
  const names = winners.map((id) => nameOf(state, id));
  return {
    winners,
    ranking: ranked.map(({ player, score }) => ({ player, score })),
    text:
      winners.length === 1
        ? `${names[0]} wins with ${best.score} points!`
        : `${names.join(" and ")} share the win with ${best.score} points!`,
  };
}

export function getStatus(state: State, viewer: Viewer): GameStatus {
  if (state.phase === "over")
    return { text: getResult(state)?.text ?? "Game over", activePlayers: [] };
  const who = currentPlayer(state.turn);
  return {
    text:
      viewer === who
        ? "Your turn: take one colour from a factory or the centre"
        : `Waiting for ${nameOf(state, who)}`,
    activePlayers: [who],
  };
}

function eventText(state: State, e: GameEvent, viewer: Viewer): string {
  const Name = (id: PlayerId) => (id === viewer ? "You" : nameOf(state, id));
  switch (e.type) {
    case "took": {
      const where = e.line === FLOOR ? "the floor" : `line ${e.line + 1}`;
      const spill = e.line !== FLOOR && e.toFloor ? ` (${e.toFloor} to the floor)` : "";
      const marker = e.marker ? " and the first-player marker" : "";
      return `${Name(e.player)} took ${e.count} ${e.color} from ${
        e.source === CENTRE ? "the centre" : `factory ${e.source + 1}`
      }${marker} → ${where}${spill}.`;
    }
    case "roundScored": {
      const parts = state.players.map((p) => {
        const gained = e.tilings.filter((t) => t.player === p.id).reduce((n, t) => n + t.points, 0);
        const pen = e.penalties[p.id] ?? 0;
        return `${Name(p.id)} +${gained}${pen ? `, floor ${pen}` : ""}`;
      });
      return `Round ${e.round} scored: ${parts.join("; ")}.`;
    }
    case "bonus":
      return e.points
        ? `${Name(e.player)} ${e.player === viewer ? "get" : "gets"} +${e.points} bonus.`
        : "";
    case "newRound":
      return `Round ${e.round}: ${Name(e.first)} ${e.first === viewer ? "start" : "starts"}.`;
    case "over":
      return getResult(state)?.text ?? "Game over.";
  }
}

export function describeMove(
  _before: State,
  after: State,
  player: PlayerId,
  move: Move,
  viewer: Viewer,
): ActionDescription {
  const text = after.events
    .map((e) => eventText(after, e, viewer))
    .filter(Boolean)
    .join(" ");
  const desc: ActionDescription = { text };
  const highlight = move.line !== FLOOR ? [`line-${player}-${move.line}`] : [];
  // Tiles just set into walls, so boards can point them out.
  for (const e of after.events) {
    if (e.type !== "roundScored") continue;
    for (const t of e.tilings)
      highlight.push(`wall-${t.player}-${t.row * SIZE + wallColumn(t.row, t.color)}`);
  }
  if (highlight.length) desc.highlight = highlight;
  if (after.events.some((e) => e.type === "over")) {
    const winners = getResult(after)?.winners ?? [];
    const won = viewer !== "spectator" && winners.includes(viewer);
    return {
      ...desc,
      tone: won ? "good" : "normal",
      flash: won ? "You win!" : `${winners.map((w) => nameOf(after, w)).join(" & ")} wins!`,
    };
  }
  if (after.events.some((e) => e.type === "roundScored"))
    return { ...desc, tone: "good", flash: "Round scored!" };
  return desc;
}
