import type { GameStatus, Viewer } from "@utopia/shared";

export interface TurnBannerProps {
  status: GameStatus;
  viewer: Viewer;
}

/** Top banner saying what is happening. Accented when the viewer needs to act. */
export function TurnBanner({ status, viewer }: TurnBannerProps) {
  const yourTurn = viewer !== "spectator" && status.activePlayers.includes(viewer);
  return (
    <div
      role="status"
      aria-live="polite"
      className={`px-4 py-3 text-center text-base font-semibold ${
        yourTurn ? "bg-amber-400 text-slate-900" : "bg-slate-800 text-slate-100"
      }`}
    >
      {status.text}
    </div>
  );
}
