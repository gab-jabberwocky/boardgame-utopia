import ridgeline from "@utopia/game-ridgeline";
import type { AnyGameModule } from "@utopia/shared";
import { describe, expect, it } from "vitest";
import type { GameEntry } from "../games";
import {
  applySessionMove,
  moveCount,
  simulate,
  startSession,
  stateAfter,
  truncate,
} from "./session";

const game = { module: ridgeline as unknown as AnyGameModule, Board: () => null } as GameEntry;
const players = [
  { id: "p1", name: "Ann", color: "#f97316" },
  { id: "p2", name: "Bob", color: "#38bdf8" },
];
const newSession = (seed = "1") => startSession(game, {}, players, seed);
const activePlayer = (s: ReturnType<typeof newSession>) =>
  game.module.getStatus(stateAfter(s, moveCount(s)), "spectator").activePlayers[0]!;

describe("sandbox session", () => {
  it("applies legal moves and rejects illegal ones", () => {
    const s = newSession();
    const other = players.find((p) => p.id !== activePlayer(s))!.id;
    expect(applySessionMove(s, other, { type: "roll" })).toBe("It's not your turn.");
    const next = applySessionMove(s, activePlayer(s), { type: "roll" });
    expect(typeof next).not.toBe("string");
    expect(moveCount(next as typeof s)).toBe(1);
  });

  it("simulates a whole game to a winner", () => {
    const s = simulate(newSession());
    expect(game.module.getResult(stateAfter(s, moveCount(s)))).not.toBeNull();
    expect(s.states).toHaveLength(moveCount(s) + 1);
  });

  it("simulates the same game for the same seed", () => {
    const a = simulate(newSession("party"));
    const b = simulate(newSession("party"));
    expect(b.history.map((h) => h.move)).toEqual(a.history.map((h) => h.move));
  });

  it("keeps earlier states for replay and can play on from any point", () => {
    const s = simulate(newSession());
    const back = truncate(s, 5);
    expect(moveCount(back)).toBe(5);
    expect(stateAfter(back, 5)).toEqual(stateAfter(s, 5));
    // Simulating again from move 5 is still a complete, legal game.
    const replayed = simulate(back);
    expect(game.module.getResult(stateAfter(replayed, moveCount(replayed)))).not.toBeNull();
  });
});
