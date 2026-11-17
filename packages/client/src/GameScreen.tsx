import { useEffect, useState } from "react";
import {
  ActionBar,
  EventFlash,
  GameOver,
  LastAction,
  PlayerList,
  TurnBanner,
} from "@utopia/kit/ui";
import type { LegalMove, PlayerInfo, Snapshot, Viewer } from "@utopia/shared";
import type { GameEntry } from "./games";

export interface GameScreenProps {
  game: GameEntry;
  snapshot: Snapshot;
  players: PlayerInfo[];
  viewer: Viewer;
  /** Number of moves applied so far. Changes with every move (and goes down on undo). */
  version: number;
  onMove(move: unknown): void;
  /** Host only. */
  onBackToLobby?: () => void;
  /** Show results instantly, without dice animations (for stepping through a replay). */
  skipReveal?: boolean;
  /** Bottom bar text when the viewer has nothing to do. */
  idleText?: string;
}

/**
 * The screen every game is played on: status banner, players, last action,
 * the game's Board, the confirm-before-send action bar, big-event flashes and
 * the game over overlay. Results of moves with `revealAfterMs` (dice rolls) are
 * held back until the animation finishes.
 */
export function GameScreen({
  game,
  snapshot,
  players,
  viewer,
  version,
  onMove,
  onBackToLobby,
  skipReveal = false,
  idleText,
}: GameScreenProps) {
  const [proposal, setProposal] = useState<{ version: number; move: LegalMove<unknown> } | null>(
    null,
  );
  const [mountedAt] = useState(version);
  const [revealedVersion, setRevealedVersion] = useState(version);
  if (version < revealedVersion) setRevealedVersion(version); // after an undo

  const latest = snapshot.recentActions[0];
  const delay = latest?.revealAfterMs ?? 0;
  const revealing = !skipReveal && delay > 0 && version > revealedVersion;

  useEffect(() => {
    if (!revealing) return;
    const timer = setTimeout(() => setRevealedVersion(version), delay);
    return () => clearTimeout(timer);
  }, [revealing, version, delay]);

  const proposed = proposal?.version === version ? proposal.move : null;
  const decor = game.playerDecor?.(snapshot.view);
  const { Board } = game;
  const status = revealing
    ? { text: latest?.pendingText ?? "…", activePlayers: [] }
    : snapshot.status;

  const submit = (move: unknown) => {
    setProposal(null);
    onMove(move);
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-slate-950 text-white">
      <TurnBanner status={status} viewer={viewer} />
      <PlayerList
        players={players}
        activePlayers={status.activePlayers}
        viewer={viewer}
        scores={decor?.scores}
      />
      <LastAction
        actions={snapshot.recentActions}
        pendingText={revealing ? latest?.pendingText : undefined}
      />
      <div className="@container flex-1 overflow-y-auto">
        <Board
          view={snapshot.view}
          viewer={viewer}
          players={players}
          highlight={latest?.highlight ?? []}
          legalMoves={snapshot.legalMoves}
          proposed={proposed?.move ?? null}
          propose={(move, label) => setProposal({ version, move: { move, label, where: "board" } })}
          cancel={() => setProposal(null)}
          submit={submit}
          revealing={revealing}
        />
      </div>
      <ActionBar
        // Button labels can give away a result that is still held back (e.g. a card being
        // flipped), so bar moves wait for the reveal. Board-only games are unaffected.
        legalMoves={
          revealing ? snapshot.legalMoves.filter((m) => m.where === "board") : snapshot.legalMoves
        }
        proposed={proposed}
        onPropose={(move) => setProposal({ version, move })}
        onCancel={() => setProposal(null)}
        onSubmit={submit}
        disabled={revealing}
        idleText={
          revealing
            ? latest?.pendingText
            : (idleText ?? (snapshot.result ? "Game over" : undefined))
        }
      />
      {!revealing && latest?.flash && version > mountedAt && (
        <EventFlash key={`flash-${version}`} text={latest.flash} tone={latest.tone} />
      )}
      {snapshot.result && !revealing && (
        <GameOver
          key={`over-${version}`}
          result={snapshot.result}
          players={players}
          onBackToLobby={onBackToLobby}
        />
      )}
    </div>
  );
}
