/**
 * Easy Street — holes 11, 12 and 13, counted at NET par or better.
 *
 *   three  −1
 *   two     0
 *   one    +1
 *   none   +2
 *
 * IT WAS SCORED ON GROSS UNTIL 15 AUGUST, and that reversal is the whole point
 * of this file. Gross failed in the direction that matters: on 14 August five
 * of seven finishers made ZERO gross pars on these three and nobody made two,
 * so the contest penalised 71% of the field and rewarded no one. Across the
 * archive gross pars run r = −0.36 with index WITHIN a single tee — it was
 * measuring the handicap, not the play. Net pars run +0.08.
 *
 * The threshold moved up a rung with it, because net pars are common: all three
 * happens on 34% of rounds and two on 47%.
 *
 * A hole counts ONCE however far under par it went — a net birdie is a net par
 * for this purpose, so a birdie beside a par is two, not three.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, type PlayerCard } from "../src/scoring.ts";

const PAR = ABERDEEN_TEE_IV.par;
const HOLES = ABERDEEN_TEE_IV.easyStreetHoles;
const SIX = { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 };

function card(opts: {
  over?: Record<number, number>;
  courseHandicap?: number;
  unplayed?: number[];
  pickedUp?: number[];
} = {}): PlayerCard {
  const gross = PAR.map((p, i) => p + ((opts.over || {})[i + 1] || 0)) as (number | string | null)[];
  for (const h of opts.unplayed || []) gross[h - 1] = null;
  for (const h of opts.pickedUp || []) gross[h - 1] = "X";
  return { name: "Test", courseHandicap: opts.courseHandicap ?? 0, gross, picks: { ...SIX } } as PlayerCard;
}
const easy = (c: PlayerCard) =>
  scorePlayer(c, ABERDEEN_TEE_IV, DEFAULT_CONTESTS).contests.easyStreet!;

test("the three holes come off the course, not the contest", () => {
  assert.deepEqual(HOLES, [11, 12, 13]);
  assert.equal(HOLES.reduce((n, h) => n + PAR[h - 1], 0), 11, "par 11 across the three");
});

/* ---- the ladder ---- */

test("three net pars pay 1", () => {
  assert.equal(easy(card()).strokes, -1);
  assert.match(easy(card()).detail, /3 of 3 at net par or better/);
});

test("two net pars pay nothing", () => {
  assert.equal(easy(card({ over: { 11: 1 } })).strokes, 0);
});

test("one net par costs 1", () => {
  assert.equal(easy(card({ over: { 11: 1, 12: 1 } })).strokes, 1);
});

test("no net pars costs 2", () => {
  const r = easy(card({ over: { 11: 1, 12: 1, 13: 1 } }));
  assert.equal(r.strokes, 2);
  assert.match(r.detail, /no net pars on the three/);
});

/* ---- net, not gross ---- */

test("a gross bogey with a stroke on it counts as a par", () => {
  // Off 18 a man has a stroke on all three. Three gross bogeys are three NET
  // pars and take the top rung — on gross this exact card scored nothing.
  const r = easy(card({ over: { 11: 1, 12: 1, 13: 1 }, courseHandicap: 18 }));
  assert.equal(r.strokes, -1);
});

test("the same gross card scores differently off different handicaps", () => {
  const over = { 11: 1, 12: 1, 13: 1 };
  assert.equal(easy(card({ over })).strokes, 2, "off scratch: three bogeys, no pars");
  assert.equal(easy(card({ over, courseHandicap: 18 })).strokes, -1, "off 18: three net pars");
});

test("strokes fall by the stroke index, not evenly", () => {
  // Off 8 a man does not have a stroke on all three, so the same three bogeys
  // land between the two extremes above.
  const r = easy(card({ over: { 11: 1, 12: 1, 13: 1 }, courseHandicap: 8 }));
  assert.ok(r.strokes > -1 && r.strokes <= 2, "somewhere in between: " + r.strokes);
});

/* ---- counting ---- */

test("a lone net birdie is a count of one, and costs 1", () => {
  // Under par counts once, not twice. One hole under, two over.
  const r = easy(card({ over: { 11: -1, 12: 1, 13: 1 } }));
  assert.equal(r.strokes, 1);
});

test("a birdie beside a par is two, not three", () => {
  const r = easy(card({ over: { 11: -1, 13: 1 } }));
  assert.equal(r.strokes, 0);
});

test("an eagle is still one hole", () => {
  const r = easy(card({ over: { 11: -2, 12: 1, 13: 1 } }));
  assert.equal(r.strokes, 1);
});

/* ---- incomplete ---- */

test("all three must be played, because the contest can penalise", () => {
  // A man cannot be charged for failing to par a hole he never stood on.
  const r = easy(card({ unplayed: [13] }));
  assert.equal(r.live, false);
  assert.equal(r.strokes, 0);
  assert.match(r.detail, /needs holes 11–13/);
});

test("a picked-up hole is played, and is not a net par", () => {
  // Picked up fills in at par + 4, which caps to a net double.
  const r = easy(card({ pickedUp: [11] }));
  assert.equal(r.live, true);
  assert.equal(r.strokes, 0, "two of three");
});

test("switching Easy Street off leaves it off the card entirely", () => {
  const r = scorePlayer(card(), ABERDEEN_TEE_IV, { ...DEFAULT_CONTESTS, easyStreet: null } as any);
  assert.equal(r.contests.easyStreet, undefined);
});

test("the ladder in the config is the one the brief published", () => {
  assert.deepEqual(DEFAULT_CONTESTS.easyStreet, [
    { threshold: 0, strokes: 2 },
    { threshold: 1, strokes: 1 },
    { threshold: 2, strokes: 0 },
    { threshold: 99, strokes: -1 },
  ]);
});
