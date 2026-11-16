import { useState } from "react";
import type { GameResult, PlayerInfo } from "@utopia/shared";

export interface GameOverProps {
  result: GameResult;
  players: readonly PlayerInfo[];
  /** Shown only to the host. */
  onBackToLobby?: () => void;
}

/** Winner declaration over the board. Can be minimised to look at the final board. */
export function GameOver({ result, players, onBackToLobby }: GameOverProps) {
  const [minimised, setMinimised] = useState(false);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? id;

  if (minimised) {
    return (
      <button
        type="button"
        onClick={() => setMinimised(false)}
        className="absolute bottom-3 left-1/2 z-20 min-h-12 whitespace-nowrap -translate-x-1/2 rounded-full bg-amber-400 px-4 py-2 font-semibold text-slate-900 shadow-lg"
      >
        🏆 Game over: show results
      </button>
    );
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 p-6 text-center text-white shadow-2xl">
        <div className="text-5xl" aria-hidden>
          🏆
        </div>
        <h2 className="mt-2 text-2xl font-bold">
          {result.winners.length === 0
            ? "Game over"
            : `${result.winners.map(name).join(" & ")} win${result.winners.length === 1 ? "s" : ""}!`}
        </h2>
        <p className="mt-1 text-slate-300">{result.text}</p>
        {result.ranking && (
          <ol className="mt-4 space-y-1 text-left">
            {result.ranking.map((r, i) => (
              <li
                key={r.player}
                className={`flex justify-between rounded-lg px-3 py-2 ${
                  result.winners.includes(r.player) ? "bg-amber-400/20" : "bg-slate-700/50"
                }`}
              >
                <span>
                  {i + 1}. {name(r.player)}
                </span>
                {r.score !== undefined && <span className="font-semibold">{r.score}</span>}
              </li>
            ))}
          </ol>
        )}
        <div className="mt-6 flex flex-col gap-2">
          {onBackToLobby && (
            <button
              type="button"
              onClick={onBackToLobby}
              className="min-h-12 rounded-xl bg-amber-400 font-semibold text-slate-900"
            >
              Back to lobby
            </button>
          )}
          <button
            type="button"
            onClick={() => setMinimised(true)}
            className="min-h-12 rounded-xl bg-slate-700 font-semibold"
          >
            View final board
          </button>
        </div>
      </div>
    </div>
  );
}
