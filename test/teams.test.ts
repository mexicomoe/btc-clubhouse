/**
 * THE TEAM MAKER, RUN RATHER THAN READ.
 *
 * teams.html is one file with no imports, like score.html, so its functions
 * are LIFTED OUT of the source by brace matching and run here.
 *
 * What is checked is everything that can put the wrong men on a team:
 *  · the feed, with a comma in every name, a BLIND, a blank and a repeat
 *  · the snake, exactly as the brief draws it for sixteen men
 *  · the awkward counts: 12, 13, 17, 21, 24, and 25, which must refuse
 *  · BLINDs spread one per team by the snake, never three on one team
 *  · locks kept through a reshuffle, swaps re-lettered
 *  · Copy: 24 lines, team then seat, names exactly as the feed spelled them
 *  · recent partners leaned away from, and never a refusal over it
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGE = readFileSync(new URL("../teams.html", import.meta.url), "utf8");

function fnSource(name: string): string {
  const at = PAGE.indexOf("function " + name + "(");
  assert.ok(at > -1, name + " is not in teams.html");
  let depth = 0;
  for (let i = PAGE.indexOf("{", at); i < PAGE.length; i++) {
    if (PAGE[i] === "{") depth++;
    else if (PAGE[i] === "}") { depth--; if (depth === 0) return PAGE.slice(at, i + 1); }
  }
  throw new Error("unbalanced braces in " + name);
}
function varSource(name: string): string {
  const m = PAGE.match(new RegExp("^var " + name + " = [^\\n]*;$", "m"));
  assert.ok(m, "var " + name + " is not in teams.html");
  return m![0];
}

const FNS = ["parseCsv", "parseIndex", "parseRoll", "teamCount", "dealOrder", "teamTotal",
  "teamWeight", "spread", "seatOrder", "arrange", "snakeOrder", "shuffledOrder", "pairKeys",
  "recentPairs", "repeatsIn", "makeTeams", "swapMen", "copyText", "weekKey", "rememberWeek"];
const P = new Function(
  ["ROLL_CSV", "MAX_TEAMS", "EVEN_SLACK", "TRIES"].map(varSource).join("\n") + "\n" +
  FNS.map(fnSource).join("\n") + "\nreturn {MAX_TEAMS,ROLL_CSV," + FNS.join(",") + "};")() as any;

/** A seeded random source, so a reshuffle is the same reshuffle every run. */
function seeded(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n men called "Man, A".. with indexes spread across Rob's 19-34. */
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function field(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: "Man, " + LETTERS[i], index: Math.round((19 + (15 * i) / Math.max(1, n - 1)) * 10) / 10, tee: "IV",
  }));
}
const names = (teams: any[]) => teams.map((t: any[]) => t.map(m => m.name.replace("Man, ", "")).join(""));
const blindsPer = (teams: any[]) => teams.map((t: any[]) => t.filter(m => m.blind).length);

/* ---------- the feed ---------- */

test("the roll call is read by heading, with a comma in every name", () => {
  const got = P.parseRoll([
    "name,index,tee",
    '"Tanenbaum, Rob",23.5,IV',
    '"Buyer, Chuck",23.6,IV',
    ",,",
    "BLIND,,",
    '"Tanenbaum, Rob",23.5,IV',
    '"Plus, Pete",+1.2,I',
    '"Nobody, Known",,IV',
  ].join("\n"));
  assert.equal(got.ok, true);
  assert.deepEqual(got.men.map((m: any) => m.name),
    ["Tanenbaum, Rob", "Buyer, Chuck", "Plus, Pete", "Nobody, Known"]);
  assert.equal(got.men[0].index, 23.5);
  assert.equal(got.men[2].index, -1.2, "a plus index is better than scratch");
  assert.deepEqual(got.twice, ["Tanenbaum, Rob"], "a repeat is reported, not silently dropped");
  assert.deepEqual(got.noIndex, ["Nobody, Known"]);
});

test("a feed with no name heading is not read as a field", () => {
  assert.equal(P.parseRoll("<!DOCTYPE html><html>").ok, false);
  assert.equal(P.parseRoll("").ok, false);
});

test("the page reads the roll call, never the Index feed", () => {
  // The Index feed follows Players, which this page fills: it would hand Rob
  // last week's men every Monday.
  assert.equal(/gid=1116052183&/.test(PAGE), false, "the Index feed's address is in teams.html");
  // The Playing feed tab, from Roll call, in the same published document as the others.
  assert.match(P.ROLL_CSV, /^https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/2PACX-1vQg-44HCczcIAcyn9_osr4HvnniZba5IV9wKlf-uNFjz_CaGDcYRnqYVz_n4L7dsPdcUJkynwk7lx4d\/pub\?gid=1365054493&single=true&output=csv$/);
  assert.match(PAGE, /cache:"no-store"/);
  assert.match(PAGE, /cachebust="\+Date\.now\(\)/);
});

/* ---------- the snake ---------- */

test("sixteen men deal exactly as the brief draws it", () => {
  // sorted A..P; team 1 A H I P, team 2 B G J O, team 3 C F K N, team 4 D E L M
  const r = P.makeTeams(field(16), { tries: 0 });
  assert.deepEqual(names(r.teams), ["AHIP", "BGJO", "CFKN", "DELM"]);
});

test("every team has one man from each quarter of the field, whatever the shuffle", () => {
  const men = field(24), T = 6;
  const deal = P.dealOrder(men);
  const quarter = (m: any) => Math.floor(deal.indexOf(m) / T);
  for (let seed = 1; seed <= 20; seed++) {
    const teams = P.arrange(deal, T, {}, P.shuffledOrder(T, seeded(seed)));
    for (const t of teams) assert.deepEqual(t.map(quarter).sort(), [0, 1, 2, 3]);
  }
});

test("A is the lowest index on the team, then B, C, D", () => {
  const r = P.makeTeams(field(16), { tries: 0 });
  for (const t of r.teams) {
    const ix = t.map((m: any) => m.index);
    assert.deepEqual(ix, [...ix].sort((a, b) => a - b));
  }
});

/* ---------- the awkward counts ---------- */

for (const [n, teams, blinds] of [[12, 3, 0], [13, 4, 3], [16, 4, 0], [17, 5, 3], [21, 6, 3], [24, 6, 0]] as const) {
  test(`${n} men make ${teams} teams with ${blinds} BLINDs`, () => {
    const r = P.makeTeams(field(n), { tries: 50, rand: seeded(n) });
    assert.equal(r.teams.length, teams);
    assert.ok(r.teams.every((t: any[]) => t.length === 4), "every team has four seats");
    const all = r.teams.flat();
    assert.equal(all.filter((m: any) => m.blind).length, blinds);
    assert.equal(all.filter((m: any) => !m.blind).length, n, "nobody is dropped");
    // ONE BLIND PER TEAM AT MOST — never one man and three BLINDs.
    assert.ok(blindsPer(r.teams).every(b => b <= 1), "BLINDs: " + blindsPer(r.teams));
    // And a BLIND always sits in D, the last seat.
    for (const t of r.teams) t.forEach((m: any, i: number) => { if (m.blind) assert.equal(i, 3); });
  });
}

test("13 men: the snake puts the BLINDs on teams 1-3, and team 4 is four men", () => {
  const r = P.makeTeams(field(13), { tries: 0 });
  assert.deepEqual(blindsPer(r.teams), [1, 1, 1, 0]);
  assert.equal(r.teams[0][3].name, "BLIND");
  assert.equal(P.copyText(r.teams).split("\n")[3], "BLIND", "spelled exactly that way");
});

test("a team with a BLIND is weighed man for man, not counted light", () => {
  // The bug this guards: raw totals made each BLIND team ~26 strokes "light",
  // so the evening-out piled the strong men onto the one full team.
  for (const n of [13, 17, 21]) {
    const r = P.makeTeams(field(n), { rand: seeded(n) });
    const full = P.makeTeams(field(n), { tries: 0 });
    assert.ok(P.spread(r.teams) <= 5, n + " men: spread " + P.spread(r.teams) + " (raw totals gave about 26)");
    assert.ok(P.spread(r.teams) <= P.spread(full.teams) + 1e-9, "never worse than the plain snake");
  }
  const t = [{ name: "a", index: 20 }, { name: "b", index: 30 }, { name: "c", index: 25 }, { name: "BLIND", index: null, blind: true }];
  assert.equal(P.teamWeight(t), 100);
  assert.equal(P.teamTotal(t), 75);
});

test("25 men is more than the sheet holds", () => {
  // The page refuses on screen (see the browser check); here, the arithmetic.
  assert.equal(P.teamCount(25), 7);
  assert.ok(P.teamCount(25) > P.MAX_TEAMS);
  assert.match(PAGE, /The sheet holds 24 — six teams of four\./);
});

/* ---------- the paste ---------- */

test("Rob is told to clear A4:A27 before pasting", () => {
  // A pasted blank line is not relied on to clear a cell; the Delete is.
  assert.match(PAGE, /<p id="clearFirst"><b>Select A4:A27 in Players, press Delete, then click in A4 and paste\.<\/b><\/p>\s*<button id="copy"/);
  assert.equal(/last week's names are cleared too/.test(PAGE), false, "the page no longer promises the paste clears them");
});

test("Copy is 24 lines, team then seat, spelled as the feed spelled them", () => {
  const men = [
    { name: "Tanenbaum, Rob", index: 23.5, tee: "IV" }, { name: "Wolberg, Larry", index: 30.1, tee: "IV" },
    { name: "Cooper, Ian", index: 19.4, tee: "III" }, { name: "Goodman, Bob", index: 33.0, tee: "IV" },
    { name: "Buyer, Chuck", index: 23.6, tee: "IV" },
  ];
  const r = P.makeTeams(men, { tries: 0 });
  const lines = P.copyText(r.teams).split("\n");
  assert.equal(lines.length, 24);
  // Two teams of four: 5 men and 3 BLINDs. Rows 4-7 then 8-11, A to D each.
  const real = lines.slice(0, 8);
  assert.deepEqual(real.filter(l => l !== "BLIND").sort(), men.map(m => m.name).sort());
  assert.deepEqual(lines.slice(8), Array(16).fill(""), "the unused rows go out blank, to clear last week");
});

/* ---------- moving men by hand ---------- */

test("a swap trades two men and re-letters both teams", () => {
  const r = P.makeTeams(field(16), { tries: 0 });
  const out = P.swapMen(r.teams, { team: 0, seat: 0 }, { team: 3, seat: 0 }); // A <-> D
  assert.deepEqual(names(out), ["DHIP", "BGJO", "CFKN", "AELM"]);
  assert.deepEqual(names(r.teams), ["AHIP", "BGJO", "CFKN", "DELM"], "the old teams are not touched");
});

test("a locked man stays on his team through every reshuffle", () => {
  const men = field(16);
  const locks = { "Man, A": 2, "Man, P": 2 };
  for (let seed = 1; seed <= 15; seed++) {
    const r = P.makeTeams(men, { locks, again: true, rand: seeded(seed), tries: 60 });
    const t3 = r.teams[2].map((m: any) => m.name);
    assert.ok(t3.includes("Man, A") && t3.includes("Man, P"), "seed " + seed + ": " + t3);
    assert.equal(r.teams.flat().length, 16);
  }
});

test("making them again gives a different set of teams", () => {
  const men = field(16);
  const first = P.makeTeams(men, { tries: 0 }).teams;
  const again = P.makeTeams(men, { again: true, current: first, rand: seeded(7) }).teams;
  assert.notDeepEqual(names(again).sort(), names(first).sort());
});

/* ---------- last week's partners ---------- */

test("recent partners are leaned away from", () => {
  const men = field(16);
  const lastWeek = P.makeTeams(men, { tries: 0 }).teams;
  const history = P.rememberWeek([], "2026-10-16", lastWeek);
  const r = P.makeTeams(men, { history, week: "2026-10-23", rand: seeded(3) });
  assert.equal(r.recent, 24, "16 men in 4 teams make 24 pairings");
  assert.ok(r.repeats < 24, "repeats: " + r.repeats);
  // Still even: within the slack of the snake's spread.
  assert.ok(P.spread(r.teams) <= P.spread(lastWeek) + 1.0 + 1e-9);
});

test("this week's own copy is not counted as last week", () => {
  const men = field(16);
  const teams = P.makeTeams(men, { tries: 0 }).teams;
  const history = P.rememberWeek([], "2026-10-23", teams);
  assert.equal(P.makeTeams(men, { history, week: "2026-10-23", tries: 0 }).recent, 0);
});

test("only pairings between two men playing this week count", () => {
  const history = [{ week: "2026-10-16", pairs: ["Man, A|Man, B", "Man, A|Gone, Man"] }];
  const r = P.makeTeams(field(16), { history, week: "2026-10-23", tries: 0 });
  assert.equal(r.recent, 1);
});

test("three weeks are kept, and a second Copy in a week replaces the first", () => {
  const t = P.makeTeams(field(8), { tries: 0 }).teams;
  let h: any[] = [];
  for (const w of ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-23"]) h = P.rememberWeek(h, w, t);
  assert.deepEqual(h.map(x => x.week), ["2026-10-09", "2026-10-16", "2026-10-23"]);
});

test("with no memory at all it still makes teams", () => {
  for (const history of [undefined, [], [null], [{}]]) {
    assert.equal(P.makeTeams(field(12), { history, tries: 5 }).teams.length, 3);
  }
});

/* ---------- the Friday these teams are for ---------- */

test("the week is the coming Friday, in Florida time", () => {
  // Mon 19 Oct, 9 AM Florida.
  assert.equal(P.weekKey(new Date("2026-10-19T13:00:00Z")), "2026-10-23");
  // Fri 16 Oct at 9 PM Florida is already Saturday in UTC — still next Friday.
  assert.equal(P.weekKey(new Date("2026-10-17T01:00:00Z")), "2026-10-23");
  // Thu 22 Oct, late evening Florida.
  assert.equal(P.weekKey(new Date("2026-10-23T03:00:00Z")), "2026-10-23");
});

/* ---------- the guarded memory, and the eyesight floors ---------- */

test("every storage read and write is wrapped", () => {
  const uses = PAGE.match(/localStorage\.[a-zA-Z]+\(/g) || [];
  assert.equal(uses.length, 2);
  assert.match(fnSource("loadHistory"), /try \{[\s\S]*localStorage\.getItem[\s\S]*catch/);
  assert.match(fnSource("saveHistory"), /try \{ localStorage\.setItem[\s\S]*catch/);
});

test("nothing is under 18px", () => {
  const css = PAGE.slice(PAGE.indexOf("<style>"), PAGE.indexOf("</style>"));
  const small = [...css.matchAll(/font-size:\s*(\d+)px/g)].map(m => Number(m[1])).filter(n => n < 18);
  assert.deepEqual(small, []);
});
