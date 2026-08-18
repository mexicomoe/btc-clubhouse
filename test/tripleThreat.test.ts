/**
 * Triple Threat — a blow-up hole costs 0.5, and answering it on the very next
 * hole pays 1.0.
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

test("the two rates are one config value each", () => {
  assert.equal(DEFAULT_CONTESTS.tripleThreat.perTriple, 0.5);
  assert.equal(DEFAULT_CONTESTS.tripleThreat.perBounceBack, -1.0);
});

/* ---- what counts as a blow-up ---- */

test("a net double costs 0.5", () => {
  // On the 18th, so nothing can answer it and the penalty stands alone.
  const r = tt(card({ 18: 2 }));
  assert.equal(r.strokes, 0.5);
  assert.match(r.detail, /1 net double, 0 bounce-backs/);
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

test("a net par on the next hole pays 1.0", () => {
  const r = tt(card({ 1: 2 }));
  assert.equal(r.strokes, -0.5, "0.5 charged, 1.0 paid");
  assert.match(r.detail, /1 net double, 1 bounce-back/);
});

test("a net birdie on the next hole answers it too", () => {
  assert.equal(tt(card({ 1: 2, 2: -1 })).strokes, -0.5);
});

test("a net bogey on the next hole does not answer it", () => {
  assert.equal(tt(card({ 1: 2, 2: 1 })).strokes, 0.5);
});

test("only the very next hole counts", () => {
  // Blow-up on 1, bogey on 2, par on 3. The par comes too late.
  assert.equal(tt(card({ 1: 2, 2: 1 })).strokes, 0.5);
});

test("a blow-up on the 18th can only cost", () => {
  assert.equal(tt(card({ 18: 2 })).strokes, 0.5);
});

test("two net doubles running leave the first unanswered", () => {
  const r = tt(card({ 1: 2, 2: 2 }));
  assert.equal(r.strokes, 0, "two charged at 0.5, one answered at 1.0");
  assert.match(r.detail, /2 net doubles, 1 bounce-back/);
});

test("three running leave the first two unanswered", () => {
  const r = tt(card({ 1: 2, 2: 2, 3: 2 }));
  assert.equal(r.strokes, 0.5, "1.5 charged, 1.0 paid");
});

test("a blow-up answered is better than no blow-up at all", () => {
  // Which is the contest's whole shape: the recovery is worth more than the
  // damage, so a man who steadies the ship comes out ahead.
  assert.ok(tt(card({ 1: 2 })).strokes < tt(card()).strokes);
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

test("a picked-up hole can be bounced back off", () => {
  const r = tt(card({}, { pickedUp: [1] }));
  assert.equal(r.strokes, -0.5);
});

/* ---- incomplete ---- */

test("an unplayed hole is neither a blow-up nor an answer", () => {
  const r = tt(card({ 1: 2 }, { unplayed: [2] }));
  assert.equal(r.strokes, 0.5, "charged, but nothing answered it");
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
