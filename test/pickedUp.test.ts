/**
 * Picking up — the X Golf Genius prints where a man lifted his ball.
 *
 * Scored as par + 4 gross, which the net double bogey cap then takes to net
 * double: exactly what picking up means.
 *
 * The part that matters most is not the arithmetic but the counting. A picked-up
 * hole WAS played. A man who X'd three holes went round eighteen and can win the
 * competition. Reading X as a blank would make him a fifteen-hole card and take
 * him out of it — the same treatment as walking in after twelve, which is a
 * different thing entirely and is correctly not eligible.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { computeLeaderboard, scorePlayer, cappedNetByHole, type PlayerCard } from "../src/scoring.ts";
import { parseScores, PICKED_UP } from "../src/importScores.ts";

const PAR = ABERDEEN_TEE_IV.par;

/** Level par off scratch, with the named holes (1-based) picked up. */
function card(name: string, xHoles: number[] = [], ch = 0): PlayerCard {
  const gross: (number | string | null)[] = PAR.map((p) => p);
  for (const h of xHoles) gross[h - 1] = "X";
  return { name, courseHandicap: ch, gross, picks: { front: 5, back: 14 } };
}

/* ---- what an X scores ---- */

test("a picked-up hole is par + 4 gross and net double", () => {
  const r = scorePlayer(card("Picked up", [3]), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const par3 = PAR[2];                       // hole 3 is a par 3
  assert.equal(r.grossByHole[2], par3 + 4, "filled in at par + 4");
  assert.equal(r.netByHole[2], par3 + 2, "and the cap takes it to net double");
});

test("it is net double whatever the hole's par", () => {
  for (const hole of [1, 3, 4]) {            // a par 4, a par 3 and a par 5
    const r = scorePlayer(card("x", [hole]), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
    assert.equal(r.netByHole[hole - 1], PAR[hole - 1] + 2, `hole ${hole}`);
  }
});

test("it is net double at any ordinary handicap, shots received or not", () => {
  // Hole 4 is stroke index 1, so it is the first hole anyone gets a shot on.
  // par + 4 less one shot is par + 3, which the cap still takes to net double,
  // and less two shots it lands exactly on it.
  for (const ch of [0, 18, 26, 36]) {
    const net = cappedNetByHole(card("x", [4], ch), ABERDEEN_TEE_IV);
    assert.equal(net[3], PAR[3] + 2, `course handicap ${ch}: net double`);
  }
});

// Three shots on one hole needs a course handicap of 37 or more — the very top
// of the range. There par + 4 comes in UNDER net double, so a man who picked up
// is credited with a net bogey. Pinned so the limit of the rule is on the record
// rather than discovered on a card one day.
test("above a 36 handicap, par + 4 stops being net double", () => {
  const net = cappedNetByHole(card("x", [4], 37), ABERDEEN_TEE_IV);
  assert.equal(net[3], PAR[3] + 1, "three shots take it below the cap");
});

/* ---- the counting, which is the point ---- */

test("a hole he picked up still counts as played", () => {
  const r = scorePlayer(card("Three Xs", [4, 11, 15]), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(r.holesPlayed, 18, "eighteen holes, three of them picked up");
  assert.deepEqual(r.pickedUpHoles, [4, 11, 15]);
});

test("a man who X'd three holes is eligible to win", () => {
  const xCard = card("Picked up thrice", [4, 11, 15]);
  const clean = card("Went round", []);
  const board = computeLeaderboard([xCard, clean], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));

  assert.equal(by["Picked up thrice"].eligible, true, "a full round");
  assert.ok(by["Picked up thrice"].rank != null, "and it takes a position");
});

test("that is not the same as walking in", () => {
  // Three Xs is eighteen holes. Fifteen holes and nothing after is not.
  const xCard = card("Picked up thrice", [4, 11, 15]);
  const walked: PlayerCard = { name: "Walked in", courseHandicap: 0,
    gross: PAR.map((p, i) => (i < 15 ? p : null)), picks: { front: 5, back: 14 } };

  const board = computeLeaderboard([walked, xCard], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));
  assert.equal(by["Picked up thrice"].eligible, true);
  assert.equal(by["Walked in"].eligible, false, "a short card, however good");
  assert.equal(by["Walked in"].rank, null);
  assert.equal(board[0].name, "Picked up thrice", "the full round is placed first");
});

test("every contest still runs on a card with Xs on it", () => {
  const r = scorePlayer(card("Three Xs", [4, 11, 15]), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  // Agony Alley needs 4–6 and hole 4 was picked up — it was still played, so
  // the contest is live and simply scores the net double.
  assert.equal(r.contests.agonyAlley.live, true, "the stretch was played");
  assert.equal(r.contests.goLong.live, true);
  assert.equal(r.contests.getShorty.live, true);
  assert.equal(r.contests.damageControl.live, true);
});

/* ---- reading it out of a paste ---- */

const HEADER = "\t1\t2\t3\t4\t5\t6\t7\t8\t9\tOut\t10\t11\t12\t13\t14\t15\t16\t17\t18\tIn\tTotal\tNet";

function row(name: string, holes: (number | string)[]) {
  const out = holes.slice(0, 9).reduce<number>((a, h) => a + (typeof h === "number" ? h : 0), 0);
  const inn = holes.slice(9).reduce<number>((a, h) => a + (typeof h === "number" ? h : 0), 0);
  return [name, ...holes.slice(0, 9), out, ...holes.slice(9), inn, 90, 72].join("\t");
}

test("X is read as picked up, and a blank as not played", () => {
  const holes: (number | string)[] = PAR.map((p) => p);
  holes[3] = "X";
  const { cards, errors } = parseScores(`${HEADER}\n${row("Ridgeway, Ken (18)", holes)}`);
  assert.equal(errors.length, 0, errors.join("\n"));

  const c = cards[0];
  assert.equal(c.holes[3], PICKED_UP, "the X survives parsing as a marker");
  assert.equal(c.pickedUp, 1);
  assert.equal(c.holesPlayed, 18, "and the hole counts towards the eighteen");
});

test("a blank is still an unplayed hole, not a pick-up", () => {
  const holes: (number | string)[] = PAR.map((p) => p);
  const line = row("Ridgeway, Ken (18)", holes).split("\t");
  line[4] = "";                                   // hole 4 blank
  const { cards } = parseScores(`${HEADER}\n${line.join("\t")}`);
  assert.equal(cards[0].holes[3], null, "blank means not played");
  assert.equal(cards[0].pickedUp, 0);
  assert.equal(cards[0].holesPlayed, 17);
});

test("a card with an X is not called broken for failing to add up", () => {
  // The eighteen cannot be summed against the Total when one has no number, so
  // the mode is left for the organiser to say — but nothing is reported wrong.
  const holes: (number | string)[] = PAR.map((p) => p);
  holes[3] = "X";
  const { cards, errors } = parseScores(`${HEADER}\n${row("Ridgeway, Ken (18)", holes)}`);
  assert.equal(errors.length, 0, "no false 'paste looks broken'");
  assert.equal(cards[0].mode, "unknown", "gross vs net is left to be chosen");
});

test("any mark that is not a number means the same thing", () => {
  for (const mark of ["X", "x", "NR", "-", "*"]) {
    const holes: (number | string)[] = PAR.map((p) => p);
    holes[3] = mark;
    const { cards } = parseScores(`${HEADER}\n${row("Ridgeway, Ken (18)", holes)}`);
    assert.equal(cards[0].holes[3], PICKED_UP, `${mark} reads as picked up`);
    assert.equal(cards[0].holesPlayed, 18, `${mark} counts as played`);
  }
});
