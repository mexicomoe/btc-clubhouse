/**
 * Watch the Birdie — six nominated holes, each settled on its own.
 *
 *   net birdie        −0.5
 *   net eagle         −1.5
 *   nothing on any six +0.5
 *
 * THE SLOTS CHANGED on 15 August. Par 4s are still split front and back, one
 * each. The par 3s and par 5s now FLOAT across the whole course and take two
 * each — because once Agony Alley (4, 5, 6) and Easy Street (11, 12, 13) take
 * their holes there are only three par 3s and three par 5s left, and splitting
 * three across two nines leaves a slot with one hole in it, which is not a
 * choice.
 *
 * THE DOUBLING ON 4 AND 18 IS GONE. It was printed on the card and changed
 * nobody's behaviour — 8 of 10 still took hole 7, 9 of 10 still took 16 — so it
 * was paying extra for choices men were making anyway. Hole 4 is not a
 * candidate at all now.
 *
 * The legal holes come off the course's par and its barred list, never a
 * hardcoded table: front par 4 1/2/9, back par 4 10/14/15, par 3 3/8/17, par 5
 * 7/16/18.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, birdiePickHoles, PICK_SLOTS, migratePicks, randomPicks, readPicks,
         type PlayerCard, type BirdiePicks } from "../src/scoring.ts";

const PAR = ABERDEEN_TEE_IV.par;
const LEGAL = birdiePickHoles(ABERDEEN_TEE_IV);

/** One legal pick in every slot: 2, 14, 3, 8, 7, 16. */
const SIX: BirdiePicks = { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 };

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
  scorePlayer(c, ABERDEEN_TEE_IV, DEFAULT_CONTESTS).contests.watchTheBirdie!;

/* ---- the legal table ---- */

test("the legal holes are derived from par and the bar list, not hardcoded", () => {
  assert.deepEqual(LEGAL.p4f, [1, 2, 9]);
  assert.deepEqual(LEGAL.p4b, [10, 14, 15]);
  assert.deepEqual(LEGAL.p3a, [3, 8, 17]);
  assert.deepEqual(LEGAL.p5a, [7, 16, 18]);
});

test("the eighteen partition — every hole is used once and none twice", () => {
  const agony = ABERDEEN_TEE_IV.agonyHoles;
  const easy = ABERDEEN_TEE_IV.easyStreetHoles;
  const candidates = [...new Set(PICK_SLOTS.flatMap((s) => LEGAL[s.key]))];
  const all = [...agony, ...easy, ...candidates].sort((a, b) => a - b);
  assert.deepEqual(all, Array.from({ length: 18 }, (_, i) => i + 1));
  const par = (hs: number[]) => hs.reduce((n, h) => n + PAR[h - 1], 0);
  assert.equal(par(agony), 13);
  assert.equal(par(easy), 11);
  assert.equal(par(candidates), 48);
  assert.equal(13 + 11 + 48, 72);
});

test("holes 4, 5, 6, 11, 12 and 13 are barred", () => {
  const every = PICK_SLOTS.flatMap((s) => LEGAL[s.key]);
  for (const barred of [4, 5, 6, 11, 12, 13]) {
    assert.equal(every.includes(barred), false, "hole " + barred);
  }
});

test("every slot keeps a genuine three-way choice", () => {
  for (const slot of PICK_SLOTS) {
    assert.equal(LEGAL[slot.key].length, 3, slot.label);
  }
});

test("the par 3 slots share one list, and so do the par 5s", () => {
  // This USED to be the opposite: every hole fell in at most one slot, so a
  // hole nominated twice was also illegal for one of them and either check
  // caught it. Floating the par 3s and par 5s ended that, which is why the
  // duplicate pass below is now load-bearing rather than a convenience.
  assert.deepEqual(LEGAL.p3a, LEGAL.p3b);
  assert.deepEqual(LEGAL.p5a, LEGAL.p5b);
});

/* ---- what a pick pays ---- */

test("a net birdie on a pick pays 0.5", () => {
  const r = score(card(SIX, { edit: (g) => { g[1] = PAR[1] - 1; } }));
  assert.equal(r.strokes, -0.5);
});

test("a net eagle pays 1.5, and not the birdie underneath it as well", () => {
  const r = score(card(SIX, { edit: (g) => { g[6] = PAR[6] - 2; } }));
  assert.equal(r.strokes, -1.5);
});

test("better than an eagle still pays the eagle rate", () => {
  const r = score(card(SIX, { edit: (g) => { g[6] = PAR[6] - 3; } }));
  assert.equal(r.strokes, -1.5);
});

test("no hole pays double any more", () => {
  // Hole 18 was worth 1.6 for a birdie and 3.0 for an eagle. It is an ordinary
  // par 5 pick now.
  const with18 = { ...SIX, p5b: 18 };
  assert.equal(score(card(with18, { edit: (g) => { g[17] = PAR[17] - 1; } })).strokes, -0.5);
  assert.equal(score(card(with18, { edit: (g) => { g[17] = PAR[17] - 2; } })).strokes, -1.5);
});

test("a net par on a pick pays nothing on that hole", () => {
  // Level par everywhere: no pick pays, so only the blank penalty is charged.
  assert.equal(score(card(SIX)).strokes, 0.5);
});

test("a birdie on a hole he did not nominate pays nothing here", () => {
  // Hole 1 is a legal front par 4 he did not take.
  const r = score(card(SIX, { edit: (g) => { g[0] = PAR[0] - 1; } }));
  assert.equal(r.strokes, 0.5, "still blank on his own six");
});

test("all six can pay at once", () => {
  const r = score(card(SIX, { edit: (g) => {
    for (const h of [2, 14, 3, 8, 7, 16]) g[h - 1] = PAR[h - 1] - 1;
  } }));
  assert.equal(r.strokes, -3, "six net birdies at 0.5");
});

test("six net eagles is −9.0 — arithmetic, not a target", () => {
  const r = score(card(SIX, { edit: (g) => {
    for (const h of [2, 14, 3, 8, 7, 16]) g[h - 1] = PAR[h - 1] - 2;
  } }));
  assert.equal(r.strokes, -9);
});

test("the total is always a clean tenth", () => {
  const r = score(card(SIX, { edit: (g) => {
    g[1] = PAR[1] - 1; g[6] = PAR[6] - 2; g[2] = PAR[2] - 1;
  } }));
  assert.equal(r.strokes, -2.5);
  assert.equal(String(r.strokes).length <= 5, true);
});

/* ---- the blank penalty ---- */

test("nothing on any of the six costs half a stroke", () => {
  const r = score(card(SIX));
  assert.equal(r.strokes, 0.5);
  assert.match(r.detail, /no net birdies/);
});

test("the penalty is not charged while a pick is still unplayed", () => {
  // He cannot be charged for failing to birdie a hole he never stood on.
  const r = score(card(SIX, { unplayed: [16] }));
  assert.equal(r.strokes, 0);
  assert.match(r.detail, /nothing yet/);
});

test("one birdie clears the penalty rather than being netted against it", () => {
  const r = score(card(SIX, { edit: (g) => { g[1] = PAR[1] - 1; } }));
  assert.equal(r.strokes, -0.5, "not −0.5 + 0.5");
});

/* ---- picked up, unplayed, missing ---- */

test("a pick he picked up on pays nothing and does not stop the rest", () => {
  const r = score(card(SIX, { pickedUp: [16], edit: (g) => { g[1] = PAR[1] - 1; } }));
  assert.equal(r.strokes, -0.5);
});

test("an unplayed nominated hole pays nothing and does not stop the rest", () => {
  const r = score(card(SIX, { unplayed: [16], edit: (g) => { g[1] = PAR[1] - 1; } }));
  assert.equal(r.strokes, -0.5);
});

test("no picks at all means the contest is not scored", () => {
  const r = score(card(undefined));
  assert.equal(r.live, false);
  assert.equal(r.strokes, 0);
  assert.match(r.detail, /no picks made/);
});

test("some slots filled scores those slots", () => {
  const r = score(card({ p4f: 2, p3a: 3 } as BirdiePicks,
    { edit: (g) => { g[1] = PAR[1] - 1; } }));
  assert.equal(r.strokes, -0.5);
});

/* ---- refusing a bad set ---- */

test("a pick outside the legal table is rejected by name", () => {
  assert.throws(() => readPicks({ ...SIX, p4f: 5 }, ABERDEEN_TEE_IV, "Ken"),
    /Ken: hole 5 is not a legal front par 4 — 1, 2, 9/);
});

test("a par 4 in a par 3 slot is rejected even though it is legal elsewhere", () => {
  assert.throws(() => readPicks({ ...SIX, p3a: 1 }, ABERDEEN_TEE_IV, "Ken"),
    /hole 1 is not a legal first par 3/);
});

test("a front par 4 in the back par 4 slot is rejected", () => {
  assert.throws(() => readPicks({ ...SIX, p4b: 2, p4f: 1 }, ABERDEEN_TEE_IV, "Ken"),
    /hole 2 is not a legal back par 4 — 10, 14, 15/);
});

test("the same hole in two slots is rejected as a duplicate", () => {
  assert.throws(() => readPicks({ ...SIX, p3b: 3 }, ABERDEEN_TEE_IV, "Ken"),
    /hole 3 is nominated twice, as first par 3 and second par 3/);
});

test("the player's name is in the error, so a field of sixteen says who", () => {
  assert.throws(() => readPicks({ ...SIX, p4f: 5 }, ABERDEEN_TEE_IV, "Ridgeway, Ken"),
    /^Error: Ridgeway, Ken:/);
});

/* ---- rounds stored under older rules ---- */

test("a round stored with the old two picks still opens", () => {
  const migrated = migratePicks({ front: 2, back: 14 } as BirdiePicks)!;
  assert.equal(migrated.p4f, 2);
  assert.equal(migrated.p4b, 14);
  assert.equal(migrated.legacy, true);
});

test("a round stored under the old six slots still opens", () => {
  // f4/b4 become the par 4 slots; f3 and b3 the two par 3s; f5 and b5 the par 5s.
  const migrated = migratePicks({ f3: 8, f4: 2, f5: 7, b3: 17, b4: 14, b5: 16 } as BirdiePicks)!;
  assert.equal(migrated.p4f, 2);
  assert.equal(migrated.p4b, 14);
  assert.equal(migrated.p3a, 8);
  assert.equal(migrated.p3b, 17);
  assert.equal(migrated.p5a, 7);
  assert.equal(migrated.p5b, 16);
});

test("an old pick on a hole since barred is dropped, not refused", () => {
  // Holes 4 and 13 were legal under the old slots and are barred now. Refusing
  // would take a played round off a man's phone; dropping costs him one slot.
  const migrated = migratePicks({ f3: 3, f4: 2, f5: 4, b3: 13, b4: 14, b5: 16 } as BirdiePicks)!;
  const read = readPicks(migrated, ABERDEEN_TEE_IV, "Ken");
  assert.equal(read.p5a, null, "hole 4 is gone");
  assert.equal(read.p3b, null, "hole 13 is gone");
  assert.equal(read.p4f, 2, "the rest survives");
  assert.equal(read.p5b, 16);
});

test("the six named slots win over anything left in the old fields", () => {
  const migrated = migratePicks({ ...SIX, f4: 9, front: 1 } as BirdiePicks)!;
  assert.equal(migrated.p4f, 2);
});

test("no picks in either form is no picks", () => {
  assert.equal(migratePicks(null), null);
  assert.equal(migratePicks({} as BirdiePicks), null);
});

/* ---- the config ---- */

test("the three rates are one config value each", () => {
  const c = DEFAULT_CONTESTS.watchTheBirdie;
  assert.equal(c.birdie, -0.5);
  assert.equal(c.eagle, -1.5);
  assert.equal(c.blank, 0.5);
});

test("the per-hole override is gone", () => {
  assert.equal((DEFAULT_CONTESTS.watchTheBirdie as any).byHole, undefined);
});

/* ---- a drawn set, for the man who sent none in ---- */

test("a drawn set is legal in every slot", () => {
  for (let i = 0; i < 200; i++) {
    const picks = randomPicks(ABERDEEN_TEE_IV);
    for (const slot of PICK_SLOTS) {
      assert.ok(LEGAL[slot.key].includes(picks[slot.key]!), slot.key + "=" + picks[slot.key]);
    }
  }
});

test("a drawn set never touches a barred hole", () => {
  for (let i = 0; i < 200; i++) {
    const picks = randomPicks(ABERDEEN_TEE_IV);
    for (const slot of PICK_SLOTS) {
      assert.equal([4, 5, 6, 11, 12, 13].includes(picks[slot.key]!), false);
    }
  }
});

test("a drawn set never draws the same hole twice", () => {
  // Not a formality since the par 3 slots share a list: drawn slot by slot on
  // its own, hole 8 landed in both about a third of the time — a set no man
  // could have chosen, which readPicks would then refuse.
  for (let i = 0; i < 500; i++) {
    const picks = randomPicks(ABERDEEN_TEE_IV);
    const holes = PICK_SLOTS.map((s) => picks[s.key]);
    assert.equal(new Set(holes).size, holes.length, JSON.stringify(picks));
  }
});

test("a drawn set scores without complaint", () => {
  for (let i = 0; i < 50; i++) {
    const r = score(card(randomPicks(ABERDEEN_TEE_IV)));
    assert.equal(r.live, true);
  }
});

test("the draw is the caller's randomness, so it can be pinned down", () => {
  const fixed = () => 0;               // always the first legal hole left
  const picks = randomPicks(ABERDEEN_TEE_IV, fixed);
  assert.equal(picks.p4f, 1);
  assert.equal(picks.p4b, 10);
  assert.equal(picks.p3a, 3);
  assert.equal(picks.p3b, 8, "3 is taken, so the next one down");
  assert.equal(picks.p5a, 7);
  assert.equal(picks.p5b, 16);
});

test("every legal hole can come up", () => {
  const seen = new Set<number>();
  for (let i = 0; i < 2000; i++) {
    const picks = randomPicks(ABERDEEN_TEE_IV);
    for (const slot of PICK_SLOTS) seen.add(picks[slot.key]!);
  }
  for (const slot of PICK_SLOTS) {
    for (const hole of LEGAL[slot.key]) assert.ok(seen.has(hole), "hole " + hole);
  }
});
