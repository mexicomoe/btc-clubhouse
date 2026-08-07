/**
 * The event export — one CSV a round (build brief section 5).
 *
 * This is the only copy of a round that ever leaves the phone, and the brief
 * wants it for calibration, so it has to carry everything: who played, off what,
 * every hole, and what each contest paid. A column quietly dropped or shifted
 * would not be noticed until someone tried to use the data months later.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { computeLeaderboard, type PlayerCard } from "../src/scoring.ts";
import {
  eventToCsv, csvFilename, csvField, headerRow, eventSignature, changedSinceExport,
} from "../src/exportScores.ts";
import { canonicalName } from "../src/importScores.ts";

const PAR = ABERDEEN_TEE_IV.par;

const PLAYERS = [
  { id: "p1", name: "Ridgeway, Ken", ghin: "1234567", index: 19.4, tee: "IV", gender: "M",
    cart: 1, flight: "A", front: 5, back: 14 },
  // No GHIN: the club does not have one for every man.
  { id: "p2", name: "Merrick, Sal", index: 22.7, tee: "I", gender: "F",
    cart: 2, flight: "A", front: 2, back: 11 },
];
const EVENT = { name: "Friday", date: "2026-08-07", format: "Individual net",
                players: PLAYERS, allowancePercent: 100, skinsOn: true };
const HOLES: Record<string, (number | string | null)[]> = {
  p1: PAR.map((p) => p),
  p2: PAR.map((p, i) => (i === 3 ? "X" : i === 17 ? null : p)),
};

function board() {
  const cards: PlayerCard[] = PLAYERS.map((p) => ({
    name: canonicalName(p.name), handicapIndex: p.index, tee: p.tee, gender: p.gender as "M" | "F",
    cart: p.cart, flight: p.flight, gross: HOLES[p.id],
    picks: { front: p.front, back: p.back },
  }));
  return computeLeaderboard(cards, undefined, DEFAULT_CONTESTS);
}

const shown = (p: { name: string }) => canonicalName(p.name);
const csv = () => eventToCsv(EVENT, board(), { displayNameOf: shown, holesOf: (p) => HOLES[p.id] });

/**
 * Read a CSV line the way a spreadsheet does. Splitting on commas is exactly
 * the mistake the quoting exists to prevent — "Ridgeway, Ken" would shift every
 * column after it — so the tests must honour quotes or they prove nothing.
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { out.push(field); field = ""; }
    else field += c;
  }
  out.push(field);
  return out;
}
const rows = () => csv().trim().split("\r\n").map(parseCsvLine);

/** Columns addressed by name, so a reorder cannot slip past unnoticed. */
const COL: Record<string, number> = Object.fromEntries(headerRow().map((h, i) => [h, i]));
const cell = (row: string[], name: string) => row[COL[name]];

/* ---- the shape ---- */

test("the columns are the ones the brief asks for, in order", () => {
  const head = headerRow();
  // The event's own columns lead, and repeat on every row, so several rounds
  // can be piled into one sheet and still be told apart.
  assert.deepEqual(head.slice(0, 14), [
    "Event", "Date", "Format",
    "Name", "Name as entered", "GHIN",
    "Handicap index", "Tee", "Gender", "Cart", "Flight",
    "Front pick", "Back pick", "Course handicap",
  ]);
  assert.deepEqual(head.slice(14, 32), Array.from({ length: 18 }, (_, i) => "H" + (i + 1)));
  assert.deepEqual(head.slice(32, 50), Array.from({ length: 18 }, (_, i) => "N" + (i + 1)));
  assert.deepEqual(head.slice(50, 52), ["Net", "Gross"]);
  assert.deepEqual(head.slice(52, 59), [
    "Watch the Birdie", "Agony Alley", "Damage Control",
    "Go Long", "Get Shorty", "Bounce Back", "Cart Skins",
  ]);
  assert.equal(head[59], "Final");
  assert.equal(head.length, 60);
});

test("the event is stamped on every row", () => {
  for (const row of rows().slice(1)) {
    assert.equal(cell(row, "Event"), "Friday");
    assert.equal(cell(row, "Date"), "2026-08-07");
    assert.equal(cell(row, "Format"), "Individual net");
  }
});

test("both forms of the name are carried", () => {
  const ken = rows()[1];
  assert.equal(cell(ken, "Name"), "Ken Ridgeway", "the canonical one, as the board shows it");
  assert.equal(cell(ken, "Name as entered"), "Ridgeway, Ken",
    "and exactly what was typed, which is what Golf Genius matches on");
});

test("a GHIN is carried where the club has one", () => {
  assert.equal(cell(rows()[1], "GHIN"), "1234567");
  assert.equal(cell(rows()[2], "GHIN"), "", "and left blank where it does not");
});

test("a row for every player, and a header", () => {
  const r = rows();
  assert.equal(r.length, PLAYERS.length + 1);
  assert.equal(r[0][0], "Event");
  assert.deepEqual(r.slice(1).map((x) => cell(x, "Name as entered")),
    ["Ridgeway, Ken", "Merrick, Sal"]);
  for (const row of r) assert.equal(row.length, 60, "every row is the full width");
});

/* ---- what is in it ---- */

test("the setup fields come out as they were entered", () => {
  const ken = rows()[1];
  assert.equal(cell(ken, "Handicap index"), "19.4", "index keeps its tenth");
  assert.equal(cell(ken, "Tee"), "IV");
  assert.equal(cell(ken, "Gender"), "M");
  assert.equal(cell(ken, "Cart"), "1");
  assert.equal(cell(ken, "Flight"), "A");
  assert.equal(cell(ken, "Front pick"), "5");
  assert.equal(cell(ken, "Back pick"), "14");
});

test("the scoring columns come from the leaderboard, not recomputed", () => {
  const scored = board();
  const ken = rows()[1];
  const r = scored.find((x) => x.name === "Ken Ridgeway")!;
  assert.equal(cell(ken, "Course handicap"), String(r.courseHandicap));
  assert.equal(cell(ken, "Net"), String(r.net));
  assert.equal(cell(ken, "Gross"), String(r.gross));
  assert.equal(cell(ken, "Final"), String(r.final), "the final is the one that was placed");
  assert.equal(cell(ken, "Watch the Birdie"), String(r.contests.watchTheBirdie.strokes));
  assert.equal(cell(ken, "Bounce Back"), String(r.contests.bounceBack.strokes));
});

test("the hole columns carry the card, not the scoring device", () => {
  const sal = rows()[2];
  const holes = sal.slice(COL["H1"], COL["H1"] + 18);
  assert.equal(holes[3], "X", "a pick-up is an X, never the par + 4 behind it");
  assert.equal(holes[17], "", "a hole not played is blank, never a nought");
  assert.equal(holes[0], String(PAR[0]), "and the rest are what he shot");
});

test("a woman's row records the card she played off", () => {
  const sal = rows()[2];
  assert.equal(cell(sal, "Tee"), "I", "her tee");
  assert.equal(cell(sal, "Gender"), "F", "and her stroke index follows from it");
});

/* ---- players who cannot be scored ---- */

test("a player with no index is still in the export", () => {
  // He is in the event. An export that dropped him would misreport who was there.
  const withStray = PLAYERS.concat([{ id: "p3", name: "No Index", index: null as any,
    tee: "IV", gender: "M", cart: null as any, flight: "", front: null as any, back: null as any }]);
  const out = eventToCsv({ ...EVENT, players: withStray }, board(),
    { displayNameOf: shown, holesOf: () => [] })
    .trim().split("\r\n").map(parseCsvLine);
  assert.equal(out.length, 4);
  const stray = out[3];
  assert.equal(cell(stray, "Name as entered"), "No Index");
  assert.equal(cell(stray, "Handicap index"), "", "no index");
  assert.equal(cell(stray, "Course handicap"), "", "and so no course handicap");
  assert.equal(cell(stray, "Final"), "", "and no final");
  assert.equal(stray.length, 60, "still the full width");
});

/* ---- escaping ---- */

test("a field that would break the file is quoted", () => {
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField("Ridgeway, Ken"), '"Ridgeway, Ken"', "a comma");
  assert.equal(csvField('He said "no"'), '"He said ""no"""', "quotes are doubled");
  assert.equal(csvField("two\nlines"), '"two\nlines"');
  assert.equal(csvField(null), "", "nothing, not the word null");
  assert.equal(csvField(undefined), "");
  assert.equal(csvField(0), "0", "and a nought is a nought");
});

test("a name with a comma survives the round trip", () => {
  // "Last, First" is exactly how Golf Genius writes them, so this is the norm
  // rather than an edge case.
  const line = csv().trim().split("\r\n")[1];
  assert.ok(line.includes('"Ridgeway, Ken"'), "quoted, so the comma is not a column break");
  assert.equal(line.split(",").length, 61, "split naively it comes apart...");
  assert.equal(parseCsvLine(line).length, 60, "...but read properly it is one field");
  assert.equal(cell(parseCsvLine(line), "Name as entered"), "Ridgeway, Ken",
    "and the comma is still in the name");
});

/* ---- the file name ---- */

test("the file is named after the event and its date", () => {
  assert.equal(csvFilename("Friday", "2026-08-07"), "Friday 2026-08-07.csv");
  assert.equal(csvFilename("Saturday Medal", "2026-08-08"), "Saturday Medal 2026-08-08.csv");
});

test("a name a file system would refuse is made safe", () => {
  assert.equal(csvFilename("Round 1/2", "2026-08-07"), "Round 1-2 2026-08-07.csv");
  assert.equal(csvFilename('A:B*C?"D<E>F|G', "2026-08-07"), "A-B-C-D-E-F-G 2026-08-07.csv");
  assert.equal(csvFilename("  spaced   out  ", "2026-08-07"), "spaced out 2026-08-07.csv");
  assert.equal(csvFilename("", "2026-08-07"), "event 2026-08-07.csv", "never a bare .csv");
});

/* ---- has the round moved since it was exported? ---- */

// "Exported at lunch, imported the real scores after, deleted next week" is how
// a round gets lost. Knowing an export HAPPENED is not enough; what matters is
// whether the round has moved since.
test("a round never exported counts as changed", () => {
  assert.equal(changedSinceExport(EVENT), true, "no export at all");
  assert.equal(changedSinceExport({ ...EVENT, exportedAt: null }), true);
});

test("a round exported and left alone has not changed", () => {
  const done = { ...EVENT, exportedAt: "2026-08-07T12:00:00.000Z" };
  const settled = { ...done, exportedSignature: eventSignature(done) };
  assert.equal(changedSinceExport(settled), false);
});

test("scores imported after the export count as a change", () => {
  const done = { ...EVENT, exportedAt: "2026-08-07T12:00:00.000Z" };
  const settled = { ...done, exportedSignature: eventSignature(done) };
  // The real cards come in after lunch.
  const withScores = { ...settled, scores: { p1: PAR.map((p) => p) } };
  assert.equal(changedSinceExport(withScores), true, "the round has moved");
});

test("anything the file carries counts as a change", () => {
  const base = { ...EVENT, exportedAt: "2026-08-07T12:00:00.000Z" };
  const settled = { ...base, exportedSignature: eventSignature(base) };
  const moved = [
    { ...settled, name: "Friday Medal" },
    { ...settled, date: "2026-08-09" },
    { ...settled, format: "Scramble" },
    { ...settled, allowancePercent: 85 },
    { ...settled, skinsOn: false },
    { ...settled, handicaps: { p1: 28 } },
    { ...settled, players: [{ ...PLAYERS[0], ghin: "9999999" }, PLAYERS[1]] },
    { ...settled, players: [{ ...PLAYERS[0], index: 20.1 }, PLAYERS[1]] },
    { ...settled, players: [PLAYERS[0]] },
  ];
  for (const e of moved) assert.equal(changedSinceExport(e), true, JSON.stringify(e.name));
});

test("which tab was open is not a change to the round", () => {
  const base = { ...EVENT, exportedAt: "2026-08-07T12:00:00.000Z" };
  const settled: any = { ...base, exportedSignature: eventSignature(base) };
  // View state is not part of what the file carries, so it must not warn.
  assert.equal(changedSinceExport({ ...settled, tab: "skins" }), false);
  assert.equal(changedSinceExport({ ...settled, flight: "B" }), false);
});

test("an export recorded before signatures existed counts as changed", () => {
  // Safer to warn once too often than to lose a round to a stale record.
  assert.equal(changedSinceExport({ ...EVENT, exportedAt: "2026-08-07T12:00:00.000Z" }), true);
});

/* ---- the net columns ---- */

// The gross columns alone force anything reading the file to redo the handicap
// allocation before it can see what the contests were actually graded on. The
// N columns are that figure, straight off the result.
test("the net columns are the capped net the engine scored", () => {
  const scored = board();
  const ken = rows()[1];
  const r = scored.find((x) => x.name === "Ken Ridgeway")!;
  for (let h = 1; h <= 18; h++) {
    assert.equal(cell(ken, "N" + h), String(r.netByHole[h - 1]), "hole " + h);
  }
});

test("net is not gross — the strokes really have come off", () => {
  const ken = rows()[1];
  const grossTotal = Array.from({ length: 18 }, (_, i) => Number(cell(ken, "H" + (i + 1))))
    .reduce((a, b) => a + b, 0);
  const netTotal = Array.from({ length: 18 }, (_, i) => Number(cell(ken, "N" + (i + 1))))
    .reduce((a, b) => a + b, 0);
  assert.ok(netTotal < grossTotal, "he receives shots, so his net is lower");
  assert.equal(String(netTotal), cell(ken, "Net"), "and the holes add up to the Net column");
  assert.equal(String(grossTotal), cell(ken, "Gross"));
});

test("the net columns follow the man's own tee and card", () => {
  // Sal plays the women's stroke index off Tee I, so her allocation differs.
  const scored = board();
  const sal = rows()[2];
  const r = scored.find((x) => x.name === "Sal Merrick")!;
  assert.equal(cell(sal, "N1"), String(r.netByHole[0]));
  assert.equal(cell(sal, "N17"), String(r.netByHole[16]));
});

test("a pick-up and an unplayed hole read the same on both sides", () => {
  const sal = rows()[2];
  assert.equal(cell(sal, "H4"), "X", "gross");
  assert.equal(cell(sal, "N4"), "X", "and net, so a pick-up is never mistaken for a real net double");
  assert.equal(cell(sal, "H18"), "", "not played");
  assert.equal(cell(sal, "N18"), "", "blank on both sides");
});

test("a player who cannot be scored has no net columns either", () => {
  const withStray = PLAYERS.concat([{ id: "p3", name: "No Index", index: null as any,
    tee: "IV", gender: "M", cart: null as any, flight: "", front: null as any, back: null as any }]);
  const out = eventToCsv({ ...EVENT, players: withStray }, board(),
    { displayNameOf: shown, holesOf: () => [] }).trim().split("\r\n").map(parseCsvLine);
  const stray = out[3];
  for (let h = 1; h <= 18; h++) assert.equal(cell(stray, "N" + h), "", "hole " + h);
});
