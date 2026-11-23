import { GAME_MODULES } from "@utopia/catalog";
import { describe, expect, it } from "vitest";
import { GAMES } from "./games";

describe("game lists", () => {
  it("the client has a Board for exactly the games the server offers, in the same order", () => {
    expect(GAMES.map((g) => g.module.id)).toEqual(GAME_MODULES.map((m) => m.id));
  });
});
