/**
 * Triple Threat — a gross triple bogey or worse costs, and answering it with a
 * net par or better on the very next hole more than pays it back.
 *
 *   gross triple bogey or worse        +0.5
 *   a BOUNCE BACK off it — net par or better on the next hole — −0.9
 *
 * One flat rate for everybody: no handicap bands. The two halves are read
 * differently on purpose — the damage is what he actually shot, the bounce back is
 * what he shot after his strokes, because steadying the ship is the thing being
 * asked for and a 24-handicap should not have to match a scratch card to do it.
 *
 * A PICKED-UP HOLE IS NEVER A TRIPLE. It shows a gross of par + 4 and would
 * otherwise clear the bar, which would mean a Stableford round charging a man
 * for the one thing Stableford tells him to do.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, type PlayerCard } from "../src/scoring.ts";

const PAR = ABERDEEN_TEE_IV.par;

function card(edit: (g: (number | string | null)[]) => void = () => {},
              courseHandicap = 0): PlayerCard {
  const gross = PAR.slice() as (number | string | null)[];
  edit(gross);
  return { name: "Test", courseHandicap, gross } as PlayerCard;
}
const score = (c: PlayerCard) =>
  scorePlayer(c, ABERDEEN_TEE_IV, DEFAULT_CONTESTS).contests.tripleThreat!;
/** Play hole `h` at par + `over`. Holes are 1-based. */
const at = (g: (number | string | null)[], h: number, over: number) => {
  g[h - 1] = (PAR[h - 1] as number) + over;
};

test("the rates are one flat pair, with no bands", () => {
  assert.deepEqual(DEFAULT_CONTESTS.tripleThreat, { perTriple: 0.5, perBounceBack: -0.9 });
});

/* ---- the damage ---- */

test("a clean round pays nothing and is still live", () => {
  const r = score(card());
  assert.equal(r.strokes, 0);
  assert.equal(r.detail, "no triples");
  assert.equal(r.live, true);
});

test("a triple with no bounce back costs 0.5", () => {
  // Triple on 1, bogey on 2 — nothing to answer it with.
  const r = score(card((g) => { at(g, 1, 3); at(g, 2, 1); }));
  assert.equal(r.strokes, 0.5);
  assert.equal(r.detail, "1 triple, 0 bounce-backs");
});

test("worse than a triple is still one triple", () => {
  for (const over of [3, 4, 5, 8]) {
    const r = score(card((g) => { at(g, 1, over); at(g, 2, 1); }));
    assert.equal(r.strokes, 0.5, "par + " + over);
  }
});

test("a double bogey is not a triple", () => {
  assert.equal(score(card((g) => { at(g, 1, 2); })).strokes, 0);
});

test("triples add up", () => {
  const r = score(card((g) => { [1, 4, 8].forEach((h) => at(g, h, 3)); [2, 5, 9].forEach((h) => at(g, h, 1)); }));
  assert.equal(r.strokes, 1.5);
  assert.equal(r.detail, "3 triples, 0 bounce-backs");
});

/* ---- the bounce back ---- */

test("bouncing back off a triple with a net par turns 0.5 into −0.4", () => {
  // Triple on 1, par on 2 — off scratch, a gross par is a net par.
  const r = score(card((g) => { at(g, 1, 3); }));
  assert.equal(r.strokes, -0.4);
  assert.equal(r.detail, "1 triple, 1 bounce-back");
});

test("better than a net par bounces back just as well", () => {
  assert.equal(score(card((g) => { at(g, 1, 3); at(g, 2, -1); })).strokes, -0.4);
  assert.equal(score(card((g) => { at(g, 1, 3); at(g, 2, -2); })).strokes, -0.4);
});

test("a net bogey is not a bounce back", () => {
  assert.equal(score(card((g) => { at(g, 1, 3); at(g, 2, 1); })).strokes, 0.5);
});

// The bounce back is NET, so a man receiving a stroke on the next hole answers with
// a gross bogey. This is the half of the contest that is handicap-aware.
test("the bounce back is read on net, not gross", () => {
  const c = card((g) => { at(g, 1, 3); at(g, 2, 1); }, 18);   // a stroke on every hole
  assert.equal(score(c).strokes, -0.4, "gross bogey on 2 is a net par");
  const scratch = card((g) => { at(g, 1, 3); at(g, 2, 1); }, 0);
  assert.equal(score(scratch).strokes, 0.5, "off scratch the same card does not answer");
});

test("only the very next hole counts", () => {
  // Triple on 1, bogey on 2, par on 3 — the par comes a hole too late.
  assert.equal(score(card((g) => { at(g, 1, 3); at(g, 2, 1); })).strokes, 0.5);
});

test("a triple on the 18th can only cost — there is no next hole", () => {
  const r = score(card((g) => { at(g, 18, 3); }));
  assert.equal(r.strokes, 0.5);
  assert.equal(r.detail, "1 triple, 0 bounce-backs");
});

test("consecutive triples leave the first without a bounce back", () => {
  // Triples on 1 and 2, par on 3. The 2nd answers nothing for the 1st; the 3rd
  // hole answers the triple on 2.
  const r = score(card((g) => { at(g, 1, 3); at(g, 2, 3); }));
  assert.equal(r.detail, "2 triples, 1 bounce-back");
  assert.equal(r.strokes, 0.1, "1.0 charged, 0.9 given back — a tenth adrift, and it shows");
});

// The bounce back used to be exactly TWICE the penalty — 0.3 and 0.6 — so two
// triples with one bounce back came out at nothing. Scaling by 1.5 and rounding
// to tenths took 0.45 to 0.5 and left 0.9 alone, so it is now 1.8× the
// penalty and that no longer cancels: it comes to a tenth on the wrong side.
// Deliberate, and a consequence of the rounding rather than of the ratio.
test("the bounce back is no longer exactly twice the penalty", () => {
  const cfg = DEFAULT_CONTESTS.tripleThreat!;
  assert.equal(cfg.perTriple, 0.5);
  assert.equal(cfg.perBounceBack, -0.9);
  assert.notEqual(Math.abs(cfg.perBounceBack), cfg.perTriple * 2, "1.8×, not 2×");

  const r = score(card((g) => { at(g, 1, 3); at(g, 2, 3); }));
  assert.equal(r.strokes, 0.1, "two triples, one bounce back, is a tenth against him");
  assert.equal(Object.is(r.strokes, -0), false, "never a negative zero");
});

/* ---- pick-ups ---- */

test("a picked-up hole is never a triple", () => {
  const r = score(card((g) => { g[0] = "X"; g[3] = "X"; }));
  assert.equal(r.strokes, 0);
  assert.equal(r.detail, "no triples");
});

test("but the same hole actually played to par + 4 is one", () => {
  const r = score(card((g) => { at(g, 1, 4); at(g, 2, 1); }));
  assert.equal(r.strokes, 0.5);
  assert.equal(r.detail, "1 triple, 0 bounce-backs");
});

// A pick-up is net double, which is not a net par — so it cannot bounce back either.
test("a pick-up is not a bounce back off the triple before it", () => {
  const r = score(card((g) => { at(g, 1, 3); g[1] = "X"; }));
  assert.equal(r.strokes, 0.5, "the triple on 1 gets no bounce back");
});

/* ---- unplayed holes ---- */

test("a hole not played is neither a triple nor a bounce back", () => {
  const blank = score(card((g) => { at(g, 1, 3); g[1] = null; }));
  assert.equal(blank.strokes, 0.5, "hole 2 is a gap, so nothing bounces back off the triple");

  const front = score(card((g) => { for (let i = 9; i < 18; i++) g[i] = null; }));
  assert.equal(front.strokes, 0, "nine holes played clean, nothing charged for the rest");
  assert.equal(front.live, true, "and it stays a live contest");
});

/* ---- arithmetic ---- */

// 0.5 and −0.9 do not add exactly in binary, and they no longer cancel either:
// two triples both bounced back is 1.0 − 1.8, a penalty that pays 0.8 back. Every figure the contest returns
// must still be a clean tenth.
test("every total is a clean tenth", () => {
  for (let t = 0; t <= 6; t++) {
    const c = card((g) => {
      for (let k = 0; k < t; k++) { at(g, 1 + k * 2, 3); at(g, 2 + k * 2, 1); }
    });
    const v = score(c).strokes;
    assert.equal(Math.round(v * 10) / 10, v, t + " triples");
  }
  // And with the recoveries in, which is where the dust actually came from.
  for (let t = 1; t <= 5; t++) {
    const c = card((g) => { for (let k = 0; k < t; k++) at(g, 1 + k * 2, 3); });
    const v = score(c).strokes;
    assert.equal(Math.round(v * 10) / 10, v, t + " triples bounced back");
  }
});

test("the strokes it pays reach the final, still as a clean tenth", () => {
  const c = card((g) => { at(g, 1, 3); at(g, 3, 3); at(g, 5, 3); });
  const r = scorePlayer(c, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(Math.round(r.strokesEarned * 10) / 10, r.strokesEarned, "strokes earned");
  assert.equal(Math.round(r.final! * 10) / 10, r.final, "final");
});

test("switching it off leaves it off the card", () => {
  const r = scorePlayer(card((g) => at(g, 1, 3)), ABERDEEN_TEE_IV,
    { ...DEFAULT_CONTESTS, tripleThreat: null });
  assert.equal(r.contests.tripleThreat, undefined);
  assert.ok(Number.isFinite(r.final!));
});
