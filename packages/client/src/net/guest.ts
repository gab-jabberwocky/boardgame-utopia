/*
 * Guest identity: a random token kept in the browser, so a refresh or a locked phone
 * gets the same seat back. In dev each tab gets its own (sessionStorage), so several
 * tabs can play against each other.
 */

const TOKEN_KEY = "utopia.guest";
const NAME_KEY = "utopia.name";

function storage(kind: "token" | "name"): Storage | null {
  try {
    return kind === "token" && import.meta.env.DEV ? sessionStorage : localStorage;
  } catch {
    return null; // private mode or blocked storage
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes); // works on plain http too, unlike crypto.randomUUID
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

let cached: string | null = null;

export function guestToken(): string {
  if (cached) return cached;
  const store = storage("token");
  let token = store?.getItem(TOKEN_KEY) ?? null;
  if (!token || !/^[\w-]{8,64}$/.test(token)) {
    token = randomToken();
    store?.setItem(TOKEN_KEY, token);
  }
  cached = token;
  return token;
}

/** The name you used last time, to fill in the join form. */
export const rememberedName = () => storage("name")?.getItem(NAME_KEY) ?? "";
export const rememberName = (name: string) => storage("name")?.setItem(NAME_KEY, name.trim());
