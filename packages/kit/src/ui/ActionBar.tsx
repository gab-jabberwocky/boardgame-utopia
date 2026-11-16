import type { LegalMove } from "@utopia/shared";

export interface ActionBarProps<Move> {
  /** Moves the viewer may make now. Empty when it's not their turn. */
  legalMoves: readonly LegalMove<Move>[];
  /** The move waiting for confirmation, if any. */
  proposed: LegalMove<Move> | null;
  onPropose(move: LegalMove<Move>): void;
  onCancel(): void;
  /** Actually send the move. */
  onSubmit(move: Move): void;
  /** Buttons are shown but can't be pressed (e.g. while dice are still rolling). */
  disabled?: boolean;
  /** Shown when there is nothing to do. */
  idleText?: string;
}

const big =
  "min-h-14 rounded-xl px-4 text-lg font-semibold transition active:scale-[0.98] disabled:opacity-40";

/**
 * Bottom action area. Choices are proposed first and confirmed second.
 * When only one move exists, it is a single button with no confirm step,
 * but the player still taps it themselves. Moves marked `where: "board"`
 * are left to the game's Board, and the bar hides itself when those are the only moves.
 */
export function ActionBar<Move>({
  legalMoves,
  proposed,
  onPropose,
  onCancel,
  onSubmit,
  disabled = false,
  idleText = "Waiting for other players…",
}: ActionBarProps<Move>) {
  const barMoves = legalMoves.filter((m) => (m.where ?? "bar") === "bar");
  let content;
  if (proposed && (proposed.where ?? "bar") === "bar") {
    content = (
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          className={`${big} bg-slate-700 text-white`}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSubmit(proposed.move)}
          className={`${big} flex-1 bg-amber-400 text-slate-900`}
        >
          Confirm: {proposed.label}
        </button>
      </div>
    );
  } else if (legalMoves.length === 1 && barMoves.length === 1) {
    const only = barMoves[0] as LegalMove<Move>;
    content = (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSubmit(only.move)}
        className={`${big} w-full bg-amber-400 text-slate-900`}
      >
        {only.label}
      </button>
    );
  } else if (barMoves.length > 0) {
    content = (
      <div className="grid grid-cols-2 gap-2">
        {barMoves.map((m, i) => (
          <button
            type="button"
            key={i}
            disabled={disabled}
            onClick={() => onPropose(m)}
            className={`${big} bg-slate-700 text-white ${
              barMoves.length % 2 === 1 && i === barMoves.length - 1 ? "col-span-2" : ""
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    );
  } else if (legalMoves.length > 0) {
    return null; // the choice is made on the board; don't take up space
  } else {
    content = <p className="py-3 text-center text-slate-400">{idleText}</p>;
  }
  return (
    <div className="border-t border-slate-700 bg-slate-900 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {content}
    </div>
  );
}
