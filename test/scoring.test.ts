/**
 * The milestone test: load the eight lowest-index players from the 19 December
 * Aberdeen round and reproduce section 9 of the build brief.
 *
 * Gross hole-by-hole and the course handicaps are the real figures from the
 * December export; only the names are demo stand-ins. Nothing here is computed
 * by the test — every expected value is pinned.
 *
 * The finals are re-derived for the current contest set: Call Your Number is
 * gone, and Watch the Birdie (two nominated par 4s, one per nine, a net birdie
 * on either paying −1.0) has replaced it.
 *
 * NOTE ON PICKS: the club has no recorded Watch the Birdie picks for December —
 * the contest postdates the round. The picks below are demo inputs, assigned by
 * rotating through the legal par 4s (front 1, 2, 5, 6, 9 · back 10, 11, 12, 14,
 * 15). Real picks would move these finals.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, type PlayerCard, type BirdiePicks } from "../src/scoring.ts";

interface Reference {
  card: PlayerCard;
  courseHandicap: number;
  gross: number;
  net: number;
  netUncapped: number;
  watchTheBirdie: number;
  strokesOff: number; // strokes earned, as a positive "off" figure
  final: number;
}

// name | index | picks | 18 gross scores | expected: CH, gross, net, netUncapped, WTB, off, final
const REFERENCE: Reference[] = [
  ref("Abe Whitfield",   25.2, { front: 1, back: 10 }, [5,5,4,6,6,5,6,4,6,6,4,5,4,6,6,5,3,6], 19, 92, 73, 73,  0.0, 7.0, 66.0),
  ref("Ben Castellan",   24.8, { front: 2, back: 11 }, [5,4,4,6,5,5,6,4,6,5,5,6,5,7,5,5,4,6], 19, 93, 74, 74, -1.0, 6.0, 68.0),
  ref("Cy Ashford",      24.0, { front: 5, back: 12 }, [5,4,4,6,6,5,5,5,6,6,5,5,3,5,6,6,4,7], 18, 93, 75, 75,  0.0, 4.0, 71.0),
  ref("Dan Pemberton",   26.4, { front: 6, back: 14 }, [6,5,3,9,5,6,6,2,4,7,5,3,5,4,7,7,4,7], 21, 95, 74, 74, -1.0, 3.5, 70.5),
  ref("Eli Marsden",     23.6, { front: 9, back: 15 }, [6,6,4,8,5,5,6,3,6,6,5,5,4,4,3,6,4,6], 18, 92, 74, 74, -1.0, 3.0, 71.0),
  ref("Gus Thornbury",   25.4, { front: 1, back: 10 }, [5,6,4,6,6,5,6,5,5,6,5,5,4,8,4,7,4,6], 20, 97, 76, 77,  0.0, 4.5, 71.5),
  ref("Hal Brightwater", 25.1, { front: 2, back: 11 }, [5,6,4,8,6,6,6,3,5,5,6,6,4,5,5,6,3,6], 19, 95, 76, 76,  0.0, 3.0, 73.0),
  ref("Ike Calloway",    20.8, { front: 5, back: 12 }, [6,5,4,7,4,7,6,4,5,6,5,5,5,4,5,6,4,6], 15, 94, 79, 79, -1.0, 3.0, 76.0),
];

function ref(
  name: string, handicapIndex: number, picks: BirdiePicks, gross: number[],
  courseHandicap: number, grossTotal: number, net: number, netUncapped: number,
  watchTheBirdie: number, strokesOff: number, final: number,
): Reference {
  return {
    card: { name, handicapIndex, picks, gross },
    courseHandicap, gross: grossTotal, net, netUncapped, watchTheBirdie, strokesOff, final,
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
    // strokesEarned is negative when contests help; the brief prints it as "off".
    assert.equal(-result.strokesEarned, r.strokesOff, "strokes off");
    assert.equal(result.final, r.final, "FINAL");
  });
}

// The two cases the brief calls out by name.
test("Gus Thornbury's net is capped from 77 to 76", () => {
  const gus = REFERENCE.find((r) => r.card.name === "Gus Thornbury")!;
  const result = scorePlayer(gus.card, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(result.netUncapped, 77);
  assert.equal(result.net, 76);
});

test("Hal Brightwater takes a +1.0 penalty on Agony Alley", () => {
  const hal = REFERENCE.find((r) => r.card.name === "Hal Brightwater")!;
  const result = scorePlayer(hal.card, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(result.contests.agonyAlley.strokes, 1.0);
});
