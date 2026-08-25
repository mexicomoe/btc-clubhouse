/**
 * Watch the Birdie picks, sent in by text.
 *
 *     Ridgeway, Ken — 7, 16, 3, 8, 13, 2, 14, 1, 10
 *
 * NINE bare numbers, always in slot order: two par 5s, three par 3s, four par
 * 4s. There is nothing in the line to say which number is which, so the ORDER
 * is the entire format — a line with any other count of numbers is refused
 * rather than guessed at.
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
  // Stepped so no two slots land on the same hole. Every slot of a par is
  // handed the IDENTICAL list, so walking them all by the same index nominates
  // one hole twice and the line is refused as a duplicate.
  const block = FIELD.map((n, i) => {
    const taken: number[] = [];
    const nine = PICK_SLOTS.map((s) => {
      const free = LEGAL[s.key].filter((h) => !taken.includes(h));
      const hole = free[i % free.length];
      taken.push(hole);
      return hole;
    });
    return `${n} — ${nine.join(", ")}`;
  }).join("\n");
  const { rows, ignored } = read(block);

  assert.equal(rows.length, 8);
  assert.equal(ignored, 0);
  assert.deepEqual(rows.map((r) => r.problems), Array.from({ length: 8 }, () => []),
    "nothing wrong with any of them");
  assert.deepEqual(rows.map((r) => r.index), [0, 1, 2, 3, 4, 5, 6, 7],
    "each matched to his own man, in roster order");
  assert.deepEqual(rows[0].picks, { p5a: 7, p5b: 16, p3a: 3, p3b: 8, p3c: 13, p4f: 1, p4b: 2, p4c: 9, p4d: 10 });
});

test("the nine numbers land in slot order", () => {
  const { rows } = read("Abe Whitfield — 7, 16, 3, 8, 13, 2, 14, 1, 10");
  assert.deepEqual(rows[0].picks, { p5a: 7, p5b: 16, p3a: 3, p3b: 8, p3c: 13, p4f: 2, p4b: 14, p4c: 1, p4d: 10 });
});

/* ---- how the line may be written ---- */

test("em dash, en dash, hyphen, colon and tab all separate the name", () => {
  for (const sep of [" — ", " – ", " - ", ": ", "\t"]) {
    const { rows } = read("Abe Whitfield" + sep + "7, 16, 3, 8, 13, 2, 14, 1, 10");
    assert.deepEqual(rows[0].problems, [], JSON.stringify(sep));
    assert.equal(rows[0].index, 0, JSON.stringify(sep));
  }
});

// A phone turns a typed hyphen into an en dash on its own, but it does not touch
// one inside a word — so a hyphenated name must not be cut in half.
test("a hyphen inside a name is not a separator", () => {
  const { rows } = read("Jean-Paul Marchetti — 7, 16, 3, 8, 13, 2, 14, 1, 10", ["Jean-Paul Marchetti"]);
  assert.equal(rows[0].name, "Jean-Paul Marchetti");
  assert.deepEqual(rows[0].problems, []);
});

test("no separator at all still reads — the first number is the boundary", () => {
  const { rows } = read("Abe Whitfield 7 16 3 8 13 2 14 1 10");
  assert.equal(rows[0].index, 0);
  assert.deepEqual(rows[0].picks, { p5a: 7, p5b: 16, p3a: 3, p3b: 8, p3c: 13, p4f: 2, p4b: 14, p4c: 1, p4d: 10 });
});

test("spaces, commas or both between the numbers", () => {
  for (const line of ["Abe Whitfield — 7,16,3,8,13,2,14,1,10",
                      "Abe Whitfield — 7 16 3 8 13 2 14 1 10",
                      "Abe Whitfield —  7 , 16,  3 , 8 ,13, 2, 14, 1, 10 "]) {
    const { rows } = read(line);
    assert.deepEqual(rows[0].picks, { p5a: 7, p5b: 16, p3a: 3, p3b: 8, p3c: 13, p4f: 2, p4b: 14, p4c: 1, p4d: 10 }, line);
  }
});

test("blank lines and a heading row are ignored, not refused", () => {
  const { rows, ignored } = read(
    "Name — picks\n\nAbe Whitfield — 7, 16, 3, 8, 13, 2, 14, 1, 10\n   \n");
  assert.equal(rows.length, 1, "one real line");
  assert.equal(ignored, 4, "the heading, and three empty ones");
});

/* ---- names ---- */

test("a misspelled name is flagged, not guessed", () => {
  const { rows } = read("Abe Whitfeld — 7, 16, 3, 8, 13, 2, 14, 1, 10");
  assert.equal(rows[0].index, -1, "nobody is picked");
  assert.deepEqual(rows[0].problems, ["no player of that name on the list"]);
  assert.equal(rows[0].name, "Abe Whitfeld", "and the line is shown back as typed");
});

test("a name nobody sent in is flagged too", () => {
  const { rows } = read("Ned Copeland — 7, 16, 3, 8, 13, 2, 14, 1, 10");
  assert.equal(rows[0].index, -1);
  assert.match(rows[0].problems[0], /no player of that name/);
});

test("Last, First is turned round and matched", () => {
  const { rows } = read("Whitfield, Abe — 7, 16, 3, 8, 13, 2, 14, 1, 10");
  assert.equal(rows[0].index, 0);
  assert.equal(rows[0].how, "reversed");
  assert.deepEqual(rows[0].problems, []);
});

test("first name and last initial is enough, when written that way", () => {
  const { rows } = read("Abe W. — 7, 16, 3, 8, 13, 2, 14, 1, 10");
  assert.equal(rows[0].index, 0);
  assert.equal(rows[0].how, "initial");
});

// The initial rule is what makes "Abe W." work. Left unguarded it would also
// reduce a misspelled surname to its first letter and match on that — turning a
// typo into a silent write to the wrong man's card.
test("a full surname spelled wrong is not rescued by its initial", () => {
  for (const wrong of ["Abe Whitfeld", "Abe Witfield", "Abe Whitfields"]) {
    const { rows } = read(wrong + " — 7, 16, 3, 8, 13, 2, 14, 1, 10");
    assert.equal(rows[0].index, -1, wrong);
    assert.deepEqual(rows[0].problems, ["no player of that name on the list"], wrong);
  }
});

test("a name two men could answer to is refused, not guessed between", () => {
  const { rows } = read("Abe W — 7, 16, 3, 8, 13, 2, 14, 1, 10",
    ["Abe Whitfield", "Abe Wingate"]);
  assert.equal(rows[0].index, -1);
  assert.match(rows[0].problems[0], /more than one player could be meant/);
});

// A line can be wrong in both ways at once, and both are worth saying: fixing
// only the spelling would leave him still to discover the picks are wrong.
test("a bad name and bad picks are both reported", () => {
  const { rows } = read("Abe Whitfeld — 7, 16, 3, 8, 13");
  assert.equal(rows[0].problems.length, 2);
  assert.match(rows[0].problems[0], /no player of that name/);
  assert.match(rows[0].problems[1], /expected 9 numbers, found 5/);
});

/* ---- picks that are not allowed ---- */

test("a pick outside the legal table is named", () => {
  const { rows } = read("Abe Whitfield — 7, 16, 3, 8, 13, 5, 14, 1, 10");
  assert.deepEqual(rows[0].problems,
    ["hole 5 is not a legal first par 4 — 1, 2, 9, 10, 11, 12, 14, 15"]);
});

test("every barred hole is refused, and says what was allowed", () => {
  // ONLY AGONY ALLEY'S THREE ARE BARRED NOW, each shown in a slot its par would
  // otherwise fit. Hole 4 is a par 5; 5 and 6 are par 4s.
  for (const [line, want] of [
    ["Abe Whitfield — 4, 16, 3, 8, 13, 2, 14, 1, 10", /hole 4 is not a legal first par 5 — 7, 16, 18/],
    ["Abe Whitfield — 7, 16, 3, 8, 13, 5, 14, 1, 10", /hole 5 is not a legal first par 4/],
    ["Abe Whitfield — 7, 16, 3, 8, 13, 6, 14, 1, 10", /hole 6 is not a legal first par 4/],
  ] as [string, RegExp][]) {
    const { rows } = read(line);
    assert.match(rows[0].problems[0], want, line);
  }
});

test("11, 12 and 13 are legal again — Easy Street is out of the game", () => {
  // They were barred while Easy Street owned them. A line using all three reads
  // cleanly now, and 13 in particular is a par 3 in a par 3 slot.
  const { rows } = read("Abe Whitfield — 7, 16, 3, 8, 13, 11, 12, 1, 10");
  assert.deepEqual(rows[0].problems, []);
  assert.equal(rows[0].picks.p3c, 13);
  assert.equal(rows[0].picks.p4f, 11);
  assert.equal(rows[0].picks.p4b, 12);
});

test("a hole in the wrong slot is refused even though it is legal elsewhere", () => {
  // Hole 10 is a legal par 4, but the first number is a par 5.
  const { rows } = read("Abe Whitfield — 10, 16, 3, 8, 13, 2, 14, 1, 9");
  assert.match(rows[0].problems[0], /hole 10 is not a legal first par 5 — 7, 16, 18/);
});

test("a par 5 in a par 3 slot is refused", () => {
  const { rows } = read("Abe Whitfield — 7, 16, 18, 8, 13, 2, 14, 1, 10");
  assert.match(rows[0].problems[0], /hole 18 is not a legal first par 3 — 3, 8, 13, 17/);
});

test("a tenth number is rejected rather than half-applied", () => {
  const { rows } = read("Abe Whitfield — 7, 16, 3, 8, 13, 2, 14, 1, 10, 18");
  assert.deepEqual(rows[0].problems, ["expected 9 numbers, found 10"]);
  assert.deepEqual(rows[0].picks, {}, "and nothing is taken from the line");
});

// This USED to be belt and braces: every hole fell in exactly one slot, so the
// same hole twice was ALSO illegal for one of them and either check caught it.
// Every slot of a par is handed the identical list now, so hole 8 is perfectly
// legal in all three par 3 slots — and this check is the ONLY thing standing
// between a man and being paid twice for one birdie.
test("the same hole nominated twice is called a duplicate", () => {
  const { rows } = read("Abe Whitfield — 7, 16, 8, 8, 13, 2, 14, 1, 10");
  assert.deepEqual(rows[0].problems,
    ["hole 8 is nominated twice, as first par 3 and second par 3"]);
});

test("a duplicate across two par 5 slots is caught the same way", () => {
  const { rows } = read("Abe Whitfield — 16, 16, 3, 8, 13, 2, 14, 1, 10");
  assert.match(rows[0].problems[0], /hole 16 is nominated twice/);
});

test("a duplicate among the FOUR par 4s is caught too", () => {
  // Four slots off one list of eight is where a man is likeliest to repeat
  // himself, and the only place the count grew.
  const { rows } = read("Abe Whitfield — 7, 16, 3, 8, 13, 2, 14, 2, 10");
  assert.match(rows[0].problems[0], /hole 2 is nominated twice, as first par 4 and third par 4/);
});

test("too few numbers is refused rather than half-applied", () => {
  const { rows } = read("Abe Whitfield — 7, 16, 3");
  assert.deepEqual(rows[0].problems, ["expected 9 numbers, found 3"]);
  assert.deepEqual(rows[0].picks, {});
});

test("a hole number off the course is refused", () => {
  const { rows } = read("Abe Whitfield — 7, 16, 3, 8, 13, 2, 14, 1, 19");
  assert.deepEqual(rows[0].problems, ["a hole number is outside 1–18"]);
});

/* ---- a real block, as it arrives ---- */

test("the good lines survive alongside the bad ones", () => {
  const { rows, ignored } = read([
    "Picks for Friday",
    "Abe Whitfield — 7, 16, 3, 8, 13, 2, 14, 1, 10",
    "Whitfeld, Ben — 7, 18, 3, 8, 13, 1, 10, 9, 15",
    "Cy Ashford — 9, 15, 3, 8, 7",
    "Dan Pemberton: 7 18 8 17 13 1 10 9 15",
    "",
  ].join("\n"));

  assert.equal(ignored, 2, "the heading and the blank line");
  const good = rows.filter((r) => r.problems.length === 0);
  assert.deepEqual(good.map((r) => r.index), [0, 3], "Abe and Dan");
  assert.deepEqual(rows[1].problems, ["no player of that name on the list"]);
  assert.deepEqual(rows[2].problems, ["expected 9 numbers, found 5"]);
});
