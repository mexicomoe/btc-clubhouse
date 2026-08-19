/**
 * Triple Threat — a blow-up hole costs 0.5.
 *
 * ITS OWN CONTEST AGAIN, with its own switch. The recovery is Bounce Back and
 * has a file of its own; the two read the same facts about the round and stay
 * linked in the scoring — a recovery only ever counts on the hole straight
 * after a blow-up — but they are separate contests everywhere a man looks.
 *
 * A BLOW-UP IS NOW A NET DOUBLE BOGEY, not a gross triple. That is the change
 * of 15 August and it is what this file is mostly about. Gross triples were a
 * handicap measurement wearing a contest's clothes: within a single tee they
 * run r = +0.43 with handicap index. Net doubles run +0.01.
 *
 * The name stays. For a man with a stroke on the hole a net double IS a gross
 * triple — the same figure on the card — so it stays true for most players on
 * most holes.
 *
 * The answer keeps the name of the contest it absorbed: BOUNCE BACK, a net par
 * or better on the very next hole.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, type PlayerCard } from "../src/scoring.ts";

const PAR = ABERDEEN_TEE_IV.par;
const SIX = { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 };

function card(over: Record<number, number> = {}, opts: {
  courseHandicap?: number; unplayed?: number[]; pickedUp?: number[];
} = {}): PlayerCard {
  const gross = PAR.map((p, i) => p + (over[i + 1] || 0)) as (number | string | null)[];
  for (const h of opts.unplayed || []) gross[h - 1] = null;
  for (const h of opts.pickedUp || []) gross[h - 1] = "X";
  return { name: "Test", courseHandicap: opts.courseHandicap ?? 0, gross, picks: { ...SIX } } as PlayerCard;
}
const tt = (c: PlayerCard) =>
  scorePlayer(c, ABERDEEN_TEE_IV, DEFAULT_CONTESTS).contests.tripleThreat!;

test("the rate is one config value", () => {
  assert.equal(DEFAULT_CONTESTS.tripleThreat!.perTriple, 0.5);
  assert.equal((DEFAULT_CONTESTS.tripleThreat as any).perBounceBack, undefined,
    "the recovery is Bounce Back's now, not a second value here");
});

/* ---- what counts as a blow-up ---- */

test("a net double costs 0.5", () => {
  // On the 18th, so nothing can answer it and the penalty stands alone.
  const r = tt(card({ 18: 2 }));
  assert.equal(r.strokes, 0.5);
  assert.match(r.detail, /^1 net double$/);
});

test("a net bogey is not a blow-up", () => {
  assert.equal(tt(card({ 18: 1 })).strokes, 0);
  assert.match(tt(card({ 18: 1 })).detail, /no net doubles/);
});

test("a gross triple with a stroke on it is a net double, and counts", () => {
  const r = tt(card({ 18: 3 }, { courseHandicap: 18 }));
  assert.equal(r.strokes, 0.5);
});

test("a gross double with a stroke on it is only a net bogey, and does not", () => {
  assert.equal(tt(card({ 18: 2 }, { courseHandicap: 18 })).strokes, 0);
});

test("off scratch the gross double IS the net double", () => {
  // The same contest reading two cards correctly, which is the point of moving
  // it to net: the measure is the man's own score against his own par.
  assert.equal(tt(card({ 18: 2 })).strokes, 0.5);
});

test("worse than a net double is still one blow-up", () => {
  assert.equal(tt(card({ 18: 5 })).strokes, 0.5);
});

/* ---- the bounce back ---- */

test("the recovery does not change what Triple Threat charges", () => {
  // Whether he bounced back is Bounce Back's business. The penalty is the same.
  assert.equal(tt(card({ 1: 2 })).strokes, 0.5, "answered");
  assert.equal(tt(card({ 1: 2, 2: 1 })).strokes, 0.5, "not answered");
});

test("a blow-up on the 18th can only cost", () => {
  assert.equal(tt(card({ 18: 2 })).strokes, 0.5);
});

test("every blow-up is charged, however they fall", () => {
  assert.equal(tt(card({ 1: 2, 2: 2 })).strokes, 1);
  assert.equal(tt(card({ 1: 2, 2: 2, 3: 2 })).strokes, 1.5);
});

test("switching Bounce Back off does not change what it charges", () => {
  const off = scorePlayer(card({ 1: 2 }), ABERDEEN_TEE_IV,
    { ...DEFAULT_CONTESTS, bounceBack: null } as any);
  assert.equal(off.contests.tripleThreat!.strokes, 0.5);
  assert.equal(off.contests.bounceBack, undefined);
});

/* ---- picked up ---- */

test("a picked-up hole IS a blow-up", () => {
  // It fills in at par + 4, which caps to a net double, and a hole a man picked
  // up on was a blow-up by any reading. The old gross-triple rule had to
  // EXCLUDE it, or a Stableford round charged a man for doing what Stableford
  // asks him to do — that exclusion is gone with the rule that needed it.
  const r = tt(card({}, { pickedUp: [18] }));
  assert.equal(r.strokes, 0.5);
});

test("a picked-up hole is charged like any other blow-up", () => {
  assert.equal(tt(card({}, { pickedUp: [1] })).strokes, 0.5);
});

/* ---- incomplete ---- */

test("an unplayed hole is not a blow-up", () => {
  assert.equal(tt(card({}, { unplayed: [2] })).strokes, 0);
});

test("an empty card scores nothing", () => {
  const r = scorePlayer(
    { name: "T", courseHandicap: 0, gross: PAR.map(() => null), picks: { ...SIX } } as any,
    ABERDEEN_TEE_IV, DEFAULT_CONTESTS).contests.tripleThreat!;
  assert.equal(r.strokes, 0);
  assert.equal(r.live, false);
});

test("switching it off leaves it off the card entirely", () => {
  const r = scorePlayer(card(), ABERDEEN_TEE_IV, { ...DEFAULT_CONTESTS, tripleThreat: null } as any);
  assert.equal(r.contests.tripleThreat, undefined);
});

test("the total is always a clean tenth", () => {
  const r = tt(card({ 1: 2, 4: 2, 7: 2 }));
  assert.equal(Math.round(r.strokes * 10) / 10, r.strokes);
});

test("it is switched off on its own, leaving Bounce Back running", () => {
  const r = scorePlayer(card({ 1: 2 }), ABERDEEN_TEE_IV,
    { ...DEFAULT_CONTESTS, tripleThreat: null } as any);
  assert.equal(r.contests.tripleThreat, undefined);
  assert.equal(r.contests.bounceBack!.strokes, -1, "a recovery still pays");
});
