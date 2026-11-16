export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 bg-slate-900 p-6 text-white">
      <h1 className="text-3xl font-bold">Boardgame Utopia</h1>
      <p className="text-center text-slate-300">Online lobby is coming soon.</p>
      {import.meta.env.DEV && (
        <a
          href="/sandbox"
          className="rounded-xl bg-amber-400 px-6 py-3 font-semibold text-slate-900"
        >
          Open the sandbox
        </a>
      )}
    </main>
  );
}
