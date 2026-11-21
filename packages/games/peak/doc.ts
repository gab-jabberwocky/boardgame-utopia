import type { Viewer } from "@utopia/shared";
import { TRAILS, trailLength, type State } from "./logic.js";

/** Secret mode: the trails as plain text, one per line. */
export function docView(view: State, viewer: Viewer): string[] {
  const name = (id: string) =>
    id === viewer ? "you" : (view.players.find((p) => p.id === id)?.name ?? id);
  const lines = [`dice: ${view.dice.join(" ") || "-"} · ${view.phase}`];
  for (const trail of TRAILS) {
    const parts: string[] = [];
    const peak = view.peaks[trail];
    if (peak) parts.push(`peak: ${name(peak)}`);
    for (const p of view.players) {
      const step = view.camps[p.id]?.[trail] ?? 0;
      if (step > 0 && !peak) parts.push(`${name(p.id)}@${step}`);
    }
    const climber = view.climbers[trail] ?? 0;
    if (climber > 0) parts.push(`climber@${climber}`);
    lines.push(
      `${String(trail).padStart(2)} /${String(trailLength(trail)).padStart(2)}: ${parts.join("  ") || "-"}`,
    );
  }
  return lines;
}
