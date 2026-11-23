import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { BoardProps, LegalMove, PlayerId } from "@utopia/shared";
import {
  DOUBLE_SCAN_TEXT,
  SCAN_NAME,
  TOOL_INFO,
  TWIST_INFO,
  valueText,
  wireValueText,
  type Move,
  type ScanTool,
  type Tool,
  type View,
  type ViewWire,
  type WireValue,
} from "./logic.js";

/** Wires left per player, for the shell's player list. */
export function playerDecor(view: View) {
  return {
    scores: Object.fromEntries(
      view.players.map((p) => [p.id, `${p.racks.flat().filter((w) => !w.cut).length} wires`]),
    ),
  };
}

const sameMove = (a: Move | null, b: Move) => !!a && JSON.stringify(a) === JSON.stringify(b);

/** Yellow wires sit at x.1 and red ones at x.5, between the numbers. */
const decimal = (n: number) => n.toFixed(1);
const special = (w: ViewWire) => w.value === "YELLOW" || w.value === "RED";

const face = (w: ViewWire) =>
  w.value === undefined
    ? "?"
    : special(w)
      ? w.sort !== undefined
        ? decimal(w.sort)
        : w.value === "YELLOW"
          ? "Y"
          : "R"
      : `${w.value}`;

const wireText = (w: ViewWire) =>
  w.value === undefined ? "hidden" : wireValueText({ value: w.value, sort: w.sort });

const GAP = 4;

/**
 * One stand of wires, kept in order: a single row when the wires fit at a readable size,
 * otherwise two even rows (7 + 7, never 11 + 3).
 */
function StandRow({
  count,
  min,
  max,
  children,
}: {
  count: number;
  /** Narrowest readable wire, in px. */
  min: number;
  /** Widest a wire gets, in px. */
  max: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const fits = width === 0 || count * (min + GAP) - GAP <= width;
  const cols = Math.max(1, fits ? count : Math.ceil(count / 2));
  return (
    <div
      ref={ref}
      className="grid min-w-0 flex-1 items-end"
      style={{ gap: GAP, gridTemplateColumns: `repeat(${cols}, minmax(0, ${max}px))` }}
    >
      {children}
    </div>
  );
}

function wireStyle(w: ViewWire): string {
  if (w.cut)
    return "border-dashed border-emerald-400/60 bg-emerald-950/60 text-emerald-200/70 line-through";
  if (w.value === undefined) return "border-slate-600 bg-slate-700 text-slate-400";
  if (w.value === "YELLOW") return "border-amber-300 bg-amber-200 text-amber-950";
  if (w.value === "RED") return "border-rose-300 bg-rose-300 text-rose-950";
  return "border-sky-200 bg-sky-100 text-sky-950";
}

function WireTile({
  wire,
  index,
  onTap,
  selected,
  lit,
  solo = false,
  size = "md",
}: {
  wire: ViewWire;
  index: number;
  onTap?: (() => void) | undefined;
  selected: boolean;
  lit: boolean;
  /** One of your wires you could solo cut right now (a green glow). */
  solo?: boolean;
  size?: "sm" | "md";
}) {
  const text = face(wire);
  // "10.1" needs the smallest type; "7.1" a little less.
  const fontSize =
    size === "sm"
      ? ["text-sm", "text-sm", "text-[11px] tracking-tight", "text-[9px] tracking-tighter"]
      : ["text-lg", "text-lg", "text-sm tracking-tight", "text-xs tracking-tighter"];
  const box = `${size === "sm" ? "h-10" : "h-14"} ${fontSize[Math.min(text.length, 4) - 1]}`;
  return (
    <span className="flex min-w-0 flex-col items-center gap-0.5">
      <button
        type="button"
        disabled={!onTap}
        onClick={onTap}
        aria-label={`Wire ${index + 1}: ${wire.cut ? `cut${wire.value === undefined ? "" : ` (${wireText(wire)})`}` : wireText(wire)}${wire.clue && !wire.cut ? ", clue" : ""}${solo ? ", can solo cut" : ""}`}
        className={`relative flex w-full items-center justify-center rounded-md border-2 font-black transition ${box} ${wireStyle(wire)} ${
          selected
            ? "-translate-y-1 ring-4 ring-amber-400"
            : solo
              ? "shadow-[0_0_12px_rgba(52,211,153,0.8)] ring-4 ring-emerald-400"
              : lit
                ? "ring-2 ring-amber-300"
                : ""
        } ${onTap ? "hover:-translate-y-0.5" : ""}`}
      >
        {text}
        {wire.clue && !wire.cut && (
          <span
            className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full border border-slate-900 bg-amber-400"
            title="Clue"
          />
        )}
      </button>
      <span className="text-[9px] text-slate-500 tabular-nums">{index + 1}</span>
    </span>
  );
}

function ToolButton({
  name,
  status,
  tone,
  active,
  onTap,
}: {
  name: string;
  status: string;
  tone: "locked" | "ready" | "used";
  active: boolean;
  onTap: (() => void) | undefined;
}) {
  const look =
    tone === "used"
      ? "border-slate-700 bg-slate-900 text-slate-500"
      : tone === "locked"
        ? "border-slate-600 border-dashed bg-slate-800/60 text-slate-300"
        : "border-emerald-400/70 bg-emerald-900/40 text-white";
  return (
    <button
      type="button"
      disabled={!onTap}
      onClick={onTap}
      className={`min-h-12 rounded-lg border-2 px-2 py-1 text-left ${look} ${active ? "ring-2 ring-amber-400" : ""} ${onTap ? "" : "cursor-default"}`}
    >
      <span className={`block text-sm font-bold ${tone === "used" ? "line-through" : ""}`}>
        {tone === "locked" ? "🔒 " : tone === "used" ? "" : "⚡ "}
        {name}
      </span>
      <span className="block text-[10px] text-slate-400">
        {status}
        {onTap ? " · tap to use" : ""}
      </span>
    </button>
  );
}

function PlayerChip({
  name,
  color,
  selected = false,
  onTap,
}: {
  name: string;
  color: string;
  selected?: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className={`flex min-h-11 items-center gap-1.5 rounded-lg px-3 font-bold ${selected ? "bg-amber-400 text-slate-900" : "bg-slate-700 text-white"}`}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {name}
    </button>
  );
}

function CloseButton({ onTap }: { onTap: () => void }) {
  return (
    <button
      type="button"
      className="min-h-11 rounded-lg px-3 text-sm text-slate-400"
      onClick={onTap}
    >
      Close
    </button>
  );
}

const BASE_RULES: [string, ReactNode][] = [
  ["Clues", "In seat order, reveal one of your wires (not red). Max 2 clues per number."],
  ["Call", "Tap one of your wires and a teammate's wire, in either order, to call that value."],
  ["Right", "Their wire is cut; you cut one of yours of that value."],
  [
    "Wrong",
    <>
      It becomes a public clue and the <b className="text-rose-300">detonator ticks</b>.
    </>,
  ],
  ["Red", "Calling on a red wire explodes the bomb."],
  [
    "Solo",
    "Hold every remaining copy (2 or 4) of a value? They glow green on your turn: tap one to cut them all.",
  ],
  ["Win", "Cut every wire before the detonator runs out."],
];

function rulesFor(view: View): [string, ReactNode][] {
  const rows = [...BASE_RULES];
  if (view.twist) rows.unshift(["Twist", TWIST_INFO[view.twist].text]);
  if (view.doubleScan)
    rows.push([
      "2× Scan",
      `${DOUBLE_SCAN_TEXT} If either wire matches, they choose which is cut. A miss ticks once and they choose where the clue goes. One red is safe; two reds explode.`,
    ]);
  if (view.tools.length) {
    rows.push([
      "Power cards",
      "Each unlocks when 2 wires of its number are cut, works once and costs no action. Radar and Swap work any time, even out of turn.",
    ]);
    for (const t of view.tools) rows.push([TOOL_INFO[t.kind].name, TOOL_INFO[t.kind].text]);
  }
  return rows;
}

type Mode =
  | { kind: "scan"; tool: ScanTool; wireIds: string[]; values: number[] }
  | { kind: "radar"; target: PlayerId | null }
  | { kind: "swap" };

const SCAN_SIZE: Record<ScanTool, number> = { double: 2, tripleScan: 3, twoTone: 1 };
const BAR_MOVES = new Set<Move["type"]>(["revealRed", "skipClue"]);

export default function Board({
  view,
  viewer,
  players,
  highlight,
  legalMoves,
  proposed,
  propose,
  cancel,
  submit,
}: BoardProps<View, Move>) {
  const [target, setTarget] = useState<{ version: string; wireId: string } | null>(null);
  const [modeState, setModeState] = useState<{ version: string; mode: Mode } | null>(null);
  // Your own wire picked to call with. It lasts the whole turn, so that after a match
  // the same wire is offered as the one you cut.
  const [source, setSource] = useState<{ turn: number; wireId: string } | null>(null);
  const [offerLabel, setOfferLabel] = useState("");
  // A target choice only lasts for the turn it was made in.
  const version = `${view.turn}-${view.phase}-${view.active}`;
  const picked = target?.version === version ? target.wireId : null;
  const mode = modeState?.version === version ? modeState.mode : null;
  const setMode = (m: Mode | null) => {
    setModeState(m ? { version, mode: m } : null);
    setTarget(null);
    setSource(null);
    cancel();
  };
  const offer = (move: Move, label: string) => {
    setOfferLabel(label);
    propose(move, label);
  };

  const colorOf = (id: PlayerId) => players.find((p) => p.id === id)?.color ?? "#64748b";
  const me = view.players.find((p) => p.id === viewer);
  const others = view.players.filter((p) => p.id !== viewer);

  const find = (pred: (m: Move) => boolean): LegalMove<Move> | undefined =>
    legalMoves.find((m) => pred(m.move));
  const callsOn = (wireId: string) =>
    legalMoves.filter((m) => m.move.type === "call" && m.move.wireId === wireId);
  const callMove = (wireId: string, value: WireValue) =>
    find((mv) => mv.type === "call" && mv.wireId === wireId && mv.value === value);
  const soloMove = (value: WireValue | undefined) =>
    value === undefined ? undefined : find((mv) => mv.type === "solo" && mv.value === value);
  const callsWith = (value: WireValue | undefined) =>
    value !== undefined && legalMoves.some((m) => m.move.type === "call" && m.move.value === value);

  const sourceWire =
    source && source.turn === view.turn && view.active === viewer && !mode
      ? me?.racks.flat().find((w) => w.id === source.wireId && !w.cut)
      : undefined;
  const sourceValue = view.phase === "play" ? sourceWire?.value : undefined;
  // After a match, the wire you called with is ready to confirm as the one you cut.
  const autoCut =
    view.phase === "own" && sourceWire
      ? find((mv) => mv.type === "cutOwn" && mv.wireId === sourceWire.id)
      : undefined;
  const shown = proposed ?? autoCut?.move ?? null;
  const proposedLabel =
    shown && !BAR_MOVES.has(shown.type)
      ? (legalMoves.find((m) => sameMove(shown, m.move))?.label ?? offerLabel)
      : null;
  const soloing = shown?.type === "solo" ? shown.value : undefined;

  // Where each wire sits, for labels like "Bob's wires 2, 3".
  const spots = new Map<string, { owner: View["players"][number]; label: string }>();
  for (const p of view.players)
    p.racks.forEach((rack, r) =>
      rack.forEach((w, i) =>
        spots.set(w.id, { owner: p, label: p.racks.length > 1 ? `${r + 1}-${i + 1}` : `${i + 1}` }),
      ),
    );
  // The choosing teammate sees only their options lit; everyone else sees the scanned wires.
  const pendingIds = view.pending?.options ?? view.pending?.wireIds ?? [];
  const lit = (id: string) =>
    view.pending?.options
      ? view.pending.options.includes(id)
      : highlight.includes(id) || pendingIds.includes(id);

  // Tools this viewer can use right now.
  const canScan = (tool: ScanTool) =>
    legalMoves.some((m) => m.move.type === "scan" && m.move.tool === tool);
  const radarMoves = legalMoves.filter((m) => m.move.type === "radar");
  const swapMoves = legalMoves.filter((m) => m.move.type === "swap");
  const dampenMove = find((m) => m.type === "dampen");
  const callValues = Array.from(
    new Set(
      legalMoves.flatMap((m) =>
        m.move.type === "call" && typeof m.move.value === "number" ? [m.move.value] : [],
      ),
    ),
  ).sort((a, b) => a - b);

  // Values left per number: 4 printed, minus those already cut (public).
  const cutByValue = new Map<number, number>();
  for (const w of view.players.flatMap((p) => p.racks.flat())) {
    if (w.cut && typeof w.value === "number")
      cutByValue.set(w.value, (cutByValue.get(w.value) ?? 0) + 1);
  }
  // The counter: every number, with the yellow (x.1) and red (x.5) markers between them.
  const revealed = view.players.flatMap((p) => p.racks.flat());
  type Slot =
    | { kind: "number"; at: number; left: number }
    | {
        kind: "special";
        at: number;
        color: "yellow" | "red";
        state: "in" | "cut" | "maybe" | "out";
      };
  const slots: Slot[] = [
    ...Array.from({ length: view.values }, (_, i): Slot => ({
      kind: "number",
      at: i + 1,
      left: 4 - (cutByValue.get(i + 1) ?? 0),
    })),
    ...view.markers.map((m): Slot => {
      const at = m.position + (m.color === "yellow" ? 0.1 : 0.5);
      const cut = revealed.some(
        (w) => w.cut && w.sort !== undefined && Math.abs(w.sort - at) < 0.01,
      );
      return {
        kind: "special",
        at,
        color: m.color,
        state: cut
          ? "cut"
          : m.present === false
            ? "out"
            : m.uncertain && m.present === undefined
              ? "maybe"
              : "in",
      };
    }),
  ].sort((a, b) => a.at - b.at);
  const stepsLeft = Math.max(0, view.mistakeLimit - view.mistakes);
  const toolStatus = (t: Tool) => {
    if (t.used) return { tone: "used", text: "Used" } as const;
    const n = cutByValue.get(t.unlock) ?? 0;
    return n >= 2
      ? ({ tone: "ready", text: "Ready" } as const)
      : ({ tone: "locked", text: `Locked · ${n}/2 ${t.unlock}s cut` } as const);
  };
  const doubleUsed = view.doubleScanUsed.includes(viewer as PlayerId);

  const scanLabel = (tool: ScanTool, wireIds: string[], values: number[]) => {
    const first = spots.get(wireIds[0] ?? "");
    const where = wireIds.map((id) => spots.get(id)?.label ?? "?").join(", ");
    const whose = first ? `${first.owner.name}'s wire${wireIds.length > 1 ? "s" : ""}` : "";
    return `${SCAN_NAME[tool]}: ${values.join(" or ")} on ${whose} ${where}`;
  };
  const updateScan = (next: Extract<Mode, { kind: "scan" }>) => {
    setModeState({ version, mode: next });
    const ready =
      next.wireIds.length === SCAN_SIZE[next.tool] &&
      next.values.length === (next.tool === "twoTone" ? 2 : 1);
    if (ready)
      offer(
        { type: "scan", tool: next.tool, wireIds: next.wireIds, values: next.values },
        scanLabel(next.tool, next.wireIds, next.values),
      );
    else cancel();
  };

  const ownMove = (w: ViewWire) =>
    find(
      (mv) =>
        (mv.type === "clue" || mv.type === "cutOwn" || mv.type === "choose") && mv.wireId === w.id,
    );
  const tapOwn = (w: ViewWire) => {
    const m = ownMove(w);
    if (m) return () => offer(m.move, m.label);
    // On your turn: pick the wire to call with, or the value to solo cut.
    if (view.phase !== "play" || mode || w.cut) return undefined;
    const value = w.value;
    const solo = soloMove(value);
    if (value === undefined || (!callsWith(value) && !solo)) return undefined;
    return () => {
      if (sourceWire?.id === w.id) {
        setSource(null);
        cancel();
        return;
      }
      setSource({ turn: view.turn, wireId: w.id });
      const call = picked ? callMove(picked, value) : undefined;
      if (call) propose(call.move, call.label);
      else if (solo) offer(solo.move, solo.label);
      else cancel();
    };
  };
  const tapTeammate = (w: ViewWire) => {
    if (mode?.kind === "scan") {
      if (w.cut) return undefined;
      return () => {
        const owner = spots.get(w.id)?.owner.id;
        const same = mode.wireIds.filter((id) => spots.get(id)?.owner.id === owner);
        const wireIds = same.includes(w.id)
          ? same.filter((id) => id !== w.id)
          : [...same, w.id].slice(-SCAN_SIZE[mode.tool]);
        updateScan({ ...mode, wireIds });
      };
    }
    return callsOn(w.id).length
      ? () => {
          setModeState(null);
          setTarget({ version, wireId: w.id });
          // Your wire is already picked: call its value straight away.
          const call = sourceValue === undefined ? undefined : callMove(w.id, sourceValue);
          if (call) propose(call.move, call.label);
          else cancel();
        }
      : undefined;
  };
  const canCall = legalMoves.some((m) => m.move.type === "call");
  const canSolo = legalMoves.some((m) => m.move.type === "solo");

  const hint =
    view.phase === "over"
      ? null
      : mode?.kind === "scan"
        ? mode.wireIds.length < SCAN_SIZE[mode.tool]
          ? `${SCAN_NAME[mode.tool]}: tap ${SCAN_SIZE[mode.tool] === 1 ? "1 wire" : `${SCAN_SIZE[mode.tool]} wires`} of one teammate (${mode.wireIds.length}/${SCAN_SIZE[mode.tool]}).`
          : `${SCAN_NAME[mode.tool]}: now pick ${mode.tool === "twoTone" ? "two values" : "the value"}.`
        : view.pending && view.pending.owner === viewer
          ? view.pending.kind === "pick"
            ? "A match on your wires! Tap the highlighted wire that gets cut."
            : "No match. Tap the scanned wire that gets the clue."
          : view.phase === "clues" && legalMoves.some((m) => m.move.type === "clue")
            ? "Tap one of your wires to reveal it as your starting clue."
            : view.phase === "own" && legalMoves.length
              ? autoCut
                ? "Match! Confirm cutting the wire you called with, or tap another one."
                : `Tap one of your ${valueText(view.pendingValue ?? 0)} wires to cut it.`
              : view.phase === "play" && (canCall || canSolo)
                ? soloing !== undefined
                  ? `Solo cut all your ${valueText(soloing)}s, or tap a teammate's wire to call ${valueText(soloing)} on it instead.`
                  : sourceValue !== undefined
                    ? picked
                      ? "Pick another wire, or confirm the call below."
                      : `Now tap a teammate's wire to call ${valueText(sourceValue)} on it.`
                    : picked
                      ? "Now tap one of your wires, or pick the value below."
                      : canCall
                        ? `Tap one of your wires and a teammate's wire to call that value.${canSolo ? " Green-glowing wires can be solo cut: tap one." : ""}`
                        : "Tap a green-glowing wire to solo cut that value."
                : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-3 @2xl:grid @2xl:max-w-5xl @2xl:grid-cols-2 @2xl:items-start @2xl:gap-x-6 @2xl:px-6">
      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {/* Mission, detonator and values left */}
        <section
          aria-label="Bomb"
          className="order-1 rounded-2xl bg-gradient-to-b from-rose-950/60 to-slate-900 p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] tracking-widest text-slate-400 uppercase">
                {view.missionLabel}
              </p>
              <p className="truncate font-bold">{view.missionName}</p>
            </div>
            <div className="text-right" aria-label={`Detonator: ${stepsLeft} mistakes left`}>
              <p className="text-[10px] tracking-wide text-slate-400 uppercase">Detonator</p>
              <span className="flex justify-end gap-1">
                {Array.from({ length: view.mistakeLimit }, (_, i) => (
                  <span
                    key={i}
                    className={`h-3 w-3 rounded-full ${i < view.mistakes ? "bg-rose-500" : "bg-slate-600"}`}
                  />
                ))}
              </span>
            </div>
          </div>
          {view.twist && (
            <p className="mt-2 rounded-lg bg-violet-500/20 px-2 py-1.5 text-xs text-violet-100">
              <b>Twist · {TWIST_INFO[view.twist].name}:</b> {TWIST_INFO[view.twist].text}
            </p>
          )}
          <div
            className="mt-2 grid gap-0.5"
            style={{
              // One row while it stays readable, otherwise two even rows.
              gridTemplateColumns: `repeat(${slots.length > 13 ? Math.ceil(slots.length / 2) : slots.length}, minmax(0, 1fr))`,
            }}
            aria-label="Wires left per number"
          >
            {slots.map((slot) =>
              slot.kind === "number" ? (
                <span
                  key={slot.at}
                  aria-label={`${slot.at}: ${slot.left} left`}
                  className={`rounded py-0.5 text-center ${slot.left ? "bg-slate-800" : "bg-slate-900 opacity-40"}`}
                >
                  <b className="block text-[11px]">{slot.at}</b>
                  <span className="text-[9px] text-slate-400">{slot.left}</span>
                </span>
              ) : (
                <span
                  key={`${slot.color}-${slot.at}`}
                  aria-label={`${slot.color} ${decimal(slot.at)}: ${
                    slot.state === "cut"
                      ? "cut"
                      : slot.state === "maybe"
                        ? "maybe in play"
                        : slot.state === "out"
                          ? "not in play"
                          : "in play"
                  }`}
                  className={`rounded py-0.5 text-center ${
                    slot.color === "yellow"
                      ? "bg-amber-300 text-amber-950"
                      : "bg-rose-400 text-rose-950"
                  } ${slot.state === "cut" || slot.state === "out" ? "opacity-35" : ""} ${slot.state === "maybe" ? "border border-dashed border-white/70" : ""}`}
                >
                  <b className="block text-[11px] tracking-tighter">{decimal(slot.at)}</b>
                  <span className="text-[9px]">
                    {slot.state === "maybe" ? "?" : slot.state === "in" ? "1" : "0"}
                  </span>
                </span>
              ),
            )}
          </div>
        </section>

        {/* Your stand(s) */}
        {me && (
          <section
            aria-label="Your wires"
            className="order-2 rounded-2xl border-2 p-3"
            style={{
              borderColor: colorOf(me.id),
              background: `linear-gradient(180deg, ${colorOf(me.id)}26, #0f172a 70%)`,
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[11px] font-bold tracking-widest uppercase"
                style={{ color: colorOf(me.id) }}
              >
                Your wires
              </span>
              {view.active === me.id && !view.pending && view.phase !== "over" && (
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-900">
                  Your turn
                </span>
              )}
            </div>
            {me.racks.map((rack, r) => (
              <div key={r} className="mt-2">
                {me.racks.length > 1 && (
                  <p className="mb-1 text-[10px] text-slate-400 uppercase">Stand {r + 1}</p>
                )}
                <StandRow count={rack.length} min={30} max={44}>
                  {rack.map((w, i) => {
                    const m = ownMove(w);
                    return (
                      <WireTile
                        key={w.id}
                        wire={w}
                        index={i}
                        onTap={tapOwn(w)}
                        selected={
                          (!!m && sameMove(shown, m.move)) ||
                          (view.phase === "play" &&
                            !w.cut &&
                            (sourceWire?.id === w.id || soloing === w.value))
                        }
                        lit={lit(w.id)}
                        solo={
                          view.phase === "play" &&
                          !sourceWire &&
                          !mode &&
                          !w.cut &&
                          !!soloMove(w.value)
                        }
                      />
                    );
                  })}
                </StandRow>
              </div>
            ))}
          </section>
        )}

        {/* Double Scan and tools */}
        {(view.doubleScan || view.tools.length > 0) && view.phase !== "over" && (
          <section aria-label="Power cards" className="order-3 rounded-xl bg-slate-900/80 p-2.5">
            <p className="mb-1.5 text-[11px] font-bold tracking-widest text-slate-400 uppercase">
              Power cards
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {view.doubleScan && (
                <ToolButton
                  name="Double Scan"
                  status={doubleUsed ? "Used (yours)" : "Ready · once each"}
                  tone={doubleUsed ? "used" : "ready"}
                  active={mode?.kind === "scan" && mode.tool === "double"}
                  onTap={
                    canScan("double")
                      ? () => setMode({ kind: "scan", tool: "double", wireIds: [], values: [] })
                      : undefined
                  }
                />
              )}
              {view.tools.map((t) => {
                const st = toolStatus(t);
                const onTap =
                  t.kind === "radar"
                    ? radarMoves.length
                      ? () => setMode({ kind: "radar", target: null })
                      : undefined
                    : t.kind === "swap"
                      ? swapMoves.length
                        ? () => setMode({ kind: "swap" })
                        : undefined
                      : t.kind === "dampener"
                        ? dampenMove
                          ? () => {
                              setMode(null);
                              offer(dampenMove.move, dampenMove.label);
                            }
                          : undefined
                        : canScan(t.kind)
                          ? () =>
                              setMode({
                                kind: "scan",
                                tool: t.kind as ScanTool,
                                wireIds: [],
                                values: [],
                              })
                          : undefined;
                return (
                  <ToolButton
                    key={t.kind}
                    name={TOOL_INFO[t.kind].name}
                    status={t.kind === "dampener" && view.dampened ? "Armed" : st.text}
                    tone={st.tone}
                    active={
                      (mode?.kind === "scan" && mode.tool === t.kind) || mode?.kind === t.kind
                    }
                    onTap={onTap}
                  />
                );
              })}
            </div>
            {view.radar.length > 0 && (
              <ul
                className="mt-2 space-y-0.5 text-[11px] text-slate-300"
                aria-label="Radar answers"
              >
                {view.radar.map((r, i) => (
                  <li key={i}>
                    📡 {view.players.find((p) => p.id === r.asker)?.name} asked: does{" "}
                    {view.players.find((p) => p.id === r.target)?.name} hold a {r.value}?{" "}
                    <b className={r.answer ? "text-emerald-300" : "text-rose-300"}>
                      {r.answer ? "Yes" : "No"}
                    </b>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Scan values */}
        {mode?.kind === "scan" && (
          <section
            aria-label="Scan values"
            className="order-3 rounded-xl border border-amber-400/40 bg-slate-900 p-3"
          >
            <p className="mb-2 text-sm font-semibold">
              {SCAN_NAME[mode.tool]}:{" "}
              {mode.tool === "twoTone" ? "which two values?" : "which value?"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {callValues.map((v) => {
                const on = mode.values.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      const values = on
                        ? mode.values.filter((x) => x !== v)
                        : mode.tool === "twoTone"
                          ? [...mode.values, v].slice(-2).sort((a, b) => a - b)
                          : [v];
                      updateScan({ ...mode, values });
                    }}
                    className={`min-h-11 min-w-11 rounded-lg px-3 font-black ${on ? "bg-amber-400 text-slate-900" : "bg-slate-700 text-white"}`}
                  >
                    {v}
                  </button>
                );
              })}
              <CloseButton onTap={() => setMode(null)} />
            </div>
          </section>
        )}

        {/* Radar: teammate, then number */}
        {mode?.kind === "radar" && (
          <section
            aria-label="Radar"
            className="order-3 rounded-xl border border-amber-400/40 bg-slate-900 p-3"
          >
            <p className="mb-2 text-sm font-semibold">
              Radar: {mode.target ? "which number?" : "ask which teammate?"} Everyone sees the
              answer.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {mode.target
                ? radarMoves
                    .filter((m) => m.move.type === "radar" && m.move.target === mode.target)
                    .map((m) => (
                      <button
                        key={m.label}
                        type="button"
                        onClick={() => offer(m.move, m.label)}
                        className={`min-h-11 min-w-11 rounded-lg px-3 font-black ${sameMove(proposed, m.move) ? "bg-amber-400 text-slate-900" : "bg-slate-700 text-white"}`}
                      >
                        {m.move.type === "radar" ? m.move.value : ""}
                      </button>
                    ))
                : others
                    .filter((p) =>
                      radarMoves.some((m) => m.move.type === "radar" && m.move.target === p.id),
                    )
                    .map((p) => (
                      <PlayerChip
                        key={p.id}
                        name={p.name}
                        color={colorOf(p.id)}
                        onTap={() =>
                          setModeState({ version, mode: { kind: "radar", target: p.id } })
                        }
                      />
                    ))}
              <CloseButton onTap={() => setMode(null)} />
            </div>
          </section>
        )}

        {/* Swap Radios: pick a teammate */}
        {mode?.kind === "swap" && (
          <section
            aria-label="Swap Radios"
            className="order-3 rounded-xl border border-amber-400/40 bg-slate-900 p-3"
          >
            <p className="mb-2 text-sm font-semibold">
              Swap one random wire with whom? Only the two of you see the values.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {swapMoves.map((m) => {
                const mv = m.move;
                const p = mv.type === "swap" ? others.find((o) => o.id === mv.target) : undefined;
                return p ? (
                  <PlayerChip
                    key={p.id}
                    name={p.name}
                    color={colorOf(p.id)}
                    selected={sameMove(proposed, m.move)}
                    onTap={() => offer(m.move, m.label)}
                  />
                ) : null;
              })}
              <CloseButton onTap={() => setMode(null)} />
            </div>
          </section>
        )}

        {hint && (
          <p className="order-3 rounded-lg bg-amber-400/15 px-3 py-2 text-center text-xs text-amber-100">
            {hint}
          </p>
        )}

        {/* Value picker for the chosen teammate wire */}
        {picked && (
          <section
            aria-label="Call a value"
            className="order-3 rounded-xl border border-amber-400/40 bg-slate-900 p-3"
          >
            <p className="mb-2 text-sm font-semibold">Call which value on this wire?</p>
            <div className="flex flex-wrap gap-1.5">
              {callsOn(picked).map((m) => {
                const value = m.move.type === "call" ? m.move.value : (0 as WireValue);
                return (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => propose(m.move, m.label)}
                    className={`min-h-11 min-w-11 rounded-lg px-3 font-black ${
                      sameMove(proposed, m.move)
                        ? "bg-amber-400 text-slate-900"
                        : "bg-slate-700 text-white"
                    }`}
                  >
                    {valueText(value)}
                  </button>
                );
              })}
              <button
                type="button"
                className="min-h-11 rounded-lg px-3 text-sm text-slate-400"
                onClick={() => {
                  setTarget(null);
                  cancel();
                }}
              >
                Pick another wire
              </button>
            </div>
          </section>
        )}
      </div>

      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {/* Teammates */}
        <section aria-label="Teammates" className="order-4 flex flex-col gap-1.5">
          {others.map((p: View["players"][number]) => (
            <div
              key={p.id}
              className="rounded-xl border-2 bg-slate-900/70 px-2.5 py-2"
              style={{
                borderColor:
                  view.active === p.id && view.phase !== "over" ? colorOf(p.id) : "#1e293b",
              }}
            >
              <p className="flex items-center gap-1.5 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(p.id) }} />
                <span className="font-semibold">
                  {view.active === p.id && view.phase !== "over" && "▶ "}
                  {p.name}
                </span>
                <span className="ml-auto text-xs text-slate-400">
                  {p.racks.flat().filter((w) => !w.cut).length} left
                </span>
              </p>
              {p.racks.map((rack, r) => (
                <div key={r} className="mt-1.5 flex items-start gap-1">
                  {p.racks.length > 1 && (
                    <span className="w-4 shrink-0 pt-3 text-[9px] text-slate-500">S{r + 1}</span>
                  )}
                  <StandRow count={rack.length} min={20} max={34}>
                    {rack.map((w, i) => (
                      <WireTile
                        key={w.id}
                        wire={w}
                        index={i}
                        size="sm"
                        onTap={tapTeammate(w)}
                        selected={
                          picked === w.id || (mode?.kind === "scan" && mode.wireIds.includes(w.id))
                        }
                        lit={lit(w.id)}
                      />
                    ))}
                  </StandRow>
                </div>
              ))}
            </div>
          ))}
        </section>

        <section aria-label="Rules reference" className="order-5 rounded-xl bg-slate-900/60 p-2.5">
          <table className="w-full border-separate border-spacing-y-1 text-xs">
            <tbody>
              {rulesFor(view).map(([name, text]) => (
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

      {/* Board moves are confirmed here; red reveals and skipped clues use the shell's bar. */}
      {shown && proposedLabel && (
        <div className="sticky bottom-2 z-10 order-6 flex gap-2 rounded-2xl border border-amber-400/50 bg-slate-950/95 p-2 shadow-xl @2xl:col-span-2">
          <button
            type="button"
            onClick={() => {
              setTarget(null);
              setModeState(null);
              setSource(null);
              cancel();
            }}
            className="min-h-12 rounded-xl bg-slate-700 px-4 font-bold text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setTarget(null);
              setModeState(null);
              // The called-with wire stays picked, to be offered again after a match.
              submit(shown);
            }}
            className="min-h-12 flex-1 rounded-xl bg-amber-400 px-3 font-bold text-slate-900"
          >
            {proposedLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export { docView } from "./doc.js";
