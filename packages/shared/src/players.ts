import type { PlayerId, PlayerInfo } from "./contract.js";

/** Colours players can pick. Enough for 10 players, readable on a dark board. */
export const PLAYER_COLORS = [
  { name: "Orange", value: "#f97316" },
  { name: "Sky", value: "#38bdf8" },
  { name: "Lime", value: "#a3e635" },
  { name: "Pink", value: "#f472b6" },
  { name: "Yellow", value: "#facc15" },
  { name: "Red", value: "#ef4444" },
  { name: "Teal", value: "#2dd4bf" },
  { name: "Violet", value: "#a78bfa" },
  { name: "Brown", value: "#b45309" },
  { name: "White", value: "#e2e8f0" },
] as const;

export const MAX_NAME_LENGTH = 16;

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** The player (other than `exceptId`) already using this name, ignoring case and spaces. */
export function nameTakenBy(
  players: readonly PlayerInfo[],
  name: string,
  exceptId?: PlayerId,
): PlayerInfo | undefined {
  return players.find((p) => p.id !== exceptId && sameName(p.name, name));
}

/** The player (other than `exceptId`) already using this colour. */
export function colorTakenBy(
  players: readonly PlayerInfo[],
  color: string,
  exceptId?: PlayerId,
): PlayerInfo | undefined {
  return players.find((p) => p.id !== exceptId && p.color.toLowerCase() === color.toLowerCase());
}

/** First palette colour nobody uses yet. */
export function firstFreeColor(players: readonly PlayerInfo[]): string {
  const free = PLAYER_COLORS.find((c) => !colorTakenBy(players, c.value));
  return (free ?? PLAYER_COLORS[0]).value;
}

/**
 * Check a player's chosen name and colour against everyone else in the room.
 * Returns an error message, or null if the choice is fine.
 */
export function validatePlayerChoice(
  players: readonly PlayerInfo[],
  choice: PlayerInfo,
): string | null {
  const name = choice.name.trim();
  if (!name) return "Enter a name.";
  if (name.length > MAX_NAME_LENGTH) return `Names can be at most ${MAX_NAME_LENGTH} characters.`;
  const nameOwner = nameTakenBy(players, name, choice.id);
  if (nameOwner) return `“${nameOwner.name}” is already taken.`;
  if (!PLAYER_COLORS.some((c) => c.value === choice.color)) return "Pick one of the colours.";
  const colorOwner = colorTakenBy(players, choice.color, choice.id);
  if (colorOwner) return `${colorOwner.name} already has that colour.`;
  return null;
}
