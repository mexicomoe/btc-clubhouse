/**
 * Breaking a tie — golf's match of cards.
 *
 * Every contest except Skins pays in halves, so equal finals are the norm, not
 * the exception: across the club's own cards at least one tie turns up in most
 * eight-man fields and in every full one. The club's rule settles them, back
 * nine first: lowest final, then 10–18, then 13–18, then 16–18, then the 18th.
 * Level after all that and the place is genuinely shared.
 *
 * The cards below are built off a scratch handicap so net is gross and every
 * figure can be read straight off par. Each variant moves strokes only between
 * holes that no contest looks at, so the finals stay equal and the card match is
 * the only thing separating anyone.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { computeLeaderboard, matchOfCards, CARD_MATCH, scorePlayer, type PlayerCard } from "../src/scoring.ts";

const PAR = ABERDEEN_TEE_IV.par;
const level = () => PAR.slice() as (number | null)[];

function card(name: string, edit: (g: (number | null)[]) => void): PlayerCard {
  const gross = level();
  edit(gross);
  return { name, courseHandicap: 0, gross };
}

// Level par. Front 36, back 36.
const EVEN = card("Even", () => {});
// A shot given back on the 1st, a shot won on the 10th: same 72, better back nine.
const BACK_NINE = card("Back nine", (g) => { g[0] = 5; g[9] = 3; });
// Same 72 and the same back nine as BACK_NINE, but the birdie falls in 13–18.
const LAST_SIX = card("Last six", (g) => { g[0] = 5; g[13] = 3; });

test("the stretches are the club's, in order", () => {
  assert.deepEqual(CARD_MATCH.map((s) => [s.from, s.to]), [[10, 18], [13, 18], [16, 18], [18, 18]]);
});

test("all three finish on the same final", () => {
  for (const c of [EVEN, BACK_NINE, LAST_SIX]) {
    const r = scorePlayer(c, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
    assert.equal(r.net, 72, `${c.name} net`);
    assert.equal(r.final, 67, `${c.name} final — the tie these tests exist to break`);
  }
});

test("the better back nine takes the place", () => {
  const board = computeLeaderboard([EVEN, BACK_NINE], undefined, DEFAULT_CONTESTS);
  assert.deepEqual(board.map((r) => r.name), ["Back nine", "Even"]);
  assert.deepEqual(board.map((r) => r.rank), [1, 2], "not a shared place");
  assert.deepEqual(board[0].cardMatch, { shared: false, wonBy: "the back nine" });
});

test("level on the back nine, it goes to the last six", () => {
  const board = computeLeaderboard([EVEN, BACK_NINE, LAST_SIX], undefined, DEFAULT_CONTESTS);
  assert.deepEqual(board.map((r) => r.name), ["Last six", "Back nine", "Even"]);
  assert.deepEqual(board.map((r) => r.rank), [1, 2, 3]);
  assert.equal(board[0].cardMatch!.wonBy, "13–18", "the last six separated the top two");
  assert.equal(board[1].cardMatch!.wonBy, "the back nine", "the back nine separated the next");
});

test("16–18 decides when the back nine and the last six are level", () => {
  // One shot won on the 16th against one won on the 13th: level over 10–18 and
  // over 13–18, and only 16–18 tells them apart.
  const on16 = scorePlayer(card("on16", (g) => { g[15] = 4; }), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const on13 = scorePlayer(card("on13", (g) => { g[12] = 2; }), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(matchOfCards(on16, on13).label, "16–18");
  assert.equal(matchOfCards(on16, on13).order, -1, "the shot inside 16–18 takes it");
});

test("the 18th is the last word", () => {
  // One shot won on the 18th against one won on the 16th: level all the way
  // through 16–18, so only the hole itself is left.
  const on18 = scorePlayer(card("on18", (g) => { g[17] = 4; }), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const on16 = scorePlayer(card("on16", (g) => { g[15] = 4; }), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(matchOfCards(on18, on16).label, "the 18th");
  assert.equal(matchOfCards(on18, on16).order, -1, "the better 18th takes it");
});

test("cards genuinely level share the place", () => {
  const twin = card("Twin", () => {});
  const board = computeLeaderboard([EVEN, twin], undefined, DEFAULT_CONTESTS);
  assert.deepEqual(board.map((r) => r.rank), [1, 1], "the place is shared");
  assert.equal(board[0].cardMatch!.shared, true);
  assert.equal(board[1].cardMatch!.shared, true);
  assert.equal(board[0].cardMatch!.wonBy, null, "nothing to claim");
});

test("a man who did not finish cannot win a card match", () => {
  // Same final, but four holes never played — no card, so no match of cards.
  const short = card("Walked in", (g) => { for (let i = 14; i < 18; i++) g[i] = null; });
  const shortResult = scorePlayer(short, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const evenResult = scorePlayer(EVEN, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);

  assert.equal(shortResult.holesPlayed, 14);
  const verdict = matchOfCards(evenResult, shortResult);
  assert.equal(verdict.order, -1, "the finished card is placed above");
  assert.equal(verdict.label, "a finished card");
  // ...and the other way round, whichever order they are compared in.
  assert.equal(matchOfCards(shortResult, evenResult).order, 1);
});

test("two unfinished cards share rather than being invented apart", () => {
  const one = scorePlayer(card("one", (g) => { g[17] = null; }), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const two = scorePlayer(card("two", (g) => { g[17] = null; g[16] = 2; }), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(matchOfCards(one, two).order, 0, "neither can win a card match");
});

test("different finals are never touched by the card match", () => {
  const better = card("Better", (g) => { g[9] = 3; });   // a shot better, so a lower final
  const board = computeLeaderboard([EVEN, better], undefined, DEFAULT_CONTESTS);
  assert.equal(board[0].name, "Better");
  assert.ok(board[0].final! < board[1].final!, "the final decided it, not the cards");
  assert.equal(board[0].cardMatch, undefined, "no card match to report");
  assert.equal(board[1].cardMatch, undefined);
});
