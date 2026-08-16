/**
 * A paste MERGES into the round.
 *
 * It used to replace it outright, which is only right if a paste is always the
 * whole round — and it is not. A two-flight event kept the second flight and
 * silently lost the first; three and four flights are ordinary at a club event,
 * and any field pasted in chunks would have gone the same way.
 *
 * The merge itself lives in commitImport in leaderboard.html, which needs a
 * browser. What is tested here is the RULE it applies, written out the same
 * way, so the shape of the decision is pinned even though the button is not.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseScores, nearestName, editDistance } from "../src/importScores.ts";

type Card = { playerId: string; gross: number[]; handicap: number | null };

/** Exactly what commitImport does to state.scores and state.handicaps. */
function merge(
  scores: Record<string, number[]>,
  handicaps: Record<string, number>,
  cards: Card[],
) {
  for (const c of cards) {
    scores[c.playerId] = c.gross;
    if (c.handicap != null) handicaps[c.playerId] = c.handicap;
    else delete handicaps[c.playerId];
  }
  return { scores, handicaps };
}

const card = (n: number) => new Array(18).fill(n);

test("a second flight does not wipe the first", () => {
  const scores: Record<string, number[]> = {};
  const handicaps: Record<string, number> = {};

  merge(scores, handicaps, [
    { playerId: "p1", gross: card(4), handicap: 18 },
    { playerId: "p2", gross: card(5), handicap: 21 },
  ]);
  merge(scores, handicaps, [
    { playerId: "p3", gross: card(6), handicap: 15 },
    { playerId: "p4", gross: card(7), handicap: 23 },
  ]);

  assert.deepEqual(Object.keys(scores).sort(), ["p1", "p2", "p3", "p4"]);
  assert.deepEqual(scores.p1, card(4), "the first flight is still there");
  assert.deepEqual(scores.p4, card(7));
});

test("four flights all survive", () => {
  const scores: Record<string, number[]> = {};
  const handicaps: Record<string, number> = {};
  for (let f = 1; f <= 4; f++) {
    merge(scores, handicaps, [
      { playerId: "f" + f + "a", gross: card(f), handicap: 10 + f },
      { playerId: "f" + f + "b", gross: card(f), handicap: 20 + f },
    ]);
  }
  assert.equal(Object.keys(scores).length, 8);
});

test("a card for a man already scored replaces only his", () => {
  const scores: Record<string, number[]> = {};
  const handicaps: Record<string, number> = {};
  merge(scores, handicaps, [
    { playerId: "p1", gross: card(4), handicap: 18 },
    { playerId: "p2", gross: card(5), handicap: 21 },
  ]);
  merge(scores, handicaps, [{ playerId: "p2", gross: card(9), handicap: 22 }]);

  assert.deepEqual(scores.p1, card(4), "the other man is untouched");
  assert.deepEqual(scores.p2, card(9), "his own card is the new one");
  assert.equal(handicaps.p1, 18);
  assert.equal(handicaps.p2, 22, "and so is his handicap");
});

test("a replacement with no handicap does not inherit the displaced card's", () => {
  // Otherwise the round is scored on a handicap belonging to a card that is no
  // longer in it, and nothing on screen would say so.
  const scores: Record<string, number[]> = {};
  const handicaps: Record<string, number> = {};
  merge(scores, handicaps, [{ playerId: "p1", gross: card(4), handicap: 18 }]);
  merge(scores, handicaps, [{ playerId: "p1", gross: card(5), handicap: null }]);
  assert.equal("p1" in handicaps, false);
});

/* ---- an empty Total column ---- */

const HEADER = "Player\t1\t2\t3\t4\t5\t6\t7\t8\t9\tOut\t10\t11\t12\t13\t14\t15\t16\t17\t18\tIn\tTotal\tNet";
const eighteen = (n: number) => {
  const h = new Array(18).fill(n);
  return h.slice(0, 9).join("\t") + "\t" + (n * 9) + "\t" + h.slice(9).join("\t") + "\t" + (n * 9);
};

test("a blank Total no longer throws the card away", () => {
  const text = [HEADER, "Ridgeway, Ken (18)\t" + eighteen(4) + "\t\t"].join("\n");
  const { cards, errors } = parseScores(text);
  assert.equal(cards.length, 1, "the card comes through");
  assert.equal(cards[0].holesPlayed, 18);
  assert.deepEqual(errors, [], "and nothing is called broken");
});

test("a blank Total still cannot say gross from net on its own", () => {
  // Summing the holes and comparing them to that same sum always agrees, so it
  // would call every card gross — net ones included. It stays unclassified and
  // the screen asks.
  const text = [HEADER, "Ridgeway, Ken (18)\t" + eighteen(4) + "\t\t"].join("\n");
  const { cards } = parseScores(text);
  assert.equal(cards[0].mode, "unknown");
});

test("a blank Total with a Net that fits is read as net", () => {
  const text = [HEADER, "Ridgeway, Ken (18)\t" + eighteen(4) + "\t\t72"].join("\n");
  const { cards } = parseScores(text);
  assert.equal(cards[0].mode, "net", "72 is what the eighteen fours come to");
});

test("a real mismatch is still called broken", () => {
  const text = [HEADER, "Ridgeway, Ken (18)\t" + eighteen(4) + "\t99\t95"].join("\n");
  const { errors } = parseScores(text);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /looks broken/);
});

/* ---- suggesting the near miss ---- */

const ROSTER = ["Gidaly, Mitchell", "Ridgeway, Ken", "Finkelstein, Dave", "Merrick, Sal"];

test("a shortened first name is offered, not just rejected", () => {
  const near = nearestName("Gidaly, Mitch", ROSTER);
  assert.equal(ROSTER[near.index], "Gidaly, Mitchell");
});

test("a misspelt surname is offered", () => {
  assert.equal(ROSTER[nearestName("Gidali, Mitchell", ROSTER).index], "Gidaly, Mitchell");
});

test("a stranger is not dressed up as a near miss", () => {
  assert.equal(nearestName("Nobody, At All", ROSTER).index, -1);
});

test("two names equally close is a coin toss, so nothing is offered", () => {
  // "Smith, Jon" sits one edit from both. Guessing here would be worse than
  // saying nothing, because the organiser would trust it.
  const tie = ["Smith, John", "Smith, Joan"];
  assert.equal(nearestName("Smith, Jon", tie).index, -1);
});

test("an empty roster offers nothing rather than throwing", () => {
  assert.equal(nearestName("Ridgeway, Ken", []).index, -1);
});

test("edit distance counts what it says it counts", () => {
  assert.equal(editDistance("", ""), 0);
  assert.equal(editDistance("abc", "abc"), 0);
  assert.equal(editDistance("abc", "abd"), 1);
  assert.equal(editDistance("abc", ""), 3);
  assert.equal(editDistance("mitch", "mitchell"), 3);
});
