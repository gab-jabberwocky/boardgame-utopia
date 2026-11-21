import type { Viewer } from "@utopia/shared";
import { VALUES, label, rankOf, type View } from "./logic.js";

/** Secret mode: the table as plain text. */
export function docView(view: View, viewer: Viewer): string[] {
  const name = (id: string) =>
    id === viewer ? "you" : (view.players.find((p) => p.id === id)?.name ?? id);
  const order = [...VALUES]
    .sort((a, b) => rankOf(view, a) - rankOf(view, b))
    .map(label)
    .join("<");
  const lines = [`order: ${order}${view.revolution ? "  (revolution)" : ""}`];
  if (view.trick.length) {
    lines.push(
      `trick: ${view.trick.map((p) => `${name(p.player)} ${p.cards.length}x${label(p.value)}`).join(" -> ")}`,
    );
    const top = view.trick[view.trick.length - 1]!;
    lines.push(
      `top: ${top.cards.map((c) => `${label(c.card.digit)}${c.flipped ? "~" : ""}${c.added.length ? `+${c.added.length}` : ""}`).join(" ")} as ${label(top.value)}`,
    );
    if (view.passed.length) lines.push(`passed: ${view.passed.map(name).join(", ")}`);
  } else {
    lines.push("trick: (empty, new lead)");
  }
  if (viewer !== "spectator" && !view.finished.includes(viewer)) {
    lines.push(
      `your hand: ${view.hand.map((c) => label(c.digit)).join(" ") || "-"} · sticks ${view.sticks[viewer] ?? 0}`,
    );
  }
  for (const p of view.players) {
    if (p.id === viewer) continue;
    const place = view.finished.indexOf(p.id);
    lines.push(
      place >= 0
        ? `${p.name}: out, #${place + 1}`
        : `${p.name}: ${view.handCounts[p.id] ?? 0} cards · ${view.sticks[p.id] ?? 0} stick${view.sticks[p.id] === 1 ? "" : "s"}`,
    );
  }
  lines.push("// ~ upside down, +n matchsticks added");
  return lines;
}
