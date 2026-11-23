import type { Viewer } from "@utopia/shared";
import { TOOL_INFO, TWIST_INFO, type View, type ViewWire } from "./logic.js";

const face = (w: ViewWire) =>
  w.cut
    ? "x"
    : w.value === undefined
      ? "?"
      : w.value === "YELLOW"
        ? "Y"
        : w.value === "RED"
          ? "R"
          : `${w.value}`;

/** Secret mode: the stands as plain text. x = cut, ? = hidden, * = clue. */
export function docView(view: View, viewer: Viewer): string[] {
  const lines = [
    `${view.missionLabel.toLowerCase()} (${view.missionName}) · detonator ${view.mistakes}/${view.mistakeLimit}`,
  ];
  if (view.twist) lines.push(`twist: ${TWIST_INFO[view.twist].text}`);
  if (view.tools.length)
    lines.push(
      `tools: ${view.tools.map((t) => `${TOOL_INFO[t.kind].name}${t.used ? " (used)" : ""}`).join(", ")}`,
    );
  for (const p of view.players) {
    const you = p.id === viewer ? " (you)" : "";
    p.racks.forEach((rack, r) => {
      const stand = p.racks.length > 1 ? ` stand ${r + 1}` : "";
      lines.push(
        `${p.name}${you}${stand}: ${rack.map((w) => `${face(w)}${w.clue && !w.cut ? "*" : ""}`).join(" ")}`,
      );
    });
  }
  lines.push("// x cut, ? hidden, * clue");
  return lines;
}
