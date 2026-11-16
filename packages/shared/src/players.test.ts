import { describe, expect, it } from "vitest";
import {
  PLAYER_COLORS,
  colorTakenBy,
  firstFreeColor,
  nameTakenBy,
  validatePlayerChoice,
} from "./players.js";

const [orange, sky] = PLAYER_COLORS.map((c) => c.value);
const room = [
  { id: "a", name: "Ann", color: orange! },
  { id: "b", name: "Bob", color: sky! },
];

describe("player choices", () => {
  it("finds taken names ignoring case and spaces", () => {
    expect(nameTakenBy(room, "  ann ")?.id).toBe("a");
    expect(nameTakenBy(room, "ann", "a")).toBeUndefined(); // your own name is fine
  });

  it("finds taken colours", () => {
    expect(colorTakenBy(room, sky!)?.id).toBe("b");
    expect(colorTakenBy(room, sky!, "b")).toBeUndefined();
  });

  it("suggests the first free colour", () => {
    expect(firstFreeColor(room)).toBe(PLAYER_COLORS[2].value);
    expect(firstFreeColor([])).toBe(orange);
  });

  it("accepts a free name and colour", () => {
    expect(
      validatePlayerChoice(room, { id: "c", name: "Cat", color: PLAYER_COLORS[2].value }),
    ).toBeNull();
  });

  it("rejects empty, long, or taken names", () => {
    const color = PLAYER_COLORS[2].value;
    expect(validatePlayerChoice(room, { id: "c", name: "  ", color })).toBe("Enter a name.");
    expect(validatePlayerChoice(room, { id: "c", name: "x".repeat(17), color })).toMatch(/at most/);
    expect(validatePlayerChoice(room, { id: "c", name: "BOB", color })).toBe(
      "“Bob” is already taken.",
    );
  });

  it("rejects taken or unknown colours", () => {
    expect(validatePlayerChoice(room, { id: "c", name: "Cat", color: sky! })).toBe(
      "Bob already has that colour.",
    );
    expect(validatePlayerChoice(room, { id: "c", name: "Cat", color: "#123456" })).toMatch(
      /Pick one/,
    );
  });
});
