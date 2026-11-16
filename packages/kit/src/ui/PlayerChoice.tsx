import {
  MAX_NAME_LENGTH,
  PLAYER_COLORS,
  colorTakenBy,
  validatePlayerChoice,
  type PlayerInfo,
} from "@utopia/shared";

export interface PlayerChoiceProps {
  /** Everyone in the room, including `me`. */
  players: readonly PlayerInfo[];
  me: PlayerInfo;
  onChange(me: PlayerInfo): void;
  /** Hide the name field (e.g. when only the colour is being picked). */
  colorOnly?: boolean;
}

/** Name input plus colour swatches. Taken colours are crossed out; clashes are explained. */
export function PlayerChoice({ players, me, onChange, colorOnly = false }: PlayerChoiceProps) {
  const problem = validatePlayerChoice(players, me);
  return (
    <div className="flex flex-col gap-2">
      {!colorOnly && (
        <input
          value={me.name}
          maxLength={MAX_NAME_LENGTH + 4}
          onChange={(e) => onChange({ ...me, name: e.target.value })}
          aria-label="Name"
          aria-invalid={problem !== null}
          className={`min-h-11 rounded-lg bg-slate-800 px-3 text-white outline-none ${
            problem ? "ring-2 ring-red-500" : "focus:ring-2 focus:ring-amber-400"
          }`}
        />
      )}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
        {PLAYER_COLORS.map((c) => {
          const owner = colorTakenBy(players, c.value, me.id);
          const selected = me.color === c.value;
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={owner ? `${c.name}, taken by ${owner.name}` : c.name}
              title={owner ? `Taken by ${owner.name}` : c.name}
              disabled={Boolean(owner)}
              onClick={() => onChange({ ...me, color: c.value })}
              className={`relative h-9 w-9 rounded-full border-2 ${
                selected ? "border-white ring-2 ring-white/50" : "border-transparent"
              } ${owner ? "opacity-25" : ""}`}
              style={{ background: c.value }}
            >
              {owner && (
                <span className="absolute inset-0 flex items-center justify-center font-bold text-slate-900">
                  ✕
                </span>
              )}
              {selected && (
                <span className="absolute inset-0 flex items-center justify-center font-bold text-slate-900">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
      {problem && <p className="text-sm text-red-400">{problem}</p>}
    </div>
  );
}
