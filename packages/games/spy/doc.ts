import type { Viewer } from "@utopia/shared";
import { ROLE_INFO, type View } from "./logic.js";

/** Secret mode: the table as plain text. */
export function docView(view: View, viewer: Viewer): string[] {
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? id;
  const lines = [`phase: ${view.phase}`];
  if (view.role) lines.push(`you: ${ROLE_INFO[view.role].name}`);
  lines.push(`word: ${view.word ?? "?"}`);
  lines.push(
    `master: ${name(view.master)}${view.guesser ? ` · guesser: ${name(view.guesser)}` : ""}`,
  );
  if (view.phase === "questions")
    lines.push(`time: ${view.config.minutes} min · answers: yes / no / don't know`);
  if (view.phase === "judge" || view.phase === "accuse") {
    lines.push(`voted: ${view.voted.map(name).join(", ") || "-"}`);
  }
  if (view.judgeVotes) {
    lines.push(
      `vote 1: ${Object.entries(view.judgeVotes)
        .map(([id, yes]) => `${name(id)}=${yes ? "yes" : "no"}`)
        .join(" ")}`,
    );
  }
  if (view.accuseVotes) {
    lines.push(
      `vote 2: ${Object.entries(view.accuseVotes)
        .map(([id, t]) => `${name(id)}->${name(t)}`)
        .join(" ")}`,
    );
  }
  if (view.roles) {
    lines.push(
      `roles: ${Object.entries(view.roles)
        .map(([id, r]) => `${name(id)}=${r}`)
        .join(" ")}`,
    );
  }
  void viewer;
  return lines;
}
