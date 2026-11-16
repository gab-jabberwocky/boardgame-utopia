import { useEffect, useRef } from "react";

export interface EventFlashProps {
  text: string;
  tone?: "normal" | "good" | "bad";
}

const STYLES = {
  bad: { cls: "bg-red-600 text-white", icon: "💥" },
  good: { cls: "bg-amber-400 text-slate-900", icon: "🏁" },
  normal: { cls: "bg-slate-700 text-white", icon: "📣" },
};

/**
 * A big headline that pops over the screen for a couple of seconds.
 * Give it a new `key` for each event so it plays again.
 */
export function EventFlash({ text, tone = "normal" }: EventFlashProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const animation = ref.current?.animate(
      [
        { opacity: 0, transform: "scale(0.6)" },
        { opacity: 1, transform: "scale(1.08)", offset: 0.12 },
        { opacity: 1, transform: "scale(1)", offset: 0.2 },
        { opacity: 1, transform: "scale(1)", offset: 0.8 },
        { opacity: 0, transform: "scale(0.95)" },
      ],
      { duration: 2400, easing: "ease-out", fill: "forwards" },
    );
    return () => animation?.cancel();
  }, []);
  const style = STYLES[tone];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 z-30 flex justify-center px-4">
      <div
        ref={ref}
        role="alert"
        style={{ opacity: 0 }}
        className={`flex items-center gap-2 rounded-2xl px-6 py-4 text-2xl font-extrabold shadow-2xl ${style.cls}`}
      >
        <span aria-hidden>{style.icon}</span>
        {text}
      </div>
    </div>
  );
}
