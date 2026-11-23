import { createRng } from "@utopia/kit";
import { describe, expect, it } from "vitest";
import { configSchema } from "./config.js";
import {
  WORDS,
  applyMove,
  describeMove,
  getLegalMoves,
  getPlayerView,
  getResult,
  getStatus,
  insiderOf,
  setup,
  validateMove,
  waitingOn,
  type Move,
  type Role,
  type State,
} from "./logic.js";

const PLAYERS = ["ann", "bob", "cy", "dee", "eve", "fay"].map((id) => ({
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  color: "#888",
}));

/** Ann is the Master, Bob the Insider, everyone else a Common. Word: "penguin". */
function newGame(count = 5): State {
  const s = setup({ players: PLAYERS.slice(0, count), rng: createRng(1) }, configSchema.parse({}));
  const roles: Record<string, Role> = Object.fromEntries(
    s.players.map((p, i) => [p.id, i === 0 ? "master" : i === 1 ? "insider" : "common"]),
  );
  return { ...s, roles, master: "ann", word: "penguin" };
}

const play = (state: State, player: string, move: Move): State => {
  const error = validateMove(state, player, move);
  if (error) throw new Error(`${player} ${JSON.stringify(move)}: ${error}`);
  return applyMove(state, player, move, { rng: createRng(7) });
};

/** Through the questions: `guesser` finds the word after 90 seconds; discussion; vote 1 opens. */
function toVote(guesser: string, count = 5): State {
  let s = play(newGame(count), "ann", { type: "start" });
  s = play(s, "ann", { type: "found", guesser, seconds: 90 });
  return play(s, "ann", { type: "startVote" });
}

function judge(s: State, votes: Record<string, boolean>): State {
  for (const [p, insider] of Object.entries(votes)) s = play(s, p, { type: "judge", insider });
  return s;
}

function accuse(s: State, votes: Record<string, string>): State {
  for (const [p, target] of Object.entries(votes)) s = play(s, p, { type: "accuse", target });
  return s;
}

describe("setup", () => {
  it("deals one Master, one Insider and Commons, and picks a word", () => {
    for (const n of [4, 6, 8]) {
      const players = Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
        color: "#888",
      }));
      const s = setup({ players, rng: createRng(n) }, configSchema.parse({}));
      const roles = Object.values(s.roles);
      expect(roles.filter((r) => r === "master")).toHaveLength(1);
      expect(roles.filter((r) => r === "insider")).toHaveLength(1);
      expect(roles.filter((r) => r === "common")).toHaveLength(n - 2);
      expect(s.roles[s.master]).toBe("master");
      expect(WORDS).toContain(s.word);
    }
  });

  it("only the Master and the Insider see the word; everyone sees who the Master is", () => {
    const s = newGame();
    expect(getPlayerView(s, "ann")).toMatchObject({
      role: "master",
      word: "penguin",
      master: "ann",
    });
    expect(getPlayerView(s, "bob")).toMatchObject({ role: "insider", word: "penguin" });
    expect(getPlayerView(s, "cy")).toMatchObject({ role: "common", word: null, roles: null });
    expect(JSON.stringify(getPlayerView(s, "cy"))).not.toContain("penguin");
    expect(JSON.stringify(getPlayerView(s, "cy"))).not.toContain('insider"');
  });

  it("the Master can draw another word before starting", () => {
    const s = play(newGame(), "ann", { type: "newWord" });
    expect(s.word).not.toBe("penguin");
    expect(getLegalMoves(s, "bob")).toEqual([]);
  });
});

describe("questions and discussion", () => {
  it("the Master marks who found the word; it's then public", () => {
    let s = play(newGame(), "ann", { type: "start" });
    expect(getStatus(s, "ann").text).toBe("Answer only YES, NO or I DON'T KNOW");
    expect(getStatus(s, "cy").text).toBe("Ask Ann yes/no questions to find the word");
    expect(validateMove(s, "ann", { type: "found", guesser: "ann", seconds: 10 })).toMatch(
      /other players/,
    );
    expect(validateMove(s, "cy", { type: "found", guesser: "cy", seconds: 10 })).toMatch(
      /not your turn/,
    );
    s = play(s, "ann", { type: "found", guesser: "cy", seconds: 999 });
    expect(s.phase).toBe("discussion");
    expect(s.questionSeconds).toBe(300); // capped at the time allowed
    const untimed = play(play(newGame(), "ann", { type: "start" }), "ann", {
      type: "found",
      guesser: "cy",
      seconds: 0,
    });
    expect(untimed.questionSeconds).toBe(300); // no time measured: the full time
    expect(getPlayerView(s, "dee").word).toBe("penguin");
    expect(
      describeMove(s, s, "ann", { type: "found", guesser: "cy", seconds: 1 }, "dee"),
    ).toMatchObject({
      text: 'Cy found the word: "penguin"!',
      tone: "good",
    });
  });

  it("if time runs out, everyone loses", () => {
    let s = play(newGame(), "ann", { type: "start" });
    s = play(s, "ann", { type: "timeUp" });
    expect(getResult(s)).toEqual({
      winners: [],
      text: 'Time ran out: everyone loses. The word was "penguin"; Bob was the Insider.',
    });
  });
});

describe("vote 1: is the Guesser the Insider?", () => {
  it("votes are secret until everyone has voted; the Guesser doesn't vote", () => {
    let s = toVote("cy");
    expect(waitingOn(s)).toEqual(["ann", "bob", "dee", "eve"]);
    s = judge(s, { ann: true });
    expect(getPlayerView(s, "bob").judgeVotes).toBeNull();
    expect(getStatus(s, "ann").text).toBe("Waiting for votes (1/4)");
    expect(getLegalMoves(s, "cy")).toEqual([]);
  });

  it("majority yes on the real Insider: Master and Commons win", () => {
    const s = judge(toVote("bob"), { ann: true, cy: true, dee: true, eve: false });
    expect(getResult(s)?.winners).toEqual(["ann", "cy", "dee", "eve"]);
  });

  it("majority yes on an innocent Guesser: the Insider wins", () => {
    const s = judge(toVote("cy"), { ann: true, bob: true, dee: true, eve: false });
    expect(getResult(s)).toEqual({ winners: ["bob"], text: "Bob wins as the Insider!" });
  });

  it("no majority (a tie is not one) on the real Insider: the Insider wins", () => {
    const s = judge(toVote("bob"), { ann: true, cy: true, dee: false, eve: false });
    expect(getResult(s)?.winners).toEqual(["bob"]);
  });

  it("no majority on an innocent Guesser: on to vote 2, with the tally shown", () => {
    const s = judge(toVote("cy"), { ann: false, bob: false, dee: true, eve: false });
    expect(s.phase).toBe("accuse");
    expect(getPlayerView(s, "eve").judgeVotes).toEqual({
      ann: false,
      bob: false,
      dee: true,
      eve: false,
    });
    expect(describeMove(s, s, "eve", { type: "judge", insider: false }, "eve").text).toBe(
      "You voted. 1 of 4 voted that Cy is the Insider. Not a majority: now point at the Insider!",
    );
  });
});

describe("vote 2: find the Insider", () => {
  const vote2 = () => judge(toVote("cy"), { ann: false, bob: false, dee: false, eve: false });

  it("everyone points at someone (not themselves, not the Master)", () => {
    const s = vote2();
    expect(getLegalMoves(s, "dee").map((m) => m.label)).toEqual([
      "It's Bob",
      "It's Cy",
      "It's Eve",
    ]);
  });

  it("most votes on the Insider: Master and Commons win", () => {
    const s = accuse(vote2(), { ann: "bob", bob: "eve", cy: "bob", dee: "bob", eve: "dee" });
    expect(getResult(s)?.text).toBe("The Master and Commons win! Bob was the Insider.");
    expect(describeMove(s, s, "eve", { type: "accuse", target: "dee" }, "bob")).toMatchObject({
      tone: "bad",
      flash: "Insider caught!",
    });
  });

  it("most votes on someone else: the Insider wins", () => {
    const s = accuse(vote2(), { ann: "eve", bob: "eve", cy: "bob", dee: "eve", eve: "dee" });
    expect(getResult(s)?.winners).toEqual(["bob"]);
  });

  it("a tie is decided by the Guesser", () => {
    let s = accuse(vote2(), { ann: "bob", bob: "eve", cy: "bob", dee: "eve", eve: "dee" });
    expect(s.phase).toBe("tiebreak");
    expect(waitingOn(s)).toEqual(["cy"]);
    expect(getLegalMoves(s, "cy").map((m) => m.label)).toEqual(["It's Bob", "It's Eve"]);
    expect(getStatus(s, "dee").text).toBe("It's a tie: Cy decides");
    s = play(s, "cy", { type: "decide", target: "bob" });
    expect(getResult(s)?.winners).toEqual(["ann", "cy", "dee", "eve"]);
    expect(getPlayerView(s, "dee").roles?.bob).toBe("insider");
  });
});

describe("random games", () => {
  it("always end with a result, for 4–8 players", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const n = 4 + (seed % 5);
      const players = Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
        color: "#888",
      }));
      let s = setup({ players, rng: createRng(seed) }, configSchema.parse({}));
      const rng = createRng(seed * 3);
      for (let step = 0; step < 100 && !getResult(s); step++) {
        const options = players.flatMap((p) =>
          getLegalMoves(s, p.id).map((m) => ({ p: p.id, m: m.move })),
        );
        expect(options.length).toBeGreaterThan(0);
        const pick = rng.pick(options);
        s = play(s, pick.p, pick.m);
      }
      expect(getResult(s)).not.toBeNull();
      expect(insiderOf(s)).toBeTruthy();
    }
  });
});
