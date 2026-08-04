/**
 * Handicap allowance — the percentage a club event plays off, usually 85%.
 *
 * The course handicap is worked out in full and THEN cut to the allowance, so
 * there are two roundings and the order matters. It is not a small adjustment
 * and it does not fall evenly: at 85% a 38 index off Tee IV gives up five shots
 * while an 8 index off Tee I gives up one. It changes who wins.
 *
 * The one thing that must not happen is applying it twice. A course handicap
 * printed on a Golf Genius card already has the event's allowance in it, so it
 * is used exactly as it stands.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS, courseForTee } from "../src/courseConfig.ts";
import {
  courseHandicap, fullCourseHandicap, resolveCourseHandicap, scorePlayer,
  computeLeaderboard, FULL_ALLOWANCE, type PlayerCard,
} from "../src/scoring.ts";

const PAR = ABERDEEN_TEE_IV.par;
const level = () => PAR.slice() as (number | null)[];

/* ---- the arithmetic ---- */

test("the allowance is taken off the full course handicap", () => {
  // The brief's own example: a 38 index off Tee IV is 33 shots, 28 at 85%.
  const tee = courseForTee("IV", "M");
  assert.equal(fullCourseHandicap(38, tee), 33, "the full handicap");
  assert.equal(courseHandicap(38, tee, 85), 28, "plays off 28 at 85%");
  assert.equal(fullCourseHandicap(38, tee) - courseHandicap(38, tee, 85), 5, "five shots");
});

test("it costs the low handicap far less than the high one", () => {
  const back = courseForTee("I", "M");
  assert.equal(fullCourseHandicap(8, back), 10);
  assert.equal(courseHandicap(8, back, 85), 9, "an 8 index gives up one shot");
  assert.equal(fullCourseHandicap(38, back), 47);
  assert.equal(courseHandicap(38, back, 85), 40, "a 38 index gives up seven");
});

test("100% is the full handicap, and the default", () => {
  const tee = courseForTee("IV", "M");
  assert.equal(FULL_ALLOWANCE, 100);
  for (const idx of [8, 20, 26, 38]) {
    assert.equal(courseHandicap(idx, tee, 100), fullCourseHandicap(idx, tee), `${idx} at 100%`);
    assert.equal(courseHandicap(idx, tee), fullCourseHandicap(idx, tee), `${idx} with none given`);
  }
});

test("any allowance the club sets works, not just 85", () => {
  const tee = courseForTee("IV", "M");            // a 38 index is 33 shots here
  assert.equal(courseHandicap(38, tee, 90), 30);   // 29.7
  assert.equal(courseHandicap(38, tee, 80), 26);   // 26.4
  assert.equal(courseHandicap(38, tee, 75), 25);   // 24.75
  assert.equal(courseHandicap(38, tee, 50), 17);   // 16.5, rounded up
});

test("a plus handicap is cut the same way either side of zero", () => {
  // Off the forward tee a low index goes minus: the allowance must not round it
  // the wrong way just because it is negative.
  const tee = courseForTee("V", "M");
  const full = fullCourseHandicap(2, tee);
  assert.ok(full < 0, "a plus handicap off this tee");
  assert.equal(courseHandicap(2, tee, 85), -Math.round(Math.abs(full * 0.85)));
});

/* ---- through a card ---- */

test("a card scored off an index takes the allowance", () => {
  const card: PlayerCard = { name: "x", handicapIndex: 38, tee: "IV", gender: "M",
    gross: level(), allowancePercent: 85 };
  assert.equal(resolveCourseHandicap(card, ABERDEEN_TEE_IV), 28);

  const r = scorePlayer(card, undefined, DEFAULT_CONTESTS);
  assert.equal(r.courseHandicap, 28, "played off");
  assert.equal(r.courseHandicapFull, 33, "and the full figure is kept for showing");
  assert.equal(r.allowancePercent, 85);
});

// The caveat that matters: Golf Genius prints the handicap it used, which
// already has the event's allowance in it. Cutting it again would take a man
// from 33 to 28 to 24 and quietly cost him four more shots.
test("a handicap off a card is used as it stands, never cut again", () => {
  const fromPaste: PlayerCard = { name: "x", courseHandicap: 28, handicapIndex: 38,
    tee: "IV", gender: "M", gross: level(), allowancePercent: 85 };
  assert.equal(resolveCourseHandicap(fromPaste, ABERDEEN_TEE_IV), 28, "as printed");

  const r = scorePlayer(fromPaste, undefined, DEFAULT_CONTESTS);
  assert.equal(r.courseHandicap, 28);
  assert.equal(r.courseHandicapFull, null, "there is no 'full' figure to show");
  // 28 cut again at 85% would be 24 — the number this test exists to prevent.
  assert.notEqual(r.courseHandicap, 24);
});

test("no allowance given means no allowance applied", () => {
  const card: PlayerCard = { name: "x", handicapIndex: 38, tee: "IV", gender: "M", gross: level() };
  assert.equal(resolveCourseHandicap(card, ABERDEEN_TEE_IV), 33);
  assert.equal(scorePlayer(card, undefined, DEFAULT_CONTESTS).allowancePercent, 100);
});

/* ---- what it does to a round ---- */

test("the allowance changes the net, and so the order", () => {
  // Same gross round from both men; only the handicaps differ.
  const high: PlayerCard = { name: "High", handicapIndex: 38, tee: "IV", gender: "M", gross: level() };
  const low: PlayerCard = { name: "Low", handicapIndex: 8, tee: "IV", gender: "M", gross: level() };

  const full = computeLeaderboard(
    [ { ...high }, { ...low } ], undefined, DEFAULT_CONTESTS);
  const cut = computeLeaderboard(
    [ { ...high, allowancePercent: 85 }, { ...low, allowancePercent: 85 } ],
    undefined, DEFAULT_CONTESTS);

  const netOf = (board: typeof full, name: string) => board.find((r) => r.name === name)!.net!;
  // The high handicap loses five shots of net, the low one none.
  assert.equal(netOf(full, "High") + 5, netOf(cut, "High"), "five shots dearer");
  assert.equal(netOf(full, "Low"), netOf(cut, "Low"), "the 8 index is untouched here");
  // Which is exactly how an allowance is meant to close the gap between them.
  assert.ok(netOf(full, "Low") - netOf(full, "High") >
            netOf(cut, "Low") - netOf(cut, "High"), "the gap narrows");
});
