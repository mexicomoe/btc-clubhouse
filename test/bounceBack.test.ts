/**
 * Bounce Back — a net bogey or worse, answered by a net birdie or better on the
 * very next hole.
 *
 * It used to require a net DOUBLE to recover from, which made the contest
 * punish good play: the fewer net doubles a man made, the fewer chances he was
 * given, and a round without one could not score it at all. Ten of sixty-three
 * real rounds were shut out and the correlation with making net doubles was
 * +0.69 — the opposite of what Damage Control rewards, in the same six-contest
 * set. On those sixty-three rounds the rule below shuts nobody out, 30% clear
 * two or more, and the handicap correlation falls to −0.09.
 *
 * The ladder is unchanged: 3 or more −1.5, 2 −1.0, 1 −0.5, none 0.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, type PlayerCard } from "../src/scoring.ts";

const PAR = ABERDEEN_TEE_IV.par;

/** Level par off scratch, so net is gross and every hole reads straight off par. */
function card(edit: (g: number[]) => void = () => {}): PlayerCard {
  const gross = PAR.slice();
  edit(gross);
  return { name: "x", courseHandicap: 0, gross, picks: { front: 5, back: 14 } };
}
const bounces = (c: PlayerCard) =>
  scorePlayer(c, ABERDEEN_TEE_IV, DEFAULT_CONTESTS).contests.bounceBack;

/* ---- what counts ---- */

test("a bogey answered by a birdie counts", () => {
  const r = bounces(card((g) => { g[0] = PAR[0] + 1; g[1] = PAR[1] - 1; }));
  assert.equal(r.detail, "1 bounce-back");
  assert.equal(r.strokes, -0.5);
});

test("worse than a bogey counts too — it is bogey OR WORSE", () => {
  for (const over of [1, 2, 3]) {
    const r = bounces(card((g) => { g[0] = PAR[0] + over; g[1] = PAR[1] - 1; }));
    assert.equal(r.detail, "1 bounce-back", `${over} over answered by a birdie`);
  }
});

test("better than a birdie counts too — it is birdie OR BETTER", () => {
  const r = bounces(card((g) => { g[0] = PAR[0] + 1; g[1] = PAR[1] - 2; }));
  assert.equal(r.detail, "1 bounce-back", "an eagle answers a bogey");
});

test("the ladder pays as it always did", () => {
  const make = (n: number) => card((g) => {
    // n bogey-then-birdie pairs, laid out so they never overlap.
    for (let k = 0; k < n; k++) { g[k * 4] = PAR[k * 4] + 1; g[k * 4 + 1] = PAR[k * 4 + 1] - 1; }
  });
  assert.equal(bounces(make(0)).strokes, 0);
  assert.equal(bounces(make(1)).strokes, -0.5);
  assert.equal(bounces(make(2)).strokes, -1.0);
  assert.equal(bounces(make(3)).strokes, -1.5);
  assert.equal(bounces(make(4)).strokes, -1.5, "and holds at three or more");
});

/* ---- what does not ---- */

test("a par is no longer an answer", () => {
  // The old rule took any recovery to par or better. A birdie is now the price.
  const r = bounces(card((g) => { g[0] = PAR[0] + 2; }));      // double, then par
  assert.equal(r.detail, "0 bounce-backs");
  assert.equal(r.strokes, 0);
});

test("the birdie must be on the very next hole", () => {
  const r = bounces(card((g) => { g[0] = PAR[0] + 1; g[2] = PAR[2] - 1; }));
  assert.equal(r.detail, "0 bounce-backs", "a hole later is not a bounce back");
});

test("a birdie before a bogey is not a bounce back", () => {
  const r = bounces(card((g) => { g[0] = PAR[0] - 1; g[1] = PAR[1] + 1; }));
  assert.equal(r.detail, "0 bounce-backs", "the order is what makes it one");
});

test("both holes must have been played", () => {
  const c = card((g) => { g[0] = PAR[0] + 1; g[1] = PAR[1] - 1; });
  (c.gross as (number | null)[])[1] = null;                    // the answer never happened
  assert.equal(bounces(c).detail, "0 bounce-backs");
});

/* ---- the fault this rule was changed to fix ---- */

test("a round with no net doubles can score it", () => {
  // Under the old rule this card was shut out: nothing to recover FROM. It is
  // an ordinary good round — bogeys and birdies, not a blemish worse than one.
  const clean = card((g) => {
    g[0] = PAR[0] + 1; g[1] = PAR[1] - 1;
    g[6] = PAR[6] + 1; g[7] = PAR[7] - 1;
  });
  const r = scorePlayer(clean, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(r.contests.damageControl.detail, "0 net doubles", "not one all round");
  assert.equal(r.contests.damageControl.strokes, -2.0, "and Damage Control pays its best");
  assert.equal(r.contests.bounceBack.detail, "2 bounce-backs", "Bounce Back pays too, now");
  assert.equal(r.contests.bounceBack.strokes, -1.0);
});

test("the two contests no longer pull against each other", () => {
  // The old rule needed a net double, so the man who avoided them — exactly the
  // man Damage Control rewards — was the man Bounce Back could not pay.
  const spotless = card((g) => { g[0] = PAR[0] + 1; g[1] = PAR[1] - 1; });
  const r = scorePlayer(spotless, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.ok(r.contests.damageControl.strokes < 0, "Damage Control pays");
  assert.ok(r.contests.bounceBack.strokes < 0, "and so can Bounce Back");
});
