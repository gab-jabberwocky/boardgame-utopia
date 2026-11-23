/**
 * Moves arrive from the network as untrusted JSON. Call this first in `validateMove`,
 * before reading `move.type` or any other field.
 */
export function isMove(move: unknown): move is { type: string } {
  return (
    typeof move === "object" &&
    move !== null &&
    !Array.isArray(move) &&
    typeof (move as { type?: unknown }).type === "string"
  );
}
