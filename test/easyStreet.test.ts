/**
 * Easy Street — the three holes the card is supposed to give back, counted on
 * GROSS scores.
 *
 *   no par     +1.0
 *   one par     0
 *   two or more −1.0
 *
 * Par or better counts as ONE. A birdie is a par for this purpose, so a lone
 * birdie is a count of one and pays nothing, and a birdie beside a par is two
 * rather than three.
 *
 * It replaced Go Long and Get Shorty, and it is the only hole contest graded on
 * gross — every other one runs on net, where a high handicap receives strokes.
 * Here he does not, which is why the contest runs mildly against him. That is
 * the specification, not an oversight in it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, type PlayerCard } from "../src/scoring.ts";

const PAR = ABERDEEN_TEE_IV.par;
const HOLES = ABERDEEN_TEE_IV.easyStreetHoles;

/** A level-par card, then whatever `edit` does to it. */
function card(edit: (g: (number | string | null)[]) => void = () => {},
              courseHandicap = 0): PlayerCard {
  const gross = PAR.slice() as (number | string | null)[];
  edit(gross);
  return { name: "Test", courseHandicap, gross } as PlayerCard;
}
const score = (c: PlayerCard) =>
  scorePlayer(c, ABERDEEN_TEE_IV, DEFAULT_CONTESTS).contests.easyStreet!;

/** Set holes 11, 12, 13 to par + the given offsets. */
const street = (...over: number[]) =>
  card((g) => HOLES.forEach((h, i) => { g[h - 1] = (PAR[h - 1] as number) + over[i]; }));

test("the three holes come off the course, not out of the contest", () => {
  assert.deepEqual(HOLES, [11, 12, 13]);
});

/* ---- the ladder ---- */

test("no par on the three costs 1.0", () => {
  const r = score(street(1, 1, 1));
  assert.equal(r.strokes, 1.0);
  assert.equal(r.detail, "no pars on the three");
  assert.equal(r.live, true);
});

test("one par pays nothing", () => {
  assert.equal(score(street(0, 1, 1)).strokes, 0);
  assert.equal(score(street(1, 0, 1)).strokes, 0);
  assert.equal(score(street(1, 1, 0)).strokes, 0);
  assert.equal(score(street(0, 1, 1)).detail, "1 of 3 at par or better");
});

test("two pars pay 1.0", () => {
  assert.equal(score(street(0, 0, 1)).strokes, -1.0);
  assert.equal(score(street(0, 0, 1)).detail, "2 of 3 at par or better");
});

test("all three pay the same as two — the ladder tops out", () => {
  assert.equal(score(street(0, 0, 0)).strokes, -1.0);
  assert.equal(score(street(0, 0, 0)).detail, "3 of 3 at par or better");
});

/* ---- par or better counts as ONE ---- */

// The rule that decides the whole shape of the contest. A birdie is a par here.
test("a lone birdie is a count of one, and pays nothing", () => {
  const r = score(street(1, 1, -1));
  assert.equal(r.strokes, 0, "one hole at par or better, whatever it was");
  assert.equal(r.detail, "1 of 3 at par or better");
});

test("a birdie beside a par is two, not three", () => {
  const r = score(street(-1, 0, 1));
  assert.equal(r.strokes, -1.0);
  assert.equal(r.detail, "2 of 3 at par or better");
});

test("an eagle is still one hole", () => {
  assert.equal(score(street(-2, 1, 1)).strokes, 0);
  assert.equal(score(street(-2, -2, 1)).strokes, -1.0, "two eagles are two, not four");
});

/* ---- gross, not net ---- */

// Every other hole contest grades on net. This one does not, so a man off 36 —
// two strokes on every hole — gets no help at all.
test("it reads gross, so handicap strokes do not create pars", () => {
  // Off 18 he has exactly one stroke on every hole, so a gross bogey on all
  // three IS a net par on all three — and Easy Street still charges him 1.0.
  const bogeys = street(1, 1, 1);
  bogeys.courseHandicap = 18;
  const r = scorePlayer(bogeys, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.deepEqual([10, 11, 12].map((i) => r.netByHole![i]),
    [10, 11, 12].map((i) => PAR[i]), "all three net par");
  assert.equal(r.contests.easyStreet!.strokes, 1.0, "and gross bogey pays the penalty anyway");
});

test("the same card scores the same off every tee", () => {
  // Par is identical from all nine tees, and this contest never looks at the
  // stroke index, so nothing about the tee can move it.
  for (const tee of ["I", "III", "IV", "V"]) {
    const c = street(0, 0, 1);
    c.tee = tee; c.courseHandicap = 18;
    assert.equal(scorePlayer(c, undefined, DEFAULT_CONTESTS).contests.easyStreet!.strokes,
      -1.0, "Tee " + tee);
  }
});

/* ---- holes that were not played ---- */

// The contest can PENALISE, so it must not charge a man for holes he never
// stood on — the same reason Agony Alley waits for its stretch.
test("it waits for all three holes", () => {
  for (const missing of [11, 12, 13]) {
    const c = street(1, 1, 1);
    c.gross[missing - 1] = null;
    const r = score(c);
    assert.equal(r.live, false, "hole " + missing + " unplayed");
    assert.equal(r.strokes, 0, "and nothing is charged");
    assert.equal(r.detail, "needs holes 11–13");
  }
});

test("a front-nine card is not charged for the back", () => {
  const front = card((g) => { for (let i = 9; i < 18; i++) g[i] = null; });
  const r = scorePlayer(front, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(r.contests.easyStreet!.live, false);
  assert.equal(r.contests.easyStreet!.strokes, 0);
});

// A pick-up is a played hole showing par + 4 — not a par, but not a gap either.
test("a picked-up hole is played, and is not a par", () => {
  const c = street(0, 0, 0);
  c.gross[10] = "X";
  const r = score(c);
  assert.equal(r.live, true, "the hole was played");
  assert.equal(r.strokes, -1.0, "12 and 13 still carry it");
  assert.equal(r.detail, "2 of 3 at par or better");
});

/* ---- what it replaced ---- */

test("Go Long and Get Shorty are switched off, not merely zero", () => {
  assert.equal(DEFAULT_CONTESTS.goLong, null);
  assert.equal(DEFAULT_CONTESTS.getShorty, null);
  const r = scorePlayer(card(), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(r.contests.goLong, undefined, "absent from the card entirely");
  assert.equal(r.contests.getShorty, undefined);
});

test("switching Easy Street off in turn leaves it off the card", () => {
  const r = scorePlayer(card(), ABERDEEN_TEE_IV, { ...DEFAULT_CONTESTS, easyStreet: null });
  assert.equal(r.contests.easyStreet, undefined);
  assert.ok(Number.isFinite(r.final!), "and the round still scores");
});

test("every value it can pay is a clean tenth", () => {
  for (const over of [[1,1,1],[0,1,1],[0,0,1],[0,0,0],[-1,1,1],[-2,-2,-2]]) {
    const v = score(street(...over)).strokes;
    assert.equal(Math.round(v * 10) / 10, v, JSON.stringify(over));
  }
});
