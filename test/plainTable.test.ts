/**
 * A plain table — hole numbers across the top, a name and eighteen scores
 * beneath, and nothing else. No dots, no par row, no stroke index, no Out/In,
 * no Total, no Net.
 *
 * THE BUG THESE EXIST FOR. The header row used to be found by looking for the
 * word "Total". A plain table has none, so no header was found, the fixed
 * section-10 layout was used instead, and column 10 — hole 10's score — was
 * read as the Out total. Hole 10 was dropped, holes 11 to 18 slid one place
 * left, SEVENTEEN holes came through and the eighteenth was blank. The header
 * row itself then parsed as a player called "1".
 *
 * Every number was plausible, so nothing looked broken. That is the shape of
 * fault worth the most tests: a card that is quietly wrong beats a card that
 * refuses, because only one of them gets noticed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer } from "../src/scoring.ts";
import { parseScores, grossCardToPlayer } from "../src/importScores.ts";

const PAR = ABERDEEN_TEE_IV.par;

/** The four cards of the section 9 round, as a plain table. */
const CARDS: Record<string, number[]> = {
  "Whitfield, Abe (19)":  [5,5,4,6,6,5,6,4,6, 6,4,5,4,6,6,5,3,6],
  "Castellan, Ben (19)":  [5,4,4,6,5,5,6,4,6, 5,5,6,5,7,5,5,4,6],
  "Ashford, Cy (18)":     [5,4,4,6,6,5,5,5,6, 6,5,5,3,5,6,6,4,7],
  "Pemberton, Dan (21)":  [6,5,3,9,5,6,6,2,4, 7,5,3,5,4,7,7,4,7],
};

/** Hole numbers 1–18 across the top, then one row a man. */
const HEADER = Array.from({ length: 18 }, (_, i) => i + 1).join("\t");
const PLAIN = [HEADER].concat(
  Object.entries(CARDS).map(([name, holes]) => [name, ...holes].join("\t"))).join("\n");

/* ---- the eighteenth hole ---- */

test("all eighteen holes come through, in the right order", () => {
  const { cards } = parseScores(PLAIN);
  assert.equal(cards.length, 4, "four men, and no phantom from the header row");
  for (const card of cards) {
    const want = CARDS[card.name + " (" + card.handicap + ")"];
    assert.deepEqual(card.holes, want, card.name);
    assert.equal(card.holesPlayed, 18, card.name + " played eighteen");
  }
});

// The exact failure: hole 10 vanished and everything after it moved up one.
test("hole 10 is not eaten by a column that is not there", () => {
  const { cards } = parseScores(PLAIN);
  const abe = cards.find((c) => c.name === "Whitfield, Abe")!;
  assert.equal(abe.holes[9], 6, "hole 10");
  assert.equal(abe.holes[10], 4, "hole 11 — not hole 12 shifted up");
  assert.equal(abe.holes[17], 6, "hole 18 — not a blank");
  assert.equal(abe.holes.filter((h) => h == null).length, 0, "no gaps at all");
});

test("the header row is not read as a player", () => {
  const { cards } = parseScores(PLAIN);
  assert.deepEqual(cards.map((c) => c.name),
    ["Whitfield, Abe", "Castellan, Ben", "Ashford, Cy", "Pemberton, Dan"]);
  assert.ok(!cards.some((c) => /^\d+$/.test(c.name)), "no card named after a hole number");
});

/* ---- no Total is a shape, not a fault ---- */

test("a table with no Total column raises no error", () => {
  const { errors } = parseScores(PLAIN);
  assert.deepEqual(errors, [],
    "the card read perfectly — there is simply nothing to reconcile it against");
});

test("without a Total the columns are left unclassified, for a person to say", () => {
  const { cards } = parseScores(PLAIN);
  for (const card of cards) {
    assert.equal(card.mode, "unknown", card.name);
    assert.equal(card.grossTotal, null);
    assert.equal(card.netTotal, null);
  }
});

// The old message said "no Total column — cannot read the card", which was
// wrong twice: the card read fine, and it sent a man looking for a mistake in a
// paste that had none. An empty Total where there IS a Total column is a real
// fault and still says so.
test("an empty Total cell, where there is a Total column, is still an error", () => {
  const gg = [
    "\t1\t2\t3\t4\t5\t6\t7\t8\t9\tOut\t10\t11\t12\t13\t14\t15\t16\t17\t18\tIn\tTotal\tNet",
    ["Whitfield, Abe (19)", 5,5,4,6,6,5,6,4,6, 47, 6,4,5,4,6,6,5,3,6, 45, "", ""].join("\t"),
  ].join("\n");
  const { errors } = parseScores(gg);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /the Total column is empty/);
});

/* ---- the scores are the ones that were pasted ---- */

// This shape can never classify itself — there is no total to sum against — so
// the import screen asks, and the man answers "Gross". These are the numbers he
// gets when he does: section 9's own, from the same four men.
test("told they are gross, the cards score exactly as the reference round does", () => {
  const expected: Record<string, { gross: number; net: number }> = {
    "Whitfield, Abe": { gross: 92, net: 73 },
    "Castellan, Ben": { gross: 93, net: 74 },
    "Ashford, Cy":    { gross: 93, net: 75 },
    "Pemberton, Dan": { gross: 95, net: 74 },
  };
  const { cards } = parseScores(PLAIN);
  for (const card of cards) {
    const chosen = { ...card, mode: "gross" as const };
    const player = grossCardToPlayer(chosen);
    const r = scorePlayer(player, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
    assert.equal(r.gross, expected[card.name].gross, card.name + " gross");
    assert.equal(r.net, expected[card.name].net, card.name + " net");
  }
});

// The screen must be able to ask. An unclassified card that had no way through
// would make this whole shape unimportable.
test("an unclassified card is refused until it is told which the columns are", () => {
  const { cards } = parseScores(PLAIN);
  assert.throws(() => grossCardToPlayer(cards[0]), /expected gross holes, got unknown/);
});

test("the eighteen sum to the gross the card was pasted with", () => {
  const { cards } = parseScores(PLAIN);
  for (const card of cards) {
    const want = CARDS[card.name + " (" + card.handicap + ")"];
    const sum = (card.holes as number[]).reduce((a, b) => a + b, 0);
    assert.equal(sum, want.reduce((a, b) => a + b, 0), card.name);
  }
});

/* ---- the shape's variations ---- */

test("a leading empty cell above the name column changes nothing", () => {
  const withGap = ["\t" + HEADER].concat(
    Object.entries(CARDS).map(([n, h]) => [n, ...h].join("\t"))).join("\n");
  const { cards, errors } = parseScores(withGap);
  assert.deepEqual(errors, []);
  assert.equal(cards.length, 4);
  assert.deepEqual(cards[0].holes, CARDS["Whitfield, Abe (19)"]);
});

test("a name with no handicap in brackets still reads", () => {
  const plain = [HEADER, ["Abe Whitfield", ...CARDS["Whitfield, Abe (19)"]].join("\t")].join("\n");
  const { cards, errors } = parseScores(plain);
  assert.deepEqual(errors, []);
  assert.equal(cards[0].name, "Abe Whitfield");
  assert.equal(cards[0].handicap, null);
  assert.deepEqual(cards[0].holes, CARDS["Whitfield, Abe (19)"]);
});

test("a blank hole in a plain table is a hole not played, not a shift", () => {
  const holes = CARDS["Whitfield, Abe (19)"].slice() as (number | string)[];
  holes[9] = "";                                   // hole 10 left empty
  const plain = [HEADER, ["Abe Whitfield", ...holes].join("\t")].join("\n");
  const { cards } = parseScores(plain);
  assert.equal(cards[0].holes[9], null, "hole 10 is a gap");
  assert.equal(cards[0].holes[10], 4, "and hole 11 stays where it is");
  assert.equal(cards[0].holesPlayed, 17);
});

test("an X in a plain table is still a pick-up", () => {
  const holes = CARDS["Whitfield, Abe (19)"].slice() as (number | string)[];
  holes[3] = "X";
  const plain = [HEADER, ["Abe Whitfield", ...holes].join("\t")].join("\n");
  const { cards } = parseScores(plain);
  assert.equal(cards[0].holes[3], "X");
  assert.equal(cards[0].pickedUp, 1);
  assert.equal(cards[0].holesPlayed, 18, "a pick-up is a played hole");
});

// A selection that clipped the right-hand end is common, and the header is
// still recognisably a header — it must not fall back to the fixed layout.
test("a header clipped short is still a header", () => {
  const short = ["1\t2\t3\t4\t5\t6",
    ["Abe Whitfield", 5, 5, 4, 6, 6, 5].join("\t")].join("\n");
  const { cards, errors } = parseScores(short);
  assert.equal(errors.length, 1, "six holes is not a round");
  assert.match(errors[0], /could not find 18 hole columns/);
  assert.equal(cards.length, 0, "and nothing half-read comes through");
});

/* ---- the Golf Genius shape is untouched ---- */

test("the export's own layout still reads exactly as it did", () => {
  const gg = [
    "\t1\t2\t3\t4\t5\t6\t7\t8\t9\tOut\t10\t11\t12\t13\t14\t15\t16\t17\t18\tIn\tTotal\tNet",
    ["Whitfield, Abe (19)", 5,5,4,6,6,5,6,4,6, 47, 6,4,5,4,6,6,5,3,6, 45, 92, 73].join("\t"),
  ].join("\n");
  const { cards, errors } = parseScores(gg);
  assert.deepEqual(errors, []);
  assert.deepEqual(cards[0].holes, CARDS["Whitfield, Abe (19)"]);
  assert.equal(cards[0].grossTotal, 92);
  assert.equal(cards[0].netTotal, 73);
  assert.equal(cards[0].mode, "gross", "and it is still classified from the totals");
});

test("a paste with no header at all still uses the fixed layout", () => {
  // No header row: name, 1–9, Out, 10–18, In, Total, Net, as section 10 has it.
  const noHeader = ["Whitfield, Abe (19)", 5,5,4,6,6,5,6,4,6, 47,
                    6,4,5,4,6,6,5,3,6, 45, 92, 73].join("\t");
  const { cards, errors } = parseScores(noHeader);
  assert.deepEqual(errors, []);
  assert.deepEqual(cards[0].holes, CARDS["Whitfield, Abe (19)"]);
  assert.equal(cards[0].mode, "gross");
});
