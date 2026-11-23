import type { Viewer } from "@utopia/shared";
import { shown, type View } from "./logic.js";

/** Secret mode: the table as plain text. */
export function docView(view: View, viewer: Viewer): string[] {
  const goal = view.config.mode === "Spicy" ? "2 connected trios" : "3 trios";
  const lines = [`win: ${goal} or the 7 trio`];
  const rev = view.revealed.map((r) => String(r.value));
  lines.push(
    `this turn: ${[...rev, ...Array(Math.max(0, 3 - rev.length)).fill("_")].join(" ")}${view.phase === "mismatch" ? "  (no match)" : ""}`,
  );
  lines.push(
    `middle: ${view.middle.map((m, i) => `${i + 1}:${m === "down" ? "#" : m === "gone" ? "-" : m}`).join(" ")}`,
  );
  if (viewer !== "spectator") {
    const { low, high } = shown(view, viewer);
    const hand = view.hand.map((v, i) =>
      i < low || i >= view.hand.length - high ? `(${v})` : `${v}`,
    );
    lines.push(
      `your hand: ${hand.join(" ") || "-"} · trios ${(view.trios[viewer] ?? []).join(",") || "-"}`,
    );
  }
  for (const p of view.players) {
    if (p.id === viewer) continue;
    const { low, high } = shown(view, p.id);
    const showing = view.revealed
      .filter((r) => r.from === "hand" && r.player === p.id)
      .map((r) => r.value)
      .join(",");
    lines.push(
      `${p.name}: ${view.handCounts[p.id] ?? 0} cards${low + high ? ` (showing ${showing})` : ""} · trios ${(view.trios[p.id] ?? []).join(",") || "-"}`,
    );
  }
  return lines;
}
