/*
 * One JSON object per line on stdout/stderr, which hosts like Render and Railway
 * collect and search as-is.
 */

type Level = "info" | "warn" | "error";

function serialize(value: unknown): unknown {
  return value instanceof Error ? { message: value.message, stack: value.stack } : value;
}

export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const entry: Record<string, unknown> = { time: new Date().toISOString(), level, event };
  for (const [key, value] of Object.entries(fields)) entry[key] = serialize(value);
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else console.log(line);
}
