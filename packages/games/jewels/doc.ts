import type { Viewer } from "@utopia/shared";
import {
  COLORS,
  LETTER,
  TOKEN_KINDS,
  bonuses,
  costText,
  patronText,
  points,
  tokenCount,
  type Card,
  type Level,
  type View,
} from "./logic.js";

const cardText = (c: Card) =>
  `${LETTER[c.color]}${c.points ? ` ${c.points}p` : ""} · cost ${costText(c.cost)}`;

/** Secret mode: the table as plain text. W B G R K gems, O gold. */
export function docView(view: View, viewer: Viewer): string[] {
  const lines = [
    `supply: ${TOKEN_KINDS.map((t) => `${LETTER[t]}${view.supply[t]}`).join(" ")}`,
    `patrons (3p): ${view.patrons.map(patronText).join(" | ") || "-"}`,
    `decks: L1 ${view.deckCounts[1]} · L2 ${view.deckCounts[2]} · L3 ${view.deckCounts[3]}`,
    "cards:",
  ];
  for (const level of [3, 2, 1] as Level[]) {
    view.market[level].forEach((c, i) =>
      lines.push(`  L${level}.${i + 1} ${c ? cardText(c) : "-"}`),
    );
  }
  for (const p of view.players) {
    const seat = view.seats[p.id];
    if (!seat) continue;
    const b = bonuses(seat);
    const bonus =
      COLORS.filter((c) => b[c])
        .map((c) => `${LETTER[c]}${b[c]}`)
        .join(" ") || "-";
    const tokens =
      TOKEN_KINDS.filter((t) => seat.tokens[t])
        .map((t) => `${LETTER[t]}${seat.tokens[t]}`)
        .join(" ") || "-";
    lines.push(
      `${p.name}${p.id === viewer ? " (you)" : ""}: ${points(seat)}p · tokens ${tokens} (${tokenCount(seat)}/10) · bonus ${bonus}${
        seat.patrons.length ? ` · patrons ${seat.patrons.length}` : ""
      }`,
    );
    if (seat.reserved) seat.reserved.forEach((c, i) => lines.push(`  R${i + 1} ${cardText(c)}`));
    else if (seat.reservedLevels.length) {
      lines.push(`  reserved: ${seat.reservedLevels.map((l) => `L${l}`).join(" ")}`);
    }
  }
  if (view.finalRound) lines.push("last round");
  return lines;
}
