/**
 * Watch the Birdie — six nominated holes, a par 3, a par 4 and a par 5 on each
 * nine, each paying on its own.
 *
 *   net birdie  −0.8
 *   net eagle   −1.5
 *
 * Holes 4 and 18 pay DOUBLE — 1.6 and 3.0. Hole 4 was measured as the worst par
 * 5 to nominate by a distance, so its slot was a formality; 18 was already the
 * best of its pair and doubling makes it the pick of the back nine.
 *
 * A hole pays the BEST single result on it. A net eagle pays the eagle rate and
 * not the birdie rate as well:
 * it does not also collect the birdie underneath it.
 *
 * The legal holes come off the course's par and its barred list, never a
 * hardcoded table. At Aberdeen that is front 3/8, 1/2/9, 4/7 and back 13/17,
 * 10/14/15, 16/18 — holes 5, 6, 11 and 12 are spoken for by other contests.
 * Hole 4 is an Agony Alley hole and stays legal anyway, because the front nine
 * has only two par 5s and a slot with one legal hole in it is not a choice.
 *
 * Six net eagles, with 4 doubled, comes to 10.5. That is arithmetic, not a
 * target: across 111 real rounds the contest averages 0.4.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, birdiePickHoles, PICK_SLOTS, migratePicks, cappedNetByHole,
         type PlayerCard, type BirdiePicks } from "../src/scoring.ts";

const PAR = ABERDEEN_TEE_IV.par;
const LEGAL = birdiePickHoles(ABERDEEN_TEE_IV);

/** One legal pick in every slot: 3, 2, 4, 13, 14, 16. */
const SIX: BirdiePicks = { f3: 3, f4: 2, f5: 4, b3: 13, b4: 14, b5: 16 };

/**
 * A level-par card with the given picks. `edit` moves individual holes; holes
 * listed in `unplayed` are left blank, and `pickedUp` are marked X.
 */
function card(picks: BirdiePicks | undefined, opts: {
  edit?: (g: (number | string | null)[]) => void;
  unplayed?: number[];
  pickedUp?: number[];
} = {}): PlayerCard {
  const gross = PAR.slice() as (number | string | null)[];
  if (opts.edit) opts.edit(gross);
  for (const h of opts.unplayed || []) gross[h - 1] = null;
  for (const h of opts.pickedUp || []) gross[h - 1] = "X";
  return { name: "Test", courseHandicap: 0, gross, picks } as PlayerCard;
}

const score = (c: PlayerCard) =>
  scorePlayer(c, ABERDEEN_TEE_IV, DEFAULT_CONTESTS).contests.watchTheBirdie;

/* ---- the legal table ---- */

test("the legal holes are derived from par and the bar list, not hardcoded", () => {
  assert.deepEqual(LEGAL, {
    f3: [3, 8], f4: [1, 2, 9], f5: [4, 7],
    b3: [13, 17], b4: [10, 14, 15], b5: [16, 18],
  });
});

test("holes 5, 6, 11 and 12 are barred", () => {
  const all = PICK_SLOTS.flatMap((s) => LEGAL[s.key]);
  for (const h of [5, 6, 11, 12]) assert.ok(!all.includes(h), "hole " + h + " must not be offered");
});

// A slot offering one hole is a formality, not a choice — which is why hole 4
// stays legal despite being an Agony Alley hole.
test("every slot keeps at least two holes in it", () => {
  for (const s of PICK_SLOTS) {
    assert.ok(LEGAL[s.key].length >= 2, `${s.label} has only ${LEGAL[s.key].length}`);
  }
});

test("no hole belongs to two slots", () => {
  const all = PICK_SLOTS.flatMap((s) => LEGAL[s.key]);
  assert.equal(new Set(all).size, all.length);
});

/* ---- what a pick pays ---- */

test("six valid picks and one net birdie pays 0.8", () => {
  // Hole 14 in one under; every other hole left at par.
  const r = score(card(SIX, { edit: (g) => { g[13] = PAR[13] - 1; } }));
  assert.equal(r.strokes, -0.8);
  assert.equal(r.detail, "1 of 6 picks");
  assert.equal(r.live, true);
});

test("six valid picks and one net eagle pays the eagle rate alone", () => {
  // Hole 14, an ordinary hole: 1.5, not 1.5 + 0.8.
  const r = score(card(SIX, { edit: (g) => { g[13] = PAR[13] - 2; } }));
  assert.equal(r.strokes, -1.5, "the eagle rate alone");
  assert.equal(r.detail, "1 of 6 picks", "and it is one hole paying, not two");
});

test("better than an eagle still pays the eagle rate", () => {
  const r = score(card(SIX, { edit: (g) => { g[13] = PAR[13] - 3; } }));
  assert.equal(r.strokes, -1.5);
});

// Holes 4 and 18 pay double, which is the whole reason hole 4 is worth picking.
test("holes 4 and 18 pay double", () => {
  assert.equal(score(card(SIX, { edit: (g) => { g[3] = PAR[3] - 1; } })).strokes, -1.6,
    "a birdie on 4 pays more than an eagle anywhere else");
  assert.equal(score(card(SIX, { edit: (g) => { g[3] = PAR[3] - 2; } })).strokes, -3.0,
    "and an eagle on 4 pays double the eagle rate");
  const eighteen = { ...SIX, b5: 18 };
  assert.equal(score(card(eighteen, { edit: (g) => { g[17] = PAR[17] - 1; } })).strokes, -1.6);
  assert.equal(score(card(eighteen, { edit: (g) => { g[17] = PAR[17] - 2; } })).strokes, -3.0);
});

test("a net par on a pick pays nothing", () => {
  assert.equal(score(card(SIX)).strokes, 0);
  assert.equal(score(card(SIX)).live, true, "still a live contest, just unpaid");
});

test("a birdie on a hole he did not nominate pays nothing", () => {
  // Hole 7 is a legal front par 5, but 4 is the one he picked.
  const r = score(card(SIX, { edit: (g) => { g[6] = PAR[6] - 2; } }));
  assert.equal(r.strokes, 0);
});

test("all six can pay at once", () => {
  const r = score(card(SIX, { edit: (g) => {
    for (const h of [3, 2, 4, 13, 14, 16]) g[h - 1] = PAR[h - 1] - 1;
  } }));
  assert.equal(r.strokes, -5.6, "five at 0.8 plus hole 4 at 1.6");
  assert.equal(r.detail, "6 of 6 picks");
});

test("six net eagles is 10.5 here — the ceiling, and only arithmetic", () => {
  const r = score(card(SIX, { edit: (g) => {
    for (const h of [3, 2, 4, 13, 14, 16]) g[h - 1] = PAR[h - 1] - 2;
  } }));
  assert.equal(r.strokes, -10.5, "five at 1.5 plus hole 4 at 3.0");
});

test("the total is always a clean tenth", () => {
  for (let n = 0; n <= 6; n++) {
    const holes = [3, 2, 4, 13, 14, 16].slice(0, n);
    const r = score(card(SIX, { edit: (g) => { for (const h of holes) g[h - 1] = PAR[h - 1] - 1; } }));
    assert.equal(Math.round(r.strokes * 10) / 10, r.strokes, `${n} birdies`);
  }
});

/* ---- holes with no score on them ---- */

test("a picked-up hole that was a pick scores double bogey plus his strokes", () => {
  // The brief's own example: a par 5 with two handicap strokes on it is a 9.
  // This man is off 36, so he has two strokes everywhere; the card is bogeyed
  // throughout so that a played hole nets par and only the pick-up stands out.
  const c = card(SIX, {
    edit: (g) => { for (let i = 0; i < 18; i++) g[i] = (PAR[i] as number) + 2; },
    pickedUp: [4],
  });
  c.courseHandicap = 36;
  const full = scorePlayer(c, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);

  const net = cappedNetByHole(c, ABERDEEN_TEE_IV);
  assert.equal(net[3], PAR[3] + 2, "hole 4 nets par + 2 — double bogey after his strokes");
  assert.equal(full.gross, 18 * 4 + 2 * 18 + 2,
    "and it shows a gross of 9 there: par 5, double bogey, plus his two strokes");
  assert.equal(full.contests.watchTheBirdie.strokes, 0, "a pick-up cannot be a birdie");
  assert.equal(full.contests.watchTheBirdie.live, true, "the contest still runs");
  assert.equal(full.holesPlayed, 18, "and the hole counts as played");
});

test("a pick he picked up on is worth the same as a pick he bogeyed", () => {
  const up = card(SIX, { pickedUp: [14] });
  const bogey = card(SIX, { edit: (g) => { g[13] = PAR[13] + 2; } });
  assert.equal(score(up).strokes, score(bogey).strokes);
});

test("an unplayed nominated hole pays nothing and does not stop the rest", () => {
  const r = score(card(SIX, {
    unplayed: [4],
    edit: (g) => { g[13] = PAR[13] - 1; },
  }));
  assert.equal(r.strokes, -0.8, "hole 14 still pays");
  assert.equal(r.live, true);
});

test("no picks at all means the contest is not scored", () => {
  const r = score(card(undefined));
  assert.equal(r.strokes, 0);
  assert.equal(r.live, false, "shown as not live, like any unscorable contest");
});

test("some slots filled scores those slots", () => {
  const r = score(card({ f3: 3, b4: 14 }, { edit: (g) => { g[13] = PAR[13] - 1; } }));
  assert.equal(r.strokes, -0.8);
  assert.equal(r.detail, "1 of 2 picks", "counted against what he actually nominated");
});

/* ---- picks that are not allowed ---- */

test("a pick outside the legal table is rejected by name", () => {
  assert.throws(() => score(card({ ...SIX, f4: 5 })),
    /hole 5 is not a legal front par 4 — 1, 2, 9/);
  assert.throws(() => score(card({ ...SIX, b4: 11 })),
    /hole 11 is not a legal back par 4 — 10, 14, 15/);
  assert.throws(() => score(card({ ...SIX, f3: 7 })),
    /hole 7 is not a legal front par 3 — 3, 8/);
  assert.throws(() => score(card({ ...SIX, b5: 10, b4: 15 })),
    /hole 10 is not a legal back par 5 — 16, 18/);
});

test("a hole on the wrong nine is rejected", () => {
  assert.throws(() => score(card({ ...SIX, f3: 17, b3: 3 })), /not a legal front par 3/);
  assert.throws(() => score(card({ ...SIX, b5: 7 })), /hole 7 is not a legal back par 5/);
});

// The six lists never overlap, so a hole nominated twice is also illegal for one
// of the two slots. The duplicate is reported FIRST because that is what the man
// actually did — being told "8 is not a legal front par 4" about a line that
// plainly says 8 twice is no help at all.
test("the same hole in two slots is rejected as a duplicate", () => {
  assert.throws(() => score(card({ ...SIX, f3: 8, f4: 8 })),
    /hole 8 is nominated twice, as front par 3 and front par 4/);
});

test("the player's name is in the error, so a field of sixteen says who", () => {
  const c = card({ ...SIX, f4: 5 });
  c.name = "Ridgeway, Ken";
  assert.throws(() => score(c), /^Error: Ridgeway, Ken: hole 5 is not a legal front par 4/);
});

/* ---- the two-pick form that came before ---- */

test("a round stored with the old two picks still opens", () => {
  // front/back were always par 4s, so they become the par 4 slots.
  assert.deepEqual(migratePicks({ front: 2, back: 14 }),
    { f4: 2, b4: 14, legacy: true });
  const r = score(card({ front: 2, back: 14 } as BirdiePicks,
    { edit: (g) => { g[13] = PAR[13] - 1; } }));
  assert.equal(r.strokes, -0.8, "and it scores at the new rate");
  assert.equal(r.detail, "1 of 2 picks");
});

// A pick made under the old rules on a hole since barred cannot be guessed at.
// Dropping the slot loses one sixth of one contest; refusing would take a played
// round off a man's phone.
test("an old pick on a hole since barred is dropped, not refused", () => {
  const r = score(card({ front: 5, back: 14 } as BirdiePicks,
    { edit: (g) => { g[13] = PAR[13] - 1; } }));
  assert.equal(r.strokes, -0.8, "hole 14 still pays");
  assert.equal(r.detail, "1 of 1 pick", "hole 5 is simply gone");
});

test("the six named slots win over anything left in the old fields", () => {
  assert.deepEqual(migratePicks({ f4: 9, front: 2, back: 14 } as BirdiePicks),
    { f4: 9, front: 2, back: 14 });
});

test("no picks in either form is no picks", () => {
  assert.equal(migratePicks(null), null);
  assert.equal(migratePicks({}), null);
  assert.equal(migratePicks({ front: null, back: null }), null);
});

/* ---- the payout is configuration ---- */

test("the two rates are one config value each", () => {
  assert.equal(DEFAULT_CONTESTS.watchTheBirdie.birdie, -0.8);
  assert.equal(DEFAULT_CONTESTS.watchTheBirdie.eagle, -1.5);
});

// Nothing uses this yet; it is why the payout is a pair of values per hole
// rather than one number in the scoring code.
test("a hard hole can be made to pay more than an easy one", () => {
  const contests = {
    ...DEFAULT_CONTESTS,
    watchTheBirdie: { birdie: -0.8, eagle: -1.5, byHole: { 4: { birdie: -1.5, eagle: -3.0 } } },
  };
  const one = (hole: number, under: number) => scorePlayer(
    card(SIX, { edit: (g) => { g[hole - 1] = PAR[hole - 1] - under; } }),
    ABERDEEN_TEE_IV, contests).contests.watchTheBirdie.strokes;

  assert.equal(one(4, 1), -1.5, "hole 4's own birdie rate");
  assert.equal(one(4, 2), -3.0, "and its own eagle rate");
  assert.equal(one(14, 1), -0.8, "every other hole is unchanged");
});

test("Call Your Number is gone", () => {
  assert.equal((DEFAULT_CONTESTS as Record<string, unknown>).callYourNumber, undefined);
});
