/**
 * The milestone test: load the eight lowest-index players from the 19 December
 * Aberdeen round and reproduce section 9 of the build brief exactly.
 *
 * Gross hole-by-hole is taken from
 *   `Hole by Hole Excel Export -- Spreadsheet Composer.xlsx`
 * (hole columns are gross). Predicted scores are the section-9 inputs. Nothing
 * here is computed by the test — the expected finals are the brief's numbers,
 * re-derived for the retuned Bounce Back ladder (3+/2/1 → −1.5/−1.0/−0.5).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, type PlayerCard } from "../src/scoring.ts";

interface Reference {
  card: PlayerCard;
  courseHandicap: number;
  gross: number;
  net: number;
  netUncapped: number;
  callYourNumber: number;
  strokesOff: number; // strokes earned, as a positive "off" figure
  final: number;
}

// name | index | predicted | 18 gross scores | expected: CH, gross, net, netUncapped, CYN, off, final
const REFERENCE: Reference[] = [
  ref("Abe Whitfield", 25.2, 92, [5,5,4,6,6,5,6,4,6,6,4,5,4,6,6,5,3,6], 19, 92, 73, 73, -2.0, 8.0, 65.0),
  ref("Ben Castellan",   24.8, 91, [5,4,4,6,5,5,6,4,6,5,5,6,5,7,5,5,4,6], 19, 93, 74, 74, -1.5, 7.0, 67.0),
  ref("Cy Ashford",    24.0, 93, [5,4,4,6,6,5,5,5,6,6,5,5,3,5,6,6,4,7], 18, 93, 75, 75, -2.0, 6.0, 69.0),
  ref("Dan Pemberton",   26.4, 94, [6,5,3,9,5,6,6,2,4,7,5,3,5,4,7,7,4,7], 21, 95, 74, 74, -2.0, 4.5, 69.5),
  ref("Eli Marsden",  23.6, 91, [6,6,4,8,5,5,6,3,6,6,5,5,4,4,3,6,4,6], 18, 92, 74, 74, -2.0, 4.5, 69.5),
  ref("Gus Thornbury",    25.4, 95, [5,6,4,6,6,5,6,5,5,6,5,5,4,8,4,7,4,6], 20, 97, 76, 77, -1.5, 6.0, 70.0),
  ref("Hal Brightwater", 25.1, 94, [5,6,4,8,6,6,6,3,5,5,6,6,4,5,5,6,3,6], 19, 95, 76, 76, -2.0, 5.0, 71.0),
  ref("Ike Calloway",  20.8, 92, [6,5,4,7,4,7,6,4,5,6,5,5,5,4,5,6,4,6], 15, 94, 79, 79, -1.5, 3.5, 75.5),
];

function ref(
  name: string, handicapIndex: number, predicted: number, gross: number[],
  courseHandicap: number, grossTotal: number, net: number, netUncapped: number,
  callYourNumber: number, strokesOff: number, final: number,
): Reference {
  return {
    card: { name, handicapIndex, predicted, gross },
    courseHandicap, gross: grossTotal, net, netUncapped, callYourNumber, strokesOff, final,
  };
}

for (const r of REFERENCE) {
  test(`section 9 · ${r.card.name}`, () => {
    const result = scorePlayer(r.card, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);

    assert.equal(result.courseHandicap, r.courseHandicap, "course handicap");
    assert.equal(result.gross, r.gross, "gross total");
    assert.equal(result.net, r.net, "capped net");
    assert.equal(result.netUncapped, r.netUncapped, "uncapped net");
    assert.equal(result.contests.callYourNumber.strokes, r.callYourNumber, "Call Your Number");
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
