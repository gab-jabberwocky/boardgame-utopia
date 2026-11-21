import { useState } from "react";
import { ROOM_CODE_LENGTH, isRoomCode, normalizeRoomCode } from "@utopia/shared";
import { GAMES } from "../games";
import { navigate, roomPath } from "../router";
import { Page, button } from "./common";

export function Home() {
  const [code, setCode] = useState("");
  const clean = normalizeRoomCode(code).replace(/[^A-Z]/g, "");
  const valid = isRoomCode(clean);

  return (
    <Page>
      <header className="mt-6 text-center">
        <p className="text-5xl">🎲</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Boardgame Utopia</h1>
        <p className="mt-1 text-slate-400">Board games with friends. No accounts, just a code.</p>
      </header>

      <button
        type="button"
        className={`${button.primary} mt-4 text-lg`}
        onClick={() => navigate("/new")}
      >
        Create a game
      </button>

      <div className="flex items-center gap-3 text-xs tracking-widest text-slate-500 uppercase">
        <span className="h-px flex-1 bg-slate-800" />
        or join friends
        <span className="h-px flex-1 bg-slate-800" />
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) navigate(roomPath(clean));
        }}
      >
        <input
          value={clean}
          onChange={(e) => setCode(e.target.value)}
          maxLength={ROOM_CODE_LENGTH}
          placeholder="CODE"
          aria-label="Room code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="min-h-12 w-0 flex-1 rounded-xl bg-slate-800 px-4 text-center font-mono text-2xl font-black tracking-[0.4em] text-white uppercase outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-amber-400"
        />
        <button type="submit" className={button.secondary} disabled={!valid}>
          Join
        </button>
      </form>

      <section className="mt-4 rounded-2xl bg-slate-900/70 p-3">
        <p className="mb-2 text-xs tracking-wide text-slate-500 uppercase">
          {GAMES.length} games to play
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {GAMES.map((g) => (
            <li key={g.module.id} className="rounded-full bg-slate-800 px-3 py-1 text-sm">
              {g.module.name}
            </li>
          ))}
        </ul>
      </section>

      {import.meta.env.DEV && (
        <a href="/sandbox" className={`${button.quiet} self-center`}>
          Open the sandbox (dev only)
        </a>
      )}
    </Page>
  );
}
