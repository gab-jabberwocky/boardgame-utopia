import { useEffect, useRef, type ReactNode } from "react";
import { DiceTray, Die, type DieTone } from "@utopia/kit/ui";
import type { BoardProps, LegalMove, PlayerId } from "@utopia/shared";
import {
  TRAILS,
  activePlayer,
  climb,
  climbLabel,
  diceChoices,
  peaksClaimed,
  trailLength,
  type DiceChoice,
  type Move,
  type State,
} from "./logic.js";

/** Peak counts for the shell's player list. */
export function playerDecor(view: State) {
  return {
    scores: Object.fromEntries(
      view.players.map((p) => [p.id, `${peaksClaimed(view, p.id)}/${view.config.peaksToWin} ⛰`]),
    ),
  };
}

/** Matches the dice tints: pair "a" amber, pair "b" sky. */
const PAIR_COLORS = { a: "#fbbf24", b: "#38bdf8" } as const;
const LOST = "#ef4444";

const sameTrails = (a: readonly number[], b: readonly number[]) => a.join() === b.join();
const sameMove = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Tone of each die for a chosen combination: used pairs coloured, unused pair faded. */
function diceTones(choice: DiceChoice | undefined): (DieTone | undefined)[] {
  const tones: (DieTone | undefined)[] = [undefined, undefined, undefined, undefined];
  if (!choice) return tones;
  const both = choice.uses[0] && choice.uses[1];
  choice.pairs.forEach((pair, i) => {
    const tone: DieTone = !choice.uses[i] ? "unused" : both && i === 1 ? "b" : "a";
    for (const d of pair) tones[d] = tone;
  });
  return tones;
}

/** Which pair colour each trail of a choice gets. */
function trailTones(choice: DiceChoice | undefined): Map<number, "a" | "b"> {
  const map = new Map<number, "a" | "b">();
  if (!choice) return map;
  const both = choice.uses[0] && choice.uses[1];
  choice.sums.forEach((sum, i) => {
    if (choice.uses[i] && !map.has(sum)) map.set(sum, both && i === 1 ? "b" : "a");
  });
  return map;
}

// ---------------------------------------------------------------- arrows

interface ArrowSpec {
  /** Step the arrow starts from (0 = the foot of the trail). */
  from: number;
  /** Step the arrow points at. */
  to: number;
  color: string;
  dashed?: boolean;
  pulse?: boolean;
  /** Grow the arrow when it first appears. */
  grow?: boolean;
  /** "cross" marks a lost climb. */
  head?: "arrow" | "cross";
  /** Stop just below the target step so a camp drawn there stays visible. */
  stopBelow?: boolean;
}

/** Height (percent from the bottom of the steps) of a step's centre. */
const stepCenter = (step: number, top: number) => (step <= 0 ? 0 : ((step - 0.5) / top) * 100);
/** Top edge of a step: arrows leave from here so the camp they start at stays visible. */
const stepTop = (step: number, top: number) => (step <= 0 ? 0 : (step / top) * 100);
/** Bottom edge of a step. */
const stepBottom = (step: number, top: number) => ((step - 1) / top) * 100;

function Arrow({ spec, top }: { spec: ArrowSpec; top: number }) {
  const shaft = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!spec.grow || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = shaft.current?.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], {
      duration: 500,
      easing: "ease-out",
    });
    const b = head.current?.animate(
      [
        { opacity: 0, transform: `translate(-50%, ${spec.stopBelow ? "100%" : "50%"}) scale(0.4)` },
        { opacity: 1, transform: `translate(-50%, ${spec.stopBelow ? "100%" : "50%"}) scale(1)` },
      ],
      { duration: 250, delay: 400, easing: "ease-out", fill: "backwards" },
    );
    return () => {
      a?.cancel();
      b?.cancel();
    };
  }, [spec.grow, spec.stopBelow]);

  const bottom = stepTop(spec.from, top);
  const tip = spec.stopBelow ? stepBottom(spec.to, top) : stepCenter(spec.to, top);
  // The head is centred on the tip, or (stopBelow) sits just under it.
  const headShift = spec.stopBelow ? "100%" : "50%";
  return (
    <div className={`pointer-events-none absolute inset-0 ${spec.pulse ? "animate-pulse" : ""}`}>
      <div
        ref={shaft}
        className="absolute left-1/2 w-1 -translate-x-1/2 rounded-full @2xl:w-1.5"
        style={{
          bottom: `${bottom}%`,
          height: `${tip - bottom}%`,
          transformOrigin: "bottom",
          background: spec.dashed
            ? `repeating-linear-gradient(to top, ${spec.color} 0 4px, transparent 4px 7px)`
            : spec.color,
        }}
      />
      <div
        ref={head}
        className="absolute left-1/2 flex items-center justify-center"
        style={{ bottom: `${tip}%`, transform: `translate(-50%, ${headShift})` }}
      >
        {spec.head === "cross" ? (
          <span className="text-sm leading-none font-black text-red-400 @2xl:text-xl">✕</span>
        ) : (
          <svg viewBox="0 0 16 14" className="h-3.5 w-4 @2xl:h-6 @2xl:w-7" aria-hidden>
            <polygon
              points="8,1 15,13 1,13"
              fill={spec.color}
              stroke="white"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- board

export default function Board({
  view,
  highlight,
  legalMoves,
  proposed,
  propose,
  cancel,
  submit,
  revealing,
}: BoardProps<State, Move>) {
  const colorOf = (id: PlayerId | null) =>
    view.players.find((p) => p.id === id)?.color ?? "#ffffff";
  const rolling = revealing && highlight.includes("dice");

  // ----- this viewer's moves (none while the dice are still tumbling)
  const myMoves = revealing ? [] : legalMoves;
  const canChoose = myMoves.some((m) => m.move.type === "climb");
  const choices = canChoose ? diceChoices(view, view.dice) : [];
  const turnMoves = myMoves.filter((m) => m.move.type !== "climb"); // roll / stop
  const proposedTrails = proposed?.type === "climb" ? proposed.trails : null;
  // The selected choice: the proposed one, or the only one (it still needs a tap to confirm).
  const selected =
    choices.find((c) => proposedTrails && sameTrails(c.trails, proposedTrails)) ??
    (choices.length === 1 ? choices[0] : undefined);
  const selectedTurnMove = turnMoves.find((m) => proposed && sameMove(m.move, proposed));
  const tones = diceTones(selected);
  const trailTone = trailTones(selected);

  // ----- who is climbing, and from where
  const fall = view.fallen;
  const lastWasFall = highlight.some((h) => h.startsWith("fall-"));
  // While the dice tumble before a fall, keep showing the climbers that are about to be lost.
  const showDoomed = Boolean(rolling && fall && lastWasFall);
  const owner = showDoomed && fall ? fall.player : activePlayer(view);
  const ownerColor = colorOf(owner);
  const current = showDoomed && fall ? fall.climbers : view.climbers;
  const preview = selected ? climb(view, selected.trails) : null;
  const lost = !revealing && fall && lastWasFall ? fall : null;
  const campMove = view.campMove;

  /** Arrows to draw on one trail. */
  const arrowsFor = (trail: number): { key: string; spec: ArrowSpec }[] => {
    const arrows: { key: string; spec: ArrowSpec }[] = [];
    const start = view.camps[owner]?.[trail] ?? 0;
    const at = current[trail] ?? 0;
    if (at > 0) {
      // This turn's climb so far: from the camp (which stays put) to the climber.
      arrows.push({
        key: `climb-${start}-${at}`,
        spec: { from: start, to: at, color: ownerColor, grow: !rolling },
      });
    }
    const next = preview?.[trail] ?? 0;
    const tone = trailTone.get(trail);
    if (tone && next > at) {
      // The selected combination: where this climb would go.
      arrows.push({
        key: `preview-${next}`,
        spec: { from: at || start, to: next, color: PAIR_COLORS[tone], dashed: true, pulse: true },
      });
    }
    if (lost) {
      const lostAt = lost.climbers[trail] ?? 0;
      if (lostAt > 0) {
        const lostStart = view.camps[lost.player]?.[trail] ?? 0;
        arrows.push({
          key: `lost-${lostAt}`,
          spec: { from: lostStart, to: lostAt, color: LOST, dashed: true, head: "cross" },
        });
      }
    }
    if (campMove) {
      const from = campMove.from[trail] ?? 0;
      const to =
        view.peaks[trail] === campMove.player
          ? trailLength(trail)
          : (view.camps[campMove.player]?.[trail] ?? 0);
      if (to > from) {
        // Just made camp: show the move from the old camp to the new one.
        arrows.push({
          key: `camp-${from}-${to}`,
          spec: { from, to, color: colorOf(campMove.player), grow: true, stopBelow: true },
        });
      }
    }
    return arrows;
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-2 px-3 py-3 @2xl:max-w-6xl @2xl:flex-row @2xl:items-center @2xl:gap-8 @2xl:px-8">
      {/* Trails */}
      <div className="flex w-full items-end justify-center gap-[3px] @2xl:flex-1 @2xl:gap-1.5">
        {TRAILS.map((trail) => {
          const top = trailLength(trail);
          const claimedBy = view.peaks[trail] ?? null;
          const tone = trailTone.get(trail);
          const ring = tone
            ? PAIR_COLORS[tone]
            : highlight.includes(`fall-${trail}`) && !revealing
              ? LOST
              : highlight.includes(`trail-${trail}`) || highlight.includes(`peak-${trail}`)
                ? "#fbbf24"
                : null;
          return (
            <div
              key={trail}
              aria-label={`Trail ${trail}${claimedBy ? `, claimed by ${view.players.find((p) => p.id === claimedBy)?.name}` : ""}`}
              className="flex flex-1 flex-col-reverse items-stretch gap-[2px] rounded-md p-[2px]"
              style={{
                boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
                background: claimedBy ? `${colorOf(claimedBy)}26` : undefined,
              }}
            >
              <span
                className="rounded-sm text-center text-xs font-bold @2xl:text-base"
                style={{ color: tone ? PAIR_COLORS[tone] : "#94a3b8" }}
              >
                {trail}
              </span>
              <div className="relative flex flex-col-reverse gap-[2px]">
                {Array.from({ length: top }, (_, i) => i + 1).map((step) => {
                  const isTop = step === top;
                  const camps = claimedBy
                    ? []
                    : view.players.filter((p) => view.camps[p.id]?.[trail] === step);
                  return (
                    <span
                      key={step}
                      className={`flex h-[clamp(12px,calc(2.4dvh/var(--stage-zoom,1)),22px)] items-center justify-center gap-px rounded-sm @2xl:h-[clamp(14px,calc(4.4dvh/var(--stage-zoom,1)),42px)] ${
                        claimedBy && !isTop ? "opacity-50" : ""
                      } ${isTop && highlight.includes(`peak-${trail}`) ? "animate-pulse" : ""}`}
                      style={{
                        background:
                          claimedBy && isTop ? colorOf(claimedBy) : isTop ? "#475569" : "#1e293b",
                      }}
                    >
                      {isTop && !claimedBy && <span className="text-[9px] text-slate-300">▲</span>}
                      {isTop && claimedBy && <span className="text-[10px]">🏁</span>}
                      {camps.map((p) => (
                        <span
                          key={p.id}
                          className="h-[6px] w-[6px] rounded-[1px] @2xl:h-[10px] @2xl:w-[10px] @2xl:rounded-[2px]"
                          style={{ background: p.color }}
                        />
                      ))}
                    </span>
                  );
                })}
                {arrowsFor(trail).map((a) => (
                  <Arrow key={a.key} spec={a.spec} top={top} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Side panel on wide screens: dice, then every action right underneath */}
      <div className="flex w-full flex-col items-center gap-2 @2xl:w-96 @2xl:shrink-0">
        <DiceTray
          values={view.dice}
          rolling={rolling}
          tones={tones}
          highlight={highlight.includes("dice") && !selected}
        />
        {choices.length > 0 && (
          <ChoicePanel
            hint="Pick a combination"
            confirmLabel={selected ? climbLabel(selected.trails) : null}
            onlyOne={choices.length === 1}
            onConfirm={() => selected && submit({ type: "climb", trails: selected.trails })}
            onCancel={cancel}
          >
            {choices.map((c) => (
              <ComboCard
                key={c.trails.join()}
                choice={c}
                dice={view.dice}
                selected={c === selected}
                wide={choices.length % 2 === 1 && c === choices[choices.length - 1]}
                onClick={() =>
                  c === selected && choices.length > 1
                    ? cancel()
                    : propose({ type: "climb", trails: c.trails }, climbLabel(c.trails))
                }
              />
            ))}
          </ChoicePanel>
        )}
        {turnMoves.length === 1 && choices.length === 0 && (
          <BigButton onClick={() => submit(turnMoves[0]!.move)}>{turnMoves[0]!.label}</BigButton>
        )}
        {turnMoves.length > 1 && (
          <ChoicePanel
            hint="Push your luck, or make camp?"
            confirmLabel={selectedTurnMove?.label ?? null}
            onlyOne={false}
            onConfirm={() => selectedTurnMove && submit(selectedTurnMove.move)}
            onCancel={cancel}
          >
            {turnMoves.map((m: LegalMove<Move>) => {
              const isSelected = m === selectedTurnMove;
              return (
                <button
                  key={m.label}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => (isSelected ? cancel() : propose(m.move, m.label))}
                  className={`min-h-14 rounded-xl border-2 px-3 text-lg font-semibold text-white ${
                    isSelected ? "border-amber-400 bg-slate-700" : "border-slate-700 bg-slate-800"
                  }`}
                >
                  {m.move.type === "roll" ? "🎲 Roll again" : "⛺ Make camp"}
                </button>
              );
            })}
          </ChoicePanel>
        )}
        <p className="text-center text-[11px] text-slate-500">
          ■ camp · ▲ this turn&apos;s climb · dashed = selected
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- action panel pieces

function BigButton({ onClick, children }: { onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-14 w-full rounded-xl bg-amber-400 text-lg font-semibold text-slate-900 active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

/** Options in a grid, with the confirm row directly above them. */
function ChoicePanel({
  hint,
  confirmLabel,
  onlyOne,
  onConfirm,
  onCancel,
  children,
}: {
  hint: string;
  confirmLabel: string | null;
  /** A single option needs no Cancel; tapping the button is the one tap. */
  onlyOne: boolean;
  onConfirm(): void;
  onCancel(): void;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      {confirmLabel ? (
        <div className="flex gap-2">
          {!onlyOne && (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-12 rounded-xl bg-slate-700 px-4 font-semibold text-white"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-12 flex-1 rounded-xl bg-amber-400 text-lg font-semibold text-slate-900 active:scale-[0.98]"
          >
            {onlyOne ? "" : "Confirm: "}
            {confirmLabel}
          </button>
        </div>
      ) : (
        <p className="flex min-h-12 items-center justify-center text-amber-200">{hint}</p>
      )}
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function ComboCard({
  choice,
  dice,
  selected,
  wide,
  onClick,
}: {
  choice: DiceChoice;
  dice: readonly number[];
  selected: boolean;
  wide: boolean;
  onClick(): void;
}) {
  const both = choice.uses[0] && choice.uses[1];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 ${
        selected ? "border-amber-400 bg-slate-700" : "border-slate-700 bg-slate-800"
      } ${wide ? "col-span-2" : ""}`}
    >
      <span className="flex items-center gap-3">
        {choice.pairs.map((pair, i) => {
          const used = choice.uses[i];
          const color = both && i === 1 ? PAIR_COLORS.b : PAIR_COLORS.a;
          return (
            <span key={i} className={`flex items-center gap-1 ${used ? "" : "opacity-30"}`}>
              {pair.map((d) => (
                <Die key={d} value={dice[d] ?? 0} size={18} />
              ))}
              <span
                className={`ml-0.5 text-base font-bold ${used ? "" : "line-through"}`}
                style={{ color: used ? color : "#94a3b8" }}
              >
                {choice.sums[i]}
              </span>
            </span>
          );
        })}
      </span>
      <span className="text-sm text-slate-200">{climbLabel(choice.trails)}</span>
    </button>
  );
}

export { docView } from "./doc.js";
