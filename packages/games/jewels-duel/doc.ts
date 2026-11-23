import type { Viewer } from "@utopia/shared";
import {
  COLORS,
  SIZE,
  colorPoints,
  crowns,
  points,
  royalName,
  type Card,
  type Level,
  type TokenKind,
  type View,
} from "./logic.js";

const LETTER: Record<TokenKind, string> = {
  white: "W",
  blue: "B",
  green: "G",
  red: "R",
  black: "K",
  pearl: "P",
  gold: "O",
};
const ABILITY = { again: "again", token: "+token", privilege: "+priv", steal: "steal" } as const;

function cardText(c: Card): string {
  const color = c.color === "wild" ? "wild" : LETTER[c.color];
  const cost = (Object.entries(c.cost) as [TokenKind, number][])
    .filter(([, k]) => k > 0)
    .map(([t, k]) => `${k}${LETTER[t]}`)
    .join(" ");
  const extras = [
    c.bonus === 2 ? "x2" : "",
    c.points ? `${c.points}p` : "",
    c.crowns ? `${c.crowns}c` : "",
    c.ability ? ABILITY[c.ability] : "",
  ].filter(Boolean);
  return `${color} ${extras.join(" ")}${extras.length ? " " : ""}· cost ${cost || "0"}`;
}

/** Secret mode: the table as plain text. Letters: W B G R K gems, P pearl, O gold. */
export function docView(view: View, viewer: Viewer): string[] {
  const lines = ["board:", `   ${"ABCDE".split("").join(" ")}`];
  for (let r = 0; r < SIZE; r++) {
    const row = view.board.slice(r * SIZE, r * SIZE + SIZE).map((t) => (t ? LETTER[t] : "."));
    lines.push(` ${r + 1} ${row.join(" ")}`);
  }
  lines.push(
    `bag ${view.bag.length} · privileges left ${view.privilegeSupply} · decks L1 ${view.deckCounts[1]} L2 ${view.deckCounts[2]} L3 ${view.deckCounts[3]}`,
    `royals: ${view.royals.map(royalName).join(" | ") || "-"}`,
    "cards:",
  );
  for (const level of [3, 2, 1] as Level[]) {
    view.pyramid[level].forEach((c, i) =>
      lines.push(`  L${level}.${i + 1} ${c ? cardText(c) : "-"}`),
    );
  }
  for (const p of view.players) {
    const seat = view.seats[p.id];
    if (!seat) continue;
    const cp = colorPoints(seat);
    const bonus = COLORS.map((c) => {
      const k = seat.cards.filter((o) => o.color === c).reduce((n, o) => n + o.card.bonus, 0);
      return k ? `${LETTER[c]}${k}(${cp[c]}p)` : "";
    })
      .filter(Boolean)
      .join(" ");
    const tokens = (Object.entries(seat.tokens) as [TokenKind, number][])
      .filter(([, k]) => k > 0)
      .map(([t, k]) => `${LETTER[t]}${k}`)
      .join(" ");
    lines.push(
      `${p.name}${p.id === viewer ? " (you)" : ""}: ${points(seat)}p ${crowns(seat)}c · priv ${seat.privileges} · tokens ${tokens || "-"} · bonus ${bonus || "-"}${
        seat.royals.length ? ` · royals ${seat.royals.length}` : ""
      }`,
    );
    if (seat.reserved) seat.reserved.forEach((c) => lines.push(`  reserved: ${cardText(c)}`));
    else if (seat.reservedLevels.length)
      lines.push(`  reserved: ${seat.reservedLevels.map((l) => `L${l}`).join(" ")}`);
  }
  if (view.pending) lines.push(`waiting on: ${view.pending.type}`);
  return lines;
}
