import { createRng } from "@utopia/kit";
import type { AnyGameModule, PlayerInfo, Rng } from "@utopia/shared";
import { describe, expect, it } from "vitest";
import { GAME_MODULES } from "./index";

/*
 * Moves arrive from the network as untrusted JSON. Every game must answer any payload
 * with an error message instead of throwing, and whatever it accepts must apply cleanly.
 */

const GARBAGE: unknown[] = [null, undefined, 0, 42, "", "roll", true, [], [1, 2], {}, { type: 42 }];
const BAD_VALUES: unknown[] = [undefined, null, -1, 1.5, 999, "x", "0", true, {}, [], [999]];

/** Broken copies of a real move: each field removed or replaced with a wrong value. */
function mutations(move: unknown): unknown[] {
  if (!move || typeof move !== "object") return [];
  const out: unknown[] = [{ ...move, type: "no-such-move" }];
  for (const key of Object.keys(move)) {
    if (key === "type") continue;
    for (const bad of BAD_VALUES) out.push({ ...move, [key]: bad });
  }
  return out;
}

function players(n: number): PlayerInfo[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, color: "" }));
}

/** States from a few seeded random games, sampled along the way. */
function sampleStates(module: AnyGameModule, n: number, seed: number) {
  const rng: Rng = createRng(`robust:${module.id}:${n}:${seed}`);
  const config = module.configSchema.parse({});
  const seats = players(n);
  let state = module.setup({ players: seats, rng }, config);
  const states = [state];
  for (let step = 0; step < 200 && !module.getResult(state); step++) {
    const options = seats.flatMap((p) =>
      (module.getLegalMoves?.(state, p.id) ?? []).map((m) => ({ player: p.id, move: m.move })),
    );
    if (options.length === 0) break;
    const { player, move } = rng.pick(options);
    state = module.applyMove(state, player, move, { rng });
    if (step % 7 === 0) states.push(state);
  }
  states.push(state);
  return { states, seats, rng };
}

describe.each(GAME_MODULES.map((m) => [m.id, m] as const))(
  "%s with untrusted moves",
  (_, module) => {
    for (const n of new Set([module.minPlayers, module.maxPlayers])) {
      it(`never throws and never accepts junk (${n} players)`, () => {
        for (let seed = 0; seed < 3; seed++) {
          const { states, seats, rng } = sampleStates(module, n, seed);
          for (const state of states) {
            const legal = seats.flatMap((p) =>
              (module.getLegalMoves?.(state, p.id) ?? []).map((m) => m.move),
            );
            for (const p of seats) {
              for (const junk of GARBAGE) {
                expect(module.validateMove(state, p.id, junk), JSON.stringify(junk)).toBeTypeOf(
                  "string",
                );
              }
              for (const move of legal.flatMap(mutations)) {
                const label = `${p.id} ${JSON.stringify(move)}`;
                let error: string | null = "";
                expect(() => (error = module.validateMove(state, p.id, move)), label).not.toThrow();
                if (error === null) {
                  expect(
                    () => module.applyMove(state, p.id, move, { rng: createRng(rng.getState()) }),
                    label,
                  ).not.toThrow();
                }
              }
            }
          }
        }
      });
    }
  },
);
