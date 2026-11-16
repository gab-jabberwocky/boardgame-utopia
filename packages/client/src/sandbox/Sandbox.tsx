import { useEffect, useMemo, useRef, useState } from "react";
import { PlayerChoice, SettingsForm, defaultSettings } from "@utopia/kit/ui";
import {
  buildSnapshot,
  firstFreeColor,
  validatePlayerChoice,
  type PlayerInfo,
  type Viewer,
} from "@utopia/shared";
import { GAMES } from "../games";
import { GameScreen } from "../GameScreen";
import { ZoomStage } from "../ZoomStage";
import {
  applySessionMove,
  canSimulate,
  moveCount,
  simulate,
  startSession,
  stateAfter,
  truncate,
  type Session,
} from "./session";

/*
 * Dev-only test bench (/sandbox). Runs game logic in the browser with fake players,
 * lets you act as any seat, see the full state, undo, replay a seed, simulate a
 * whole game, and step through any game move by move (← → keys).
 */

type Seat = "follow" | "god" | string;

/** Time per move when auto-playing a replay (long enough for the dice animation). */
const AUTOPLAY_MS = 1200;

const randomSeed = () => String(Math.floor(Math.random() * 1_000_000));
const btn =
  "min-h-10 rounded-lg px-3 text-sm font-medium bg-slate-700 text-white disabled:opacity-40";
const chip = (on: boolean) =>
  `min-h-10 rounded-lg px-3 text-sm font-medium ${on ? "bg-amber-400 text-slate-900" : "bg-slate-700 text-white"}`;
const iconBtn =
  "flex h-9 min-w-9 items-center justify-center rounded-lg bg-slate-800 px-2 text-white hover:bg-slate-700 disabled:opacity-30";

/** Grow or shrink the fake player list, giving new seats a free name and colour. */
function resizePlayers(players: PlayerInfo[], count: number): PlayerInfo[] {
  const out = players.slice(0, count);
  for (let i = out.length; i < count; i++) {
    out.push({ id: `p${i + 1}`, name: `P${i + 1}`, color: firstFreeColor(out) });
  }
  return out;
}

export default function Sandbox() {
  const [gameId, setGameId] = useState(GAMES[0]?.module.id ?? "");
  const game = GAMES.find((g) => g.module.id === gameId) ?? GAMES[0];
  const [settings, setSettings] = useState<Record<string, unknown>>(() =>
    game ? defaultSettings(game.module.configSchema) : {},
  );
  const [players, setPlayers] = useState(() => resizePlayers([], game?.module.minPlayers ?? 2));
  const playerCount = players.length;
  const setPlayerCount = (n: number) => setPlayers((ps) => resizePlayers(ps, n));
  const playerProblems = players.some((p) => validatePlayerChoice(players, p) !== null);
  const [seed, setSeed] = useState("1");
  const [session, setSession] = useState<Session | null>(null);
  const [seat, setSeat] = useState<Seat>("follow");
  const [sideBySide, setSideBySide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  /** Which move is shown while reviewing; null = live (latest move, playable). */
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const total = session ? moveCount(session) : 0;
  const shown = cursor ?? total;
  const reviewing = cursor !== null;

  /** Move the replay cursor; reaching the latest move goes back to live play. */
  const goTo = (n: number) => {
    const next = Math.max(0, Math.min(n, total));
    setCursor(next === total ? null : next);
    if (next === total) setPlaying(false);
  };

  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (total === 0) return;
    if (!reviewing) setCursor(0); // play the whole game from the start
    setPlaying(true);
  };

  // Auto-play: step forward one move at a time until the end.
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (shown + 1 >= total) {
        setCursor(null);
        setPlaying(false);
      } else {
        setCursor(shown + 1);
      }
    }, AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [playing, shown, total]);

  // Keyboard: ← → step, Home/End jump, Space play/pause. Ignored while typing.
  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      const actions: Record<string, () => void> = {
        ArrowLeft: () => {
          setPlaying(false);
          goTo(shown - 1);
        },
        ArrowRight: () => {
          setPlaying(false);
          goTo(shown + 1);
        },
        Home: () => goTo(0),
        End: () => goTo(total),
        " ": togglePlay,
      };
      const action = actions[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!game) return <p className="p-4 text-white">No games registered.</p>;

  const pickGame = (id: string) => {
    const g = GAMES.find((x) => x.module.id === id);
    if (!g) return;
    setGameId(id);
    setSettings(defaultSettings(g.module.configSchema));
    setPlayerCount(g.module.minPlayers);
  };

  const begin = (next: Session, reviewFrom: number | null = null) => {
    setError(null);
    setSeat("follow");
    setPlaying(false);
    setSession(next);
    setCursor(reviewFrom !== null && reviewFrom < moveCount(next) ? reviewFrom : null);
  };
  const start = () => begin(startSession(game, settings, players, seed));
  const startSimulated = () => begin(simulate(startSession(game, settings, players, seed)), 0);

  if (!session) {
    return (
      <div className="min-h-dvh bg-slate-950 p-4 text-white">
        <div className="mx-auto flex max-w-md flex-col gap-5">
          <h1 className="text-2xl font-bold">Sandbox</h1>
          <fieldset>
            <legend className="mb-1 font-semibold">Game</legend>
            <div className="flex flex-wrap gap-2">
              {GAMES.map((g) => (
                <button
                  key={g.module.id}
                  type="button"
                  className={chip(g.module.id === gameId)}
                  onClick={() => pickGame(g.module.id)}
                >
                  {g.module.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-slate-400">{game.module.description}</p>
          </fieldset>
          <fieldset>
            <legend className="mb-1 font-semibold">Players</legend>
            <div className="flex flex-wrap gap-2">
              {Array.from(
                { length: game.module.maxPlayers - game.module.minPlayers + 1 },
                (_, i) => game.module.minPlayers + i,
              ).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`${chip(n === playerCount)} w-11`}
                  onClick={() => setPlayerCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-3 mb-2 text-sm text-slate-400">
              Names and colours (in the real lobby each player picks their own).
            </p>
            <div className="flex flex-col gap-4">
              {players.map((p) => (
                <PlayerChoice
                  key={p.id}
                  players={players}
                  me={p}
                  onChange={(me) => setPlayers((ps) => ps.map((x) => (x.id === me.id ? me : x)))}
                />
              ))}
            </div>
          </fieldset>
          <SettingsForm schema={game.module.configSchema} value={settings} onChange={setSettings} />
          <fieldset>
            <legend className="mb-1 font-semibold">Seed</legend>
            <p className="mb-2 text-sm text-slate-400">
              Same seed, same dice, shuffles and simulated games.
            </p>
            <div className="flex gap-2">
              <input
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className="min-h-10 flex-1 rounded-lg bg-slate-800 px-3"
              />
              <button type="button" className={btn} onClick={() => setSeed(randomSeed())}>
                Random
              </button>
            </div>
          </fieldset>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={playerProblems}
              onClick={start}
              className="min-h-14 rounded-xl bg-amber-400 text-lg font-semibold text-slate-900 disabled:opacity-40"
            >
              {playerProblems ? "Fix the player names or colours first" : "Start"}
            </button>
            {game.module.getLegalMoves && (
              <button
                type="button"
                disabled={playerProblems}
                onClick={startSimulated}
                className="min-h-12 rounded-xl bg-slate-700 font-semibold text-white disabled:opacity-40"
              >
                Simulate a whole game, then replay it
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { module } = session.game;
  const state = stateAfter(session, shown);
  const history = session.history.slice(0, shown);
  const godStatus = module.getStatus(state, "spectator");
  const fallback = session.players[0]!.id;
  const actingAs = (s: Seat): Viewer =>
    s === "follow" || s === "god" ? (godStatus.activePlayers[0] ?? fallback) : s;

  const move = (player: Viewer, m: unknown) => {
    if (player === "spectator" || reviewing) return;
    const next = applySessionMove(session, player, m);
    if (typeof next === "string") {
      setError(`${player}: ${next}`);
      return;
    }
    setError(null);
    setSession(next);
  };

  const simulateFromHere = () => {
    const from = truncate(session, shown);
    begin(simulate(from), shown);
  };

  const screenFor = (s: Seat, key?: string) => {
    const viewer = actingAs(s);
    const snapshot = buildSnapshot(module, state, viewer, history);
    if (s === "god") snapshot.view = state;
    if (reviewing) snapshot.legalMoves = []; // the past can be watched, not played
    return (
      <GameScreen
        key={key}
        game={session.game}
        snapshot={snapshot}
        players={session.players}
        viewer={viewer}
        version={shown}
        skipReveal={reviewing && !playing}
        idleText={reviewing ? "Reviewing: → next move · ← previous" : undefined}
        onMove={(m) => move(viewer, m)}
        onBackToLobby={() => setSession(null)}
      />
    );
  };

  const replayBar = (
    <div
      className={`flex flex-wrap items-center gap-1 border-b border-slate-800 px-2 py-1.5 text-sm text-white ${
        reviewing ? "bg-amber-400/10" : "bg-slate-900"
      }`}
    >
      <button
        type="button"
        className={iconBtn}
        aria-label="First move"
        title="Home"
        disabled={shown === 0}
        onClick={() => goTo(0)}
      >
        ⏮
      </button>
      <button
        type="button"
        className={iconBtn}
        aria-label="Previous move"
        title="← previous move"
        disabled={shown === 0}
        onClick={() => {
          setPlaying(false);
          goTo(shown - 1);
        }}
      >
        ◀
      </button>
      <button
        type="button"
        className={iconBtn}
        aria-label={playing ? "Pause" : "Play replay"}
        title="Space"
        disabled={total === 0}
        onClick={togglePlay}
      >
        {playing ? "⏸ Pause" : "⏵ Play"}
      </button>
      <button
        type="button"
        className={iconBtn}
        aria-label="Next move"
        title="→ next move"
        disabled={!reviewing}
        onClick={() => {
          setPlaying(false);
          goTo(shown + 1);
        }}
      >
        ▶
      </button>
      <button
        type="button"
        className={iconBtn}
        aria-label="Latest move"
        title="End"
        disabled={!reviewing}
        onClick={() => goTo(total)}
      >
        ⏭
      </button>
      <span className="px-2 tabular-nums">
        Move {shown}/{total}
        {reviewing && <span className="ml-1 text-amber-300">· replay</span>}
      </span>
      <span className="hidden text-xs text-slate-500 xl:inline">← → step · Space play</span>
      <span className="flex-1" />
      {reviewing && (
        <button
          type="button"
          className={iconBtn}
          title="Drop the later moves and play on from here"
          onClick={() => begin(truncate(session, shown))}
        >
          Play from here
        </button>
      )}
      {canSimulate(session) && !module.getResult(state) && (
        <button
          type="button"
          className={iconBtn}
          title="Play random legal moves to the end, then replay them"
          onClick={simulateFromHere}
        >
          Simulate to end
        </button>
      )}
    </div>
  );

  const controls = (
    <div className="flex flex-col gap-4 text-sm text-white">
      <div>
        <h2 className="mb-1 font-semibold">View as</h2>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={chip(seat === "follow")}
            onClick={() => setSeat("follow")}
          >
            Follow turn
          </button>
          {session.players.map((p) => (
            <button
              key={p.id}
              type="button"
              className={chip(seat === p.id)}
              style={{ boxShadow: `inset 5px 0 0 ${p.color}` }}
              onClick={() => setSeat(p.id)}
            >
              {p.name}
            </button>
          ))}
          <button type="button" className={chip(seat === "god")} onClick={() => setSeat("god")}>
            God view
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className={btn}
          disabled={total === 0 || reviewing}
          onClick={() => begin(truncate(session, total - 1))}
        >
          Undo
        </button>
        <button type="button" className={btn} onClick={start}>
          Restart
        </button>
        <button type="button" className={btn} onClick={() => setSession(null)}>
          New game
        </button>
        <button
          type="button"
          className={`${btn} hidden lg:block`}
          onClick={() => setSideBySide((v) => !v)}
        >
          {sideBySide ? "Single view" : "Side by side"}
        </button>
      </div>
      <p className="text-slate-400">
        {module.name} · {session.players.length} players · seed “{session.seed}”
      </p>
      {error && <p className="rounded-lg bg-red-900/60 p-2 text-red-200">{error}</p>}
      <MoveLog session={session} shown={shown} onPick={goTo} />
      <details>
        <summary className="cursor-pointer font-semibold">Full state (JSON)</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-slate-900 p-2 text-xs">
          {JSON.stringify(state, null, 2)}
        </pre>
      </details>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col bg-slate-950 lg:flex-row">
      {/* Phone: collapsible panel on top. Wide screens: sidebar. */}
      <div className="border-b border-slate-800 lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:p-4">
        <button
          type="button"
          onClick={() => setPanelOpen((o) => !o)}
          className="flex min-h-10 w-full items-center justify-between px-4 text-sm font-semibold text-amber-300 lg:hidden"
        >
          Sandbox · viewing {seat === "follow" ? "whose turn it is" : seat}{" "}
          <span>{panelOpen ? "▲" : "▼"}</span>
        </button>
        <div
          className={`${panelOpen ? "block" : "hidden"} max-h-[60dvh] overflow-y-auto p-4 lg:block lg:max-h-none lg:p-0`}
        >
          {controls}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {replayBar}
        <div className="min-h-0 flex-1 overflow-auto">
          {sideBySide ? (
            <div className="flex gap-4 p-4">
              {session.players.map((p) => (
                <div
                  key={p.id}
                  className="h-[760px] w-[390px] shrink-0 overflow-hidden rounded-xl border border-slate-700"
                >
                  {screenFor(p.id, p.id)}
                </div>
              ))}
            </div>
          ) : (
            <ZoomStage>{screenFor(seat)}</ZoomStage>
          )}
        </div>
      </div>
    </div>
  );
}

function MoveLog({
  session,
  shown,
  onPick,
}: {
  session: Session;
  shown: number;
  onPick(moves: number): void;
}) {
  const { module } = session.game;
  const lines = useMemo(
    () =>
      session.history.map((h) => {
        const d = module.describeMove(h.before, h.after, h.player, h.move, "spectator");
        return { text: d.text, tone: d.tone ?? "normal" };
      }),
    [module, session.history],
  );
  const currentRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [shown]);
  const toneClass = { normal: "", good: "text-amber-300", bad: "text-red-300" };
  return (
    <details open>
      <summary className="cursor-pointer font-semibold">
        Move log ({lines.length}) · tap a move to jump to it
      </summary>
      <ol className="mt-2 max-h-72 overflow-y-auto text-slate-300">
        {lines.map((l, i) => {
          const isCurrent = i === shown - 1;
          return (
            <li key={i} ref={isCurrent ? currentRef : undefined}>
              <button
                type="button"
                onClick={() => onPick(i + 1)}
                className={`w-full rounded px-2 py-0.5 text-left ${toneClass[l.tone]} ${
                  isCurrent ? "bg-amber-400/20" : "hover:bg-slate-800"
                } ${i >= shown ? "opacity-40" : ""}`}
              >
                <span className="mr-2 text-slate-500 tabular-nums">{i + 1}.</span>
                {l.text}
              </button>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
