/**
 * THREE TABS, A GEAR, AND EVERY SHUT LINE SAYING WHERE IT STANDS.
 *
 * The structure tests — which tabs exist, what is reachable, the board's
 * collapse, the fixed bars, the stored-tab guard — live in boards.test.ts with
 * the rest of the leaderboard. This file is the two things those cannot reach:
 *
 *  1 · The shut summaries, RUN rather than read. Every one of them has to
 *      carry a figure, and carry it at ZERO as readily as at eight — a line
 *      that goes blank when there is nothing yet is a line nobody trusts when
 *      there is. So `drawFoldSubs` is lifted out of the page and executed
 *      against a stub document, which is the only way to see what it writes.
 *
 *  2 · The legibility floor and the accordion's scope, read off the source and
 *      the stylesheet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const APP = readFileSync(new URL("../leaderboard.html", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../clubhouse.css", import.meta.url), "utf8");

/* ---------- lifting drawFoldSubs out of the page ---------- */

/** The source of one top-level function, brace-matched. */
function fnSource(name: string): string {
  const at = APP.indexOf("function " + name + "(");
  assert.ok(at > -1, name + " is not in the app");
  let depth = 0;
  for (let i = APP.indexOf("{", at); i < APP.length; i++) {
    if (APP[i] === "{") depth++;
    else if (APP[i] === "}") { depth--; if (depth === 0) return APP.slice(at, i + 1); }
  }
  throw new Error("unbalanced braces in " + name);
}

type Written = Record<string, string>;

/** A document that only remembers what was written to it. */
function stubDoc(ids: string[]) {
  const written: Written = {};
  const nodes: Record<string, any> = {};
  for (const id of ids) {
    nodes[id] = {
      set textContent(v: string) { written[id] = v; },
      get textContent() { return written[id] ?? ""; },
      classList: { toggle() {} },
      closest: () => null,
    };
  }
  return { written, document: { getElementById: (id: string) => nodes[id] ?? null } };
}

const SUB_IDS = ["foldRosterSub", "foldRoundSub", "foldAddSub", "foldPicksSub",
                 "foldHitListSub", "foldImportSub", "goInvitesSub", "goRulesSub",
                 "goArchiveSub", "foldMoveSub", "foldAboutSub", "rosterHead"];

/** Run the page's own drawFoldSubs against a made-up round. */
function summaries(opts: {
  players?: any[]; roster?: any[]; scores?: string[];
  format?: string; allowance?: number; skins?: boolean;
  autoPicks?: boolean; autoHitList?: boolean; date?: string; events?: number;
} = {}): Written {
  const players = opts.players ?? [];
  const roster = opts.roster ?? [];
  const scored = new Set(opts.scores ?? []);
  const state = {
    name: "Friday", date: opts.date ?? "2026-08-28",
    format: opts.format ?? "Individual net",
    allowancePercent: opts.allowance ?? 100,
    players, autoPicks: opts.autoPicks === true, autoHitList: opts.autoHitList === true,
    invitesSent: {}, contests: null,
  };
  const { written, document } = stubDoc(SUB_IDS);
  const src = fnSource("drawFoldSubs") + "\n" + fnSource("dayAndDate") + "\ndrawFoldSubs();";
  const run = new Function(
    "state", "readyPlayers", "sixPlayers", "rosterMen", "inField", "playerFor", "DEFAULT_FORMAT",
    "skinsOn", "rosterPreview", "picksPreview", "E", "hasScores", "sixKey",
    "rulesChanged", "changedRulesNote", "store", "exportNote", "document", "window",
    "MONTHS", "DAYS", src);
  run(
    state,
    () => players.filter((p: any) => p.ready !== false),
    // No Index sheet in these rounds, so the six are the ready men.
    () => players.filter((p: any) => p.ready !== false),
    () => roster,
    (m: any) => players.some((p: any) => p.name === m.name),
    (m: any) => players.find((p: any) => p.name === m.name) ?? null,
    "Individual net",
    () => opts.skins !== false,
    null, null,
    { PICK_SLOTS: [{ key: "a" }, { key: "b" }] },
    (p: any) => scored.has(p.name),
    () => "six",
    () => false,
    () => "",
    { events: new Array(opts.events ?? 1).fill({}) },
    () => "Not yet exported.",
    document,
    { ClubhouseVersion: { build: "abc1234" } },
    ["January","February","March","April","May","June",
     "July","August","September","October","November","December"],
    ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
  );
  return written;
}

const man = (name: string, extra: any = {}) =>
  Object.assign({ name, a: null, b: null, hitList: "", index: 10, ready: true }, extra);

/* ---------- every shut line, at zero and at eight ---------- */

test("every shut section has a summary, and something fills it", () => {
  // A summary line with nothing written into it is a blank strip under a
  // heading, which reads as a screen that has not finished loading.
  const declared = [...APP.matchAll(/class="fsub" id="([A-Za-z]+)"/g)].map((m) => m[1]);
  assert.ok(declared.length >= 9, "found only " + declared.length + " summary lines");
  const fn = fnSource("drawFoldSubs");
  for (const id of declared) {
    assert.ok(fn.includes('say("' + id + '"'), id + " is declared but never written");
  }
});

test("AT ZERO every line still says something, and says a figure", () => {
  const w = summaries();
  for (const id of SUB_IDS) {
    assert.ok((w[id] ?? "").trim().length > 0, id + " is blank on an empty round");
  }
  assert.equal(w.foldRosterSub, "Nobody saved yet");
  assert.equal(w.foldAddSub, "Nobody in yet · 0 on the roster to tap in");
  assert.equal(w.foldPicksSub, "Nobody to give picks to yet");
  assert.equal(w.foldHitListSub, "Nobody to name yet");
  assert.equal(w.foldImportSub, "Nobody to take a card from yet");
  assert.equal(w.goInvitesSub, "Nobody to send to yet");
  // The one figure that is real even on an empty round.
  assert.equal(w.goArchiveSub, "1 round on this phone");
});

test("the roster line counts the men and how many are in this round", () => {
  const w = summaries({
    roster: [{ name: "A" }, { name: "B" }, { name: "C" }],
    players: [man("A")],
  });
  assert.equal(w.foldRosterSub, "3 men · 1 in this round");
  assert.equal(summaries({ roster: [{ name: "A" }] }).foldRosterSub, "1 man · 0 in this round");
});

test("the round line is the day, the format and the allowance", () => {
  // The brief's own example: Friday · August 29 · individual net · 100%.
  assert.equal(summaries({ date: "2026-08-28" }).foldRoundSub,
    "Friday · August 28 · Individual net · 100%");
  assert.equal(summaries({ date: "2026-08-28", allowance: 85 }).foldRoundSub,
    "Friday · August 28 · Individual net · 85%");
});

test("skins rides on the round line only when it is OFF", () => {
  // On is the ordinary case and needs nothing said. Off changes what the board
  // pays and must not be able to hide behind a shut heading.
  assert.equal(summaries({ skins: true }).foldRoundSub.includes("skins"), false);
  assert.match(summaries({ skins: false }).foldRoundSub, /· no skins$/);
});

test("the players line is who is in and who is left to tap in", () => {
  const w = summaries({
    roster: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }],
    players: [man("A"), man("B")],
  });
  assert.equal(w.foldAddSub, "2 in · 2 on the roster to tap in");
});

test("a man who cannot be scored yet is named on the line, and it reads wrong", () => {
  const w = summaries({ players: [man("A"), man("B", { ready: false })] });
  assert.match(w.foldAddSub, /2 in · 1 still needs an index and a tee/);
});

test("Watch the birdie says what becomes of the men with no picks", () => {
  const full = { a: 1, b: 2 };
  // Off: they score nothing, and the line says so rather than leaving a gap.
  assert.equal(
    summaries({ players: [man("A", full), man("B", full), man("C")] }).foldPicksSub,
    "2 of 3 picks in · 1 will score nothing");
  // On: they will be drawn for.
  assert.equal(
    summaries({ autoPicks: true, players: [man("A", full), man("B", full), man("C")] }).foldPicksSub,
    "2 of 3 picks in · 1 to draw");
  // Everybody in: no tail at all, because there is nothing left to say.
  assert.equal(summaries({ players: [man("A", full)] }).foldPicksSub, "1 of 1 picks in");
});

test("the Hit list says the same, and starts by saying they score nothing", () => {
  const players = [man("A", { hitList: "B" }), man("B", { hitList: "A" }), man("C")];
  assert.equal(summaries({ players }).foldHitListSub, "2 of 3 named · 1 will score nothing");
  assert.equal(summaries({ players, autoHitList: true }).foldHitListSub,
    "2 of 3 named · 1 to draw");
});

test("the cards line counts what has come in, including none", () => {
  const players = [man("A"), man("B"), man("C")];
  assert.equal(summaries({ players }).foldImportSub, "0 of 3 cards in");
  assert.equal(summaries({ players, scores: ["A", "B"] }).foldImportSub, "2 of 3 cards in");
  assert.equal(summaries({ players, scores: ["A", "B", "C"] }).foldImportSub, "3 of 3 cards in");
});

/* ---------- the accordion, and where it stops ---------- */

test("opening one section shuts the others — on that screen only", () => {
  /* The rule used to close every `details.fold.step` in the DOCUMENT, which was
     right when every step was on Setup. They are spread over two tabs now, and
     a document-wide rule would let opening The players shut The round on a
     screen nobody is looking at — a man would come back to a tab he left open
     and find it closed, with nothing to explain it. */
  const fn = fnSource("wireFolds");
  assert.match(fn, /const screen = d\.closest\("section\.screen"\) \|\| document;/,
    "the sweep is bounded by the screen the section is on");
  assert.match(fn, /screen\.querySelectorAll\("details\.fold\.step"\)/,
    "and it queries within that screen, not the document");
  assert.equal(/document\.querySelectorAll\("details\.fold\.step"\)/.test(fn), false,
    "a document-wide sweep is what this replaced");
});

test("the sections that are not steps stay out of it", () => {
  // Move this event and About sit behind the gear and are nobody's next action.
  const fn = fnSource("wireFolds");
  assert.match(fn, /d\.classList\.contains\("step"\)/);
});

/* ---------- the legibility floor ---------- */

test("nothing in the stylesheet sets type under 18px", () => {
  const small = [...CSS.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n < 18);
  assert.deepEqual(small, [], "under the floor: " + small.join(", "));
});

test("every tappable thing is at least 44px tall", () => {
  /* The men are seventy and up, reading a phone in Florida sun. 44 is the floor
     the brief sets; this app has always held to more, and the check is on the
     floor rather than the habit so that a new control cannot slip under it. */
  const rules = CSS.split("}").filter((r) => /min-height:\s*\d+px/.test(r));
  const bad = rules
    .map((r) => ({ h: Number(/min-height:\s*(\d+)px/.exec(r)![1]),
                   sel: r.split("{")[0].trim().replace(/\s+/g, " ") }))
    .filter((r) => r.h < 44 && /button|\.big|\.back|input|select|textarea|summary|a\./.test(r.sel));
  assert.deepEqual(bad, [], "under 44px: " + bad.map((b) => b.sel + " " + b.h).join(" · "));
});

test("nothing is laid out at a fixed width that could scroll a phone sideways", () => {
  // 375px is the narrowest phone in the group. A fixed width wider than that is
  // a sideways scroll, and a board read sideways is a board nobody reads.
  const wide = [...CSS.matchAll(/[^-]width:\s*(\d+)px/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n > 375);
  assert.deepEqual(wide, [], "wider than the narrowest phone: " + wide.join(", "));
  assert.match(CSS, /\.screen \{[^}]*max-width:/, "and the screen is capped, not fixed");
});

/* ---------- the prose came out ---------- */

test("the reasoning is in Settings, and only in Settings", () => {
  /* The three screens carry results. These are the paragraphs that used to sit
     on them, each named in the brief — they must be in the two Settings screens
     and nowhere else. */
  const howto = fnSource("drawHowTo");
  const qa = fnSource("drawQA");
  const settings = howto + qa;
  /* The source wraps, so a phrase is matched word by word across whatever
     whitespace the line break left in it. Each phrase is one that exists ONLY
     in the copy that moved — not in a comment explaining why it moved. */
  const phrase = (words: string) =>
    new RegExp(words.trim().split(/\s+/).map((w) =>
      w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"));
  const moved: [string, RegExp][] = [
    ["the skins floor", phrase("a lean day makes each one worth")],
    ["best two balls", phrase("handed a threesome a quarter more skins than a foursome")],
    ["flights", phrase("A way of dividing the field so that placings are settled")],
    ["the measured message lengths", phrase("arrived first time; 250 and 299 each failed")],
    ["what the roster is for", phrase("The men on <b>Start a round</b> outlive a round")],
    ["why a drawn opponent is different", phrase("puts <b>another man</b> in it")],
  ];
  for (const [what, re] of moved) {
    assert.match(settings, re, what + " is not in Settings");
  }

  /* AND GONE FROM EVERY SCREEN THAT DRAWS ONE OF THE THREE TABS.
     The comments are stripped first. This is a rule about what a man READS on
     a working screen, not about what a programmer reads in the source — and the
     source is exactly where the note saying why a paragraph moved belongs. */
  const stripComments = (src: string) =>
    src.replace(/\/\*[^]*?\*\//g, " ")
       .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  const screens = ["renderStart", "renderRound", "renderBoard", "drawBoards",
                   "showPicksBox", "showHitListBox", "showPickLinkBox",
                   "drawAutoPicksSwitch", "drawAutoHitListSwitch", "drawEventBox",
                   "drawAllowance", "renderImport", "drawRosterPick", "renderRoster",
                   "skinsSectionHtml"].map(fnSource).map(stripComments).join("\n");
  for (const [what, re] of moved) {
    assert.doesNotMatch(screens, re, what + " is still on a working screen");
  }
});

test("no screen sends a man to a tab that no longer exists", () => {
  // "on the Setup tab", "on Import" — pointers that were right before the
  // rebuild and would now name a screen nobody can find.
  const body = APP.slice(APP.indexOf("<script>\n\"use strict\";"));
  for (const stale of [/the <b>Setup<\/b> tab/, /on <b>Import<\/b>/, /<b>Setup → /]) {
    assert.doesNotMatch(body, stale, "a pointer to a screen that is gone: " + stale);
  }
});
