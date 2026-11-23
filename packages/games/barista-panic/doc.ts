import type { Viewer } from "@utopia/shared";
import { COUNTER, SHORT, SIZE, UPGRADES, recipeOf, score, type Area, type View } from "./logic.js";

const cupText = (cup: readonly string[]) =>
  cup.length ? cup.map((x) => SHORT[x as keyof typeof SHORT]).join(" ") : "-";

function stationLines(area: Area, full: boolean): string[] {
  const lines = [
    `  score ${score(area)} · done ${area.done.length} · penalties ${area.penalties.length} · rush ${area.rush}${
      area.upgrades.length
        ? ` · upgrades ${area.upgrades.map((u) => UPGRADES[u].name).join(", ")}`
        : ""
    }`,
    `  cups: ${area.cups.map((c, i) => `${i + 1}[${cupText(c)}]`).join(" ")}`,
  ];
  area.tabs.forEach((tab, t) => {
    if (!full) return;
    const orders = tab.map((c) => {
      const r = recipeOf(c);
      return `${r.name}${r.specialty ? "*" : ""} (${cupText(r.needs)})`;
    });
    lines.push(`  tab ${t + 1}: ${orders.join(", ") || "-"}`);
  });
  if (!full) lines.push(`  tabs: ${area.tabs.map((t) => t.length).join(" ")}`);
  return lines;
}

/** Secret mode: the counter and stations as plain text. */
export function docView(view: View, viewer: Viewer): string[] {
  const initials = (cell: number) =>
    view.players
      .filter((p) => view.areas[p.id]!.meeples.includes(cell))
      .map((p) => p.name[0]!.toLowerCase())
      .join("");
  const lines = [
    `deck ${view.deckCount} · rush tokens ${view.rushSupply}${view.closed ? " · LAST ROUND" : ""}`,
    "counter:",
    `     ${"ABCD"
      .split("")
      .map((c) => c.padEnd(5))
      .join("")}`,
  ];
  for (let r = 0; r < SIZE; r++) {
    const row = COUNTER.slice(r * SIZE, r * SIZE + SIZE).map((ing, i) => {
      const who = initials(r * SIZE + i);
      return `${SHORT[ing]}${who ? `:${who}` : ""}`.padEnd(5);
    });
    lines.push(`  ${r + 1}  ${row.join("")}`);
  }
  if (view.held.length) lines.push(`taken: ${cupText(view.held)}`);
  for (const p of view.players) {
    lines.push(`${p.name}${p.id === viewer ? " (you)" : ""}:`);
    lines.push(...stationLines(view.areas[p.id]!, p.id === viewer));
  }
  lines.push(
    "// Co coffee, Mi milk, St steam, Ic ice, Wa water, Te tea, Ch chocolate, Ca caramel; * = specialty",
  );
  return lines;
}
