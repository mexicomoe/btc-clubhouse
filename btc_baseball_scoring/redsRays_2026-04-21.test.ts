/**
 * REDS 12, RAYS 6 — 21 April 2026. Rob's card, scored against the rulebook and
 * held up next to what the v4.0 simulator printed.
 *
 * HOW THIS TEST IS BUILT, AND WHY IT IS BUILT THAT WAY. Reproducing one
 * scorecard proves nothing on its own: if the constants in `scoring.ts` were
 * transcribed wrong, a test written from the same misreading would pass. So the
 * suite opens with a DIFFERENT game — the v3.0 simulator's own worked example,
 * whose eleven printed lines were produced by the Sheet and not by this code.
 * Only once all eleven come back exactly is the engine trusted to judge the
 * April 21 card.
 *
 * Every SIM_* number below is transcribed from the simulator, untouched. Every
 * expected number is worked from the rulebook. Where they disagree the test
 * says so out loud rather than bending to the sheet.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreEntry,
  inningsPitched,
  pitcherFP,
  emptyBlock,
  type BatterBlock,
  type Entry,
} from "./scoring.ts";

/** Money rounds to the cent; so does a scorecard. Kills float dust before comparing. */
const cents = (n: number) => Math.round(n * 100) / 100;

/** A batter line, positionally, in the column order the Actual Stats tab uses. */
function line(
  player: string,
  ab: number, bb: number, h: number, doubles: number, triples: number,
  hr: number, r: number, rbi: number, k: number, sb: number, cs: number,
): BatterBlock {
  return { player, ab, bb, h, doubles, triples, hr, r, rbi, k, sb, cs };
}

/* ════════════════════ 1. CALIBRATION — the v3.0 worked example ════════════════════
 *
 * Source: BtC_Baseball_Simulator (v3.0, 4-Slot Edition), Scorecard tab. Same
 * final score as April 21, entirely different card. If the engine can price
 * this one to the cent on all eleven lines, its constants are right.
 */

const V3: Entry = {
  arrival: "ON TIME",
  winnerPickCorrect: true,
  predicted: { winner: 7, loser: 4 },
  actual: { winner: 12, loser: 6 },
  ace: { ip: 6.0, er: 2, h: 5, bb: 2, k: 9, win: true },
  closer: { ip: 1.0, er: 0, h: 1, bb: 0, k: 2, save: true },
  batters: {
    // v3.0 predates the Switcheroo: one block per slot, the other empty.
    LEADOFF: { pre: line("Elly De La Cruz", 5, 0, 2, 0, 0, 2, 2, 3, 1, 1, 0), post: emptyBlock("—") },
    THIEF:   { pre: line("Elly De La Cruz", 5, 0, 2, 0, 0, 2, 2, 3, 1, 1, 0), post: emptyBlock("—") },
    SLUGGER: { pre: line("Sal Stewart",     4, 1, 2, 1, 0, 0, 1, 2, 0, 0, 0), post: emptyBlock("—") },
    CLEANUP: { pre: line("Tyler Stephenson",4, 0, 1, 0, 0, 1, 1, 2, 0, 0, 0), post: emptyBlock("—") },
  },
  // The v3.0 card picked all nine innings and hit every one it picked.
  wsn: [
    { inning: 1, teamPick: "REDS", positionPick: "OUT", actualTeam: "REDS", actualPosition: "OUT", scorerInLineup: true },
    { inning: 2, teamPick: "REDS", positionPick: "OUT", actualTeam: "REDS", actualPosition: "OUT", scorerInLineup: true },
    { inning: 3, teamPick: "REDS", positionPick: "INF", actualTeam: "REDS", actualPosition: "INF", scorerInLineup: true },
    { inning: 4, teamPick: "RAYS", positionPick: "OUT", actualTeam: "RAYS", actualPosition: "OUT", scorerInLineup: false },
    { inning: 5, teamPick: "REDS", positionPick: "OUT", actualTeam: "REDS", actualPosition: "OUT", scorerInLineup: true },
    { inning: 6, teamPick: "RAYS", positionPick: "INF", actualTeam: "RAYS", actualPosition: "INF", scorerInLineup: false },
    { inning: 7, teamPick: "REDS", positionPick: "OUT", actualTeam: "REDS", actualPosition: "OUT", scorerInLineup: false },
    { inning: 8, teamPick: "RAYS", positionPick: "OUT", actualTeam: "RAYS", actualPosition: "OUT", scorerInLineup: false },
    { inning: 9 }, // skipped — nobody scored, and a skip costs nothing
  ],
};

test("calibration: the engine reproduces every line of the v3.0 simulator's own scorecard", () => {
  const card = scoreEntry(V3);

  assert.equal(cents(card.totalPP), 16.0);
  assert.equal(cents(card.aceFP), 16.0);
  assert.equal(cents(card.closerFP), 6.5);

  assert.equal(cents(card.batters.LEADOFF.base), 12.25);
  assert.equal(cents(card.batters.LEADOFF.bonus), 3.0);
  assert.equal(cents(card.batters.THIEF.base), 12.25);
  assert.equal(cents(card.batters.THIEF.bonus), 2.0);
  assert.equal(cents(card.batters.SLUGGER.base), 7.0);
  assert.equal(cents(card.batters.SLUGGER.bonus), 0.75);
  assert.equal(cents(card.batters.CLEANUP.base), 5.75);
  assert.equal(cents(card.batters.CLEANUP.bonus), 3.0);
  assert.equal(cents(card.totalBatterFP), 46.0);

  assert.equal(cents(card.totalWSN), 100.0);
  assert.equal(cents(card.grandTotal), 184.5);
});

/* ════════════════════ 2. THE CARD UNDER TEST — 21 April 2026 ════════════════════ */

const APRIL_21: Entry = {
  arrival: "ON TIME",
  winnerPickCorrect: true,            // picked REDS; REDS won 12-6
  predicted: { winner: 7, loser: 4 },
  actual: { winner: 12, loser: 6 },
  youTurn: { used: false },

  // Burns went 5.2 — FIVE INNINGS AND TWO OUTS, not five-point-two innings.
  ace: { ip: 5.2, er: 2, h: 5, bb: 3, k: 6, win: true },
  // Díaz never left the bullpen on April 21. A zero line, not a forfeit.
  closer: { ip: 0.0, er: 0, h: 0, bb: 0, k: 0 },

  batters: {
    // Switcheroo: De La Cruz out of LEADOFF at the break, Myers in. De La Cruz
    // stays at THIEF all nine, so his game splits across two slots' blocks.
    LEADOFF: {
      pre:  line("Elly De La Cruz", 3, 0, 1, 0, 0, 1, 1, 2, 0, 0, 0),
      post: line("Dane Myers",      2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0),
    },
    THIEF: {
      pre:  line("Elly De La Cruz", 3, 0, 1, 0, 0, 1, 1, 2, 0, 0, 0),
      post: line("Elly De La Cruz", 2, 0, 2, 0, 0, 1, 2, 2, 0, 1, 0),
    },
    SLUGGER: {
      pre:  line("Sal Stewart", 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0),
      post: line("Sal Stewart", 2, 0, 1, 0, 0, 0, 0, 2, 0, 0, 0),
    },
    CLEANUP: {
      pre:  line("Jonathan Aranda", 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0),
      post: line("Jonathan Aranda", 1, 1, 2, 0, 0, 1, 1, 3, 1, 0, 0),
    },
  },

  // No Who Scores Next picks were entered on this card. Nine free-roll innings
  // left on the table — WSN never subtracts, so an unplayed sheet is pure cost.
  wsn: [],
};

/** Exactly what the v4.0 Scorecard tab printed for this card. Transcribed, not computed. */
const SIM = {
  winnerPick: 12.0,
  scorePrediction: 4.0,
  youTurn: 0.0,
  totalPP: 16.0,
  aceFP: 13.2,
  closerFP: 0.0,
  leadoffBase: 7.0,
  leadoffBonus: 3.0,
  thiefBase: 17.25,
  thiefBonus: 2.0,
  sluggerBase: 7.5,
  sluggerBonus: 0.5,
  cleanupBase: 9.0,
  cleanupBonus: 4.5,
  totalBatterFP: 50.75,
  totalWSN: 0.0,
  totalFP: 63.95,
  grandTotal: 79.95,
};

test("April 21: PREDICTION POINTS agree with the simulator", () => {
  const card = scoreEntry(APRIL_21);
  assert.equal(cents(card.winnerPick), SIM.winnerPick);
  assert.equal(cents(card.scorePrediction), SIM.scorePrediction);
  assert.equal(cents(card.youTurn), SIM.youTurn);
  assert.equal(cents(card.totalPP), SIM.totalPP);
});

test("April 21: all eight BATTER lines agree with the simulator, Switcheroo split included", () => {
  const card = scoreEntry(APRIL_21);
  assert.equal(cents(card.batters.LEADOFF.base), SIM.leadoffBase);
  assert.equal(cents(card.batters.LEADOFF.bonus), SIM.leadoffBonus);
  assert.equal(cents(card.batters.THIEF.base), SIM.thiefBase);
  assert.equal(cents(card.batters.THIEF.bonus), SIM.thiefBonus);
  assert.equal(cents(card.batters.SLUGGER.base), SIM.sluggerBase);
  assert.equal(cents(card.batters.SLUGGER.bonus), SIM.sluggerBonus);
  assert.equal(cents(card.batters.CLEANUP.base), SIM.cleanupBase);
  assert.equal(cents(card.batters.CLEANUP.bonus), SIM.cleanupBonus);
  assert.equal(cents(card.totalBatterFP), SIM.totalBatterFP);
});

test("April 21: CLOSER and WSN agree with the simulator", () => {
  const card = scoreEntry(APRIL_21);
  // Díaz did not appear. A zero line is a zero, not a penalty.
  assert.equal(cents(card.closerFP), SIM.closerFP);
  // No picks entered, so nothing to score. WSN has no floor below zero anyway.
  assert.equal(cents(card.totalWSN), SIM.totalWSN);
});

/* ════════════════════ 3. THE ONE LINE THAT DISAGREES ════════════════════ */

test("IP is baseball notation: the digit after the point counts OUTS", () => {
  assert.equal(inningsPitched(6.0), 6);
  assert.equal(cents(inningsPitched(5.1)), 5.33);
  assert.equal(cents(inningsPitched(5.2)), 5.67);
  // .3 would be a sixth out in one inning. There is no such thing.
  assert.throws(() => inningsPitched(5.3), RangeError);
});

test("April 21: ACE FP is the ONE line that differs — 14.25 by the rulebook, 13.20 on the sheet", () => {
  const burns = APRIL_21.ace;

  // Correct: 5 innings + 2 outs = 5.667 innings.
  //   5.667 x 2.25 = 12.75 | K 6 x 0.25 = +1.50 | ER 2 = -2.00
  //   (H 5 + BB 3) x 0.25  =  -2.00 | Win = +4.00   ->  14.25
  assert.equal(cents(pitcherFP(burns, "baseball")), 14.25);

  // What the sheet did: multiplied the literal 5.2 by 2.25, as if the ".2"
  // were two tenths of an inning rather than two outs.
  //   5.2 x 2.25 = 11.70, i.e. 1.05 short of 12.75.
  assert.equal(cents(pitcherFP(burns, "decimal")), SIM.aceFP);
  assert.equal(cents(pitcherFP(burns, "decimal")), 13.2);

  // The gap is exactly two outs' worth of credit, less the rounding the sheet
  // happens to land on: 2/3 of an inning is 1.50 points, a raw .2 pays 0.45.
  assert.equal(cents(pitcherFP(burns, "baseball") - pitcherFP(burns, "decimal")), 1.05);
});

test("April 21: the grand total is 81.00, not 79.95 — the whole gap is the ACE line", () => {
  const card = scoreEntry(APRIL_21);

  assert.equal(cents(card.aceFP), 14.25);
  assert.equal(cents(card.totalFP), 65.0);   // sheet says 63.95
  assert.equal(cents(card.grandTotal), 81.0); // sheet says 79.95

  // Nothing else moved. Re-score with the sheet's own decimal-IP handling and
  // every figure on the card comes back to the simulator's, to the cent.
  const asSheetScored = scoreEntry(APRIL_21, "decimal");
  assert.equal(cents(asSheetScored.aceFP), SIM.aceFP);
  assert.equal(cents(asSheetScored.totalFP), SIM.totalFP);
  assert.equal(cents(asSheetScored.grandTotal), SIM.grandTotal);

  // And the gap between the two readings is exactly the ACE discrepancy.
  assert.equal(cents(card.grandTotal - asSheetScored.grandTotal), 1.05);
});

/* ════════════════════ 4. A DATA PROBLEM THE SCORING CANNOT SEE ════════════════════ */

test("Block 2 for CLEANUP is impossible as entered: 2 hits in 1 at-bat", () => {
  const post = APRIL_21.batters.CLEANUP.post;
  assert.equal(post.ab, 1);
  assert.equal(post.h, 2);
  // A hit is always an at-bat, so H can never exceed AB within a block.
  assert.ok(post.h > post.ab, "the entered block is internally impossible");

  // The COMBINED line is legal — 3 AB, 2 H, 2 BB is a fine 5-plate-appearance
  // game — so the scorecard totals are unaffected and every CLEANUP figure
  // above still ties out. But the 1-4 / 5-9 split is wrong somewhere, and a
  // Switcheroo card that split CLEANUP between two players would have paid the
  // wrong man. Worth a validator on the Actual Stats tab: H <= AB per block.
  const combined = { ...APRIL_21.batters.CLEANUP.pre };
  assert.equal(combined.ab + post.ab, 3);
  assert.ok(combined.h + post.h <= combined.ab + post.ab);
});
