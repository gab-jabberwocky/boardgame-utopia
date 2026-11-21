import type { Viewer } from "@utopia/shared";
import { handsToEmpty, itemName, orderSize, starsPerPlayer, type View } from "./logic.js";

/** Secret mode: the table as plain text. */
export function docView(view: View, viewer: Viewer): string[] {
  const n = view.players.length;
  const lines = [
    `level ${view.level}/${view.config.levels} · ${orderSize(view)} items · clear when ${handsToEmpty(n)} hands are empty`,
  ];
  if (view.order) lines.push(`order: ${view.order.map((c) => itemName(c.item)).join(", ")}`);
  if (viewer !== "spectator" && view.phase === "play") {
    lines.push(`your hand: ${view.hand.map((c) => itemName(c.item)).join(", ") || "(empty)"}`);
  }
  const stars = (id: string) => {
    const left = view.stars[id] ?? 0;
    return left === 0 ? "out" : `${left}/${starsPerPlayer(n)} star`;
  };
  for (const p of view.players) {
    if (p.id === viewer) continue;
    const k = view.handCounts[p.id] ?? 0;
    lines.push(`${p.name}: ${k} card${k === 1 ? "" : "s"} · ${stars(p.id)}`);
  }
  const pool = new Map<number, number>();
  for (const s of view.served) pool.set(s.card.item, (pool.get(s.card.item) ?? 0) + 1);
  lines.push(
    `pool: ${[...pool].map(([item, k]) => (k > 1 ? `${itemName(item)} x${k}` : itemName(item))).join(", ") || "-"}`,
  );
  return lines;
}
