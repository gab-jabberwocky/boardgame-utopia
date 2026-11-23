import { useSecretMode } from "./secret";

/** Small switch for secret mode (grey, low-key look on this device). */
export function SecretToggle({
  className = "",
  compact = false,
}: {
  className?: string;
  /** Icon only (for tight headers). */
  compact?: boolean;
}) {
  const [secret, setSecret] = useSecretMode();
  return (
    <button
      type="button"
      onClick={() => setSecret(!secret)}
      aria-pressed={secret}
      title={secret ? "Secret mode on: tap for colours" : "Secret mode: grey and low-key"}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${
        secret ? "bg-slate-200 text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
      } ${className}`}
    >
      <span aria-hidden>{secret ? "◐" : "◑"}</span>
      {compact ? (
        <span className="sr-only">Secret mode</span>
      ) : secret ? (
        "Secret on"
      ) : (
        "Secret mode"
      )}
    </button>
  );
}
