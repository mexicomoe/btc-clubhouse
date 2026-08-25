/**
 * The milestone test: load the eight lowest-index players from the 19 December
 * Aberdeen round and reproduce section 9 of the build brief.
 *
 * Gross hole-by-hole and the course handicaps are the real figures from the
 * December export; only the names are demo stand-ins. Nothing here is computed
 * by the test — every expected value is pinned.
 *
 * RE-CUT FOR FOUR CONTESTS. Six Pack and Easy Street are out of the game and
 * Triple Threat and Bounce Back start switched off, so a single card now
 * settles on exactly two things — Watch the Birdie and Agony Alley. The Hit
 * List and Skins need a field and are not in `scorePlayer` at all. THE FINAL IS
 * THEREFORE THE SUM OF TWO NUMBERS and both are pinned below beside it, which
 * is a stronger test than the old one: a card whose final came out right by two
 * errors cancelling would now have to get both halves right as well.
 *
 * The gross, the handicaps and the net are UNTOUCHED by any of this and are
 * still the real December figures — they were the same before the cut and are
 * the same after it, which is the point of pinning them.
 *
 * RE-BASELINED 15 August, onto the ZERO base. The finals below are not net
 * scores in the seventies; they are strokes under and over par.
 *
 * NOTE ON PICKS: the club has no recorded Watch the Birdie picks for December —
 * the contest postdates the round. The picks are demo inputs, assigned by
 * `picks()` below, which walks each slot's own legal holes. Real picks would
 * move these finals.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, birdiePickHoles, PICK_SLOTS,
         type PlayerCard, type BirdiePicks } from "../src/scoring.ts";

interface Reference {
  card: PlayerCard;
  courseHandicap: number;
  gross: number;
  net: number;
  netUncapped: number;
  watchTheBirdie: number;
  /** The other half of the final, now that only two contests settle on one card. */
  agonyAlley: number;
  final: number;
}

/**
 * Watch the Birdie picks, assigned MECHANICALLY. The contest postdates this
 * round, so the club recorded none: each of the nine slots rotates through its
 * own legal holes in finishing order. Nothing here was chosen to produce a
 * result, and the same rule built the six-pick table this replaces.
 */
function picks(i: number): BirdiePicks {
  const legal = birdiePickHoles(ABERDEEN_TEE_IV);
  // Stepped around what is already taken. Every slot of a par is handed the
  // IDENTICAL list, so walking every slot by the same index nominates one hole
  // twice — a set readPicks refuses outright.
  const taken: number[] = [];
  const out: Record<string, number> = {};
  for (const s of PICK_SLOTS) {
    const free = legal[s.key].filter((h) => !taken.includes(h));
    const hole = free[i % free.length];
    out[s.key] = hole;
    taken.push(hole);
  }
  return out as BirdiePicks;
}

// name | index | picks | 18 gross scores | expected: CH, gross, net, netUncapped, WTB, Agony, final
const REFERENCE: Reference[] = [
  ref("Abe Whitfield",   25.2, picks(0), [5,5,4,6,6,5,6,4,6,6,4,5,4,6,6,5,3,6], 19, 92, 73, 73, -0.5, -1.0, -1.5),
  ref("Ben Castellan",   24.8, picks(1), [5,4,4,6,5,5,6,4,6,5,5,6,5,7,5,5,4,6], 19, 93, 74, 74, -1.0, -2.0, -3.0),
  ref("Cy Ashford",      24.0, picks(2), [5,4,4,6,6,5,5,5,6,6,5,5,3,5,6,6,4,7], 18, 93, 75, 75, -1.0,  0.0, -1.0),
  ref("Dan Pemberton",   26.4, picks(3), [6,5,3,9,5,6,6,2,4,7,5,3,5,4,7,7,4,7], 21, 95, 74, 74, -2.5,  0.0, -2.5),
  ref("Eli Marsden",     23.6, picks(4), [6,6,4,8,5,5,6,3,6,6,5,5,4,4,3,6,4,6], 18, 92, 74, 74, -2.5,  0.0, -2.5),
  ref("Gus Thornbury",   25.4, picks(5), [5,6,4,6,6,5,6,5,5,6,5,5,4,8,4,7,4,6], 20, 97, 76, 77, -1.0, -1.0, -2.0),
  ref("Hal Brightwater", 25.1, picks(6), [5,6,4,8,6,6,6,3,5,5,6,6,4,5,5,6,3,6], 19, 95, 76, 76, -0.5,  1.0,  0.5),
  ref("Ike Calloway",    20.8, picks(7), [6,5,4,7,4,7,6,4,5,6,5,5,5,4,5,6,4,6], 15, 94, 79, 79,  0.5,  0.0,  0.5),
];

function ref(
  name: string, handicapIndex: number, picks: BirdiePicks, gross: number[],
  courseHandicap: number, grossTotal: number, net: number, netUncapped: number,
  watchTheBirdie: number, agonyAlley: number, final: number,
): Reference {
  return {
    card: { name, handicapIndex, picks, gross },
    courseHandicap, gross: grossTotal, net, netUncapped, watchTheBirdie, agonyAlley, final,
  };
}

for (const r of REFERENCE) {
  test(`section 9 · ${r.card.name}`, () => {
    const result = scorePlayer(r.card, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);

    assert.equal(result.courseHandicap, r.courseHandicap, "course handicap");
    assert.equal(result.gross, r.gross, "gross total");
    assert.equal(result.net, r.net, "capped net");
    assert.equal(result.netUncapped, r.netUncapped, "uncapped net");
    assert.equal(result.contests.watchTheBirdie.strokes, r.watchTheBirdie, "Watch the Birdie");
    assert.equal(result.contests.agonyAlley.strokes, r.agonyAlley, "Agony Alley");
    // The whole of the final, and nothing else in it. A card settles on these
    // two and only these two — the Hit List and Skins need a field.
    assert.deepEqual(Object.keys(result.contests), ["watchTheBirdie", "agonyAlley"]);
    assert.equal(r.watchTheBirdie + r.agonyAlley, r.final, "the two halves ARE the final");
    assert.equal(result.final, r.final, "FINAL");
    // ON A ZERO BASE THESE ARE THE SAME NUMBER. The contests no longer come off
    // a net total, so what a man earned IS what he finished on — worth pinning,
    // because the two used to differ by his whole net score.
    assert.equal(result.strokesEarned, result.final, "earned is the final");
  });
}

// The two cases the brief calls out by name.
test("Gus Thornbury's net is capped from 77 to 76", () => {
  const gus = REFERENCE.find((r) => r.card.name === "Gus Thornbury")!;
  const result = scorePlayer(gus.card, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(result.netUncapped, 77);
  assert.equal(result.net, 76);
});

test("Hal Brightwater is still the one man Agony Alley penalises", () => {
  // The rung is +1 now rather than +1.5 — the ladder was rescaled to the zero
  // base — but the card and the stretch are unchanged, so it is still his.
  const hal = REFERENCE.find((r) => r.card.name === "Hal Brightwater")!;
  const result = scorePlayer(hal.card, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(result.contests.agonyAlley.strokes, 1);
  assert.match(result.contests.agonyAlley.detail, /net 16 across the stretch/);

  const penalised = REFERENCE.filter((r) =>
    scorePlayer(r.card, ABERDEEN_TEE_IV, DEFAULT_CONTESTS).contests.agonyAlley.strokes > 0);
  assert.deepEqual(penalised.map((r) => r.card.name), ["Hal Brightwater"]);
});
