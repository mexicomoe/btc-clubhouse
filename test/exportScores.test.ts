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
import { eventToCsv, csvFilename, csvField, headerRow } from "../src/exportScores.ts";

const PAR = ABERDEEN_TEE_IV.par;

const PLAYERS = [
  { id: "p1", name: "Ridgeway, Ken", index: 19.4, tee: "IV", gender: "M",
    cart: 1, flight: "A", front: 5, back: 14 },
  { id: "p2", name: "Merrick, Sal", index: 22.7, tee: "I", gender: "F",
    cart: 2, flight: "A", front: 2, back: 11 },
];
const HOLES: Record<string, (number | string | null)[]> = {
  p1: PAR.map((p) => p),
  p2: PAR.map((p, i) => (i === 3 ? "X" : i === 17 ? null : p)),
};

function board() {
  const cards: PlayerCard[] = PLAYERS.map((p) => ({
    name: p.name, handicapIndex: p.index, tee: p.tee, gender: p.gender as "M" | "F",
    cart: p.cart, flight: p.flight, gross: HOLES[p.id],
    picks: { front: p.front, back: p.back },
  }));
  return computeLeaderboard(cards, undefined, DEFAULT_CONTESTS);
}

const csv = () => eventToCsv(PLAYERS, board(), { holesOf: (p) => HOLES[p.id] });

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

/* ---- the shape ---- */

test("the columns are the ones the brief asks for, in order", () => {
  const head = headerRow();
  assert.deepEqual(head.slice(0, 9), [
    "Name", "Handicap index", "Tee", "Gender", "Cart", "Flight",
    "Front pick", "Back pick", "Course handicap",
  ]);
  assert.deepEqual(head.slice(9, 27), Array.from({ length: 18 }, (_, i) => "H" + (i + 1)));
  assert.deepEqual(head.slice(27, 29), ["Net", "Gross"]);
  assert.deepEqual(head.slice(29, 36), [
    "Watch the Birdie", "Agony Alley", "Damage Control",
    "Go Long", "Get Shorty", "Bounce Back", "Cart Skins",
  ]);
  assert.equal(head[36], "Final");
  assert.equal(head.length, 37);
});

test("a row for every player, and a header", () => {
  const r = rows();
  assert.equal(r.length, PLAYERS.length + 1);
  assert.equal(r[0][0], "Name");
  assert.deepEqual(r.slice(1).map((x) => x[0]), ["Ridgeway, Ken", "Merrick, Sal"]);
  for (const row of r) assert.equal(row.length, 37, "every row is the full width");
});

/* ---- what is in it ---- */

test("the setup fields come out as they were entered", () => {
  const ken = rows()[1];
  assert.equal(ken[1], "19.4", "index keeps its tenth");
  assert.equal(ken[2], "IV");
  assert.equal(ken[3], "M");
  assert.equal(ken[4], "1", "cart");
  assert.equal(ken[5], "A", "flight");
  assert.equal(ken[6], "5", "front pick");
  assert.equal(ken[7], "14", "back pick");
});

test("the scoring columns come from the leaderboard, not recomputed", () => {
  const scored = board();
  const ken = rows()[1];
  const r = scored.find((x) => x.name === "Ridgeway, Ken")!;
  assert.equal(ken[8], String(r.courseHandicap));
  assert.equal(ken[27], String(r.net));
  assert.equal(ken[28], String(r.gross));
  assert.equal(ken[36], String(r.final), "the final is the one that was placed");
  assert.equal(ken[29], String(r.contests.watchTheBirdie.strokes));
  assert.equal(ken[34], String(r.contests.bounceBack.strokes));
});

test("the hole columns carry the card, not the scoring device", () => {
  const sal = rows()[2];
  const holes = sal.slice(9, 27);
  assert.equal(holes[3], "X", "a pick-up is an X, never the par + 4 behind it");
  assert.equal(holes[17], "", "a hole not played is blank, never a nought");
  assert.equal(holes[0], String(PAR[0]), "and the rest are what he shot");
});

test("a woman's row records the card she played off", () => {
  const sal = rows()[2];
  assert.equal(sal[2], "I", "her tee");
  assert.equal(sal[3], "F", "and her stroke index follows from it");
});

/* ---- players who cannot be scored ---- */

test("a player with no index is still in the export", () => {
  // He is in the event. An export that dropped him would misreport who was there.
  const withStray = PLAYERS.concat([{ id: "p3", name: "No Index", index: null as any,
    tee: "IV", gender: "M", cart: null as any, flight: "", front: null as any, back: null as any }]);
  const out = eventToCsv(withStray, board(), { holesOf: () => [] })
    .trim().split("\r\n").map(parseCsvLine);
  assert.equal(out.length, 4);
  const stray = out[3];
  assert.equal(stray[0], "No Index");
  assert.equal(stray[1], "", "no index");
  assert.equal(stray[8], "", "and so no course handicap");
  assert.equal(stray[36], "", "and no final");
  assert.equal(stray.length, 37, "still the full width");
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
  assert.ok(line.startsWith('"Ridgeway, Ken",'), "quoted, so the comma is not a column break");
  assert.equal(line.split(",").length, 38, "split naively it comes apart...");
  assert.equal(parseCsvLine(line).length, 37, "...but read properly it is one field");
  assert.equal(parseCsvLine(line)[0], "Ridgeway, Ken", "and the comma is still in the name");
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
