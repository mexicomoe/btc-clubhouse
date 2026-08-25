/**
 * Watch the Birdie — NINE nominated holes, each settled on its own.
 *
 *   net birdie         −0.5
 *   net eagle          −1.5
 *   nothing on any nine +0.5
 *
 * SIX PICKS BECAME NINE, IN THREE SLOTS RATHER THAN FOUR. Two par 5s of three,
 * three par 3s of four, four par 4s of eight — 840 possible sets, and every
 * slot a real choice. An earlier draft proposed three of each, which at
 * Aberdeen forces the par 3 and par 5 slots outright and leaves one genuine
 * decision in the round.
 *
 * FRONT AND BACK NO LONGER MATTER TO ANY SLOT. The par 4s were split when six
 * of them remained; with Easy Street switched off and 11, 12 and 13 back in
 * play there are eight, and dividing them again would only take choices away.
 *
 * THE VALUES DID NOT MOVE WITH THE COUNT. At these rates the contest repeats
 * the net score at +0.48 and fires on 86% of rounds; birdie at −0.4 with a +0.8
 * blank repeats it at +0.58. NOTHING IS PAID FOR A NET PAR — four a round
 * across nine picks is close to counting how well a man played.
 *
 * THE DOUBLING ON 4 AND 18 IS GONE. It was printed on the card and changed
 * nobody's behaviour — 8 of 10 still took hole 7, 9 of 10 still took 16 — so it
 * was paying extra for choices men were making anyway. Hole 4 is not a
 * candidate at all now.
 *
 * The legal holes come off the course's par and its barred list, never a
 * hardcoded table: par 5 7/16/18, par 3 3/8/13/17, par 4 1/2/9/10/11/12/14/15.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, birdiePickHoles, PICK_SLOTS, migratePicks, randomPicks, readPicks,
         type PlayerCard, type BirdiePicks } from "../src/scoring.ts";

const PAR = ABERDEEN_TEE_IV.par;
const LEGAL = birdiePickHoles(ABERDEEN_TEE_IV);

/** One legal pick in every slot, in slot order: 7, 16, 3, 8, 13, 2, 14, 1, 10. */
const NINE: BirdiePicks = { p5a: 7, p5b: 16, p3a: 3, p3b: 8, p3c: 13,
                            p4f: 2, p4b: 14, p4c: 1, p4d: 10 };
/** The nine holes of NINE, for a test that has to touch every one of them. */
const NINE_HOLES = [7, 16, 3, 8, 13, 2, 14, 1, 10];

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
  assert.deepEqual(LEGAL.p5a, [7, 16, 18]);
  assert.deepEqual(LEGAL.p3a, [3, 8, 13, 17]);
  assert.deepEqual(LEGAL.p4f, [1, 2, 9, 10, 11, 12, 14, 15]);
});

test("two of three, three of four, four of eight", () => {
  const slots = (par: number) => PICK_SLOTS.filter((s) => s.par === par);
  for (const [par, picks, holes] of [[5, 2, 3], [3, 3, 4], [4, 4, 8]]) {
    const mine = slots(par);
    assert.equal(mine.length, picks, "par " + par + " picks");
    assert.equal(LEGAL[mine[0].key].length, holes, "par " + par + " holes");
    assert.ok(holes > picks, "par " + par + " must be a real choice, not a formality");
  }
  assert.equal(PICK_SLOTS.length, 9);
});

test("840 possible sets — every slot is a genuine decision", () => {
  const choose = (n: number, k: number) =>
    k === 0 ? 1 : Math.round((n / k) * choose(n - 1, k - 1));
  assert.equal(choose(3, 2) * choose(4, 3) * choose(8, 4), 840);
});

test("twelve of the eighteen are in play — Agony Alley's three and the nine", () => {
  const agony = ABERDEEN_TEE_IV.agonyHoles;
  const candidates = [...new Set(PICK_SLOTS.flatMap((s) => LEGAL[s.key]))];
  // The eighteen still divide cleanly in two, but the line has moved: Easy
  // Street's holes are candidates now rather than a stretch of their own.
  const all = [...agony, ...candidates].sort((a, b) => a - b);
  assert.deepEqual(all, Array.from({ length: 18 }, (_, i) => i + 1));
  const par = (hs: number[]) => hs.reduce((n, h) => n + PAR[h - 1], 0);
  assert.equal(par(agony), 13);
  assert.equal(par(candidates), 59);
  assert.equal(13 + 59, 72);
  assert.equal(candidates.length, 15);
  assert.equal(agony.length + PICK_SLOTS.length, 12, "twelve holes are played for");
});

test("only Agony Alley's three are barred now", () => {
  const every = PICK_SLOTS.flatMap((s) => LEGAL[s.key]);
  for (const barred of [4, 5, 6]) {
    assert.equal(every.includes(barred), false, "hole " + barred);
  }
  // Easy Street is off, so its three come back.
  for (const back of [11, 12, 13]) {
    assert.equal(every.includes(back), true, "hole " + back);
  }
  assert.deepEqual(ABERDEEN_TEE_IV.barredPicks, [4, 5, 6]);
});

test("hole 13 is a par 3, and is legal in the par 3 slot", () => {
  assert.equal(PAR[12], 3);
  assert.ok(LEGAL.p3a.includes(13));
  assert.ok(LEGAL.p3b.includes(13));
  assert.ok(LEGAL.p3c.includes(13));
  // And it actually scores there rather than merely being offered.
  const r = score(card({ ...NINE, p3c: 13 }, { edit: (g) => { g[12] = PAR[12] - 1; } }));
  assert.equal(r.strokes, -0.5);
});

test("every slot of a par shares one list", () => {
  // This USED to be the opposite: every hole fell in at most one slot, so a
  // hole nominated twice was also illegal for one of them and either check
  // caught it. Floating the par 3s and par 5s ended that, and four par 4s
  // drawn from one list of eight ends it for them too — which is why the
  // duplicate pass below is load-bearing rather than a convenience.
  assert.deepEqual(LEGAL.p3a, LEGAL.p3b);
  assert.deepEqual(LEGAL.p3a, LEGAL.p3c);
  assert.deepEqual(LEGAL.p5a, LEGAL.p5b);
  assert.deepEqual(LEGAL.p4f, LEGAL.p4b);
  assert.deepEqual(LEGAL.p4f, LEGAL.p4c);
  assert.deepEqual(LEGAL.p4f, LEGAL.p4d);
});

/* ---- what a pick pays ---- */

test("a net birdie on a pick pays 0.5", () => {
  const r = score(card(NINE, { edit: (g) => { g[1] = PAR[1] - 1; } }));
  assert.equal(r.strokes, -0.5);
});

test("a net eagle pays 1.5, and not the birdie underneath it as well", () => {
  const r = score(card(NINE, { edit: (g) => { g[6] = PAR[6] - 2; } }));
  assert.equal(r.strokes, -1.5);
});

test("better than an eagle still pays the eagle rate", () => {
  const r = score(card(NINE, { edit: (g) => { g[6] = PAR[6] - 3; } }));
  assert.equal(r.strokes, -1.5);
});

test("no hole pays double any more", () => {
  // Hole 18 was worth 1.6 for a birdie and 3.0 for an eagle. It is an ordinary
  // par 5 pick now.
  const with18 = { ...NINE, p5b: 18 };
  assert.equal(score(card(with18, { edit: (g) => { g[17] = PAR[17] - 1; } })).strokes, -0.5);
  assert.equal(score(card(with18, { edit: (g) => { g[17] = PAR[17] - 2; } })).strokes, -1.5);
});

test("a net par on a pick pays nothing on that hole", () => {
  // Level par everywhere: no pick pays, so only the blank penalty is charged.
  assert.equal(score(card(NINE)).strokes, 0.5);
});

test("a birdie on a hole he did not nominate pays nothing here", () => {
  // Hole 9 is a legal par 4 he did not take.
  const r = score(card(NINE, { edit: (g) => { g[8] = PAR[8] - 1; } }));
  assert.equal(r.strokes, 0.5, "still blank on his own nine");
});

test("all nine can pay at once", () => {
  const r = score(card(NINE, { edit: (g) => {
    for (const h of NINE_HOLES) g[h - 1] = PAR[h - 1] - 1;
  } }));
  assert.equal(r.strokes, -4.5, "nine net birdies at 0.5");
});

test("nine net eagles is −13.5 — arithmetic, not a target", () => {
  const r = score(card(NINE, { edit: (g) => {
    for (const h of NINE_HOLES) g[h - 1] = PAR[h - 1] - 2;
  } }));
  assert.equal(r.strokes, -13.5);
});

test("birdies and eagles are counted apart, for the board's tiebreak", () => {
  // Three birdies and one eagle both come to −1.5. The strokes cannot tell
  // them apart and the tiebreak is "most net birdies, then the eagle".
  const threeBirdies = score(card(NINE, { edit: (g) => {
    for (const h of [7, 16, 3]) g[h - 1] = PAR[h - 1] - 1;
  } }));
  const oneEagle = score(card(NINE, { edit: (g) => { g[6] = PAR[6] - 2; } }));
  assert.equal(threeBirdies.strokes, oneEagle.strokes, "level on strokes");
  assert.equal(threeBirdies.birdies, 3);
  assert.equal(threeBirdies.eagles, 0);
  assert.equal(oneEagle.birdies, 0);
  assert.equal(oneEagle.eagles, 1);
});

test("a hole is a birdie or an eagle, never counted as both", () => {
  const r = score(card(NINE, { edit: (g) => { g[6] = PAR[6] - 2; } }));
  assert.equal(r.birdies, 0);
  assert.equal(r.eagles, 1);
});

test("a net par on a pick is not counted and is not paid", () => {
  // Tested and rejected: paying 0.2 for a net par takes the repetition of the
  // net score from +0.51 to +0.73. Four a round is close to counting how well
  // he played, which is the net score's job.
  const r = score(card(NINE));
  assert.equal(r.birdies, 0);
  assert.equal(r.eagles, 0);
  assert.equal(r.strokes, 0.5, "the blank penalty, and nothing paid for the pars");
});

test("the total is always a clean tenth", () => {
  const r = score(card(NINE, { edit: (g) => {
    g[1] = PAR[1] - 1; g[6] = PAR[6] - 2; g[2] = PAR[2] - 1;
  } }));
  assert.equal(r.strokes, -2.5);
  assert.equal(String(r.strokes).length <= 5, true);
});

/* ---- the blank penalty ---- */

test("no net birdie on any of the nine costs half a stroke", () => {
  const r = score(card(NINE));
  assert.equal(r.strokes, 0.5);
  assert.match(r.detail, /no net birdies/);
});

test("the penalty is not charged while a pick is still unplayed", () => {
  // He cannot be charged for failing to birdie a hole he never stood on.
  const r = score(card(NINE, { unplayed: [16] }));
  assert.equal(r.strokes, 0);
  assert.match(r.detail, /nothing yet/);
});

test("one birdie clears the penalty rather than being netted against it", () => {
  const r = score(card(NINE, { edit: (g) => { g[1] = PAR[1] - 1; } }));
  assert.equal(r.strokes, -0.5, "not −0.5 + 0.5");
});

/* ---- picked up, unplayed, missing ---- */

test("a pick he picked up on pays nothing and does not stop the rest", () => {
  const r = score(card(NINE, { pickedUp: [16], edit: (g) => { g[1] = PAR[1] - 1; } }));
  assert.equal(r.strokes, -0.5);
});

test("an unplayed nominated hole pays nothing and does not stop the rest", () => {
  const r = score(card(NINE, { unplayed: [16], edit: (g) => { g[1] = PAR[1] - 1; } }));
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

test("a barred hole is rejected by name, with what was allowed", () => {
  assert.throws(() => readPicks({ ...NINE, p4f: 5 }, ABERDEEN_TEE_IV, "Ken"),
    /Ken: hole 5 is not a legal first par 4 — 1, 2, 9, 10, 11, 12, 14, 15/);
});

test("a par 4 in a par 3 slot is rejected even though it is legal elsewhere", () => {
  // Hole 9 is a legal par 4 that NINE does not already use, so this fails on
  // the slot rather than on the duplicate pass ahead of it.
  assert.throws(() => readPicks({ ...NINE, p3a: 9 }, ABERDEEN_TEE_IV, "Ken"),
    /hole 9 is not a legal first par 3 — 3, 8, 13, 17/);
});

test("a par 3 in a par 5 slot is rejected", () => {
  assert.throws(() => readPicks({ ...NINE, p5a: 3, p3a: 17 }, ABERDEEN_TEE_IV, "Ken"),
    /hole 3 is not a legal first par 5 — 7, 16, 18/);
});

test("the same hole in two slots is rejected as a duplicate", () => {
  assert.throws(() => readPicks({ ...NINE, p3b: 3 }, ABERDEEN_TEE_IV, "Ken"),
    /hole 3 is nominated twice, as first par 3 and second par 3/);
});

test("a duplicate among the four par 4s is caught the same way", () => {
  // Four slots off one list of eight is where this is most likely to happen,
  // and nothing but the duplicate pass stands there.
  assert.throws(() => readPicks({ ...NINE, p4d: 2 }, ABERDEEN_TEE_IV, "Ken"),
    /hole 2 is nominated twice, as first par 4 and fourth par 4/);
});

test("the player's name is in the error, so a field of sixteen says who", () => {
  assert.throws(() => readPicks({ ...NINE, p4f: 5 }, ABERDEEN_TEE_IV, "Ridgeway, Ken"),
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
  // Hole 4 was legal under the very old slots and is barred now. Refusing would
  // take a played round off a man's phone; dropping costs him one slot.
  const migrated = migratePicks({ f3: 3, f4: 2, f5: 4, b3: 17, b4: 14, b5: 16 } as BirdiePicks)!;
  const read = readPicks(migrated, ABERDEEN_TEE_IV, "Ken");
  assert.equal(read.p5a, null, "hole 4 is gone");
  assert.equal(read.p4f, 2, "the rest survives");
  assert.equal(read.p5b, 16);
  assert.equal(read.p3b, 17);
});

test("hole 13 was barred and is legal again — an old pick on it comes back", () => {
  // It was barred for Easy Street, which is off. A round stored while it was
  // barred simply reads correctly now; nothing had to be migrated for it.
  const migrated = migratePicks({ f3: 3, f4: 2, f5: 7, b3: 13, b4: 14, b5: 16 } as BirdiePicks)!;
  const read = readPicks(migrated, ABERDEEN_TEE_IV, "Ken");
  assert.equal(read.p3b, 13);
});

test("a round stored under the six-pick rules needs no migration at all", () => {
  // Six of the nine keys ARE the old keys, so the round is already in the new
  // shape. It arrives with three empty slots, which is six picks and says so.
  const stored = { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 } as BirdiePicks;
  const migrated = migratePicks(stored)!;
  assert.equal(migrated.legacy, undefined, "not a legacy read — the keys are current");
  const read = readPicks(migrated, ABERDEEN_TEE_IV, "Ken");
  assert.equal(read.p4f, 2);
  assert.equal(read.p5b, 16);
  assert.equal(read.p3c, null);
  assert.equal(read.p4c, null);
  assert.equal(read.p4d, null);
  const r = score(card(stored, { edit: (g) => { g[1] = PAR[1] - 1; } }));
  assert.equal(r.strokes, -0.5);
  assert.match(r.detail, /1 of 6 picks/, "counted, not assumed to be nine");
});

test("the named slots win over anything left in the old fields", () => {
  const migrated = migratePicks({ ...NINE, f4: 9, front: 1 } as BirdiePicks)!;
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
      assert.equal([4, 5, 6].includes(picks[slot.key]!), false);
    }
  }
});

test("a drawn set fills all nine slots", () => {
  for (let i = 0; i < 100; i++) {
    const picks = randomPicks(ABERDEEN_TEE_IV);
    assert.equal(PICK_SLOTS.filter((s) => picks[s.key] != null).length, 9);
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
  // Slot order: two par 5s, three par 3s, four par 4s. Each takes the first
  // hole its list has left, which is what "without replacement" means here.
  assert.equal(picks.p5a, 7);
  assert.equal(picks.p5b, 16, "7 is taken, so the next one down");
  assert.equal(picks.p3a, 3);
  assert.equal(picks.p3b, 8);
  assert.equal(picks.p3c, 13);
  assert.equal(picks.p4f, 1);
  assert.equal(picks.p4b, 2);
  assert.equal(picks.p4c, 9);
  assert.equal(picks.p4d, 10);
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
