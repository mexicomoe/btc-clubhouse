/**
 * THE TEAM MAKER, RUN RATHER THAN READ.
 *
 * teams.html is one file with no imports, like score.html, so its functions
 * are LIFTED OUT of the source by brace matching and run here.
 *
 * What is checked is everything that can put the wrong men on a team:
 *  · the feed, with a comma in every name, a BLIND, a blank and a repeat
 *  · Rob's real field of 23 October, 0.6 strokes apart and not 6.5
 *  · the awkward counts: 12, 13, 17, 21, 24, and 25, which must refuse
 *  · BLINDs spread one per team, never three on one team
 *  · locks kept through a reshuffle, swaps re-lettered
 *  · Copy: 24 lines, team then seat, names exactly as the feed spelled them
 *  · recent partners leaned away from, and never a refusal over it
 *  · the Pairs log: no two men together three weeks running, unless a lock
 *    or the 2.0-stroke ceiling forces it, and then said by name
 *  · no browser memory anywhere: the sheet is the only history
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
  "teamWeight", "spread", "seatOrder", "seatFixed", "fillSeats", "unevenness", "lessUneven", "climb", "nameKey",
  "pairKeys", "repeatsIn", "barTable", "barredIn", "parseLogDate", "parsePairsLog", "pairHistory", "makeTeams", "swapMen", "copyText",
  "weekKey", "shortDate", "ordinal", "historyLine", "allowedLines"];
const P = new Function(
  ["ROLL_CSV", "PAIRS_CSV", "MAX_TEAMS", "EVEN_SLACK", "MAX_DRIFT", "TRIES"].map(varSource).join("\n") + "\n" +
  FNS.map(fnSource).join("\n") + "\nreturn {MAX_TEAMS,MAX_DRIFT,ROLL_CSV," + FNS.join(",") + "};")() as any;

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

/* ---------- the most even totals, and nothing else ---------- */

/** Rob's 12 men for Friday 23 October, from the Playing feed. */
const OCT23 = [
  ["Tanenbaum, Rob", 23.5], ["Buyer, Chuck", 23.6], ["Cooper, Ian", 28], ["Finkelstein, Dave", 24.8],
  ["Gidaly, Mitch", 22], ["Goodman, Bob", 22.1], ["Granville, Loren", 25], ["Haskin, Bruce", 19.3],
  ["Rothman, Bob", 25.6], ["Smith, Alan", 26.8], ["Weissman, Marty", 38.9], ["Wolberg, Larry", 27.7],
].map(([name, index]) => ({ name, index, tee: "IV" }));

test("Rob's real field of 23 October comes out 0.6 strokes apart, every tap", () => {
  // The quarter rule could do no better than 6.5 here: Marty Weissman at 38.9
  // is eleven strokes above the next man. 0.6 is the best possible split of
  // these twelve, found by trying every one.
  for (let seed = 1; seed <= 10; seed++) {
    const r = P.makeTeams(OCT23, { rand: seeded(seed) });
    assert.equal(P.spread(r.teams), 0.6, "seed " + seed);
    const marty = r.teams.find((t: any[]) => t.some(m => m.name === "Weissman, Marty"));
    assert.deepEqual(marty.map((m: any) => m.name),
      ["Haskin, Bruce", "Gidaly, Mitch", "Goodman, Bob", "Weissman, Marty"]);
  }
});

test("there is no one-man-per-quarter rule, and the reason is written down", () => {
  // A later session must not put it back: it balanced a team's shape, not its strength.
  assert.match(PAGE, /Do not put the quarter rule back\./);
  assert.equal(/function (arrange|snakeOrder|shuffledOrder)\(/.test(PAGE), false);
  // On Rob's field the even answer puts three first-quarter men on one team.
  const r = P.makeTeams(OCT23, { rand: seeded(1) });
  const q1 = ["Haskin, Bruce", "Gidaly, Mitch", "Goodman, Bob"];
  assert.ok(r.teams.some((t: any[]) => q1.every(n => t.some(m => m.name === n))));
});

test("the gap is shown on screen", () => {
  assert.match(PAGE, /"Gap between the heaviest and lightest team: "\+spread\(S\.teams\)\.toFixed\(1\)\+" strokes"/);
});

test("evenly spread fields come out within a stroke", () => {
  for (const n of [12, 16, 20, 24]) {
    const r = P.makeTeams(field(n), { rand: seeded(n) });
    assert.ok(P.spread(r.teams) <= 1.0, n + " men: gap " + P.spread(r.teams));
  }
});

test("A is the lowest index on the team, then B, C, D", () => {
  const r = P.makeTeams(field(16), { tries: 1 });
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

test("13 men: the BLINDs go on teams 1-3, and team 4 is four men", () => {
  const r = P.makeTeams(field(13), { rand: seeded(13) });
  assert.deepEqual(blindsPer(r.teams), [1, 1, 1, 0]);
  assert.equal(r.teams[0][3].name, "BLIND");
  assert.equal(P.copyText(r.teams).split("\n")[3], "BLIND", "spelled exactly that way");
});

test("a team with a BLIND is weighed man for man, not counted light", () => {
  // The bug this guards: raw totals made each BLIND team ~26 strokes "light",
  // so the evening-out piled the strong men onto the one full team.
  for (const n of [13, 17, 21]) {
    const r = P.makeTeams(field(n), { rand: seeded(n) });
    assert.ok(P.spread(r.teams) <= 2, n + " men: gap " + P.spread(r.teams) + " (raw totals gave about 26)");
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
  const r = P.makeTeams(men, { rand: seeded(5) });
  const lines = P.copyText(r.teams).split("\n");
  assert.equal(lines.length, 24);
  // Two teams of four: 5 men and 3 BLINDs. Rows 4-7 then 8-11, A to D each.
  const real = lines.slice(0, 8);
  assert.deepEqual(real.filter(l => l !== "BLIND").sort(), men.map(m => m.name).sort());
  assert.deepEqual(lines.slice(8), Array(16).fill(""), "the unused rows go out blank, to clear last week");
});

/* ---------- moving men by hand ---------- */

test("a swap trades two men and re-letters both teams", () => {
  const r = P.makeTeams(field(16), { rand: seeded(2) });
  const before = names(r.teams);
  const x = r.teams[0][0].name, y = r.teams[3][3].name;
  const out = P.swapMen(r.teams, { team: 0, seat: 0 }, { team: 3, seat: 3 });
  assert.ok(out[0].some((m: any) => m.name === y) && out[3].some((m: any) => m.name === x));
  for (const t of out) { const ix = t.map((m: any) => m.index); assert.deepEqual(ix, [...ix].sort((a, b) => a - b)); }
  assert.deepEqual(names(r.teams), before, "the old teams are not touched");
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
  const first = P.makeTeams(men, { rand: seeded(1) }).teams;
  const again = P.makeTeams(men, { again: true, current: first, rand: seeded(7) }).teams;
  assert.notDeepEqual(names(again).sort(), names(first).sort());
});

/* ---------- the Pairs log ---------- */

/** A published Pairs log: column A Rob's seat labels, then row 1 the dates, rows 2-25 the seats. */
const SEAT_LABELS = Array.from({ length: 24 }, (_, i) => (Math.floor(i / 4) + 1) + "ABCD"[i % 4]);
function logCsv(cols: { date: string; names: string[] }[], labelHead = "") {
  const q = (x: string) => '"' + x.replace(/"/g, '""') + '"';
  cols = [{ date: labelHead, names: SEAT_LABELS }, ...cols];
  const rows = [cols.map(c => q(c.date))];
  for (let r = 0; r < 24; r++) rows.push(cols.map(c => q(c.names[r] ?? "")));
  return rows.map(r => r.join(",")).join("\r\n");
}
/** Teams of letters, e.g. ["ABCD","EFGH"], as a column of "Man, X" names. */
const col = (date: string, teams: string[]) =>
  ({ date, names: teams.flatMap(t => t.padEnd(4, " ").split("").map(ch => ch === " " ? "" : ch === "*" ? "BLIND" : "Man, " + ch)) });
const key = (a: string, b: string) => [P.nameKey("Man, " + a), P.nameKey("Man, " + b)].sort().join("|");
const together = (teams: any[], a: string, b: string) =>
  teams.some((t: any[]) => t.some(m => m.name === "Man, " + a) && t.some(m => m.name === "Man, " + b));
const men = (spec: Record<string, number>) => Object.entries(spec).map(([k, v]) => ({ name: "Man, " + k, index: v, tee: "IV" }));

test("the log is read as rounds: a comma in every name, BLIND and blanks dropped, six teams to row 25", () => {
  const names = Array.from({ length: 24 }, (_, i) => "Surname" + i + ", First");
  names[3] = "BLIND"; names[22] = ""; names[23] = "  Spaced ,  Out ";
  const got = P.parsePairsLog(logCsv([{ date: "10/16/2026", names }]));
  assert.equal(got.rounds.length, 1);
  assert.equal(got.rounds[0].week, "2026-10-16");
  assert.equal(got.rounds[0].teams.length, 6, "rows 22-25 are a sixth team");
  assert.deepEqual(got.rounds[0].teams[0], ["Surname0, First", "Surname1, First", "Surname2, First"]);
  assert.deepEqual(got.rounds[0].teams[5], ["Surname20, First", "Surname21, First", "Spaced , Out"]);
});

test("column A, Rob's seat labels, is never a round — even with a date above it", () => {
  for (const head of ["", "Seat", "10/16/2026"]) {
    const got = P.parsePairsLog(logCsv([col("10/23/2026", ["ABCD"])], head));
    assert.deepEqual(got.rounds.map((r: any) => r.week), ["2026-10-23"], "A1 = " + JSON.stringify(head));
    assert.deepEqual(got.bad, []);
  }
});

test("round dates are read in the forms a sheet publishes, and a bad one is reported, not guessed", () => {
  assert.equal(P.parseLogDate("2026-10-23"), "2026-10-23");
  assert.equal(P.parseLogDate("10/23/2026"), "2026-10-23");
  assert.equal(P.parseLogDate("Oct 23, 2026"), "2026-10-23");
  assert.equal(P.parseLogDate("Fri 23 Oct"), null, "no year, not trusted");
  assert.equal(P.parseLogDate(""), null);
  const got = P.parsePairsLog(logCsv([col("Seat", ["ABCD"]), col("23/10", ["ABCD"]), col("2026-10-23", ["EFGH"])]));
  assert.deepEqual(got.bad, ["23/10"], "a label column with no digits is not a round, and not a complaint");
  assert.deepEqual(got.rounds.map((r: any) => r.week), ["2026-10-23"]);
});

test("rounds come out oldest first, whatever the column order", () => {
  const got = P.parsePairsLog(logCsv([col("2026-10-23", ["ABCD"]), col("2026-10-09", ["ABCD"]), col("2026-10-16", ["ABCD"])]));
  assert.deepEqual(got.rounds.map((r: any) => r.week), ["2026-10-09", "2026-10-16", "2026-10-23"]);
});

test("a column dated this Friday or later is an unplayed round and does not count", () => {
  const { rounds } = P.parsePairsLog(logCsv([
    col("2026-10-16", ["ABCD"]), col("2026-10-23", ["ABCD"]), col("2026-10-30", ["ABCD"]), col("2026-11-06", ["ABCD"])]));
  const ph = P.pairHistory(rounds, "2026-10-30", field(8));
  assert.deepEqual(ph.rounds, ["2026-10-16", "2026-10-23"]);
  assert.ok(ph.barred[key("A", "B")]);
});

test("barred only if together in BOTH of the last two rounds; one week is fine", () => {
  const { rounds } = P.parsePairsLog(logCsv([
    col("2026-10-09", ["EFGH"]),
    col("2026-10-16", ["ABCD", "EFGH"]),
    col("2026-10-23", ["ABEF", "CDGH"]),
  ]));
  const ph = P.pairHistory(rounds, "2026-10-30", field(8));
  assert.deepEqual(Object.keys(ph.barred).sort(), [key("A", "B"), key("C", "D"), key("E", "F"), key("G", "H")].sort());
  assert.ok(ph.recent[key("A", "C")] && !ph.barred[key("A", "C")], "together once: recent, not barred");
  assert.ok(!ph.recent[key("A", "H")]);
  assert.equal(ph.weeks[key("A", "B")], 3, "two weeks logged, so this would be the third");
  assert.equal(ph.weeks[key("E", "F")], 4, "three weeks logged");
  assert.equal(ph.weeks[key("A", "C")], 1, "apart last week, so the run starts again");
});

test("only pairs of two men both playing this week count", () => {
  const { rounds } = P.parsePairsLog(logCsv([col("2026-10-16", ["ABYZ"]), col("2026-10-23", ["ABYZ"])]));
  const ph = P.pairHistory(rounds, "2026-10-30", field(8));
  assert.deepEqual(Object.keys(ph.barred), [key("A", "B")]);
});

test("names match across the feed and the log despite case and spacing", () => {
  const { rounds } = P.parsePairsLog(logCsv([
    { date: "2026-10-16", names: ["SMITH,  Joe", "jones, bob"] }, { date: "2026-10-23", names: ["Smith, Joe ", "Jones, Bob"] }]));
  const ph = P.pairHistory(rounds, "2026-10-30", [{ name: "Smith, Joe", index: 20 }, { name: "Jones, Bob", index: 21 }]);
  assert.equal(Object.keys(ph.barred).length, 1);
});

test("with one round logged nobody is barred, but last week's partners are still leaned away from", () => {
  const { rounds } = P.parsePairsLog(logCsv([col("2026-10-23", ["ABCD", "EFGH"])]));
  const ph = P.pairHistory(rounds, "2026-10-30", field(8));
  assert.equal(Object.keys(ph.barred).length, 0);
  assert.equal(Object.keys(ph.recent).length, 12);
});

/* ---------- the rule at work ---------- */

test("a barred pair is split when it costs little", () => {
  // Rob's spread of indexes; A and B were together the last two weeks.
  const m = field(16);
  const { rounds } = P.parsePairsLog(logCsv([col("2026-10-16", ["ABCD", "EFGH", "IJKL", "MNOP"]), col("2026-10-23", ["ABEF", "CDGH", "IJMN", "KLOP"])]));
  const ph = P.pairHistory(rounds, "2026-10-30", m);
  for (let s = 1; s <= 5; s++) {
    const r = P.makeTeams(m, { pairs: ph, rand: seeded(s) });
    assert.equal(Object.keys(r.allowed).length, 0, "seed " + s);
    for (const [a, b] of [["A", "B"], ["I", "J"], ["K", "L"], ["O", "P"]]) assert.ok(!together(r.teams, a, b), a + b + " seed " + s);
    assert.ok(P.spread(r.teams) <= P.MAX_DRIFT + 1e-9);
  }
});

test("the ceiling: split at exactly 2.0 strokes, allowed past it", () => {
  const log = P.parsePairsLog(logCsv([col("2026-10-16", ["XY"]), col("2026-10-23", ["XY"])]));
  // Splitting X and Y costs a 2.0 gap: split.
  const at = men({ X: 19, Y: 21, C: 20, D: 20, E: 20, F: 20, G: 20, H: 20 });
  const r1 = P.makeTeams(at, { pairs: P.pairHistory(log.rounds, "2026-10-30", at), rand: seeded(2) });
  assert.ok(!together(r1.teams, "X", "Y"));
  assert.equal(P.spread(r1.teams), 2);
  // 2.2: balance wins, the pair is allowed, and why is recorded.
  const past = men({ X: 18.9, Y: 21.1, C: 20, D: 20, E: 20, F: 20, G: 20, H: 20 });
  const r2 = P.makeTeams(past, { pairs: P.pairHistory(log.rounds, "2026-10-30", past), rand: seeded(2) });
  assert.ok(together(r2.teams, "X", "Y"));
  assert.equal(P.spread(r2.teams), 0);
  assert.deepEqual(r2.allowed, { [key("X", "Y")]: "balance" });
});

test("Rob's 6.5-stroke failure can't come back through the pair rule", () => {
  // The 38.9 man is the one far out: barring him from the three lowest must
  // not drag the field to a lopsided split.
  const m = men({ Z: 38.9, A: 19, B: 19.5, C: 20, D: 24, E: 25, F: 25.5, G: 26, H: 26.5, I: 27, J: 27.5, K: 28 });
  const { rounds } = P.parsePairsLog(logCsv([col("2026-10-16", ["ZABC"]), col("2026-10-23", ["ZABC"])]));
  const r = P.makeTeams(m, { pairs: P.pairHistory(rounds, "2026-10-30", m), rand: seeded(4) });
  assert.ok(P.spread(r.teams) <= P.MAX_DRIFT + 1e-9, "spread " + P.spread(r.teams));
});

test("locks win over the rule, and the lock is named as the cause", () => {
  const m = field(8);
  const { rounds } = P.parsePairsLog(logCsv([col("2026-10-16", ["AB"]), col("2026-10-23", ["AB"])]));
  const r = P.makeTeams(m, { pairs: P.pairHistory(rounds, "2026-10-30", m), locks: { "Man, A": 1, "Man, B": 1 }, rand: seeded(1) });
  assert.ok(together(r.teams, "A", "B"));
  assert.deepEqual(r.allowed, { [key("A", "B")]: "lock" });
});

test("when there is no way round it, teams are still made and the pair is named", () => {
  const m = field(4);
  const { rounds } = P.parsePairsLog(logCsv([col("2026-10-16", ["ABCD"]), col("2026-10-23", ["ABCD"])]));
  const r = P.makeTeams(m, { pairs: P.pairHistory(rounds, "2026-10-30", m), tries: 5 });
  assert.equal(r.teams.length, 1);
  assert.equal(Object.keys(r.allowed).length, 6);
  assert.ok(Object.values(r.allowed).every(v => v === "stuck"));
});

test("recent partners are still leaned away from, under the rule", () => {
  const m = field(16);
  const lastWeek = P.makeTeams(m, { rand: seeded(1) }).teams;
  const names = lastWeek.flat().map((x: any) => x.name);
  const { rounds } = P.parsePairsLog(logCsv([{ date: "2026-10-23", names }]));
  const r = P.makeTeams(m, { pairs: P.pairHistory(rounds, "2026-10-30", m), rand: seeded(3) });
  assert.equal(r.recent, 24, "16 men in 4 teams make 24 pairings");
  assert.ok(r.repeats <= 6, "repeats: " + r.repeats);
  assert.ok(P.spread(r.teams) <= P.spread(lastWeek) + 0.5 + 1e-9);
});

test("with no history at all, or a broken one, it still makes teams", () => {
  for (const pairs of [undefined, {}, P.pairHistory([], "2026-10-30", field(12)), P.pairHistory([null, {}], "2026-10-30", field(12))]) {
    assert.equal(P.makeTeams(field(12), { pairs, tries: 5 }).teams.length, 3);
  }
  assert.deepEqual(P.parsePairsLog("").rounds, []);
  assert.deepEqual(P.parsePairsLog("<!DOCTYPE html><html>Sign in</html>").rounds, []);
});

/* ---------- what the screen says ---------- */

test("the history line names the rounds read, or says plainly that none were", () => {
  const ph = (r: string[]) => ({ rounds: r });
  assert.equal(P.historyLine({ state: "ok", bad: [] }, ph(["2026-10-16", "2026-10-23"])), "History: rounds of 16 Oct and 23 Oct.");
  assert.match(P.historyLine({ state: "ok", bad: [] }, ph(["2026-10-23"])), /^History: round of 23 Oct only\. The two-week rule needs two\.$/);
  assert.match(P.historyLine({ state: "ok", bad: [] }, ph([])), /no rounds in the Pairs log before this Friday/);
  assert.match(P.historyLine({ state: "fail" }, ph([])), /^Couldn't read the Pairs log, so no history was used/);
  assert.match(P.historyLine({ state: "unset" }, ph([])), /address isn't set yet/);
  assert.match(P.historyLine({ state: "ok", bad: ["23/10"] }, ph(["2026-10-16", "2026-10-23"])), /Couldn't read the date on one column of the Pairs log \(23\/10\)/);
});

test("an allowed pair is said by name, with weeks running and why — a hand swap included", () => {
  const m = field(8);
  const { rounds } = P.parsePairsLog(logCsv([col("2026-10-09", ["AB"]), col("2026-10-16", ["AB"]), col("2026-10-23", ["AB"])]));
  const ph = P.pairHistory(rounds, "2026-10-30", m);
  const teams = [[m[0], m[1], m[2], m[3]], [m[4], m[5], m[6], m[7]]];
  assert.deepEqual(P.allowedLines(teams, ph, { [key("A", "B")]: "balance" }, {}),
    ["Had to allow Man, A & Man, B — together a 4th week running, because splitting them pushed the gap past 2.0 strokes."]);
  assert.match(P.allowedLines(teams, ph, {}, {})[0], /because they were swapped together by hand\.$/);
  assert.match(P.allowedLines(teams, ph, {}, { "Man, A": 0, "Man, B": 0 })[0], /because both are locked on this team\.$/);
  assert.deepEqual(P.allowedLines([[m[0], m[2]], [m[1], m[3]]], ph, {}, {}), []);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(P.ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
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

test("no browser memory: the Pairs log is the only history", () => {
  const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB/);
  assert.match(PAGE, /not put localStorage back/);
});

test("nothing is under 18px", () => {
  const css = PAGE.slice(PAGE.indexOf("<style>"), PAGE.indexOf("</style>"));
  const small = [...css.matchAll(/font-size:\s*(\d+)px/g)].map(m => Number(m[1])).filter(n => n < 18);
  assert.deepEqual(small, []);
});
