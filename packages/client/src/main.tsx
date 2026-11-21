import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
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
    {showSandbox ? (
      <Suspense>
        <Sandbox />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
