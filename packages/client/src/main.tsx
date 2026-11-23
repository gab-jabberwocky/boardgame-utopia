import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./index.css";
import { initSecretMode } from "./secret";

initSecretMode();

// The sandbox exists only in `npm run dev`; production builds drop it entirely.
const Sandbox = import.meta.env.DEV ? lazy(() => import("./sandbox/Sandbox")) : null;
const showSandbox = Sandbox && window.location.pathname.startsWith("/sandbox");

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary
      fallback={() => (
        <main
          role="alert"
          className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center text-white"
        >
          <p className="font-semibold">Something went wrong on this page.</p>
          <button
            type="button"
            className="min-h-12 rounded-xl bg-amber-400 px-5 font-bold text-slate-900"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <button
            type="button"
            className="min-h-10 rounded-lg px-3 text-sm text-slate-400 hover:text-white"
            onClick={() => window.location.assign("/")}
          >
            Go home
          </button>
        </main>
      )}
    >
      {showSandbox ? (
        <Suspense>
          <Sandbox />
        </Suspense>
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </StrictMode>,
);
