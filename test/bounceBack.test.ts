/**
 * Bounce Back — a net par or better on the hole IMMEDIATELY AFTER a net double
 * bogey. −1.0 for each one.
 *
 * ITS OWN CONTEST AGAIN, with its own value and its own switch, after a spell
 * as the second half of Triple Threat. The scoring link is unchanged and always
 * was the whole of it: a recovery counts on the next hole and nowhere else.
 *
 * The two switches are independent. A blow-up is a fact about the card rather
 * than about whether it is being charged for, so a recovery pays even in a
 * round where Triple Threat is switched off — the only reading that lets the
 * two switches be genuinely separate.
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
const bb = (c: PlayerCard) =>
  scorePlayer(c, ABERDEEN_TEE_IV, DEFAULT_CONTESTS).contests.bounceBack!;

test("the rate is one config value", () => {
  assert.equal(DEFAULT_CONTESTS.bounceBack!.perBounceBack, -1.0);
});

/* ---- when it fires ---- */

test("a net par on the hole after a net double pays 1.0", () => {
  const r = bb(card({ 1: 2 }));
  assert.equal(r.strokes, -1);
  assert.match(r.detail, /1 off a net double/);
});

test("a net birdie on the next hole answers it too", () => {
  assert.equal(bb(card({ 1: 2, 2: -1 })).strokes, -1);
});

test("a net bogey on the next hole does not answer it", () => {
  assert.equal(bb(card({ 1: 2, 2: 1 })).strokes, 0);
});

test("only the very next hole counts", () => {
  // Blow-up on 1, bogey on 2, par on 3. The par comes one hole too late.
  assert.equal(bb(card({ 1: 2, 2: 1 })).strokes, 0);
});

test("a par with no blow-up before it pays nothing", () => {
  // Which is the contest: it is a recovery, not a par.
  assert.equal(bb(card()).strokes, 0);
  assert.match(bb(card()).detail, /no bounce-backs/);
});

test("a net bogey is not something to recover from", () => {
  assert.equal(bb(card({ 1: 1 })).strokes, 0);
});

test("a blow-up on the 18th has no next hole to recover on", () => {
  assert.equal(bb(card({ 18: 2 })).strokes, 0);
});

test("two net doubles running leave the first unanswered", () => {
  // The second is answered by the par on the 3rd; the first is answered by
  // another blow-up, which is no answer at all.
  const r = bb(card({ 1: 2, 2: 2 }));
  assert.equal(r.strokes, -1);
});

test("several recoveries each pay", () => {
  assert.equal(bb(card({ 1: 2, 4: 2, 7: 2 })).strokes, -3);
});

test("a picked-up hole can be recovered from", () => {
  // It fills in at par + 4, which caps to a net double — a blow-up by any
  // reading, and steadying the ship after one is exactly what this pays for.
  assert.equal(bb(card({}, { pickedUp: [1] })).strokes, -1);
});

test("an unplayed hole after a blow-up is not a recovery", () => {
  assert.equal(bb(card({ 1: 2 }, { unplayed: [2] })).strokes, 0);
});

test("an empty card scores nothing", () => {
  const r = scorePlayer(
    { name: "T", courseHandicap: 0, gross: PAR.map(() => null), picks: { ...SIX } } as any,
    ABERDEEN_TEE_IV, DEFAULT_CONTESTS).contests.bounceBack!;
  assert.equal(r.strokes, 0);
  assert.equal(r.live, false);
});

/* ---- the two switches are independent ---- */

test("it pays even when Triple Threat is switched off", () => {
  // The blow-up still happened. Whether the round charges for it is a separate
  // question, and this is what makes the two switches genuinely separate.
  const r = scorePlayer(card({ 1: 2 }), ABERDEEN_TEE_IV,
    { ...DEFAULT_CONTESTS, tripleThreat: null } as any);
  assert.equal(r.contests.tripleThreat, undefined);
  assert.equal(r.contests.bounceBack!.strokes, -1);
});

test("switching it off leaves Triple Threat charging as before", () => {
  const r = scorePlayer(card({ 1: 2 }), ABERDEEN_TEE_IV,
    { ...DEFAULT_CONTESTS, bounceBack: null } as any);
  assert.equal(r.contests.bounceBack, undefined);
  assert.equal(r.contests.tripleThreat!.strokes, 0.5);
});

test("both off leaves neither on the card", () => {
  const r = scorePlayer(card({ 1: 2 }), ABERDEEN_TEE_IV,
    { ...DEFAULT_CONTESTS, tripleThreat: null, bounceBack: null } as any);
  assert.equal(r.contests.tripleThreat, undefined);
  assert.equal(r.contests.bounceBack, undefined);
});

test("together they are the pair they always were", () => {
  // Charged 0.5, paid 1.0 — a man who steadies the ship comes out ahead, which
  // is the shape the two were designed with and splitting them did not change.
  const r = scorePlayer(card({ 1: 2 }), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const both = r.contests.tripleThreat!.strokes + r.contests.bounceBack!.strokes;
  assert.equal(Math.round(both * 10) / 10, -0.5);
});
