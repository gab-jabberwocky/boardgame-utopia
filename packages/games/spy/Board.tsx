import { useEffect, useState, type ReactNode } from "react";
import type { BoardProps, PlayerId } from "@utopia/shared";
import { ROLE_INFO, type Move, type Phase, type Role, type View } from "./logic.js";

/** Public roles (only the Master until the end), for the shell's player list. */
export function playerDecor(view: View) {
  const scores: Record<PlayerId, string> = {};
  for (const p of view.players) {
    const role = view.roles?.[p.id] ?? (p.id === view.master ? "master" : null);
    if (role) scores[p.id] = ROLE_INFO[role].name;
  }
  return { scores };
}

const ROLE_LOOK: Record<Role, { bg: string; ink: string; icon: string }> = {
  master: { bg: "linear-gradient(160deg, #facc15, #b45309)", ink: "#1c1917", icon: "👑" },
  insider: { bg: "linear-gradient(160deg, #f43f5e, #7f1d1d)", ink: "#fff1f2", icon: "🕵️" },
  common: { bg: "linear-gradient(160deg, #38bdf8, #1e3a8a)", ink: "#f0f9ff", icon: "🙂" },
};

const STEPS: { phase: Phase[]; label: string }[] = [
  { phase: ["roles"], label: "Roles" },
  { phase: ["questions"], label: "Ask" },
  { phase: ["discussion"], label: "Discuss" },
  { phase: ["judge"], label: "Vote 1" },
  { phase: ["accuse", "tiebreak"], label: "Vote 2" },
  { phase: ["over"], label: "Result" },
];

/** Seconds since `key` last changed, counted on this device (the Master calls time). */
function useSeconds(key: string): number {
  const [tick, setTick] = useState({ key, secs: 0 });
  useEffect(() => {
    const id = setInterval(
      () => setTick((t) => (t.key === key ? { key, secs: t.secs + 1 } : { key, secs: 1 })),
      1000,
    );
    return () => clearInterval(id);
  }, [key]);
  return tick.key === key ? tick.secs : 0;
}

const clock = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(Math.max(0, secs) % 60).padStart(2, "0")}`;

function Timer({ total, elapsed, label }: { total: number; elapsed: number; label: string }) {
  const left = Math.max(0, total - elapsed);
  const pct = total ? (left / total) * 100 : 0;
  const out = left === 0;
  return (
    <section aria-label="Timer" className="rounded-2xl bg-slate-900/70 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs tracking-wide text-slate-400 uppercase">⏳ {label}</span>
        <span className={`text-3xl font-black tabular-nums ${out ? "text-red-400" : "text-white"}`}>
          {clock(left)}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all ${out ? "bg-red-500" : "bg-amber-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {out && <p className="mt-1 text-xs text-red-300">Time's up! The Master calls it.</p>}
    </section>
  );
}

function RoleCard({
  role,
  word,
  open,
  toggle,
}: {
  role: Role;
  word: string | null;
  open: boolean;
  toggle: () => void;
}) {
  const look = ROLE_LOOK[role];
  if (!open) {
    return (
      <button
        type="button"
        onClick={toggle}
        className="flex h-40 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-600 bg-slate-900 text-slate-300"
      >
        <span className="text-3xl">🂠</span>
        <span className="font-bold">Tap to see your role</span>
        <span className="text-xs text-slate-500">Keep your screen to yourself</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className="flex w-full flex-col items-center gap-1 rounded-2xl p-4 text-center shadow-xl"
      style={{ background: look.bg, color: look.ink }}
    >
      <span className="text-xs font-bold tracking-widest uppercase opacity-80">You are the</span>
      <span className="text-3xl font-black">
        {look.icon} {ROLE_INFO[role].name}
      </span>
      <span className="text-sm opacity-90">{ROLE_INFO[role].goal}</span>
      {word && (
        <span className="mt-2 rounded-xl bg-black/30 px-4 py-2">
          <span className="block text-[10px] tracking-widest uppercase opacity-80">The word</span>
          <span className="text-2xl font-black">{word}</span>
        </span>
      )}
      <span className="mt-1 text-[10px] opacity-70">Tap to hide</span>
    </button>
  );
}

const REFERENCE: [string, ReactNode][] = [
  ["Questions", "Ask the Master yes/no questions out loud. Answers: YES · NO · I DON'T KNOW."],
  ["Found", "The Master taps who said the word. Out of time: everyone loses."],
  ["Discuss", "As long as the questions took. Who knew too much?"],
  ["Vote 1", "Is the Guesser the Insider? Majority yes: right → you win, wrong → Insider wins."],
  ["", "No majority: Insider Guesser wins, otherwise go to vote 2."],
  ["Vote 2", "Point at the Insider. Caught → Master and Commons win. Tie → the Guesser decides."],
];

export default function Board({
  view,
  viewer,
  legalMoves,
  proposed,
  propose,
  cancel,
  submit,
}: BoardProps<View, Move>) {
  const [open, setOpen] = useState(false);
  const elapsed = useSeconds(view.phase);
  const nameOf = (id: PlayerId) => view.players.find((p) => p.id === id)?.name ?? "?";
  const isMaster = viewer === view.master;
  const over = view.phase === "over";
  const found = legalMoves.filter((m) => m.move.type === "found");
  const accuseTally = new Map<PlayerId, number>();
  for (const t of Object.values(view.accuseVotes ?? {}))
    accuseTally.set(t, (accuseTally.get(t) ?? 0) + 1);
  const stepIndex = STEPS.findIndex((s) => s.phase.includes(view.phase));

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-3 @2xl:grid @2xl:max-w-5xl @2xl:grid-cols-2 @2xl:items-start @2xl:gap-x-6 @2xl:px-6">
      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {/* Where we are */}
        <ol className="order-1 flex gap-1 text-[10px] font-bold uppercase">
          {STEPS.map((s, i) => (
            <li
              key={s.label}
              className={`flex-1 rounded-md py-1 text-center ${
                i === stepIndex
                  ? "bg-amber-400 text-slate-900"
                  : i < stepIndex
                    ? "bg-slate-700 text-slate-300"
                    : "bg-slate-900 text-slate-600"
              }`}
            >
              {s.label}
            </li>
          ))}
        </ol>

        {view.role && !over && (
          <div className="order-2">
            <RoleCard role={view.role} word={view.word} open={open} toggle={() => setOpen(!open)} />
          </div>
        )}

        {view.word && view.guesser && (
          <section className="order-3 rounded-2xl bg-emerald-950/60 p-3 text-center ring-1 ring-emerald-500/40">
            <p className="text-xs text-emerald-200">
              {nameOf(view.guesser)} found the word{over ? "" : " (the Guesser)"}
            </p>
            <p className="text-2xl font-black text-white">{view.word}</p>
          </section>
        )}

        {view.phase === "questions" && (
          <div className="order-4">
            <Timer total={view.config.minutes * 60} elapsed={elapsed} label="Questions" />
          </div>
        )}
        {view.phase === "discussion" && view.questionSeconds !== null && (
          <div className="order-4">
            <Timer total={view.questionSeconds} elapsed={elapsed} label="Discussion" />
          </div>
        )}

        {/* The Master's controls during the questions */}
        {view.phase === "questions" && isMaster && (
          <section className="order-5 rounded-2xl border-2 border-amber-400/60 bg-amber-950/40 p-3">
            <p className="text-center text-xs font-bold tracking-widest text-amber-200 uppercase">
              Answer only
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center text-sm font-black">
              <span className="rounded-lg bg-emerald-600 py-2 text-white">YES</span>
              <span className="rounded-lg bg-red-600 py-2 text-white">NO</span>
              <span className="rounded-lg bg-slate-600 py-2 text-white">I DON'T KNOW</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-amber-100">
              Someone said the word? Tap who:
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {found.map((m) => {
                const guesser = m.move.type === "found" ? m.move.guesser : "";
                const move: Move = { type: "found", guesser, seconds: elapsed };
                const picked = proposed?.type === "found" && proposed.guesser === guesser;
                return (
                  <button
                    key={guesser}
                    type="button"
                    onClick={() => propose(move, m.label)}
                    className={`min-h-11 rounded-xl px-2 font-bold ${
                      picked ? "bg-amber-400 text-slate-900" : "bg-slate-700 text-white"
                    }`}
                  >
                    {nameOf(guesser)}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <div className="contents @2xl:flex @2xl:flex-col @2xl:gap-3">
        {/* Everyone */}
        <section aria-label="Players" className="order-6 rounded-2xl bg-slate-900/60 p-2.5">
          <ul className="grid gap-1.5">
            {view.players.map((p) => {
              const role = view.roles?.[p.id] ?? (p.id === view.master ? "master" : null);
              const voted =
                view.voted.includes(p.id) && (view.phase === "judge" || view.phase === "accuse");
              const judged = view.judgeVotes?.[p.id];
              const pointed = view.accuseVotes?.[p.id];
              return (
                <li
                  key={p.id}
                  className={`flex flex-wrap items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm ${
                    over && role === "insider"
                      ? "bg-red-950/70 ring-1 ring-red-500/60"
                      : "bg-slate-950/40"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: p.color }}
                  />
                  <span className="font-semibold">
                    {p.name}
                    {p.id === viewer && <span className="font-normal text-slate-400"> (you)</span>}
                  </span>
                  {role && (
                    <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[11px] font-bold">
                      {ROLE_LOOK[role].icon} {ROLE_INFO[role].name}
                    </span>
                  )}
                  {p.id === view.guesser && (
                    <span className="rounded-full bg-emerald-700 px-1.5 py-0.5 text-[11px] font-bold">
                      🎯 Guesser
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-300">
                    {voted && <span className="text-emerald-400">✓ voted</span>}
                    {judged !== undefined && (
                      <span className={judged ? "text-red-300" : "text-slate-400"}>
                        {judged ? "said Insider" : "said not"}
                      </span>
                    )}
                    {pointed && <span>→ {nameOf(pointed)}</span>}
                    {(accuseTally.get(p.id) ?? 0) > 0 && (
                      <span className="rounded bg-amber-400 px-1 font-black text-slate-900">
                        {accuseTally.get(p.id)} 👉
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {over && view.word && !view.guesser && (
          <p className="order-7 text-center text-sm text-slate-300">
            The word was <b className="text-white">{view.word}</b>.
          </p>
        )}

        <section aria-label="Rules reference" className="order-8 rounded-xl bg-slate-900/60 p-2.5">
          <table className="w-full border-separate border-spacing-y-1 text-xs">
            <tbody>
              {REFERENCE.map(([name, text], i) => (
                <tr key={i}>
                  <th
                    scope="row"
                    className="w-20 pr-2 text-left align-top font-semibold text-slate-200"
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

      {/* "Found the word" is confirmed here; votes and the rest use the shell's bar. */}
      {proposed?.type === "found" && (
        <div className="sticky bottom-2 z-10 order-9 flex gap-2 rounded-2xl border border-amber-400/50 bg-slate-950/95 p-2 shadow-xl @2xl:col-span-2">
          <button
            type="button"
            onClick={cancel}
            className="min-h-12 rounded-xl bg-slate-700 px-4 font-bold text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit({ ...proposed, seconds: elapsed })}
            className="min-h-12 flex-1 rounded-xl bg-amber-400 px-3 font-bold text-slate-900"
          >
            {nameOf(proposed.guesser)} found the word
          </button>
        </div>
      )}
    </div>
  );
}

export { docView } from "./doc.js";
