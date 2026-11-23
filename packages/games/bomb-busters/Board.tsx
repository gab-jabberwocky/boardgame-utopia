import { useState } from "react";
import type { BoardProps } from "@utopia/shared";
import type { Move, View, ViewWire } from "./logic.js";

function face(wire: ViewWire) {
  if (wire.value === undefined) return "···";
  return wire.value === "YELLOW" ? "Y" : wire.value === "RED" ? "R" : wire.value;
}

export function playerDecor(view: View) {
  return {
    scores: Object.fromEntries(
      view.players.map((p) => [p.id, `${p.racks.flat().filter((w) => !w.cut).length} wires`]),
    ),
  };
}

export default function BombBustersBoard({
  view: rawView,
  viewer,
  highlight,
  legalMoves,
  proposed,
  propose,
  cancel,
}: BoardProps<View, Move>) {
  const view = rawView;
  const myMoves = legalMoves;
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const proposedWire = proposed && "wireId" in proposed ? proposed.wireId : null;
  const moveFor = (wireId: string, type: "clue" | "call" | "cutOwn") =>
    myMoves.filter(
      (item) => item.move.type === type && "wireId" in item.move && item.move.wireId === wireId,
    );
  const callMoves = myMoves.filter((item) => item.move.type === "call");
  const selectable = (wire: ViewWire) =>
    moveFor(wire.id, "clue").length > 0 ||
    moveFor(wire.id, "cutOwn").length > 0 ||
    callMoves.some((m) => m.move.type === "call" && m.move.wireId === wire.id);
  const track = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    left: view.players.flatMap((p) => p.racks.flat()).filter((w) => !w.cut && w.value === i + 1)
      .length,
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-3 text-slate-100 sm:p-5">
      <section
        className="rounded-2xl border border-slate-700 bg-slate-900 p-4"
        aria-label="Bomb status"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400">
              Mission {view.mission}
            </p>
            <h2 className="text-xl font-bold">{view.missionName}</h2>
          </div>
          <div className="rounded-xl border-2 border-rose-400/70 px-4 py-2 text-center">
            <strong className="block text-3xl text-rose-200">
              {Math.max(0, view.mistakeLimit - view.mistakes)}
            </strong>
            <span className="text-[10px] uppercase tracking-wide">detonator steps</span>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-300">{view.lastText}</p>
        <div
          className="mt-4 flex gap-1 overflow-x-auto pb-1"
          aria-label="Blue wire values remaining"
        >
          {track.map(({ value, left }) => (
            <div
              key={value}
              className="min-w-12 rounded-lg border border-slate-600 bg-slate-800 px-2 py-2 text-center"
            >
              <b className="block text-lg">{value}</b>
              <small>{left} left</small>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2" aria-label="Player stands">
        {view.players.map((player) => (
          <article
            key={player.id}
            className={`min-w-0 rounded-2xl border p-3 ${player.id === viewer ? "border-emerald-400/70 bg-emerald-950/30" : "border-slate-700 bg-slate-900"}`}
          >
            <h3 className="font-semibold">
              {player.name}
              {player.id === viewer ? " · you" : ""}
              {player.id === view.active ? " · acting" : ""}
            </h3>
            {player.racks.map((rack, ri) => (
              <div key={ri} className="mt-3">
                <p className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">
                  {player.racks.length > 1 ? `Stand ${ri + 1}` : "Wires"}
                </p>
                <div className="flex gap-1 overflow-x-auto pb-2">
                  {rack.map((wire, wi) => {
                    const canPick = selectable(wire);
                    const callChoices = moveFor(wire.id, "call");
                    return (
                      <div
                        key={wire.id}
                        className="relative flex min-w-8 flex-1 flex-col items-center"
                      >
                        <button
                          disabled={!canPick}
                          onClick={() => {
                            const choices = moveFor(
                              wire.id,
                              view.phase === "clues"
                                ? "clue"
                                : view.phase === "own"
                                  ? "cutOwn"
                                  : "call",
                            );
                            if (view.phase === "play" && callChoices.length)
                              setSelectedTarget(wire.id);
                            else if (choices.length === 1)
                              propose(choices[0]!.move, choices[0]!.label);
                          }}
                          aria-label={`${player.name}, stand ${ri + 1}, position ${wi + 1}${wire.cut ? ", cut" : wire.clue ? `, clue ${face(wire)}` : wire.value === undefined ? ", hidden wire" : `, ${face(wire)}`}`}
                          className={`flex h-16 w-full min-w-8 items-center justify-center rounded-t-lg border-2 font-serif text-xl font-bold disabled:cursor-default disabled:opacity-100 ${wire.cut ? "border-dashed border-emerald-300 bg-emerald-900/60 text-emerald-100" : wire.color === "yellow" ? "border-amber-300 bg-amber-200 text-amber-950" : wire.color === "red" ? "border-rose-300 bg-rose-300 text-rose-950" : wire.value !== undefined ? "border-sky-200 bg-sky-100 text-sky-950" : "border-slate-600 bg-slate-700 text-slate-300"} ${highlight.includes(wire.id) ? "ring-2 ring-amber-300" : ""} ${proposedWire === wire.id ? "ring-4 ring-amber-400" : ""}`}
                        >
                          {wire.value === undefined ? "···" : face(wire)}
                          {wire.clue && !wire.cut ? (
                            <span className="absolute top-0.5 text-[8px] text-amber-700">◉</span>
                          ) : null}
                          {wire.cut ? (
                            <span className="absolute bottom-1 rounded bg-emerald-700 px-1 text-[7px] text-white">
                              CUT
                            </span>
                          ) : null}
                        </button>
                        <small className="text-[8px] text-slate-500">
                          {String(wi + 1).padStart(2, "0")}
                        </small>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </article>
        ))}
      </section>
      {view.phase === "play" && selectedTarget && (
        <section className="rounded-xl bg-slate-900 p-3">
          <p className="mb-2 text-sm font-semibold">Choose the value to call on this wire</p>
          <div className="flex flex-wrap gap-2">
            {Array.from(
              new Set(
                moveFor(selectedTarget, "call").map((item) =>
                  item.move.type === "call" ? item.move.value : -1,
                ),
              ),
            )
              .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
              .map((value) => {
                const item = moveFor(selectedTarget, "call").find(
                  (m) => m.move.type === "call" && m.move.value === value,
                );
                return (
                  <button
                    key={value}
                    onClick={() => item && propose(item.move, `Call ${value}`)}
                    className="rounded-lg border border-slate-500 bg-slate-800 px-4 py-2 font-bold"
                  >
                    {value}
                  </button>
                );
              })}
            <button
              onClick={() => setSelectedTarget(null)}
              className="rounded-lg border border-slate-500 px-3 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      {proposed && (
        <button
          onClick={cancel}
          className="self-start rounded-lg border border-slate-500 px-3 py-2 text-sm"
        >
          Cancel selection
        </button>
      )}
      <p className="text-center text-[10px] text-slate-500">
        {view.players.length} players ·{" "}
        {view.players.reduce((sum, p) => sum + p.racks.flat().filter((w) => !w.cut).length, 0)}{" "}
        wires in play
      </p>
    </div>
  );
}
