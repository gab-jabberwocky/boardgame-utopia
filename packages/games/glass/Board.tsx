import { useState, type ReactNode } from "react";
import type { BoardProps, LegalMove, PlayerInfo } from "@utopia/shared";
import {
  CENTRE,
  COLORS,
  FLOOR,
  FLOOR_PENALTIES,
  LETTER,
  SIZE,
  sourceTiles,
  wallColor,
  type Color,
  type Move,
  type PlayerBoard,
  type Source,
  type View,
} from "./logic.js";

/** Scores, for the shell's player list. */
export function playerDecor(view: View) {
  return {
    scores: Object.fromEntries(view.players.map((p) => [p.id, `${view.boards[p.id]?.score ?? 0}`])),
  };
}

// ---------------------------------------------------------------- tiles

const GLASS: Record<Color, { bg: string; ink: string }> = {
  amber: { bg: "#f59e0b", ink: "#451a03" },
  cobalt: { bg: "#2563eb", ink: "#dbeafe" },
  ruby: { bg: "#dc2626", ink: "#fee2e2" },
  jade: { bg: "#059669", ink: "#d1fae5" },
  // Smoky grey rather than near-black, so onyx tiles stand out on the dark table.
  onyx: { bg: "#71717a", ink: "#fafafa" },
};

const SIZES = {
  xs: "h-3 w-3 rounded-[2px] text-[7px]",
  sm: "h-5 w-5 rounded text-[9px]",
  fa: "h-6 w-6 rounded text-[10px]",
  md: "h-7 w-7 rounded-md text-[11px]",
} as const;

/**
 * picked: part of the colour you picked. dim: in the same factory but not picked.
 * preview: where your picked tiles would land. fresh: just set into the wall.
 */
type Mark = "picked" | "dim" | "preview" | "fresh";

function Tile({
  color,
  size = "md",
  ghost = false,
  mark,
}: {
  color: Color;
  size?: keyof typeof SIZES;
  /** An empty wall square: the colour it wants, faintly. */
  ghost?: boolean;
  mark?: Mark | undefined;
}) {
  const g = GLASS[color];
  const marks: Record<Mark, string> = {
    picked: "ring-2 ring-amber-300 scale-110",
    dim: "opacity-35",
    preview: "opacity-60 ring-2 ring-dashed ring-amber-300",
    fresh: "animate-pulse ring-2 ring-amber-300",
  };
  return (
    <span
      aria-label={ghost ? `empty ${color} square` : color}
      className={`inline-flex shrink-0 items-center justify-center font-black transition ${SIZES[size]} ${
        mark ? marks[mark] : ""
      }`}
      style={{
        background: ghost ? `${g.bg}33` : `linear-gradient(135deg, ${g.bg}, ${g.bg}cc)`,
        color: ghost ? `${g.bg}aa` : g.ink,
        boxShadow: ghost ? `inset 0 0 0 1px ${g.bg}66` : "inset 0 0 0 1px #ffffff40",
      }}
    >
      {/* Secret mode greys out colours: say which glass it is. */}
      <span className="hidden secret:inline">
        {ghost ? LETTER[color].toLowerCase() : LETTER[color]}
      </span>
    </span>
  );
}

function Empty({ size = "md" }: { size?: keyof typeof SIZES }) {
  return (
    <span
      className={`inline-block shrink-0 border border-slate-600/60 bg-slate-950/50 ${SIZES[size]}`}
    />
  );
}

function Marker({
  size = "md",
  preview = false,
}: {
  size?: keyof typeof SIZES;
  preview?: boolean;
}) {
  return (
    <span
      title="First-player marker"
      className={`inline-flex items-center justify-center bg-white font-black text-slate-900 ${SIZES[size]} ${
        preview ? "opacity-60 ring-2 ring-amber-300" : ""
      }`}
    >
      1
    </span>
  );
}

const sameMove = (a: Move | null, b: Move) => !!a && JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- boards

function Wall({
  board,
  size,
  fresh,
}: {
  board: PlayerBoard;
  size: keyof typeof SIZES;
  fresh: (index: number) => boolean;
}) {
  return (
    <div className="grid grid-cols-5 gap-0.5">
      {Array.from({ length: SIZE * SIZE }, (_, i) => {
        const color = wallColor(Math.floor(i / SIZE), i % SIZE);
        return (
          <Tile
            key={i}
            color={color}
            size={size}
            ghost={!board.wall[i]}
            mark={board.wall[i] && fresh(i) ? "fresh" : undefined}
          />
        );
      })}
    </div>
  );
}

/** What a proposed move would do to your board. */
interface Preview {
  color: Color;
  line: number;
  intoLine: number;
  toFloor: number;
  marker: boolean;
}

function Floor({ board, preview }: { board: PlayerBoard; preview: Preview | null }) {
  // Preview tiles go into the next free floor spaces (the marker first).
  const extra: ("marker" | Color)[] = preview
    ? [
        ...(preview.marker ? (["marker"] as const) : []),
        ...Array.from({ length: preview.toFloor }, () => preview.color),
      ]
    : [];
  return (
    <div className="flex gap-0.5">
      {FLOOR_PENALTIES.map((pen, i) => {
        const t = board.floor[i];
        const p = extra[i - board.floor.length];
        return (
          <div key={i} className="flex flex-col items-center">
            {t === "marker" ? (
              <Marker />
            ) : t ? (
              <Tile color={t} />
            ) : p === "marker" ? (
              <Marker preview />
            ) : p ? (
              <Tile color={p} mark="preview" />
            ) : (
              <Empty />
            )}
            <span className="text-[9px] text-red-300">{pen}</span>
          </div>
        );
      })}
    </div>
  );
}

function YourBoard({
  me,
  board,
  picking,
  lineMove,
  floorMove,
  proposed,
  propose,
  preview,
  active,
  fresh,
}: {
  me: PlayerInfo;
  board: PlayerBoard;
  picking: boolean;
  lineMove: (line: number) => LegalMove<Move> | undefined;
  floorMove: LegalMove<Move> | undefined;
  proposed: Move | null;
  propose: (move: Move, label: string) => void;
  preview: Preview | null;
  active: boolean;
  fresh: (index: number) => boolean;
}) {
  return (
    <section
      aria-label="Your window"
      className="rounded-2xl border-2 p-3"
      style={{
        borderColor: me.color,
        background: `linear-gradient(180deg, ${me.color}26, #0f172a 70%)`,
        boxShadow: active ? `0 0 0 4px ${me.color}44` : undefined,
      }}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <span
          className="text-[11px] font-bold tracking-widest uppercase"
          style={{ color: me.color }}
        >
          Your window
        </span>
        <span className="text-2xl font-black">
          {board.score} <span className="text-xs font-normal text-slate-400">pts</span>
        </span>
      </div>
      <div className="flex items-start justify-center gap-2">
        {/* Pattern lines: a staircase of 1–5 spaces, filled from the right */}
        <div className="flex flex-col items-end gap-0.5">
          {board.lines.map((l, row) => {
            const move = picking ? lineMove(row) : undefined;
            const picked = !!move && sameMove(proposed, move.move);
            const into = preview && preview.line === row ? preview.intoLine : 0;
            return (
              <button
                key={row}
                type="button"
                disabled={!move}
                onClick={() => move && propose(move.move, move.label)}
                aria-label={`Pattern line ${row + 1}`}
                className={`inline-flex gap-0.5 rounded-md p-0.5 ${
                  picked
                    ? "bg-amber-400/20 ring-2 ring-amber-400"
                    : move
                      ? "bg-emerald-400/15 ring-1 ring-emerald-400"
                      : ""
                }`}
              >
                {Array.from({ length: row + 1 }, (_, i) => {
                  // Tiles fill from the right: the rightmost spaces fill first.
                  const fromRight = row - i;
                  if (fromRight < l.count && l.color) return <Tile key={i} color={l.color} />;
                  if (preview && fromRight < l.count + into) {
                    return <Tile key={i} color={preview.color} mark="preview" />;
                  }
                  return <Empty key={i} />;
                })}
              </button>
            );
          })}
        </div>
        <span className="mt-1 text-slate-600">▸</span>
        <Wall board={board} size="md" fresh={fresh} />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <Floor board={board} preview={preview} />
        {picking && floorMove && (
          <button
            type="button"
            onClick={() => propose(floorMove.move, floorMove.label)}
            className={`min-h-10 rounded-lg px-2 text-xs font-bold ${
              sameMove(proposed, floorMove.move)
                ? "bg-amber-400 text-slate-900"
                : "bg-slate-700 text-white"
            }`}
          >
            All to floor
          </button>
        )}
      </div>
      {preview && preview.toFloor > 0 && preview.line !== FLOOR && (
        <p className="mt-1 text-center text-xs text-red-300">
          {preview.toFloor} won't fit and {preview.toFloor === 1 ? "falls" : "fall"} to the floor
        </p>
      )}
    </section>
  );
}

function OtherBoard({
  player,
  board,
  active,
  fresh,
}: {
  player: PlayerInfo;
  board: PlayerBoard;
  active: boolean;
  fresh: (index: number) => boolean;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-xl border-2 bg-slate-900/70 p-2"
      style={{ borderColor: active ? player.color : "#1e293b" }}
    >
      <span className="flex items-center gap-1.5 text-sm">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: player.color }} />
        <span className="truncate font-semibold">
          {active && "▶ "}
          {player.name}
        </span>
        <span className="ml-auto font-black">{board.score}</span>
      </span>
      <div className="flex items-start justify-center gap-1">
        <div className="flex flex-col items-end gap-px">
          {board.lines.map((l, row) => (
            <div key={row} className="flex gap-px">
              {Array.from({ length: row + 1 }, (_, i) =>
                row - i < l.count && l.color ? (
                  <Tile key={i} color={l.color} size="xs" />
                ) : (
                  <Empty key={i} size="xs" />
                ),
              )}
            </div>
          ))}
        </div>
        <Wall board={board} size="xs" fresh={fresh} />
      </div>
      {board.floor.length > 0 && (
        <span className="text-center text-[10px] text-red-300">
          floor: {board.floor.length} tile{board.floor.length === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the table

const REFERENCE: [string, ReactNode][] = [
  ["Take", "All tiles of one colour from a factory (rest to the centre) or from the centre."],
  [
    "First",
    "First to take from the centre also takes the 1 marker (a floor tile) and starts next round.",
  ],
  [
    "Place",
    "One line, one colour, not a colour already in that wall row. Extras fall to the floor.",
  ],
  ["Floor", "−1 −1 −2 −2 −2 −3 −3. Score never drops below 0."],
  ["Tile", "Round end: full lines set one tile. Alone 1, else row run + column run."],
  ["End", "After a round with a full wall row. +2 per row, +7 per column, +10 per full colour."],
];

export default function Board({
  view,
  viewer,
  highlight,
  legalMoves,
  proposed,
  propose,
  cancel,
  submit,
}: BoardProps<View, Move>) {
  const current = view.turn.players[view.turn.current];
  const myTurn = view.phase === "draft" && current === viewer;
  const me = view.players.find((p) => p.id === viewer);

  // The picked factory/centre colour resets when the game moves on.
  const sig = JSON.stringify([
    view.round,
    view.turn.current,
    view.centre.length,
    view.factories.map((f) => f.length),
  ]);
  const [sel, setSel] = useState<{
    sig: string;
    pick: { source: Source; color: Color } | null;
  }>({ sig, pick: null });
  const pick = sel.sig === sig ? sel.pick : null;
  const choose = (source: Source, color: Color) => {
    const same = pick?.source === source && pick.color === color;
    setSel({ sig, pick: same ? null : { source, color } });
    cancel();
  };
  const moveFor = (line: number) =>
    pick
      ? legalMoves.find(
          (m) =>
            m.move.source === pick.source && m.move.color === pick.color && m.move.line === line,
        )
      : undefined;
  const markFor = (source: Source, color: Color): Mark | undefined =>
    pick?.source === source ? (pick.color === color ? "picked" : "dim") : undefined;

  const proposedLabel = proposed
    ? legalMoves.find((m) => sameMove(proposed, m.move))?.label
    : undefined;

  // What the proposed move would do to your board.
  const myBoard = me ? view.boards[me.id] : undefined;
  let preview: Preview | null = null;
  if (proposed && myBoard) {
    const count = sourceTiles(view, proposed.source).filter((c) => c === proposed.color).length;
    const room =
      proposed.line === FLOOR ? 0 : proposed.line + 1 - (myBoard.lines[proposed.line]?.count ?? 0);
    const intoLine = Math.min(count, Math.max(0, room));
    preview = {
      color: proposed.color,
      line: proposed.line,
      intoLine,
      toFloor: count - intoLine,
      marker: proposed.source === CENTRE && view.markerInCentre,
    };
  }

  const freshFor = (player: string) => (index: number) =>
    highlight.includes(`wall-${player}-${index}`);
  const others = view.players.filter((p) => p.id !== viewer);
  const centreGroups = COLORS.map((c) => ({
    color: c,
    n: view.centre.filter((x) => x === c).length,
  })).filter((g) => g.n > 0);
  const pickedCount = pick
    ? sourceTiles(view, pick.source).filter((c) => c === pick.color).length
    : 0;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-3 @2xl:grid @2xl:max-w-5xl @2xl:grid-cols-2 @2xl:items-start @2xl:gap-x-6 @2xl:px-6">
      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {/* Factories and centre */}
        <section aria-label="Factories" className="order-1 rounded-2xl bg-slate-900/70 p-2.5">
          <p className="mb-1.5 flex justify-between text-[10px] tracking-wide text-slate-400 uppercase">
            <span>Round {view.round}</span>
            <span>
              bag {view.bagCount} · lid {view.lidCount}
            </span>
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {view.factories.map((f, i) => (
              <div
                key={i}
                className={`grid aspect-square grid-cols-2 place-items-center rounded-full p-1 ${
                  pick?.source === i ? "bg-amber-400/20 ring-2 ring-amber-400" : "bg-slate-800"
                } ${f.length === 0 ? "opacity-30" : ""}`}
                aria-label={`Factory ${i + 1}`}
              >
                {f.map((c, k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={!myTurn}
                    onClick={() => choose(i, c)}
                    aria-label={`Factory ${i + 1} ${c}`}
                    className="p-0.5"
                  >
                    <Tile color={c} size="fa" mark={markFor(i, c)} />
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl bg-slate-950/50 p-1.5">
            <span className="text-[10px] tracking-wide text-slate-500 uppercase">Centre</span>
            {view.markerInCentre && (
              <span className="flex items-center gap-1 text-[10px] leading-tight text-slate-400">
                <Marker />
                first
                <br />
                player
              </span>
            )}
            {centreGroups.map((g) => (
              <button
                key={g.color}
                type="button"
                disabled={!myTurn}
                onClick={() => choose(CENTRE, g.color)}
                aria-label={`Centre ${g.n} ${g.color}`}
                className={`flex min-h-10 items-center gap-1 rounded-lg px-1.5 ${
                  pick?.source === CENTRE && pick.color === g.color
                    ? "bg-amber-400/20 ring-2 ring-amber-400"
                    : ""
                }`}
              >
                <Tile color={g.color} mark={markFor(CENTRE, g.color)} />
                <span className="text-xs font-bold">×{g.n}</span>
              </button>
            ))}
            {centreGroups.length === 0 && <span className="text-xs text-slate-600">empty</span>}
          </div>
          {myTurn && (
            <p className="mt-2 text-center text-xs text-amber-100/80">
              {pick
                ? `${pickedCount} ${pick.color} picked: tap a glowing line, or All to floor.`
                : "Tap a colour in a factory or the centre."}
            </p>
          )}
        </section>

        {me && myBoard && (
          <div className="order-2">
            <YourBoard
              me={me}
              board={myBoard}
              picking={myTurn && !!pick}
              lineMove={moveFor}
              floorMove={moveFor(FLOOR)}
              proposed={proposed}
              propose={propose}
              preview={preview}
              active={myTurn}
              fresh={freshFor(me.id)}
            />
          </div>
        )}
      </div>

      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        <section aria-label="Other players" className="order-3 grid grid-cols-2 gap-1.5">
          {others.map((p) => (
            <OtherBoard
              key={p.id}
              player={p}
              board={view.boards[p.id]!}
              active={current === p.id}
              fresh={freshFor(p.id)}
            />
          ))}
        </section>

        <section aria-label="Rules reference" className="order-4 rounded-xl bg-slate-900/60 p-2.5">
          <table className="w-full border-separate border-spacing-y-1 text-xs">
            <tbody>
              {REFERENCE.map(([name, text]) => (
                <tr key={name}>
                  <th
                    scope="row"
                    className="w-14 pr-2 text-left align-top font-semibold text-slate-200"
                  >
                    {name}
                  </th>
                  <td className="text-slate-400">{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {proposed && proposedLabel && (
        <div className="sticky bottom-2 z-10 order-5 flex gap-2 rounded-2xl border border-amber-400/50 bg-slate-950/95 p-2 shadow-xl @2xl:col-span-2">
          <button
            type="button"
            onClick={() => {
              setSel({ sig, pick: null });
              cancel();
            }}
            className="min-h-12 rounded-xl bg-slate-700 px-4 font-bold text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit(proposed)}
            className="min-h-12 flex-1 rounded-xl bg-amber-400 px-3 text-sm font-bold text-slate-900"
          >
            {proposedLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export { docView } from "./doc.js";
