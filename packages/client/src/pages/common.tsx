import type { ReactNode } from "react";
import { z } from "zod";
import { GAMES, type GameEntry } from "../games";
import { SecretToggle } from "../SecretToggle";

export const findGame = (id: string) => GAMES.find((g) => g.module.id === id);

export const button = {
  primary:
    "min-h-12 rounded-xl bg-amber-400 px-5 font-bold text-slate-900 disabled:cursor-not-allowed disabled:opacity-40",
  secondary:
    "min-h-11 rounded-xl bg-slate-700 px-4 font-semibold text-white hover:bg-slate-600 disabled:opacity-40",
  quiet: "min-h-10 rounded-lg px-3 text-sm text-slate-400 hover:text-white",
};

/** The phone-width column every page outside a game uses. */
export function Page({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 bg-slate-950 px-4 py-5 text-white">
      <SecretToggle className="self-end" />
      {children}
    </main>
  );
}

export function players(entry: GameEntry) {
  const { minPlayers: lo, maxPlayers: hi } = entry.module;
  return lo === hi ? `${lo} players` : `${lo}–${hi} players`;
}

/** Pick one game from the library. */
export function GamePicker({ value, onChange }: { value: string; onChange(id: string): void }) {
  return (
    <ul className="grid gap-2" role="radiogroup" aria-label="Game">
      {GAMES.map((g) => {
        const selected = g.module.id === value;
        return (
          <li key={g.module.id}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(g.module.id)}
              className={`w-full rounded-xl border-2 p-3 text-left transition ${
                selected
                  ? "border-amber-400 bg-amber-400/10"
                  : "border-slate-800 bg-slate-900 hover:border-slate-600"
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-bold">{g.module.name}</span>
                <span className="shrink-0 text-xs text-slate-400">👥 {players(g)}</span>
              </span>
              <span className="mt-0.5 block text-sm text-slate-400">{g.module.description}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** "Points to win: 200 · Mode: Spicy", using the titles from the settings schema. */
export function settingsSummary(entry: GameEntry, config: Record<string, unknown>): string[] {
  const schema = entry.module.configSchema as z.ZodType;
  if (!(schema instanceof z.ZodObject)) return [];
  return Object.entries(schema.shape as Record<string, z.ZodType>).map(([key, field]) => {
    const meta = (field.meta() ?? {}) as { title?: string };
    const value = config[key];
    const shown = typeof value === "boolean" ? (value ? "On" : "Off") : String(value);
    return `${meta.title ?? key}: ${shown}`;
  });
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-950/70 px-3 py-2 text-sm text-red-200">
      {error}
    </p>
  );
}
