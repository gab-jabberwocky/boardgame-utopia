import type { Viewer } from "@utopia/shared";
import { bustChance, handScore, type Card, type View } from "./logic.js";

const cardText = (c: Card) =>
  c.kind === "number"
    ? `${c.value}`
    : c.kind === "bonus"
      ? `+${c.value}`
      : c.kind === "double"
        ? "x2"
        : c.action;

/** Secret mode: the table as plain text. */
export function docView(view: View, viewer: Viewer): string[] {
  const lines = [
    `round ${view.round} · deck ${view.drawCount} · discards ${view.discardPile.length} · first to ${view.config.targetScore}`,
  ];
  for (const p of view.players) {
    const hand = view.hands[p.id];
    const you = p.id === viewer ? " (you)" : "";
    if (!hand) {
      lines.push(`${p.name}${you}: no cards · total ${view.totals[p.id] ?? 0}`);
      continue;
    }
    const nums = hand.numbers.map(cardText).join(" ") || "-";
    const extras = [...hand.extras, ...(hand.lifeRing ? [hand.lifeRing] : [])]
      .map(cardText)
      .join(" ");
    const bust = hand.bustCard ? ` dup:${cardText(hand.bustCard)}` : "";
    lines.push(
      `${p.name}${you} [${hand.standing}] ${nums}${extras ? ` | ${extras}` : ""}${bust} = ${handScore(hand)} · total ${view.totals[p.id] ?? 0}`,
    );
  }
  const mine = viewer !== "spectator" ? view.hands[viewer] : undefined;
  if (mine?.standing === "active") {
    lines.push(`risk of a duplicate: ${Math.round(bustChance(view, viewer) * 100)}%`);
  }
  if (view.pending) lines.push(`to play: ${cardText(view.pending.card)}`);
  return lines;
}
