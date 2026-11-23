import { useState } from "react";
import { PlayerChoice, SettingsForm, defaultSettings } from "@utopia/kit/ui";
import {
  firstFreeColor,
  validatePlayerChoice,
  type PlayerInfo,
  type RoomView,
} from "@utopia/shared";
import { ErrorBoundary } from "../ErrorBoundary";
import { GameScreen } from "../GameScreen";
import { SecretToggle } from "../SecretToggle";
import { useSecretMode } from "../secret";
import { ZoomStage } from "../ZoomStage";
import { api, useConnected, useRoom } from "../net/api";
import { rememberName, rememberedName } from "../net/guest";
import { navigate, roomUrl } from "../router";
import { ErrorNote, GamePicker, Page, button, findGame, players, settingsSummary } from "./common";

export function RoomPage({ code }: { code: string }) {
  const { room, error } = useRoom(code);
  const connected = useConnected();

  let body;
  if (!room) {
    body = error ? (
      <Page>
        <div className="mt-10 text-center">
          <p className="text-4xl">🚪</p>
          <h1 className="mt-2 text-xl font-bold">Room {code}</h1>
          <p className="mt-1 text-slate-400">{error}</p>
        </div>
        <button type="button" className={button.primary} onClick={() => navigate("/")}>
          Go home
        </button>
      </Page>
    ) : (
      <Page>
        <p className="mt-10 text-center text-slate-400">Opening room {code}…</p>
      </Page>
    );
  } else if (room.game) {
    body = <RoomGame room={room} />;
  } else if (!room.you) {
    body = <JoinRoom room={room} />;
  } else {
    body = <Lobby room={room} />;
  }

  return (
    <>
      {body}
      {!connected && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-50 bg-amber-500 py-1.5 text-center text-sm font-semibold text-slate-900"
        >
          Reconnecting…
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- joining

function JoinRoom({ room }: { room: RoomView }) {
  const entry = findGame(room.gameId);
  const [me, setMe] = useState<PlayerInfo>(() => ({
    id: "new",
    name: rememberedName(),
    color: firstFreeColor(room.players),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Someone may grab your colour while you type: then move to a free one.
  const taken = room.players.some((p) => p.color === me.color);
  const choice = taken ? { ...me, color: firstFreeColor(room.players) } : me;
  const problem = validatePlayerChoice(room.players, choice);

  const join = async () => {
    setBusy(true);
    const res = await api.join(room.code, choice.name, choice.color);
    setBusy(false);
    if (res.ok) rememberName(choice.name);
    else setError(res.error);
  };

  return (
    <Page>
      <header className="mt-4 text-center">
        <p className="text-xs tracking-widest text-slate-500 uppercase">Room {room.code}</p>
        <h1 className="text-2xl font-black">{entry?.module.name ?? "Game"}</h1>
        {room.players.length > 0 && (
          <p className="mt-1 text-sm text-slate-400">
            With {room.players.map((p) => p.name).join(", ")}
          </p>
        )}
      </header>
      <form
        className="flex flex-col gap-3 rounded-2xl bg-slate-900/70 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) void join();
        }}
      >
        <label className="text-sm font-semibold text-slate-300">Your name and colour</label>
        <PlayerChoice players={[...room.players, choice]} me={choice} onChange={setMe} />
        <ErrorNote error={error} />
        <button type="submit" className={button.primary} disabled={!!problem || busy}>
          {busy ? "Joining…" : "Join"}
        </button>
      </form>
      <button type="button" className={`${button.quiet} self-center`} onClick={() => navigate("/")}>
        Not now
      </button>
    </Page>
  );
}

// ---------------------------------------------------------------- lobby

function Lobby({ room }: { room: RoomView }) {
  const entry = findGame(room.gameId);
  const host = room.players.find((p) => p.id === room.hostId);
  const [error, setError] = useState<string | null>(null);
  const [editingMe, setEditingMe] = useState(false);
  const [editingGame, setEditingGame] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    setError(res.ok ? null : (res.error ?? "Something went wrong."));
    return res.ok;
  };

  const share = async () => {
    const url = roomUrl(room.code);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join my game", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Share sheet closed, or clipboard blocked: the code is on screen anyway.
    }
  };

  const n = room.players.length;
  const min = entry?.module.minPlayers ?? 1;
  const max = entry?.module.maxPlayers ?? 10;
  const ready = n >= min && n <= max;
  const need =
    n < min
      ? `Need ${min - n} more player${min - n === 1 ? "" : "s"}`
      : n > max
        ? `${n - max} too many players for ${entry?.module.name}`
        : null;

  return (
    <Page>
      {/* Room code and invite */}
      <section className="rounded-2xl bg-gradient-to-b from-amber-500/20 to-slate-900 p-4 text-center">
        <p className="text-xs tracking-widest text-amber-200 uppercase">Room code</p>
        <p className="font-mono text-5xl font-black tracking-[0.25em]">{room.code}</p>
        <button
          type="button"
          className={`${button.secondary} mt-3 w-full`}
          onClick={() => void share()}
        >
          {copied ? "Link copied!" : "📨 Invite: share the link"}
        </button>
      </section>

      {/* The game */}
      {entry && (
        <section className="rounded-2xl bg-slate-900/70 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">{entry.module.name}</h2>
            <span className="text-xs text-slate-400">👥 {players(entry)}</span>
          </div>
          <p className="text-sm text-slate-400">{entry.module.description}</p>
          {settingsSummary(entry, room.config).length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {settingsSummary(entry, room.config).map((s) => (
                <li key={s} className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
                  {s}
                </li>
              ))}
            </ul>
          )}
          {room.youHost && !editingGame && (
            <button
              type="button"
              className={`${button.quiet} mt-1 -ml-3`}
              onClick={() => setEditingGame(true)}
            >
              Change game or settings
            </button>
          )}
          {room.youHost && editingGame && (
            <GameEditor
              room={room}
              onDone={async (gameId, config) => {
                if (await run(api.setGame(room.code, gameId, config))) setEditingGame(false);
              }}
              onCancel={() => setEditingGame(false)}
            />
          )}
        </section>
      )}

      {/* Who's here */}
      <section className="rounded-2xl bg-slate-900/70 p-3">
        <h2 className="mb-2 flex justify-between text-sm font-semibold text-slate-300">
          <span>Players</span>
          <span className="font-normal text-slate-500">
            {n} joined · {entry ? players(entry) : ""}
          </span>
        </h2>
        <ul className="grid gap-1.5">
          {room.players.map((p) => (
            <li
              key={p.id}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-950/50 px-3"
            >
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="truncate font-semibold">
                {p.name}
                {p.id === room.you && <span className="font-normal text-slate-400"> (you)</span>}
              </span>
              {p.id === room.hostId && <span title="Host">👑</span>}
              <span
                className={`ml-auto h-2 w-2 shrink-0 rounded-full ${p.connected ? "bg-emerald-400" : "bg-slate-600"}`}
                title={p.connected ? "Online" : "Offline"}
              />
              {room.youHost && p.id !== room.you && (
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  className="-mr-2 h-9 w-9 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-red-300"
                  onClick={() => void run(api.kick(room.code, p.id))}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
        {!editingMe ? (
          <button
            type="button"
            className={`${button.quiet} mt-1 -ml-3`}
            onClick={() => setEditingMe(true)}
          >
            Change your name or colour
          </button>
        ) : (
          <EditMe
            room={room}
            onSave={async (name, color) => {
              if (await run(api.join(room.code, name, color))) {
                rememberName(name);
                setEditingMe(false);
              }
            }}
            onCancel={() => setEditingMe(false)}
          />
        )}
      </section>

      <ErrorNote error={error} />

      <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-1 bg-slate-950/95 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {room.youHost ? (
          <>
            <button
              type="button"
              className={button.primary}
              disabled={!ready}
              onClick={() => void run(api.start(room.code))}
            >
              Start {entry?.module.name ?? "the game"}
            </button>
            {need && <p className="text-center text-xs text-slate-400">{need}</p>}
          </>
        ) : (
          <p className="py-3 text-center text-slate-400">
            Waiting for {host?.name ?? "the host"} to start…
          </p>
        )}
        <button
          type="button"
          className={`${button.quiet} self-center`}
          onClick={async () => {
            if (await run(api.leave(room.code))) navigate("/");
          }}
        >
          Leave room
        </button>
      </div>
    </Page>
  );
}

function EditMe({
  room,
  onSave,
  onCancel,
}: {
  room: RoomView;
  onSave(name: string, color: string): void;
  onCancel(): void;
}) {
  const current = room.players.find((p) => p.id === room.you)!;
  const [me, setMe] = useState<PlayerInfo>({
    id: current.id,
    name: current.name,
    color: current.color,
  });
  const problem = validatePlayerChoice(room.players, me);
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl bg-slate-950/50 p-3">
      <PlayerChoice
        players={room.players.map((p) => (p.id === me.id ? me : p))}
        me={me}
        onChange={setMe}
      />
      <div className="flex gap-2">
        <button type="button" className={button.secondary} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={`${button.primary} flex-1`}
          disabled={!!problem}
          onClick={() => onSave(me.name, me.color)}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function GameEditor({
  room,
  onDone,
  onCancel,
}: {
  room: RoomView;
  onDone(gameId: string, config: Record<string, unknown>): void;
  onCancel(): void;
}) {
  const [gameId, setGameId] = useState(room.gameId);
  const [config, setConfig] = useState<Record<string, unknown>>(room.config);
  const entry = findGame(gameId);
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-slate-800 pt-3">
      <GamePicker
        value={gameId}
        onChange={(id) => {
          const next = findGame(id);
          if (!next) return;
          setGameId(id);
          setConfig(id === room.gameId ? room.config : defaultSettings(next.module.configSchema));
        }}
      />
      {entry && (
        <SettingsForm schema={entry.module.configSchema} value={config} onChange={setConfig} />
      )}
      <div className="flex gap-2">
        <button type="button" className={button.secondary} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={`${button.primary} flex-1`}
          onClick={() => onDone(gameId, config)}
        >
          Use these settings
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- playing

function RoomGame({ room }: { room: RoomView }) {
  const [secret] = useSecretMode();
  const game = room.game!;
  const entry = findGame(game.gameId);
  const [error, setError] = useState<{ version: number; text: string } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const playing = room.you !== null && game.players.some((p) => p.id === room.you);
  const viewer = playing ? room.you! : "spectator";
  const over = !!game.snapshot.result;

  if (!entry) {
    return (
      <Page>
        <p className="mt-10 text-center text-slate-400">
          This game isn't available in this version.
        </p>
      </Page>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-slate-950 text-white">
      <header className="flex min-h-10 items-center gap-2 border-b border-slate-800 px-3 text-sm">
        <button
          type="button"
          className="-ml-2 min-h-10 shrink-0 rounded-lg px-2 text-slate-400 hover:text-white"
          aria-label="Go home. Your seat is kept; enter the code to come back."
          title="Home (your seat is kept)"
          onClick={() => navigate("/")}
        >
          ←
        </button>
        {secret ? (
          <span className="truncate font-mono text-slate-400">
            ~/notes/{room.code.toLowerCase()}.md
          </span>
        ) : (
          <>
            <span className="font-mono font-bold tracking-widest text-amber-300">{room.code}</span>
            <span className="truncate text-slate-400">{entry.module.name}</span>
          </>
        )}
        {!playing && (
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs">Watching</span>
        )}
        <SecretToggle compact className="ml-auto shrink-0" />
        {room.youHost && !over && (
          <span className="flex items-center gap-1">
            {confirmEnd ? (
              <>
                <button type="button" className={button.quiet} onClick={() => setConfirmEnd(false)}>
                  Keep playing
                </button>
                <button
                  type="button"
                  className="min-h-8 rounded-lg bg-red-700 px-3 text-xs font-bold"
                  onClick={() => void api.backToLobby(room.code)}
                >
                  End game
                </button>
              </>
            ) : (
              <button type="button" className={button.quiet} onClick={() => setConfirmEnd(true)}>
                End game…
              </button>
            )}
          </span>
        )}
      </header>
      {error && error.version === game.version && (
        <p role="alert" className="bg-red-900 px-3 py-1.5 text-center text-sm text-red-100">
          {error.text}
        </p>
      )}
      <div className="min-h-0 flex-1">
        <ZoomStage>
          <ErrorBoundary
            resetKey={game.version}
            fallback={(retry) => (
              <div role="alert" className="mx-auto flex max-w-sm flex-col gap-3 p-6 text-center">
                <p className="font-semibold">This game screen hit a problem.</p>
                <p className="text-sm text-slate-400">
                  It will try again after the next move.
                  {room.youHost ? " You can also end the game from the top bar." : ""}
                </p>
                <button type="button" className={button.secondary} onClick={retry}>
                  Try again
                </button>
                <button type="button" className={button.quiet} onClick={() => navigate("/")}>
                  Go home · your seat is kept, rejoin with code {room.code}
                </button>
              </div>
            )}
          >
            <GameScreen
              game={entry}
              snapshot={game.snapshot}
              players={game.players}
              viewer={viewer}
              version={game.version}
              onMove={async (move) => {
                const res = await api.move(room.code, move, game.version);
                if (!res.ok) setError({ version: game.version, text: res.error });
              }}
              onBackToLobby={room.youHost ? () => void api.backToLobby(room.code) : undefined}
              idleText={playing ? undefined : over ? "Game over" : "You're watching this game"}
            />
          </ErrorBoundary>
        </ZoomStage>
      </div>
    </div>
  );
}
