/**
 * Reading a handicap index that someone typed on a phone.
 *
 * The trap this exists to close: `parseFloat("24,4")` is **24**. It parses up to
 * the comma, throws away the tenth and returns a number that looks perfectly
 * reasonable — so a 24.4 index quietly becomes 24.0, and off a slope of 117 that
 * is enough to move a course handicap and cost a man a stroke.
 *
 * A number input is no safer: hand it "24,4" and it reports an EMPTY field, so a
 * typed index vanishes and looks the same as one never filled in. The setup
 * screen therefore uses a text input and parses here, to one rule, and writes
 * every index back with a period whatever the phone's locale.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseHandicapIndex, formatHandicapIndex, courseHandicap,
} from "../src/scoring.ts";
import { courseForTee } from "../src/courseConfig.ts";

/* ---- the bug this closes ---- */

test("the comma that parseFloat would silently truncate", () => {
  // What the naive read does, pinned so the danger is on the record.
  assert.equal(parseFloat("24,4"), 24, "parseFloat drops the tenth");
  // What this app does instead: reads it properly, to the same value a period gives.
  assert.deepEqual(parseHandicapIndex("24,4"), { ok: true, value: 24.4, error: null });
  assert.equal(parseHandicapIndex("24,4").value, parseHandicapIndex("24.4").value);
});

test("a dropped tenth is worth a stroke, which is why this matters", () => {
  const tee = courseForTee("IV", "M");
  // 24.4 and the truncated 24.0 do not produce the same course handicap.
  assert.notEqual(courseHandicap(24.4, tee), courseHandicap(24.0, tee));
  assert.equal(courseHandicap(24.4, tee), 19);
  assert.equal(courseHandicap(24.0, tee), 18);
});

/* ---- what is accepted ---- */

test("periods and commas both read as the same index", () => {
  for (const [text, value] of [["24.4", 24.4], ["24,4", 24.4], ["24", 24], ["0", 0],
                               ["8.1", 8.1], ["-2.4", -2.4], ["54", 54], ["-10", -10]] as const) {
    const read = parseHandicapIndex(text);
    assert.equal(read.ok, true, `${text} should be accepted`);
    assert.equal(read.value, value, `${text} → ${value}`);
  }
});

test("surrounding whitespace is not a mistake", () => {
  assert.deepEqual(parseHandicapIndex("  24.4  "), { ok: true, value: 24.4, error: null });
});

test("a blank field is not filled in yet, not wrong", () => {
  for (const blank of ["", "   "]) {
    const read = parseHandicapIndex(blank);
    assert.equal(read.ok, true, "blank is allowed");
    assert.equal(read.value, null, "and carries no index");
    assert.equal(read.error, null);
  }
});

/* ---- what is refused ---- */

test("anything that does not parse cleanly is refused, never guessed", () => {
  const refused = [
    "24.4.5",    // two decimal points
    "24,4,5",    // two commas
    "1,234.5",   // a thousands separator
    "2 4",       // a space in the middle
    "abc",
    "24abc",
    "24.",       // a separator with no tenth
    ".4",        // no whole part
    "--4",
    "1e2",       // exponent notation is not a handicap
    "24,,4",
  ];
  for (const text of refused) {
    const read = parseHandicapIndex(text);
    assert.equal(read.ok, false, `${text} must be refused`);
    assert.equal(read.value, null, `${text} must yield no value`);
    assert.ok(read.error && read.error.length > 0, `${text} must say why`);
  }
});

test("an index outside the real range is refused with its own reason", () => {
  for (const text of ["55", "-11", "99"]) {
    const read = parseHandicapIndex(text);
    assert.equal(read.ok, false, `${text} is out of range`);
    assert.match(read.error!, /runs from/, "says what the range is");
  }
});

// In golf "+2.4" means the player GIVES strokes — an index of −2.4. Reading it
// as arithmetic would land on +2.4 and get the sign exactly backwards, a swing
// of nearly five strokes, so it is refused and the man is told how to write it.
test("a plus handicap is refused rather than read with the wrong sign", () => {
  const read = parseHandicapIndex("+2.4");
  assert.equal(read.ok, false);
  assert.equal(read.value, null);
  assert.match(read.error!, /plus handicap/);
  // The form it asks for does work, and is the negative index.
  assert.deepEqual(parseHandicapIndex("-2.4"), { ok: true, value: -2.4, error: null });
});

/* ---- what is written back ---- */

test("an index is always written with a period, never a comma", () => {
  assert.equal(formatHandicapIndex(24.4), "24.4");
  assert.equal(formatHandicapIndex(24), "24");
  assert.equal(formatHandicapIndex(-2.4), "-2.4");
  assert.equal(formatHandicapIndex(null), "", "no index shows as nothing");
  assert.equal(formatHandicapIndex(NaN), "", "and neither does a broken one");
  // Whatever came in, what goes back out is period-decimal and reads the same.
  for (const text of ["24,4", "24.4"]) {
    const value = parseHandicapIndex(text).value;
    assert.equal(formatHandicapIndex(value), "24.4");
    assert.ok(!formatHandicapIndex(value).includes(","), "never a comma");
  }
});

test("a typed index survives the round trip unchanged", () => {
  for (const text of ["24.4", "24,4", "0", "-2.4", "54"]) {
    const once = parseHandicapIndex(text).value;
    const twice = parseHandicapIndex(formatHandicapIndex(once)).value;
    assert.equal(twice, once, `${text} survives text → number → text`);
  }
});
