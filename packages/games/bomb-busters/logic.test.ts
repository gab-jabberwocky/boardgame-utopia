import { createRng } from "@utopia/kit";
import { describe, expect, it } from "vitest";
import { configSchema } from "./config.js";
import { applyMove, getPlayerView, setup, validateMove, type State } from "./logic.js";

const players = [
  { id: "a", name: "A", color: "#f97316" },
  { id: "b", name: "B", color: "#38bdf8" },
  { id: "c", name: "C", color: "#a3e635" },
];
const fresh = (mission: "1" | "2" | "3" | "4" | "6" | "8" = "1") =>
  setup({ players, rng: createRng(11) }, configSchema.parse({ mission }));
const startPlay = (state: State): State => ({
  ...state,
  phase: "play",
  setupIndex: players.length,
  active: "a",
});

describe("Bomb Busters module", () => {
  it("deals reproducibly with the platform seeded RNG and hides other hands", () => {
    const a = fresh("8");
    const b = fresh("8");
    expect(a.players).toEqual(b.players);
    const own = a.players[0]!.racks.flat()[0]!;
    const hidden = a.players[1]!.racks.flat().find((wire) => !wire.cut)!;
    const view = getPlayerView(a, "a");
    expect(view.players[0]!.racks.flat().find((wire) => wire.id === own.id)?.value).toBe(own.value);
    const remote = view.players[1]!.racks.flat().find((wire) => wire.id === hidden.id)!;
    expect(remote.value).toBeUndefined();
    expect(remote.sort).toBeUndefined();
  });

  it("requires starting clues in seat order", () => {
    const state = fresh();
    const wire = state.players[0]!.racks[0]![0]!;
    expect(validateMove(state, "b", { type: "clue", wireId: wire.id })).toContain("seat order");
    expect(validateMove(state, "a", { type: "clue", wireId: wire.id })).toBeNull();
    const after = applyMove(state, "a", { type: "clue", wireId: wire.id }, { rng: createRng(1) });
    expect(after.players[0]!.racks[0]![0]!.clue).toBe(true);
    expect(after.active).toBe("b");
  });

  it("resolves a matching call only after the caller chooses their own wire", () => {
    const state = startPlay(fresh());
    const caller = state.players[0]!.racks[0]!;
    const teammate = state.players[1]!.racks[0]!;
    caller[0]!.value = 3;
    teammate[0]!.value = 3;
    const move = { type: "call" as const, wireId: teammate[0]!.id, value: 3 };
    expect(validateMove(state, "a", move)).toBeNull();
    const matched = applyMove(state, "a", move, { rng: createRng(2) });
    expect(matched.phase).toBe("own");
    expect(matched.players[1]!.racks[0]![0]!.cut).toBe(true);
    const ownCut = applyMove(
      matched,
      "a",
      { type: "cutOwn", wireId: caller[0]!.id },
      { rng: createRng(3) },
    );
    expect(ownCut.players[0]!.racks[0]![0]!.cut).toBe(true);
    expect(ownCut.phase).toBe("play");
  });

  it("turns a wrong non-red call into a public clue and advances the detonator", () => {
    const state = startPlay(fresh());
    const caller = state.players[0]!.racks[0]!;
    const target = state.players[1]!.racks[0]![0]!;
    caller[0]!.value = 1;
    target.value = 2;
    const after = applyMove(
      state,
      "a",
      { type: "call", wireId: target.id, value: 1 },
      { rng: createRng(4) },
    );
    expect(after.mistakes).toBe(1);
    expect(after.players[1]!.racks[0]![0]!.clue).toBe(true);
    expect(after.phase).toBe("play");
    expect(after.active).toBe("b");
  });
});
