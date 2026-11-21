import { useState, type ReactNode } from "react";
import type { BoardProps, PlayerInfo } from "@utopia/shared";
import {
  COUNTER,
  CUPS,
  FREE_STEPS,
  UPGRADES,
  autoPour,
  cellName,
  checkPath,
  neighbors,
  decider,
  matches,
  pathGains,
  recipeOf,
  score,
  type Area,
  type Ingredient,
  type Move,
  type OrderCard,
  type View,
} from "./logic.js";

/** Score and orders waiting, for the shell's player list. */
export function playerDecor(view: View) {
  return {
    scores: Object.fromEntries(
      view.players.map((p) => {
        const a = view.areas[p.id]!;
        return [p.id, `${score(a)} pts · ${a.tabs.flat().length} orders`];
      }),
    ),
  };
}

const INK: Record<Ingredient, { bg: string; fg: string }> = {
  coffee: { bg: "#6b3e26", fg: "#fde7d4" },
  milk: { bg: "#f5f5f4", fg: "#292524" },
  steam: { bg: "#cbd5e1", fg: "#1e293b" },
  ice: { bg: "#7dd3fc", fg: "#0c4a6e" },
  water: { bg: "#2563eb", fg: "#dbeafe" },
  tea: { bg: "#16a34a", fg: "#dcfce7" },
  chocolate: { bg: "#3f1d0b", fg: "#fed7aa" },
  caramel: { bg: "#d97706", fg: "#fff7ed" },
};

const ICON: Record<Ingredient, string> = {
  coffee: "☕",
  milk: "🥛",
  steam: "♨️",
  ice: "🧊",
  water: "💧",
  tea: "🍵",
  chocolate: "🍫",
  caramel: "🍮",
};

/** "milk, steam and 2 caramel" */
function gainsText(items: readonly Ingredient[]): string {
  const counts = new Map<Ingredient, number>();
  for (const x of items) counts.set(x, (counts.get(x) ?? 0) + 1);
  const parts = [...counts].map(([x, k]) => (k > 1 ? `${k} ${x}` : x));
  return parts.length > 1
    ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
    : (parts[0] ?? "nothing");
}

function Chip({ ing, faded = false }: { ing: Ingredient; faded?: boolean }) {
  return (
    <span
      title={ing}
      aria-label={ing}
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded px-0.5 text-sm leading-none ${
        faded ? "border border-dashed border-white/70 opacity-70" : "ring-1 ring-black/25"
      }`}
      style={{ background: INK[ing].bg, color: INK[ing].fg }}
    >
      {ICON[ing]}
    </span>
  );
}

function OrderView({ card, ready }: { card: OrderCard; ready: boolean }) {
  const rec = recipeOf(card);
  return (
    <span
      className={`inline-flex flex-col gap-0.5 rounded-lg border bg-[#fbf6ea] px-1.5 py-1 text-slate-900 ${
        ready ? "border-emerald-500 ring-2 ring-emerald-400" : "border-transparent"
      }`}
    >
      <span className="text-[11px] leading-none font-bold">
        {rec.name}
        {rec.specialty && <span title="Specialty: +1 Rush token"> ★</span>}
      </span>
      <span className="flex gap-0.5">
        {rec.needs.map((n, i) => (
          <Chip key={i} ing={n} />
        ))}
      </span>
    </span>
  );
}

const REFERENCE: [string, ReactNode][] = [
  ["Upgrade", "Start of turn: spend 3 completed orders on an upgrade (+2 points)."],
  [
    "Walk",
    "1–3 steps up/down/left/right; take each cell's ingredient. Pass baristas, don't stop on them.",
  ],
  ["Rush", "Each Rush token is 1 extra step."],
  ["Pour", "Put ingredients in cups (they stay there) or back. You may empty cups."],
  ["Serve", "A cup that exactly matches an order serves it. ★ orders give a Rush token."],
  ["Orders", "Each order you serve sends 1 new order to the next 2 players."],
  ["Time", "End of turn: orders move a tab. Off tab 4 = penalty (+1 Rush token)."],
  ["End", "Deck empty or 5 penalties: finish the round. +1 order, +2 upgrade, −1 penalty."],
];

interface Ui {
  sig: string;
  meeple: number;
  path: number[];
  /** Pour target per held ingredient: -1 back, 0–2 a cup. */
  targets: number[];
  empty: number[];
}

export default function Board({
  view,
  viewer,
  legalMoves,
  proposed,
  propose,
  cancel,
  submit,
}: BoardProps<View, Move>) {
  const who = decider(view);
  const myTurn = who === viewer && view.phase !== "over";
  const me = view.players.find((p) => p.id === viewer);
  const mine = me ? view.areas[me.id] : undefined;

  const sig = JSON.stringify([view.phase, view.turn.current, view.held, view.placeQueue.length]);
  const fresh: Ui = { sig, meeple: 0, path: [], targets: view.held.map(() => -1), empty: [] };
  const [ui, setUi] = useState<Ui>(fresh);
  const cur = ui.sig === sig ? ui : fresh;
  const update = (patch: Partial<Ui>) => setUi({ ...cur, ...patch, sig });

  const baristaAt = (cell: number) =>
    view.players.flatMap((p) => (view.areas[p.id]!.meeples.includes(cell) ? [p] : []));

  // ---- walking: build a path, then confirm it as one move
  const proposePath = (meeple: number, path: number[]) => {
    update({ meeple, path });
    if (!me || !path.length || checkPath(view, me.id, meeple, path)) return cancel();
    const got = pathGains(view, me.id, meeple, path);
    propose(
      { type: "move", meeple, path },
      `Walk ${path.length} step${path.length === 1 ? "" : "s"}, take ${gainsText(got)}`,
    );
  };

  function tapCell(cell: number) {
    if (!myTurn || !me || !mine) return;
    if (view.phase === "place") {
      const m = legalMoves.find((l) => l.move.type === "place" && l.move.cell === cell);
      if (m) propose(m.move, m.label);
      return;
    }
    if (view.phase !== "move") return;
    const own = mine.meeples.indexOf(cell);
    if (cur.path.length === 0 && own >= 0 && own !== cur.meeple) return update({ meeple: own });
    const end = cur.path.length ? cur.path[cur.path.length - 1]! : mine.meeples[cur.meeple]!;
    if (cur.path.length && cell === end) return proposePath(cur.meeple, cur.path.slice(0, -1));
    const diagonal = mine.upgrades.includes("diagonal");
    const r = (c: number) => [Math.floor(c / 4), c % 4] as const;
    const [r1, c1] = r(end);
    const [r2, c2] = r(cell);
    const adjacent =
      Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2)) === 1 && (diagonal || r1 === r2 || c1 === c2);
    if (!adjacent || cur.path.length >= FREE_STEPS + mine.rush) return;
    proposePath(cur.meeple, [...cur.path, cell]);
  }

  // ---- pouring: assign each ingredient, then confirm
  const plan = {
    empty: cur.empty,
    add: Array.from({ length: CUPS }, (_, c) => view.held.filter((_, i) => cur.targets[i] === c)),
  };
  const proposePour = (targets: number[], empty: number[]) => {
    update({ targets, empty });
    const add = Array.from({ length: CUPS }, (_, c) =>
      view.held.filter((_, i) => targets[i] === c),
    );
    propose({ type: "pour", empty, add }, pourSummary(targets, empty));
  };

  // After walking, your cups and orders matter most: show them first.
  const focusStation = myTurn && (view.phase === "pour" || view.phase === "serve");
  const pourSummary = (targets: number[], empty: number[]) => {
    const n = targets.filter((t) => t >= 0).length;
    const back = view.held.length - n;
    return (
      [
        n ? `Pour ${n}` : "",
        back ? `put back ${back}` : "",
        empty.length ? `empty cup ${empty.map((c) => c + 1).join(" & ")}` : "",
      ]
        .filter(Boolean)
        .join(", ") || "Done pouring"
    );
  };
  const steps = cur.path.length;
  /** The barista you're walking with, outlined before the first step. */
  const walkingFrom =
    myTurn && view.phase === "move" && mine && cur.path.length === 0
      ? mine.meeples[cur.meeple]
      : undefined;
  const stepsLeft = mine ? Math.max(0, FREE_STEPS + mine.rush - steps) : 0;
  const pathEnd = mine ? (steps ? cur.path[steps - 1]! : mine.meeples[cur.meeple]) : undefined;
  const nextCells =
    myTurn && view.phase === "move" && mine && pathEnd !== undefined && stepsLeft > 0
      ? neighbors(pathEnd, mine.upgrades.includes("diagonal"))
      : [];
  const blocked = steps > 0 && me ? checkPath(view, me.id, cur.meeple, cur.path) : null;
  const pathProblem = blocked
    ? stepsLeft > 0
      ? `${blocked} Take another step, or undo.`
      : `${blocked} You're out of steps: undo a step.`
    : null;
  const proposedBoard =
    proposed && ["place", "move", "pour"].includes(proposed.type) ? proposed : null;
  const ready = (cup: readonly Ingredient[], card: OrderCard) => matches(cup, recipeOf(card).needs);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-3 @2xl:grid @2xl:max-w-5xl @2xl:grid-cols-2 @2xl:items-start @2xl:gap-x-6 @2xl:px-6">
      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {/* The counter */}
        <section
          aria-label="Counter"
          className={`${focusStation ? "order-2" : "order-1"} rounded-2xl bg-gradient-to-b from-amber-950/70 to-slate-900 p-2.5`}
        >
          <p className="mb-2 flex justify-between text-xs text-slate-300">
            <span>Orders in deck: {view.deckCount}</span>
            <span>Rush tokens: {view.rushSupply}</span>
            {view.closed && <span className="font-bold text-red-300">Last round</span>}
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {COUNTER.map((ing, cell) => {
              const here = baristaAt(cell);
              const step = cur.path.indexOf(cell);
              const lastStep = cur.path.lastIndexOf(cell);
              return (
                <button
                  key={cell}
                  type="button"
                  onClick={() => tapCell(cell)}
                  disabled={!myTurn}
                  aria-label={`${cellName(cell)} ${ing}${here.length ? `, ${here.map((p) => p.name).join(", ")}` : ""}`}
                  className={`relative flex h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl border-2 ${
                    step >= 0
                      ? "border-amber-400"
                      : walkingFrom === cell
                        ? "border-sky-300"
                        : nextCells.includes(cell)
                          ? "border-dashed border-amber-200/70"
                          : "border-transparent"
                  }`}
                  style={{ background: `${INK[ing].bg}55` }}
                >
                  <span className="absolute top-0.5 left-1 text-[9px] text-slate-400">
                    {cellName(cell)}
                  </span>
                  <span className="text-lg leading-none" aria-hidden>
                    {ICON[ing]}
                  </span>
                  <span className="text-[10px] leading-none font-semibold text-slate-100">
                    {ing}
                  </span>
                  <span className="flex gap-0.5">
                    {here.map((p) => (
                      <span
                        key={p.id}
                        className="flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white px-0.5 text-[9px] font-black text-slate-900"
                        style={{ background: p.color }}
                      >
                        {p.name.slice(0, 2)}
                      </span>
                    ))}
                  </span>
                  {lastStep >= 0 && (
                    <span className="absolute top-0.5 right-1 rounded bg-amber-400 px-1 text-[9px] font-black text-slate-900">
                      {lastStep + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {myTurn && view.phase === "move" && mine && (
            <div className="mt-2 rounded-xl bg-black/30 p-2 text-xs text-amber-100">
              <p className="flex justify-between gap-2">
                <span>
                  {steps === 0
                    ? mine.meeples.length > 1
                      ? `Walking with your barista on ${cellName(mine.meeples[cur.meeple]!)} (tap your other one to switch).`
                      : "Tap a cell next to your barista (dashed) to walk."
                    : `Steps: ${steps} of ${FREE_STEPS}${steps > FREE_STEPS ? ` + ${steps - FREE_STEPS} Rush` : ""}`}
                </span>
                <span className="shrink-0 text-amber-200/80">
                  {stepsLeft > 0 ? `${stepsLeft} more possible` : "no steps left"}
                </span>
              </p>
              {steps > 0 && (
                <p className="mt-1">
                  You'll take: {gainsText(pathGains(view, me!.id, cur.meeple, cur.path))}
                </p>
              )}
              {pathProblem && <p className="mt-1 font-semibold text-red-300">{pathProblem}</p>}
              {steps > 0 && (
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    className="min-h-9 rounded-lg bg-slate-700 px-3 font-semibold text-white"
                    onClick={() => proposePath(cur.meeple, cur.path.slice(0, -1))}
                  >
                    Undo step
                  </button>
                  <button
                    type="button"
                    className="min-h-9 rounded-lg bg-slate-700 px-3 font-semibold text-white"
                    onClick={() => proposePath(cur.meeple, [])}
                  >
                    Start over
                  </button>
                </div>
              )}
            </div>
          )}
          {myTurn && view.phase === "place" && (
            <p className="mt-2 text-center text-xs text-amber-100">
              Tap a free cell to place your barista.
            </p>
          )}
        </section>

        {/* Your station */}
        {me && mine && (
          <section
            aria-label="Your station"
            className={`${focusStation ? "order-1" : "order-2"} rounded-2xl border-2 p-3`}
            style={{
              borderColor: me.color,
              background: `linear-gradient(180deg, ${me.color}26, #0f172a 70%)`,
            }}
          >
            <div className="flex items-baseline justify-between">
              <span
                className="text-[11px] font-bold tracking-widest uppercase"
                style={{ color: me.color }}
              >
                Your station
              </span>
              <span className="text-xs text-slate-300">
                {score(mine)} pts · done {mine.done.length} · penalties {mine.penalties.length} ·
                rush {mine.rush}
              </span>
            </div>
            {mine.upgrades.length > 0 && (
              <p className="mt-1 text-[11px] text-violet-300">
                Upgrades: {mine.upgrades.map((u) => UPGRADES[u].name).join(", ")}
              </p>
            )}

            {/* Cups */}
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {mine.cups.map((cup, c) => {
                const emptied = cur.empty.includes(c);
                const adding = view.phase === "pour" && myTurn ? plan.add[c]! : [];
                return (
                  <div
                    key={c}
                    className={`flex min-h-16 flex-col gap-1 rounded-xl bg-slate-950/60 p-1.5 ${
                      mine.tabs.flat().some((card) => ready(cup, card))
                        ? "ring-2 ring-emerald-400"
                        : ""
                    }`}
                  >
                    <span className="flex items-center justify-between text-[10px] text-slate-400">
                      Cup {c + 1}
                      {view.phase === "pour" && myTurn && cup.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            proposePour(
                              cur.targets,
                              emptied ? cur.empty.filter((x) => x !== c) : [...cur.empty, c],
                            )
                          }
                          className={`rounded px-1 ${emptied ? "bg-red-700 text-white" : "bg-slate-700"}`}
                        >
                          {emptied ? "emptying" : "empty"}
                        </button>
                      )}
                    </span>
                    <span
                      className={`flex flex-wrap gap-0.5 ${emptied ? "line-through opacity-40" : ""}`}
                    >
                      {cup.map((x, i) => (
                        <Chip key={i} ing={x} />
                      ))}
                    </span>
                    {adding.length > 0 && (
                      <span className="flex flex-wrap gap-0.5">
                        {adding.map((x, i) => (
                          <Chip key={i} ing={x} faded />
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Ingredients taken this turn */}
            {myTurn && view.phase === "pour" && (
              <div className="mt-2 rounded-xl bg-slate-950/60 p-2">
                <p className="mb-1 flex justify-between text-xs text-slate-300">
                  <span>Tap each to choose its cup:</span>
                  <button
                    type="button"
                    className="rounded bg-slate-700 px-2 text-[11px]"
                    onClick={() => {
                      const auto = autoPour(mine, view.held);
                      const used = auto.add.map((c) => [...c]);
                      const targets = view.held.map((x) => {
                        const cup = used.findIndex((c) => c.includes(x));
                        if (cup < 0) return -1;
                        used[cup]!.splice(used[cup]!.indexOf(x), 1);
                        return cup;
                      });
                      proposePour(targets, []);
                    }}
                  >
                    Auto
                  </button>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {view.held.map((x, i) => {
                    const t = cur.targets[i] ?? -1;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const next = [...cur.targets];
                          next[i] = t >= CUPS - 1 ? -1 : t + 1;
                          proposePour(next, cur.empty);
                        }}
                        className="flex items-center gap-1 rounded-lg bg-slate-800 px-1.5 py-1 text-[11px]"
                      >
                        <Chip ing={x} />
                        {t < 0 ? "back" : `cup ${t + 1}`}
                      </button>
                    );
                  })}
                  {view.held.length === 0 && (
                    <span className="text-xs text-slate-500">Nothing taken.</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => proposePour(cur.targets, cur.empty)}
                  className="mt-2 min-h-10 w-full rounded-lg bg-amber-400/90 text-sm font-bold text-slate-900"
                >
                  {pourSummary(cur.targets, cur.empty)}…
                </button>
              </div>
            )}

            {/* Orders by tab */}
            <div className="mt-2 flex flex-col gap-1.5">
              {mine.tabs.map((tab, t) => (
                <div key={t} className="flex items-start gap-2">
                  <span
                    className={`w-10 shrink-0 pt-1 text-[10px] font-bold ${t === 3 ? "text-red-300" : "text-slate-400"}`}
                  >
                    Tab {t + 1}
                    {t === 3 && <span className="block font-normal">expires next</span>}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {tab.map((card) => (
                      <OrderView
                        key={card.id}
                        card={card}
                        ready={mine.cups.some((cup) => ready(cup, card))}
                      />
                    ))}
                    {tab.length === 0 && <span className="pt-1 text-[10px] text-slate-600">—</span>}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {/* Everyone else */}
        <section aria-label="Other players" className="order-3 grid gap-1.5">
          {view.players
            .filter((p) => p.id !== viewer)
            .map((p) => (
              <OtherStation key={p.id} player={p} area={view.areas[p.id]!} active={who === p.id} />
            ))}
        </section>

        <section aria-label="Rules reference" className="order-4 rounded-xl bg-slate-900/60 p-2.5">
          <table className="w-full border-separate border-spacing-y-1 text-xs">
            <tbody>
              {REFERENCE.map(([name, text]) => (
                <tr key={name}>
                  <th
                    scope="row"
                    className="w-16 pr-2 text-left align-top font-semibold text-slate-200"
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

      {proposedBoard && (
        <div className="sticky bottom-2 z-10 order-5 flex gap-2 rounded-2xl border border-amber-400/50 bg-slate-950/95 p-2 shadow-xl @2xl:col-span-2">
          <button
            type="button"
            onClick={() => {
              update({ path: [], targets: view.held.map(() => -1), empty: [] });
              cancel();
            }}
            className="min-h-12 rounded-xl bg-slate-700 px-4 font-bold text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit(proposedBoard)}
            className="min-h-12 flex-1 rounded-xl bg-amber-400 px-3 font-bold text-slate-900"
          >
            {proposedBoard.type === "place"
              ? `Place on ${cellName(proposedBoard.cell)}`
              : proposedBoard.type === "move"
                ? `Walk ${proposedBoard.path.length} step${proposedBoard.path.length === 1 ? "" : "s"}`
                : pourSummary(cur.targets, cur.empty)}
          </button>
        </div>
      )}
    </div>
  );
}

function OtherStation({
  player,
  area,
  active,
}: {
  player: PlayerInfo;
  area: Area;
  active: boolean;
}) {
  return (
    <div
      className="rounded-xl border-2 bg-slate-900/70 px-2.5 py-2 text-xs"
      style={{ borderColor: active ? player.color : "#1e293b" }}
    >
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: player.color }} />
        <span className="font-semibold">
          {active && "▶ "}
          {player.name}
        </span>
        <span className="ml-auto text-slate-400">
          {score(area)} pts · done {area.done.length} · pen {area.penalties.length} · rush{" "}
          {area.rush}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-400">
        <span>
          {area.tabs.flat().length} orders
          {area.tabs[3]!.length > 0 && (
            <span className="text-red-300"> ({area.tabs[3]!.length} expiring)</span>
          )}
        </span>
        {area.cups.map((cup, c) => (
          <span key={c} className="flex items-center gap-0.5">
            cup {c + 1}:{cup.length ? cup.map((x, i) => <Chip key={i} ing={x} />) : " empty"}
          </span>
        ))}
      </div>
    </div>
  );
}

export { docView } from "./doc.js";
