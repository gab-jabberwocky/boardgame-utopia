import { useState } from "react";
import { SettingsForm, defaultSettings } from "@utopia/kit/ui";
import { GAMES } from "../games";
import { api } from "../net/api";
import { navigate, roomPath } from "../router";
import { ErrorNote, GamePicker, Page, button, findGame, settingsSummary } from "./common";

export function CreateRoom() {
  const first = GAMES[0]!;
  const [gameId, setGameId] = useState(first.module.id);
  const [settings, setSettings] = useState(() => defaultSettings(first.module.configSchema));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entry = findGame(gameId) ?? first;

  const pick = (id: string) => {
    const next = findGame(id);
    if (!next) return;
    setGameId(id);
    setSettings(defaultSettings(next.module.configSchema));
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    const res = await api.create(gameId, settings);
    setBusy(false);
    if (res.ok) navigate(roomPath(res.code));
    else setError(res.error);
  };

  return (
    <Page>
      <header className="flex items-center gap-2">
        <button type="button" className={button.quiet} onClick={() => navigate("/")}>
          ← Back
        </button>
        <h1 className="text-xl font-bold">New game</h1>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Pick a game</h2>
        <GamePicker value={gameId} onChange={pick} />
      </section>

      <section className="rounded-2xl bg-slate-900/70 p-3">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">{entry.module.name} settings</h2>
        {settingsSummary(entry, settings).length > 0 ? (
          <SettingsForm
            schema={entry.module.configSchema}
            value={settings}
            onChange={setSettings}
          />
        ) : (
          <p className="text-sm text-slate-500">No settings: just play.</p>
        )}
      </section>

      <ErrorNote error={error} />

      <div className="sticky bottom-0 -mx-4 bg-slate-950/95 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          className={`${button.primary} w-full`}
          disabled={busy}
          onClick={create}
        >
          {busy ? "Creating…" : `Create a ${entry.module.name} room`}
        </button>
      </div>
    </Page>
  );
}
