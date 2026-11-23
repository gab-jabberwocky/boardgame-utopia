import { useState, type ReactNode } from "react";
import type { LegalMove } from "@utopia/shared";
import type { GameScreenProps } from "./GameScreen";

/*
 * Secret mode's game screen: the whole game as a plain text document in a code-editor
 * style, for players who know the game well. Status, players, table, a short log, and
 * the moves as a numbered command list (tap one, then confirm). No pictures, no colour.
 */

const MAX_SHOWN = 30;

/** Drop emoji and card symbols so the document stays plain text. */
const plain = (text: string) =>
  text
    .replace(/[\p{Extended_Pictographic}\u{1F0A0}-\u{1F0FF}]/gu, "")
    .replace(/\u{FE0F}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/** The view data as an indented outline, for games without their own text view. */
export function outline(value: unknown, indent = ""): string[] {
  if (value === null || typeof value !== "object") return [`${indent}${String(value)}`];
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  const lines: string[] = [];
  for (const [k, v] of entries) {
    const flat =
      v === null ||
      typeof v !== "object" ||
      (Array.isArray(v) && v.every((x) => x === null || typeof x !== "object"));
    if (flat) lines.push(`${indent}${k}: ${Array.isArray(v) ? `[${v.join(", ")}]` : String(v)}`);
    else lines.push(`${indent}${k}:`, ...outline(v, `${indent}  `));
  }
  return lines;
}

function Line({ n, children, tone }: { n: number; children: ReactNode; tone?: string }) {
  return (
    <div className="flex">
      <span className="w-8 shrink-0 pr-2 text-right text-[#5a5a5a] select-none">{n}</span>
      <span className={`min-w-0 flex-1 break-words whitespace-pre-wrap ${tone ?? ""}`}>
        {children}
      </span>
    </div>
  );
}

const toneOf = (text: string) =>
  text.startsWith("#")
    ? "text-[#9cdcfe]"
    : text.startsWith("//")
      ? "text-[#6a9955]"
      : text.startsWith(">")
        ? "text-[#dcdcaa]"
        : undefined;

export function DocScreen({
  game,
  snapshot,
  players,
  viewer,
  version,
  onMove,
  onBackToLobby,
}: GameScreenProps) {
  const [proposal, setProposal] = useState<{ version: number; index: number } | null>(null);
  const [filter, setFilter] = useState("");
  const moves = snapshot.legalMoves;
  const picked = proposal?.version === version ? moves[proposal.index] : undefined;
  const mine = snapshot.status.activePlayers.includes(viewer as string);
  const decor = game.playerDecor?.(snapshot.view)?.scores ?? {};

  const table = game.docView ? game.docView(snapshot.view, viewer) : outline(snapshot.view);
  const filtered = moves
    .map((m, index) => ({ m, index }))
    .filter(({ m }) => m.label.toLowerCase().includes(filter.trim().toLowerCase()));
  const shown = filtered.slice(0, MAX_SHOWN);
  // Two moves with the same label (e.g. the same colours from different squares):
  // show the move data next to them so they can be told apart.
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const m of moves) (seen.has(m.label) ? repeated : seen).add(m.label);

  const send = (m: LegalMove<unknown>) => {
    setProposal(null);
    setFilter("");
    onMove(m.move);
  };

  // Build the document. Numbering is just decoration, like an editor gutter.
  const text: string[] = [
    "# notes.md",
    "",
    snapshot.result
      ? `> ${snapshot.result.text}`
      : mine
        ? `> ${snapshot.status.text}`
        : `// ${snapshot.status.text}`,
    "",
    "## players",
    ...players.map((p) => {
      const turn = snapshot.status.activePlayers.includes(p.id) ? "*" : " ";
      const you = p.id === viewer ? " (you)" : "";
      const score = decor[p.id] !== undefined ? `  ${plain(String(decor[p.id]))}` : "";
      return `${turn} ${p.name}${you}${score}`;
    }),
    "",
    "## table",
    ...table,
    "",
    "## log",
    ...(snapshot.recentActions.length
      ? snapshot.recentActions.slice(0, 6).map((a) => `// ${plain(a.text)}`)
      : ["// nothing yet"]),
  ];

  let n = 0;
  return (
    <div className="h-full overflow-y-auto bg-[#1e1e1e] py-2 font-mono text-[13px] leading-5 text-[#d4d4d4]">
      {text.map((t, i) => (
        <Line key={i} n={++n} tone={toneOf(t)}>
          {t}
        </Line>
      ))}
      <Line n={++n}>{""}</Line>
      <Line n={++n} tone="text-[#9cdcfe]">
        ## actions
      </Line>

      {moves.length === 0 && !snapshot.result && (
        <Line n={++n} tone="text-[#6a9955]">
          // nothing to do right now
        </Line>
      )}
      {moves.length > 8 && (
        <Line n={++n}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter…"
            aria-label="Filter actions"
            className="w-full max-w-xs border-b border-[#3c3c3c] bg-transparent text-[#d4d4d4] outline-none placeholder:text-[#5a5a5a] focus:border-[#9cdcfe]"
          />
        </Line>
      )}
      {shown.map(({ m, index }) => {
        const active = picked && proposal?.index === index;
        return (
          <div key={index}>
            <Line n={++n}>
              <button
                type="button"
                onClick={() => setProposal(active ? null : { version, index })}
                className={`text-left hover:underline ${active ? "text-[#dcdcaa]" : "text-[#ce9178]"}`}
              >
                [{index + 1}] {m.label}
                {repeated.has(m.label) && (
                  <span className="text-[#808080]"> {JSON.stringify(m.move)}</span>
                )}
              </button>
            </Line>
            {active && (
              <Line n={++n}>
                {"    ↳ "}
                <button
                  type="button"
                  onClick={() => send(m)}
                  className="text-[#4ec9b0] hover:underline"
                >
                  confirm
                </button>
                {"  "}
                <button
                  type="button"
                  onClick={() => setProposal(null)}
                  className="text-[#808080] hover:underline"
                >
                  cancel
                </button>
              </Line>
            )}
          </div>
        );
      })}
      {filtered.length > MAX_SHOWN && (
        <Line n={++n} tone="text-[#6a9955]">
          {`// … ${filtered.length - MAX_SHOWN} more, type to filter`}
        </Line>
      )}
      {snapshot.result && onBackToLobby && (
        <Line n={++n}>
          <button type="button" onClick={onBackToLobby} className="text-[#ce9178] hover:underline">
            [·] back to lobby
          </button>
        </Line>
      )}
      <Line n={++n}>{""}</Line>
    </div>
  );
}
