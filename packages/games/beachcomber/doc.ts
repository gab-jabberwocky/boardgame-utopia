import type { Viewer } from "@utopia/shared";
import { KIND_INFO, cardScore, colourBonus, targetScore, type Card, type View } from "./logic.js";

const short = (c: Card) => `${KIND_INFO[c.kind].name}/${c.colour}`;

/** Secret mode: the table as plain text. */
export function docView(view: View, viewer: Viewer): string[] {
  const name = (id: string) =>
    id === viewer ? "you" : (view.players.find((p) => p.id === id)?.name ?? id);
  const lines = [
    `round ${view.round} · first to ${targetScore(view.players.length, view.config)} · deck ${view.deckCount}`,
    `piles: left ${view.pileTops[0] ? short(view.pileTops[0]) : "-"} (${view.pileCounts[0]}) · right ${
      view.pileTops[1] ? short(view.pileTops[1]) : "-"
    } (${view.pileCounts[1]})`,
  ];
  if (view.lastChance) {
    lines.push(
      `last chance by ${name(view.lastChance.caller)} · safe: ${view.lastChance.safe.map(name).join(", ") || "-"}`,
    );
  }
  if (view.drawn.length) lines.push(`drawn: ${view.drawn.map(short).join(", ")}`);
  if (view.pilesOpen) {
    lines.push(`left pile: ${view.pilesOpen[0].map(short).join(", ") || "-"}`);
    lines.push(`right pile: ${view.pilesOpen[1].map(short).join(", ") || "-"}`);
  }
  if (viewer !== "spectator") {
    const played = view.played[viewer] ?? [];
    const score = cardScore(view.hand, played);
    lines.push(`your hand: ${view.hand.map(short).join(", ") || "-"}`);
    lines.push(
      `your points: ${score.total} (pairs ${score.duos}, sets ${score.collectors}, bonus cards ${score.multipliers}, pearls ${score.pearls}) · colour bonus ${colourBonus([...view.hand, ...played.flat()])}`,
    );
  }
  for (const p of view.players) {
    const pairs = (view.played[p.id] ?? []).map((pair) =>
      pair.map((c) => KIND_INFO[c.kind].name).join("+"),
    );
    const shown = view.shownHands[p.id];
    lines.push(
      `${name(p.id)}: total ${view.totals[p.id] ?? 0} · ${view.handCounts[p.id] ?? 0} in hand${
        pairs.length ? ` · played ${pairs.join(", ")}` : ""
      }${shown && p.id !== viewer ? ` · hand ${shown.map(short).join(", ") || "-"}` : ""}`,
    );
  }
  if (view.lastRound) {
    lines.push(
      `last round: ${view.players.map((p) => `${name(p.id)} +${view.lastRound?.[p.id] ?? 0}`).join(", ")}`,
    );
  }
  return lines;
}
