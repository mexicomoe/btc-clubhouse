/**
 * Who can win, and what an empty card is worth.
 *
 * Two things follow from scoring partial rounds at all:
 *
 * 1. Twelve holes of net will always total less than eighteen, so a man who
 *    walks in would top a leaderboard sorted on the final. A finished card now
 *    outranks an unfinished one however the numbers fall, and a short card takes
 *    no position at all.
 *
 * 2. A card with nothing on it counts zero of everything — zero net doubles,
 *    zero bounce-backs — and every "count" contest grades zero as the best
 *    possible round. Nothing pays on an empty card.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { computeLeaderboard, scorePlayer, type PlayerCard } from "../src/scoring.ts";

const PAR = ABERDEEN_TEE_IV.par;

/** A level-par card off scratch, with `keep` holes played and the rest blank. */
function card(name: string, keep = 18, cart: number | null = null): PlayerCard {
  const gross = PAR.map((p, i) => (i < keep ? p : null)) as (number | null)[];
  return { name, courseHandicap: 0, gross, cart: cart == null ? undefined : cart,
           picks: { front: 5, back: 14 } };
}

/* ---- an unfinished round cannot win ---- */

test("a walked-in card does not beat a finished one, however low its net", () => {
  const short = card("Walked in", 12);
  const full = card("Finished", 18);

  // The short card's raw numbers really are lower — that is the trap.
  const shortAlone = scorePlayer(short, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const fullAlone = scorePlayer(full, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.ok(shortAlone.net! < fullAlone.net!, "twelve holes total less than eighteen");
  assert.ok(shortAlone.final! < fullAlone.final!, "and so does the final");

  // The leaderboard places the finished card first regardless.
  const board = computeLeaderboard([short, full], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.deepEqual(board.map((r) => r.name), ["Finished", "Walked in"]);
  assert.equal(board[0].rank, 1);
  assert.equal(board[0].eligible, true);
  assert.equal(board[1].rank, null, "an unfinished card takes no position");
  assert.equal(board[1].eligible, false);
});

test("every finished card outranks every unfinished one", () => {
  // Three short cards with very low nets against two ordinary complete rounds.
  const field = [
    card("Short A", 9), card("Short B", 12), card("Short C", 15),
    card("Full A", 18), card("Full B", 18),
  ];
  const board = computeLeaderboard(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const names = board.map((r) => r.name);
  assert.deepEqual(names.slice(0, 2).sort(), ["Full A", "Full B"], "the full rounds come first");
  assert.ok(board.slice(0, 2).every((r) => r.eligible));
  assert.ok(board.slice(2).every((r) => !r.eligible && r.rank === null));
});

test("among the ineligible, the furthest round is shown first", () => {
  const board = computeLeaderboard(
    [card("Nine", 9), card("Nothing", 0), card("Fifteen", 15)], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.deepEqual(board.map((r) => r.name), ["Fifteen", "Nine", "Nothing"]);
  assert.deepEqual(board.map((r) => r.holesPlayed), [15, 9, 0]);
});

test("ranks still run 1..n when everyone finished", () => {
  const board = computeLeaderboard(
    [card("A"), card("B"), card("C")], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.ok(board.every((r) => r.eligible));
  assert.deepEqual(board.map((r) => r.rank), [1, 1, 1], "identical cards share the place");
});

/* ---- an empty card pays nothing ---- */

test("no contest pays out on a card with no scores", () => {
  const empty = scorePlayer(card("Empty", 0), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);

  assert.equal(empty.holesPlayed, 0);
  assert.equal(empty.net, null, "no net to speak of");
  assert.equal(empty.final, null, "and so no final");
  assert.equal(empty.strokesEarned, 0, "nothing earned");

  for (const [name, c] of Object.entries(empty.contests)) {
    assert.equal(c.strokes, 0, `${name} pays nothing`);
    assert.equal(c.live, false, `${name} is shown as not live`);
  }
});

test("Damage Control does not read an empty card as a clean one", () => {
  // This is the specific trap: zero holes means zero net doubles, which grades
  // as the best possible round and would have paid −2.0.
  const empty = scorePlayer(card("Empty", 0), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(empty.contests.damageControl.strokes, 0);

  // A card that really was clean over a partial round still earns it, though —
  // Damage Control is meant to work on a partial.
  const partial = scorePlayer(card("Partial", 12), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(partial.contests.damageControl.strokes, -2.0, "a played card still counts");
  assert.equal(partial.contests.damageControl.live, true);
});

test("a contest never pays for holes that were not played", () => {
  const empty = scorePlayer(card("Empty", 0), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const nine = scorePlayer(card("Front nine only", 9), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);

  // Agony Alley needs 4–6; Easy Street needs 11–13; Watch the Birdie needs the
  // nominated hole to have been played. Easy Street is the one that matters
  // most here: it can PENALISE, and a front-nine card must not be charged +0.5
  // for failing to par three holes it never reached.
  for (const r of [empty, nine]) {
    if (r.holesPlayed === 0) {
      assert.equal(r.contests.agonyAlley.live, false, "no stretch on an empty card");
    }
    assert.equal(r.contests.easyStreet.live, false, "11–13 were not played");
    assert.equal(r.contests.easyStreet.strokes, 0, "and nothing is charged for them");
  }
  // Go Long and Get Shorty are switched off, so they are not on the card at all
  // — absent, not a zero, which would read as "he scored nothing on them".
  for (const r of [empty, nine]) {
    assert.equal(r.contests.goLong, undefined);
    assert.equal(r.contests.getShorty, undefined);
  }
  // The front-nine card DID play 4–6, so Agony Alley is live for it.
  assert.equal(nine.contests.agonyAlley.live, true);
  // Its back-nine birdie pick (hole 14) was never played, so only the front one
  // could ever pay — and level par pays nothing anyway.
  assert.equal(nine.contests.watchTheBirdie.strokes, 0);
});

test("an empty card is paid no skins, even from a cart that won them", () => {
  const winner = card("Winner", 18, 1);
  (winner.gross as (number | null)[])[0] = 3;      // cart 1 takes the 1st
  const absent = card("Absent", 0, 1);             // same cart, never teed off
  const other = card("Other", 18, 2);

  const board = computeLeaderboard([winner, absent, other], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));

  assert.equal(by["Winner"].skins, 1, "the cart won a skin");
  assert.equal(by["Absent"].contests.skins!.strokes, 0, "but he did not play for it");
  assert.equal(by["Absent"].contests.skins!.live, false);
  assert.equal(by["Absent"].contests.skins!.detail, "no card");
});
