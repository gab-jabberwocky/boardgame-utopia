import type { PlayerId, PlayerInfo, Viewer } from "@utopia/shared";

export interface PlayerListProps {
  players: readonly PlayerInfo[];
  activePlayers: readonly PlayerId[];
  viewer: Viewer;
  /** Optional score or short note per player. */
  scores?: Readonly<Record<PlayerId, string | number>>;
}

/** Compact, horizontally scrolling player chips in each player's colour. Fits 10 on a phone. */
export function PlayerList({ players, activePlayers, viewer, scores }: PlayerListProps) {
  return (
    <ul className="flex gap-2 overflow-x-auto bg-slate-900 px-4 py-2">
      {players.map((p) => {
        const active = activePlayers.includes(p.id);
        return (
          <li
            key={p.id}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm ${
              active ? "font-semibold text-slate-900" : "bg-slate-800 text-slate-200"
            }`}
            style={{ borderColor: p.color, background: active ? p.color : undefined }}
          >
            {!active && (
              <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: p.color }} />
            )}
            <span>
              {p.name}
              {p.id === viewer && " (you)"}
            </span>
            {scores?.[p.id] !== undefined && <span className="opacity-80">· {scores[p.id]}</span>}
          </li>
        );
      })}
    </ul>
  );
}
