/**
 * Watch the Birdie picks, sent in by text.
 *
 *     Ridgeway, Ken — 2, 14, 3, 8, 7, 16
 *
 * Six bare numbers, always in slot order: front par 3, front par 4, front par 5,
 * back par 3, back par 4, back par 5. There is nothing in the line to say which
 * number is which, so the ORDER is the entire format — a line with any other
 * count of numbers is refused rather than guessed at.
 *
 * A name is MATCHED, never guessed. The rule is the one the score import uses:
 * exact, then "Last, First" reversed, then first name and last initial. A name
 * that fits nobody, or fits two men equally, comes back for a person to settle.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV } from "../src/courseConfig.ts";
import { birdiePickHoles, PICK_SLOTS } from "../src/scoring.ts";
import { parseBirdiePicks } from "../src/importScores.ts";

const LEGAL = birdiePickHoles(ABERDEEN_TEE_IV);
const SLOTS = PICK_SLOTS.map((s) => ({ key: s.key, label: s.label, legal: LEGAL[s.key] }));

/** The eight men of the section 9 round, as the setup roster holds them. */
const FIELD = ["Abe Whitfield", "Ben Castellan", "Cy Ashford", "Dan Pemberton",
               "Eli Marsden", "Gus Thornbury", "Hal Brightwater", "Ike Calloway"];

const read = (text: string, names: string[] = FIELD) =>
  parseBirdiePicks(text, { names, slots: SLOTS });

/* ---- a good block ---- */

test("a pasted block of eight players is all eight matched", () => {
  // Stepped so no two slots land on the same hole. The par 3 slots are handed
  // the IDENTICAL three holes and so are the par 5s, so walking both by the
  // same index nominates one hole twice and the line is refused as a duplicate.
  const block = FIELD.map((n, i) => {
    const taken: number[] = [];
    const six = PICK_SLOTS.map((s) => {
      const free = LEGAL[s.key].filter((h) => !taken.includes(h));
      const hole = free[i % free.length];
      taken.push(hole);
      return hole;
    });
    return `${n} — ${six.join(", ")}`;
  }).join("\n");
  const { rows, ignored } = read(block);

  assert.equal(rows.length, 8);
  assert.equal(ignored, 0);
  assert.deepEqual(rows.map((r) => r.problems), Array.from({ length: 8 }, () => []),
    "nothing wrong with any of them");
  assert.deepEqual(rows.map((r) => r.index), [0, 1, 2, 3, 4, 5, 6, 7],
    "each matched to his own man, in roster order");
  assert.deepEqual(rows[0].picks, { p4f: 1, p4b: 10, p3a: 3, p3b: 8, p5a: 7, p5b: 16 });
});

test("the six numbers land in slot order", () => {
  const { rows } = read("Abe Whitfield — 2, 14, 3, 8, 7, 16");
  assert.deepEqual(rows[0].picks, { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 });
});

/* ---- how the line may be written ---- */

test("em dash, en dash, hyphen, colon and tab all separate the name", () => {
  for (const sep of [" — ", " – ", " - ", ": ", "\t"]) {
    const { rows } = read("Abe Whitfield" + sep + "2, 14, 3, 8, 7, 16");
    assert.deepEqual(rows[0].problems, [], JSON.stringify(sep));
    assert.equal(rows[0].index, 0, JSON.stringify(sep));
  }
});

// A phone turns a typed hyphen into an en dash on its own, but it does not touch
// one inside a word — so a hyphenated name must not be cut in half.
test("a hyphen inside a name is not a separator", () => {
  const { rows } = read("Jean-Paul Marchetti — 2, 14, 3, 8, 7, 16", ["Jean-Paul Marchetti"]);
  assert.equal(rows[0].name, "Jean-Paul Marchetti");
  assert.deepEqual(rows[0].problems, []);
});

test("no separator at all still reads — the first number is the boundary", () => {
  const { rows } = read("Abe Whitfield 2 14 3 8 7 16");
  assert.equal(rows[0].index, 0);
  assert.deepEqual(rows[0].picks, { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 });
});

test("spaces, commas or both between the numbers", () => {
  for (const line of ["Abe Whitfield — 2,14,3,8,7,16",
                      "Abe Whitfield — 2 14 3 8 7 16",
                      "Abe Whitfield —  2 , 14,  3 , 8 ,7, 16 "]) {
    const { rows } = read(line);
    assert.deepEqual(rows[0].picks, { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 }, line);
  }
});

test("blank lines and a heading row are ignored, not refused", () => {
  const { rows, ignored } = read(
    "Name — picks\n\nAbe Whitfield — 2, 14, 3, 8, 7, 16\n   \n");
  assert.equal(rows.length, 1, "one real line");
  assert.equal(ignored, 4, "the heading, and three empty ones");
});

/* ---- names ---- */

test("a misspelled name is flagged, not guessed", () => {
  const { rows } = read("Abe Whitfeld — 2, 14, 3, 8, 7, 16");
  assert.equal(rows[0].index, -1, "nobody is picked");
  assert.deepEqual(rows[0].problems, ["no player of that name on the list"]);
  assert.equal(rows[0].name, "Abe Whitfeld", "and the line is shown back as typed");
});

test("a name nobody sent in is flagged too", () => {
  const { rows } = read("Ned Copeland — 2, 14, 3, 8, 7, 16");
  assert.equal(rows[0].index, -1);
  assert.match(rows[0].problems[0], /no player of that name/);
});

test("Last, First is turned round and matched", () => {
  const { rows } = read("Whitfield, Abe — 2, 14, 3, 8, 7, 16");
  assert.equal(rows[0].index, 0);
  assert.equal(rows[0].how, "reversed");
  assert.deepEqual(rows[0].problems, []);
});

test("first name and last initial is enough, when written that way", () => {
  const { rows } = read("Abe W. — 2, 14, 3, 8, 7, 16");
  assert.equal(rows[0].index, 0);
  assert.equal(rows[0].how, "initial");
});

// The initial rule is what makes "Abe W." work. Left unguarded it would also
// reduce a misspelled surname to its first letter and match on that — turning a
// typo into a silent write to the wrong man's card.
test("a full surname spelled wrong is not rescued by its initial", () => {
  for (const wrong of ["Abe Whitfeld", "Abe Witfield", "Abe Whitfields"]) {
    const { rows } = read(wrong + " — 2, 14, 3, 8, 7, 16");
    assert.equal(rows[0].index, -1, wrong);
    assert.deepEqual(rows[0].problems, ["no player of that name on the list"], wrong);
  }
});

test("a name two men could answer to is refused, not guessed between", () => {
  const { rows } = read("Abe W — 2, 14, 3, 8, 7, 16",
    ["Abe Whitfield", "Abe Wingate"]);
  assert.equal(rows[0].index, -1);
  assert.match(rows[0].problems[0], /more than one player could be meant/);
});

// A line can be wrong in both ways at once, and both are worth saying: fixing
// only the spelling would leave him still to discover the picks are wrong.
test("a bad name and bad picks are both reported", () => {
  const { rows } = read("Abe Whitfeld — 8, 2, 4, 13, 14");
  assert.equal(rows[0].problems.length, 2);
  assert.match(rows[0].problems[0], /no player of that name/);
  assert.match(rows[0].problems[1], /expected 6 numbers, found 5/);
});

/* ---- picks that are not allowed ---- */

test("a pick outside the legal table is named", () => {
  const { rows } = read("Abe Whitfield — 5, 14, 3, 8, 7, 16");
  assert.deepEqual(rows[0].problems, ["hole 5 is not a legal front par 4 — 1, 2, 9"]);
});

test("every barred hole is refused, and says what was allowed", () => {
  // All six barred holes, each in a slot its par would otherwise fit.
  for (const [line, want] of [
    ["Abe Whitfield — 6, 14, 3, 8, 7, 16", /hole 6 is not a legal front par 4 — 1, 2, 9/],
    ["Abe Whitfield — 5, 14, 3, 8, 7, 16", /hole 5 is not a legal front par 4 — 1, 2, 9/],
    ["Abe Whitfield — 2, 11, 3, 8, 7, 16", /hole 11 is not a legal back par 4 — 10, 14, 15/],
    ["Abe Whitfield — 2, 12, 3, 8, 7, 16", /hole 12 is not a legal back par 4 — 10, 14, 15/],
    ["Abe Whitfield — 2, 14, 13, 8, 7, 16", /hole 13 is not a legal first par 3 — 3, 8, 17/],
    ["Abe Whitfield — 2, 14, 3, 8, 4, 16", /hole 4 is not a legal first par 5 — 7, 16, 18/],
  ] as [string, RegExp][]) {
    const { rows } = read(line);
    assert.match(rows[0].problems[0], want, line);
  }
});

test("a hole in the wrong slot is refused even though it is legal elsewhere", () => {
  // Hole 10 is a legal BACK par 4, but the first number is the front one.
  const { rows } = read("Abe Whitfield — 10, 14, 3, 8, 7, 16");
  assert.match(rows[0].problems[0], /hole 10 is not a legal front par 4 — 1, 2, 9/);
});

test("a par 5 in a par 3 slot is refused", () => {
  const { rows } = read("Abe Whitfield — 2, 14, 7, 8, 16, 18");
  assert.match(rows[0].problems[0], /hole 7 is not a legal first par 3 — 3, 8, 17/);
});

test("a seventh number is rejected rather than half-applied", () => {
  const { rows } = read("Abe Whitfield — 2, 14, 3, 8, 7, 16, 18");
  assert.deepEqual(rows[0].problems, ["expected 6 numbers, found 7"]);
  assert.deepEqual(rows[0].picks, {}, "and nothing is taken from the line");
});

// This USED to be belt and braces: every hole fell in exactly one slot, so the
// same hole twice was ALSO illegal for one of them and either check caught it.
// The two par 3 slots are handed the identical three holes now, so hole 8 is
// perfectly legal in both — and this check is the ONLY thing standing between a
// man and being paid twice for one birdie.
test("the same hole nominated twice is called a duplicate", () => {
  const { rows } = read("Abe Whitfield — 2, 14, 8, 8, 7, 16");
  assert.deepEqual(rows[0].problems,
    ["hole 8 is nominated twice, as first par 3 and second par 3"]);
});

test("a duplicate across two par 5 slots is caught the same way", () => {
  const { rows } = read("Abe Whitfield — 2, 14, 3, 8, 16, 16");
  assert.match(rows[0].problems[0], /hole 16 is nominated twice/);
});

test("too few numbers is refused rather than half-applied", () => {
  const { rows } = read("Abe Whitfield — 8, 2, 4");
  assert.deepEqual(rows[0].problems, ["expected 6 numbers, found 3"]);
  assert.deepEqual(rows[0].picks, {});
});

test("a hole number off the course is refused", () => {
  const { rows } = read("Abe Whitfield — 8, 2, 4, 13, 14, 19");
  assert.deepEqual(rows[0].problems, ["a hole number is outside 1–18"]);
});

/* ---- a real block, as it arrives ---- */

test("the good lines survive alongside the bad ones", () => {
  const { rows, ignored } = read([
    "Picks for Friday",
    "Abe Whitfield — 2, 14, 3, 8, 7, 16",
    "Whitfeld, Ben — 1, 10, 3, 8, 7, 18",
    "Cy Ashford — 9, 15, 3, 8, 7",
    "Dan Pemberton: 1 10 8 17 7 18",
    "",
  ].join("\n"));

  assert.equal(ignored, 2, "the heading and the blank line");
  const good = rows.filter((r) => r.problems.length === 0);
  assert.deepEqual(good.map((r) => r.index), [0, 3], "Abe and Dan");
  assert.deepEqual(rows[1].problems, ["no player of that name on the list"]);
  assert.deepEqual(rows[2].problems, ["expected 6 numbers, found 5"]);
});
