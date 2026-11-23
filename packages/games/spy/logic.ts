import type {
  ActionDescription,
  GameResult,
  GameStatus,
  LegalMove,
  MoveContext,
  PlayerId,
  PlayerInfo,
  SetupContext,
  Viewer,
} from "@utopia/shared";
import { isMove } from "@utopia/kit";
import type { Config } from "./config.js";

/*
 * Spy: 20 questions with a traitor.
 *
 * - Roles are dealt in secret: one Master (announced), one Insider, the rest Commons.
 *   The Master and the Insider see the secret word.
 * - Questions: everyone asks the Master yes/no questions out loud; the Master answers
 *   only YES, NO or I DON'T KNOW. The Master taps who found the word, or calls time
 *   (then everyone loses).
 * - Discussion: as long as the questions took. Who steered us there too well?
 * - Vote 1: everyone but the Guesser votes whether the Guesser is the Insider.
 *   Majority yes: right → Master and Commons win; wrong → the Insider wins.
 *   No majority: if the Guesser was the Insider they win; otherwise go to vote 2.
 * - Vote 2: everyone points at the Insider. Most votes on the Insider: Master and
 *   Commons win; otherwise the Insider wins. A tie is decided by the Guesser.
 * - Talking happens at the table; the app deals roles, shows the word, times and votes.
 */

export const WORDS: string[] = [
  // food
  "apple",
  "banana",
  "pineapple",
  "carrot",
  "pizza",
  "sandwich",
  "popcorn",
  "chocolate",
  "honey",
  "cheese",
  "pancake",
  "ice cream",
  "birthday cake",
  "coffee",
  "lemon",
  "watermelon",
  "egg",
  "bread",
  "soup",
  "spaghetti",
  // animals
  "dog",
  "cat",
  "elephant",
  "giraffe",
  "penguin",
  "shark",
  "octopus",
  "butterfly",
  "spider",
  "owl",
  "kangaroo",
  "dolphin",
  "snail",
  "bee",
  "horse",
  "rabbit",
  "turtle",
  "lion",
  "frog",
  "camel",
  // getting around
  "bicycle",
  "train",
  "airplane",
  "submarine",
  "rocket",
  "taxi",
  "helicopter",
  "skateboard",
  "sailboat",
  "tractor",
  // music
  "guitar",
  "piano",
  "drum",
  "violin",
  "trumpet",
  // things
  "umbrella",
  "toothbrush",
  "mirror",
  "pillow",
  "candle",
  "clock",
  "ladder",
  "key",
  "scissors",
  "backpack",
  "camera",
  "telescope",
  "magnet",
  "balloon",
  "kite",
  "compass",
  "glasses",
  "wallet",
  "hammer",
  "broom",
  "lamp",
  "bathtub",
  "fridge",
  "microwave",
  "sofa",
  // places and nature
  "beach",
  "volcano",
  "desert",
  "jungle",
  "island",
  "waterfall",
  "castle",
  "library",
  "hospital",
  "airport",
  "museum",
  "zoo",
  "farm",
  "igloo",
  "lighthouse",
  "bridge",
  "cave",
  "rainbow",
  "snowman",
  "moon",
  "sun",
  "cloud",
  "tornado",
  "thunder",
  // people and characters
  "doctor",
  "firefighter",
  "pilot",
  "chef",
  "teacher",
  "astronaut",
  "farmer",
  "magician",
  "pirate",
  "ghost",
  "robot",
  "dragon",
  "mermaid",
  "king",
  "detective",
  // activities
  "football",
  "chess",
  "swimming",
  "tennis",
  "yoga",
  "fishing",
  "camping",
  "painting",
  "dancing",
  "karate",
];

export type Role = "master" | "insider" | "common";

export const ROLE_INFO: Record<Role, { name: string; goal: string }> = {
  master: {
    name: "Master",
    goal: "Answer only YES, NO or I DON'T KNOW. Then help catch the Insider.",
  },
  insider: {
    name: "Insider",
    goal: "You know the word. Steer everyone to it without being caught.",
  },
  common: {
    name: "Common",
    goal: "Find the word in time, then work out who already knew it.",
  },
};

export type Phase = "roles" | "questions" | "discussion" | "judge" | "accuse" | "tiebreak" | "over";

/** Who won: the Master and Commons, the Insider, or nobody (time ran out). */
export type Outcome = "commons" | "insider" | "nobody";

export type GameEvent =
  | { type: "newWord"; player: PlayerId }
  | { type: "started"; player: PlayerId }
  | { type: "found"; guesser: PlayerId; word: string }
  | { type: "timeUp" }
  | { type: "voteStarted" }
  | { type: "voted"; player: PlayerId }
  | { type: "judged"; yes: number; voters: number }
  | { type: "accused"; leaders: PlayerId[]; votes: number }
  | { type: "decided"; player: PlayerId; target: PlayerId }
  | { type: "over"; outcome: Outcome; insider: PlayerId };

/** What everyone can see. */
export interface Table {
  config: Config;
  players: PlayerInfo[];
  phase: Phase;
  master: PlayerId;
  guesser: PlayerId | null;
  /** How long the questions took; the discussion gets as long. */
  questionSeconds: number | null;
  /** Who has voted in the current vote (not how). */
  voted: PlayerId[];
  /** Vote 2 tie, for the Guesser to decide. */
  tied: PlayerId[];
  outcome: Outcome | null;
}

export interface State extends Table {
  roles: Record<PlayerId, Role>;
  word: string;
  judgeVotes: Record<PlayerId, boolean>;
  accuseVotes: Record<PlayerId, PlayerId>;
  events: GameEvent[];
}

export interface View extends Table {
  /** Your own role (null for spectators until the end). */
  role: Role | null;
  /** The word: for the Master and the Insider, and for everyone once it's found. */
  word: string | null;
  /** Everyone's role, once the game is over. */
  roles: Record<PlayerId, Role> | null;
  /** Vote 1, shown once everyone has voted. */
  judgeVotes: Record<PlayerId, boolean> | null;
  /** Vote 2, shown once everyone has voted. */
  accuseVotes: Record<PlayerId, PlayerId> | null;
}

export type Move =
  | { type: "newWord" }
  | { type: "start" }
  | { type: "found"; guesser: PlayerId; seconds: number }
  | { type: "timeUp" }
  | { type: "startVote" }
  | { type: "judge"; insider: boolean }
  | { type: "accuse"; target: PlayerId }
  | { type: "decide"; target: PlayerId };

// ---------------------------------------------------------------- setup

export function setup(ctx: SetupContext, config: Config): State {
  const n = ctx.players.length;
  if (n < 4) throw new Error("Spy needs at least 4 players");
  const roles = ctx.rng.shuffle<Role>(["master", "insider", ...Array<Role>(n - 2).fill("common")]);
  const byPlayer = Object.fromEntries(ctx.players.map((p, i) => [p.id, roles[i]!]));
  return {
    config,
    players: ctx.players,
    phase: "roles",
    master: ctx.players[roles.indexOf("master")]!.id,
    guesser: null,
    questionSeconds: null,
    voted: [],
    tied: [],
    outcome: null,
    roles: byPlayer,
    word: ctx.rng.pick(WORDS),
    judgeVotes: {},
    accuseVotes: {},
    events: [],
  };
}

// ---------------------------------------------------------------- helpers

export const nameOf = (t: Pick<Table, "players">, id: PlayerId) =>
  t.players.find((p) => p.id === id)?.name ?? id;

export const insiderOf = (s: Pick<State, "roles">): PlayerId =>
  Object.entries(s.roles).find(([, r]) => r === "insider")![0];

/** Who still has to vote now. */
export function waitingOn(t: Table): PlayerId[] {
  const ids = t.players.map((p) => p.id);
  switch (t.phase) {
    case "roles":
    case "questions":
    case "discussion":
      return [t.master];
    case "judge":
      return ids.filter((id) => id !== t.guesser && !t.voted.includes(id));
    case "accuse":
      return ids.filter((id) => !t.voted.includes(id));
    case "tiebreak":
      return t.guesser ? [t.guesser] : [];
    case "over":
      return [];
  }
}

/** Players you can point at in vote 2: anyone but yourself and the Master. */
export const suspects = (t: Table, voter: PlayerId) =>
  t.players.filter((p) => p.id !== voter && p.id !== t.master);

// ---------------------------------------------------------------- moves

export function getLegalMoves(state: State, player: PlayerId): LegalMove<Move>[] {
  if (!waitingOn(state).includes(player)) return [];
  switch (state.phase) {
    case "roles":
      return [
        { move: { type: "newWord" }, label: "Draw another word" },
        { move: { type: "start" }, label: "Start the questions" },
      ];
    case "questions":
      return [
        ...state.players
          .filter((p) => p.id !== state.master)
          .map((p) => ({
            move: { type: "found", guesser: p.id, seconds: 0 } as Move,
            label: `${p.name} found the word`,
            where: "board" as const,
          })),
        { move: { type: "timeUp" }, label: "Time's up: nobody found it" },
      ];
    case "discussion":
      return [{ move: { type: "startVote" }, label: "Start the vote" }];
    case "judge":
      return [
        { move: { type: "judge", insider: true }, label: "Yes, Insider" },
        { move: { type: "judge", insider: false }, label: "No, not the Insider" },
      ];
    case "accuse":
      return suspects(state, player).map((p) => ({
        move: { type: "accuse", target: p.id },
        label: `It's ${p.name}`,
      }));
    case "tiebreak":
      return state.tied.map((id) => ({
        move: { type: "decide", target: id },
        label: `It's ${nameOf(state, id)}`,
      }));
    case "over":
      return [];
  }
}

export function validateMove(state: State, player: PlayerId, move: Move): string | null {
  if (!isMove(move)) return "That move isn't allowed.";
  if (state.phase === "over") return "The game is over.";
  if (!waitingOn(state).includes(player)) return "It's not your turn to do that.";
  if (move.type === "found") {
    // The seconds come from the Master's timer, so they can't be listed in advance.
    if (state.phase !== "questions") return "Nobody is guessing right now.";
    if (move.guesser === state.master || !state.players.some((p) => p.id === move.guesser)) {
      return "The Guesser must be one of the other players.";
    }
    return Number.isInteger(move.seconds) && move.seconds >= 0 ? null : "Bad time.";
  }
  const key = JSON.stringify(move);
  const legal = getLegalMoves(state, player).some((m) => JSON.stringify(m.move) === key);
  return legal ? null : "That move isn't allowed right now.";
}

function finish(s: State, outcome: Outcome) {
  s.phase = "over";
  s.outcome = outcome;
  s.events.push({ type: "over", outcome, insider: insiderOf(s) });
}

function resolveJudge(s: State) {
  const voters = Object.keys(s.judgeVotes).length;
  const yes = Object.values(s.judgeVotes).filter(Boolean).length;
  s.events.push({ type: "judged", yes, voters });
  const majority = yes * 2 > voters; // ties are not majorities
  const guesserIsInsider = s.roles[s.guesser!] === "insider";
  if (majority) finish(s, guesserIsInsider ? "commons" : "insider");
  else if (guesserIsInsider) finish(s, "insider");
  else {
    s.phase = "accuse";
    s.voted = [];
  }
}

function accusedOutcome(s: State, target: PlayerId) {
  finish(s, s.roles[target] === "insider" ? "commons" : "insider");
}

function resolveAccuse(s: State) {
  const tally = new Map<PlayerId, number>();
  for (const target of Object.values(s.accuseVotes))
    tally.set(target, (tally.get(target) ?? 0) + 1);
  const most = Math.max(...tally.values());
  const leaders = s.players.map((p) => p.id).filter((id) => tally.get(id) === most);
  s.events.push({ type: "accused", leaders, votes: most });
  if (leaders.length === 1) accusedOutcome(s, leaders[0]!);
  else {
    s.phase = "tiebreak";
    s.tied = leaders;
  }
}

export function applyMove(state: State, player: PlayerId, move: Move, ctx: MoveContext): State {
  const s = structuredClone(state);
  s.events = [];
  switch (move.type) {
    case "newWord":
      s.word = ctx.rng.pick(WORDS.filter((w) => w !== s.word));
      s.events.push({ type: "newWord", player });
      break;
    case "start":
      s.phase = "questions";
      s.events.push({ type: "started", player });
      break;
    case "found":
      s.guesser = move.guesser;
      // No time measured (e.g. from the text view): the discussion gets the full time.
      s.questionSeconds =
        move.seconds > 0 ? Math.min(move.seconds, s.config.minutes * 60) : s.config.minutes * 60;
      s.phase = "discussion";
      s.events.push({ type: "found", guesser: move.guesser, word: s.word });
      break;
    case "timeUp":
      s.events.push({ type: "timeUp" });
      finish(s, "nobody");
      break;
    case "startVote":
      s.phase = "judge";
      s.voted = [];
      s.events.push({ type: "voteStarted" });
      break;
    case "judge":
      s.judgeVotes[player] = move.insider;
      s.voted.push(player);
      s.events.push({ type: "voted", player });
      if (waitingOn(s).length === 0) resolveJudge(s);
      break;
    case "accuse":
      s.accuseVotes[player] = move.target;
      s.voted.push(player);
      s.events.push({ type: "voted", player });
      if (waitingOn(s).length === 0) resolveAccuse(s);
      break;
    case "decide":
      s.events.push({ type: "decided", player, target: move.target });
      accusedOutcome(s, move.target);
      break;
  }
  return s;
}

// ---------------------------------------------------------------- views and text

export function getPlayerView(state: State, viewer: Viewer): View {
  const { roles, word, judgeVotes, accuseVotes, events: _events, ...table } = state;
  const over = state.phase === "over";
  const role = viewer === "spectator" ? null : (roles[viewer] ?? null);
  const knows = role === "master" || role === "insider";
  const judged = over || state.phase === "accuse" || state.phase === "tiebreak";
  return {
    ...table,
    role,
    word: over || state.guesser || knows ? word : null,
    roles: over ? roles : null,
    judgeVotes: judged && Object.keys(judgeVotes).length ? judgeVotes : null,
    accuseVotes:
      (over || state.phase === "tiebreak") && Object.keys(accuseVotes).length ? accuseVotes : null,
  };
}

function winners(s: State): PlayerId[] {
  const insider = insiderOf(s);
  if (s.outcome === "commons") return s.players.map((p) => p.id).filter((id) => id !== insider);
  if (s.outcome === "insider") return [insider];
  return [];
}

function outcomeText(s: State): string {
  const insider = nameOf(s, insiderOf(s));
  if (s.outcome === "commons") return `The Master and Commons win! ${insider} was the Insider.`;
  if (s.outcome === "insider") return `${insider} wins as the Insider!`;
  return `Time ran out: everyone loses. The word was "${s.word}"; ${insider} was the Insider.`;
}

export function getResult(state: State): GameResult | null {
  if (state.phase !== "over") return null;
  return { winners: winners(state), text: outcomeText(state) };
}

export function getStatus(state: State, viewer: Viewer): GameStatus {
  const waiting = waitingOn(state);
  if (state.phase === "over") return { text: outcomeText(state), activePlayers: [] };
  const master = nameOf(state, state.master);
  const guesser = state.guesser ? nameOf(state, state.guesser) : "";
  const isMaster = viewer === state.master;
  const mustAct = viewer !== "spectator" && waiting.includes(viewer);
  let text: string;
  switch (state.phase) {
    case "roles":
      text = isMaster
        ? "You're the Master: check the word, then start the questions"
        : `Check your role. ${master} starts the questions`;
      break;
    case "questions":
      text = isMaster
        ? "Answer only YES, NO or I DON'T KNOW"
        : `Ask ${master} yes/no questions to find the word`;
      break;
    case "discussion":
      text = isMaster
        ? "Discuss who the Insider is, then start the vote"
        : "Discuss: who is the Insider?";
      break;
    case "judge":
      text = mustAct
        ? `Vote: is ${guesser} the Insider?`
        : viewer === state.guesser
          ? "Everyone is voting on you…"
          : `Waiting for votes (${state.voted.length}/${state.players.length - 1})`;
      break;
    case "accuse":
      text = mustAct
        ? "Point at the Insider"
        : `Waiting for votes (${state.voted.length}/${state.players.length})`;
      break;
    case "tiebreak":
      text = mustAct ? "It's a tie: cast the deciding vote" : `It's a tie: ${guesser} decides`;
      break;
  }
  return { text, activePlayers: waiting };
}

function eventText(state: State, e: GameEvent, viewer: Viewer): string {
  const Name = (id: PlayerId) => (id === viewer ? "You" : nameOf(state, id));
  switch (e.type) {
    case "newWord":
      return `${Name(e.player)} drew another word.`;
    case "started":
      return "Questions start now: ask yes/no questions!";
    case "found":
      return `${Name(e.guesser)} found the word: "${e.word}"!`;
    case "timeUp":
      return "Time's up! Nobody found the word.";
    case "voteStarted":
      return `Vote: is ${state.guesser === viewer ? "you" : nameOf(state, state.guesser!)} the Insider?`;
    case "voted":
      return `${Name(e.player)} voted.`;
    case "judged":
      return `${e.yes} of ${e.voters} voted that ${
        state.guesser === viewer ? "you are" : `${nameOf(state, state.guesser!)} is`
      } the Insider.${state.phase === "accuse" ? " Not a majority: now point at the Insider!" : ""}`;
    case "accused":
      return e.leaders.length === 1
        ? `Most votes: ${nameOf(state, e.leaders[0]!)} (${e.votes}).`
        : `Tie between ${e.leaders.map((id) => nameOf(state, id)).join(" and ")}.`;
    case "decided":
      return `${Name(e.player)} picked ${nameOf(state, e.target)}.`;
    case "over":
      return outcomeText(state);
  }
}

export function describeMove(
  _before: State,
  after: State,
  _player: PlayerId,
  _move: Move,
  viewer: Viewer,
): ActionDescription {
  const desc: ActionDescription = {
    text: after.events.map((e) => eventText(after, e, viewer)).join(" "),
  };
  const over = after.events.find((e) => e.type === "over");
  if (over?.type === "over") {
    const won = viewer !== "spectator" && winners(after).includes(viewer);
    const flash =
      over.outcome === "commons"
        ? "Insider caught!"
        : over.outcome === "insider"
          ? "The Insider wins!"
          : "Time's up!";
    return { ...desc, tone: won ? "good" : "bad", flash };
  }
  const found = after.events.find((e) => e.type === "found");
  if (found?.type === "found") return { ...desc, tone: "good", flash: `“${found.word}”` };
  return desc;
}
