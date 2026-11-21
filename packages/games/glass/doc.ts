import type { Viewer } from "@utopia/shared";
import { LETTER, SIZE, floorPenalty, wallColor, type View } from "./logic.js";

/**
 * Secret mode: the table as plain text. Letters: A amber, C cobalt, R ruby, J jade,
 * O onyx. On walls, capitals are set tiles and lower case the empty square's colour.
 */
export function docView(view: View, viewer: Viewer): string[] {
  const lines = [`round ${view.round} · bag ${view.bagCount} · lid ${view.lidCount}`];
  view.factories.forEach((f, i) => {
    lines.push(`F${i + 1}: ${f.map((c) => LETTER[c]).join(" ") || "-"}`);
  });
  const counts = new Map<string, number>();
  for (const c of view.centre) counts.set(LETTER[c], (counts.get(LETTER[c]) ?? 0) + 1);
  lines.push(
    `centre: ${[...counts].map(([l, n]) => `${n}${l}`).join(" ") || "-"}${view.markerInCentre ? " +marker" : ""}`,
  );
  const order = [...view.players].sort((a, b) => (a.id === viewer ? -1 : b.id === viewer ? 1 : 0));
  for (const p of order) {
    const b = view.boards[p.id];
    if (!b) continue;
    lines.push("", `${p.name}${p.id === viewer ? " (you)" : ""}: ${b.score} pts`);
    for (let r = 0; r < SIZE; r++) {
      const l = b.lines[r]!;
      const slots = Array.from({ length: r + 1 }, (_, i) =>
        i < l.count && l.color ? LETTER[l.color] : "_",
      ).join("");
      const wall = Array.from({ length: SIZE }, (_, c) => {
        const ch = LETTER[wallColor(r, c)];
        return b.wall[r * SIZE + c] ? ch : ch.toLowerCase();
      }).join(" ");
      lines.push(`  ${r + 1} ${slots.padStart(SIZE)} | ${wall}`);
    }
    const floor = b.floor.map((t) => (t === "marker" ? "1" : LETTER[t])).join(" ");
    lines.push(`  floor: ${floor || "-"}${b.floor.length ? ` (${floorPenalty(b.floor)})` : ""}`);
  }
  lines.push("// wall: capitals set, lower case empty · floor 1 = first-player marker");
  return lines;
}
