/**
 * Watch the Birdie — two par 4s nominated before the round, one per nine.
 * A net birdie or better on a nominated hole pays; both picks can pay, so the
 * contest is worth up to −2.0.
 *
 * The legal picks are derived from the course's par, never hardcoded, so a
 * course with different par 4s offers different picks with no code change.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, birdiePickHoles, type PlayerCard } from "../src/scoring.ts";

const PAR = ABERDEEN_TEE_IV.par;

/** Level par on every hole. Off an 18 handicap that is a stroke a hole, so every
 *  hole nets one under par — a birdie on whichever holes get nominated. */
function levelPar(picks?: { front: number; back: number }, unplayed: number[] = []): PlayerCard {
  const gross: (number | null)[] = PAR.map((p) => p);
  for (const h of unplayed) gross[h - 1] = null;
  return { name: "Test Player", courseHandicap: 18, gross, picks };
}

const score = (card: PlayerCard) =>
  scorePlayer(card, ABERDEEN_TEE_IV, DEFAULT_CONTESTS).contests.watchTheBirdie;

test("the legal picks are derived from par, not hardcoded", () => {
  const { front, back } = birdiePickHoles(ABERDEEN_TEE_IV);
  assert.deepEqual(front, [1, 2, 5, 6, 9], "front-nine par 4s");
  assert.deepEqual(back, [10, 11, 12, 14, 15], "back-nine par 4s");
  // Every listed hole really is a par 4 on the right nine.
  for (const h of front) { assert.equal(PAR[h - 1], 4); assert.ok(h <= 9); }
  for (const h of back) { assert.equal(PAR[h - 1], 4); assert.ok(h >= 10); }
});

test("both picks pay, for the full −2.0", () => {
  const r = score(levelPar({ front: 5, back: 14 }));
  assert.equal(r.strokes, -2.0);
  assert.equal(r.detail, "2 of 2 picks");
  assert.equal(r.live, true);
});

test("one nominated birdie pays −1.0", () => {
  // Hole 5 bogeyed (gross par+2 nets par+1), hole 14 left at level par.
  const card = levelPar({ front: 5, back: 14 });
  card.gross[4] = PAR[4] + 2;
  assert.equal(score(card).strokes, -1.0);
});

test("an unplayed nominated hole scores 0", () => {
  const one = score(levelPar({ front: 5, back: 14 }, [5]));
  assert.equal(one.strokes, -1.0, "the played pick still pays");
  const none = score(levelPar({ front: 5, back: 14 }, [5, 14]));
  assert.equal(none.strokes, 0, "neither pick played, nothing paid");
  assert.equal(none.live, true, "still a live contest, just unpaid");
});

test("a pick that is not a par 4 is rejected", () => {
  // Hole 3 is a par 3; hole 4 is a par 5.
  assert.throws(() => score(levelPar({ front: 3, back: 14 })), /front-nine pick must be a par 4/);
  assert.throws(() => score(levelPar({ front: 4, back: 14 })), /front-nine pick must be a par 4/);
  assert.throws(() => score(levelPar({ front: 5, back: 16 })), /back-nine pick must be a par 4/);
});

test("a pick on the wrong nine is rejected", () => {
  // Hole 10 is a legal BACK pick, but not a legal front one, and vice versa.
  assert.throws(() => score(levelPar({ front: 10, back: 14 })), /front-nine pick must be a par 4/);
  assert.throws(() => score(levelPar({ front: 5, back: 2 })), /back-nine pick must be a par 4/);
});

test("a card with no picks simply doesn't score the contest", () => {
  const r = score(levelPar(undefined));
  assert.equal(r.strokes, 0);
  assert.equal(r.live, false, "shown as not live, like any unscorable contest");
});

// The contest pays per pick, not by counting them — so the two nominated holes
// can be worth different amounts. Nothing uses this yet; it is why the payout
// is a value per hole rather than a ladder over "how many paid".
test("a hard hole can be made to pay more than an easy one", () => {
  const contests = {
    ...DEFAULT_CONTESTS,
    watchTheBirdie: { perPick: -1.0, byHole: { 5: -2.5 } },
  };
  const both = scorePlayer(levelPar({ front: 5, back: 14 }), ABERDEEN_TEE_IV, contests);
  assert.equal(both.contests.watchTheBirdie.strokes, -3.5, "−2.5 for hole 5 plus −1.0 for hole 14");

  // A player who nominated an ordinary hole still gets the flat rate.
  const flat = scorePlayer(levelPar({ front: 6, back: 14 }), ABERDEEN_TEE_IV, contests);
  assert.equal(flat.contests.watchTheBirdie.strokes, -2.0);
});

test("the payout is one config value, applied per pick", () => {
  assert.equal(DEFAULT_CONTESTS.watchTheBirdie.perPick, -1.0);
  const r = score(levelPar({ front: 5, back: 14 }));
  assert.equal(r.strokes, 2 * DEFAULT_CONTESTS.watchTheBirdie.perPick);
});

test("Call Your Number is gone", () => {
  const result = scorePlayer(levelPar({ front: 5, back: 14 }), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.ok(!("callYourNumber" in result.contests), "no Call Your Number in the results");
  assert.ok(!("callYourNumber" in DEFAULT_CONTESTS), "no Call Your Number ladder in config");
});
