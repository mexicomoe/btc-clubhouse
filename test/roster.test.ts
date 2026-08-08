/**
 * Pasting a roster — sixteen men from a spreadsheet rather than sixteen forms.
 *
 * One player a line: name, handicap index, tee, group, front pick, back pick.
 * Nothing is committed here. Every row comes back with whatever is wrong with
 * it, so the screen can read the list back before a man presses the button —
 * the same way a paste of scores is shown before it is taken.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseRoster, splitCsvLine } from "../src/importScores.ts";

const RULES = {
  tees: ["I", "I/II", "II", "II/III", "III", "III/IV", "IV", "IV/V", "V"],
  frontPicks: [1, 2, 5, 6, 9],
  backPicks: [10, 11, 12, 14, 15],
  defaultTee: "IV",
};

/* ---- the shape of a line ---- */

test("a tab-separated line reads straight off a spreadsheet", () => {
  const { rows } = parseRoster("Ken Ridgeway\t19.4\tIV\t1\t5\t14", RULES);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    name: "Ken Ridgeway", indexText: "19.4", tee: "IV", group: "1",
    front: 5, back: 14, problems: [],
  });
});

test("a comma-separated line reads too", () => {
  const { rows } = parseRoster("Ken Ridgeway, 19.4, IV, 1, 5, 14", RULES);
  assert.equal(rows[0].name, "Ken Ridgeway");
  assert.equal(rows[0].indexText, "19.4");
  assert.equal(rows[0].front, 5);
});

// "Ridgeway, Ken" is one field with a comma in it, and it is exactly how the
// club writes names. Quoted it is unambiguous; unquoted it has to be rescued.
test("a Last, First name survives a comma list", () => {
  for (const line of ['"Ridgeway, Ken",19.4,IV,1,5,14', 'Ridgeway, Ken, 19.4, IV, 1, 5, 14']) {
    const { rows } = parseRoster(line, RULES);
    assert.equal(rows[0].name, "Ridgeway, Ken", line);
    assert.equal(rows[0].indexText, "19.4", line);
    assert.equal(rows[0].tee, "IV", line);
  }
});

test("a tab list never guesses at the name", () => {
  // Tabs are unambiguous, so a comma in the name is just part of it.
  const { rows } = parseRoster("Ridgeway, Ken\t19.4\tIV", RULES);
  assert.equal(rows[0].name, "Ridgeway, Ken");
  assert.equal(rows[0].indexText, "19.4");
});

test("everything after the name may be left out", () => {
  const { rows } = parseRoster("Ken Ridgeway\t19.4", RULES);
  assert.equal(rows[0].tee, "IV", "the tee falls back to the one in use");
  assert.equal(rows[0].group, "");
  assert.equal(rows[0].front, "");
  assert.deepEqual(rows[0].problems, [], "and none of that is a fault");
});

/* ---- what it refuses ---- */

test("a tee the course does not have is refused", () => {
  const { rows } = parseRoster("Ken\t19.4\tVII", RULES);
  assert.match(rows[0].problems[0], /no tee called/);
  assert.equal(rows[0].tee, "IV", "and it falls back rather than inventing one");
});

test("a pick that is not a par 4 on that nine is refused", () => {
  const { rows } = parseRoster("Ken\t19.4\tIV\t1\t3\t10", RULES);
  assert.match(rows[0].problems[0], /front pick 3 is not a par 4/);
  assert.equal(rows[0].front, "");
  assert.equal(rows[0].back, 10, "the good one is kept");
});

test("a back-nine hole in the front column is refused", () => {
  const { rows } = parseRoster("Ken\t19.4\tIV\t1\t10\t14", RULES);
  assert.match(rows[0].problems[0], /front pick 10 is not a par 4 on that nine/);
});

test("a group that is not a number is refused", () => {
  const { rows } = parseRoster("Ken\t19.4\tIV\tblue", RULES);
  assert.match(rows[0].problems[0], /group “blue” is not a number/);
  assert.equal(rows[0].group, "");
});

/* ---- lines that are not players ---- */

test("blank lines and a heading row are ignored, not refused", () => {
  const text = [
    "Name\tIndex\tTee\tGroup\tFront\tBack",
    "",
    "Ken Ridgeway\t19.4\tIV\t1\t5\t14",
    "   ",
    "Sal Merrick\t22.7\tI\t2\t2\t11",
  ].join("\n");
  const { rows, ignored } = parseRoster(text, RULES);
  assert.deepEqual(rows.map((r) => r.name), ["Ken Ridgeway", "Sal Merrick"]);
  assert.equal(ignored, 1, "the heading row; the blanks are not even counted");
});

test("a man whose name begins like a heading is still a player", () => {
  // "Parr" starts with "Par"... and "Nameless" with "Name". The second field
  // decides it: a heading row has no handicap after it.
  const { rows } = parseRoster("Nameless, Ken\t19.4\tIV", RULES);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Nameless, Ken");
});

/* ---- a whole list ---- */

test("sixteen men come through in one paste", () => {
  const lines = [];
  for (let i = 1; i <= 16; i++) lines.push(`Player ${i}\t${10 + i}\tIV\t${Math.ceil(i / 4)}\t5\t14`);
  const { rows } = parseRoster(lines.join("\n"), RULES);
  assert.equal(rows.length, 16);
  assert.ok(rows.every((r) => r.problems.length === 0));
  assert.deepEqual(rows[15], {
    name: "Player 16", indexText: "26", tee: "IV", group: "4",
    front: 5, back: 14, problems: [],
  });
});

test("splitting a line honours quotes", () => {
  assert.deepEqual(splitCsvLine('a,b,c'), ["a", "b", "c"]);
  assert.deepEqual(splitCsvLine('"a,b",c'), ["a,b", "c"]);
  assert.deepEqual(splitCsvLine('"he said ""no""",c'), ['he said "no"', "c"]);
});
