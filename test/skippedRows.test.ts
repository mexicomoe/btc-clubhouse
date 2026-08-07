/**
 * Rows in the export that are not a man's round.
 *
 *   "(blind)" in the name — a blind is the phantom player a draw invents to
 *                           even up the teams. There is nobody to score.
 *   a Total of "NC"       — no card returned.
 *
 * Neither is dropped on the floor. They come through marked, so the import
 * screen can show what it left out and why: a paste that quietly loses rows is
 * worse than one that refuses them, because nobody notices the loss.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV } from "../src/courseConfig.ts";
import { parseScores } from "../src/importScores.ts";

const PAR = ABERDEEN_TEE_IV.par;
const HEADER = "\t1\t2\t3\t4\t5\t6\t7\t8\t9\tOut\t10\t11\t12\t13\t14\t15\t16\t17\t18\tIn\tTotal\tNet";

/** A row of level-par holes, with the Total and Net cells given as text. */
function row(name: string, total: string = "72", net: string = "72") {
  const out = PAR.slice(0, 9).reduce((a, b) => a + b, 0);
  const inn = PAR.slice(9).reduce((a, b) => a + b, 0);
  return [name, ...PAR.slice(0, 9), out, ...PAR.slice(9), inn, total, net].join("\t");
}
const parse = (...rows: string[]) => parseScores([HEADER, ...rows].join("\n"));

/* ---- blinds ---- */

test("a blind is set aside, not imported", () => {
  const { cards, errors } = parse(row("BLINDER (blind)"));
  assert.equal(errors.length, 0, "not an error, just not a round");
  assert.equal(cards.length, 1, "and not dropped either");
  assert.equal(cards[0].skip, "a blind, not a player");
});

test("the blind mark is found wherever it sits, in any case", () => {
  for (const name of ["BLINDER (blind)", "Blind Draw (Blind)", "X (BLIND)", "A (  blind  ) "]) {
    const { cards } = parse(row(name));
    assert.equal(cards[0].skip, "a blind, not a player", name);
  }
});

// The rule is the word in brackets, not the word anywhere. A man called
// Blindman, or a course called Blind Creek, is a player like any other.
test("a name that merely contains the letters is not a blind", () => {
  for (const name of ["Blindman, Sid (18)", "Blind Creek Ken (12)"]) {
    const { cards } = parse(row(name));
    assert.equal(cards[0].skip, null, name);
  }
});

/* ---- no card returned ---- */

test("a Total of NC is set aside", () => {
  const { cards, errors } = parse(row("Ridgeway, Ken (18)", "NC", "NC"));
  assert.equal(errors.length, 0, "no false 'cannot read the card'");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].skip, "no card returned (NC)");
});

test("NC is read however it is written", () => {
  for (const total of ["NC", "nc", "N.C.", " NC "]) {
    const { cards } = parse(row("Ridgeway, Ken (18)", total, total));
    assert.equal(cards[0].skip, "no card returned (NC)", JSON.stringify(total));
  }
});

/* ---- everything else still imports ---- */

// From the user's own example: PEAKY (0) is a handicap of nought, not a blind.
// It parses as an ordinary player and must not be caught by either rule.
test("a handicap of nought is a player, not a blind", () => {
  const { cards, errors } = parse(row("PEAKY (0)"));
  assert.equal(errors.length, 0);
  assert.equal(cards[0].skip, null, "imported like anyone else");
  assert.equal(cards[0].name, "PEAKY");
  assert.equal(cards[0].handicap, 0);
});

test("the real rounds in the same paste are untouched", () => {
  const { cards, errors } = parse(
    row("BLINDER (blind)"),
    row("Ridgeway, Ken (18)"),
    row("Merrick, Sal (21)", "NC", "NC"),
    row("PEAKY (0)"),
  );
  assert.equal(errors.length, 0);
  assert.deepEqual(cards.map((c) => c.skip), [
    "a blind, not a player", null, "no card returned (NC)", null,
  ]);
  // The two real cards read exactly as they would on their own.
  const ken = cards[1];
  assert.equal(ken.holesPlayed, 18);
  assert.equal(ken.grossTotal, 72);
  assert.equal(ken.mode, "net", "still classified normally");
});

test("a set-aside row is never graded", () => {
  // Its holes cannot sum to a Total that isn't a number, and a blind has no card
  // to call broken — neither may raise "the paste looks broken".
  const { cards, errors } = parse(row("BLINDER (blind)", "999"), row("Nobody (5)", "NC"));
  assert.equal(errors.length, 0);
  assert.ok(cards.every((c) => c.mode === "unknown"), "left ungraded");
});

/* ---- the export's own label rows ---- */

/**
 * Golf Genius prints three rows for every player: his card, a "Net Score" row,
 * a "To Par (net)" row, then a blank one. Those are the export talking about
 * the card above, not people.
 *
 * Left in they are worse than noise. Their eighteen numbers sum to the total
 * printed beside them, so each parses as a perfectly good GROSS card and lands
 * in the import list as a phantom player waiting to be assigned — sixteen of
 * them in an eight-man field, crowding out the two rows that genuinely need a
 * decision. Assign a player to one by mistake and the real row is refused too,
 * because two rows may not share a man.
 */
const REAL_PASTE = [
  "Ridgeway, Rob (18)\t4\t5\t2\t5\t5\t4\t4\t2\t5\t36\t3\t4\t4\t3\t5\t5\t5\t2\t5\t36\t90\t72",
  "Net Score\t4\t5\t2\t5\t5\t4\t4\t2\t5\t36\t3\t4\t4\t3\t5\t5\t5\t2\t5\t36\t72\t",
  "To Par (net)\t0\t1\t-1\t0\t1\t0\t-1\t-1\t1\t0\t-1\t0\t0\t0\t1\t1\t0\t-1\t0\t0\t0\t",
  "",
  "Harkness, Fred (14)\t3\t4\t3\t6\t4\t4\t4\t4\t5\t37\t5\t3\t3\t3\t4\t5\t6\t4\t5\t38\t89\t75",
  "Marlow, Andrew (30)\t4\t3\t3\t6\t5\t4\t6\t4\t3\t38\t4\t5\t3\t3\t5\t4\t5\t3\t7\t39\t107\t77",
].join("\n");

test("three rows a player yields one card a player", () => {
  const { cards, errors } = parseScores(REAL_PASTE);
  assert.equal(errors.length, 0, "the label rows are not errors either");
  assert.deepEqual(cards.map((c) => c.name),
    ["Ridgeway, Rob", "Harkness, Fred", "Marlow, Andrew"]);
});

test("a label row is not a player, however well it parses", () => {
  // This is the trap: on its own it looks like a flawless gross card.
  const alone = parseScores(
    "Net Score\t4\t5\t2\t5\t5\t4\t4\t2\t5\t36\t3\t4\t4\t3\t5\t5\t5\t2\t5\t36\t72\t");
  assert.equal(alone.cards.length, 0, "no card at all");
  assert.equal(alone.errors.length, 0, "and nothing to report");
});

test("every label the export writes is refused", () => {
  const holes = "\t4\t5\t2\t5\t5\t4\t4\t2\t5\t36\t3\t4\t4\t3\t5\t5\t5\t2\t5\t36\t72\t";
  for (const label of ["Net Score", "net score", "NET SCORE",
                       "To Par", "To Par (net)", "To Par (gross)", "  To Par  "]) {
    const { cards } = parseScores(label + holes);
    assert.equal(cards.length, 0, label);
  }
});

test("a real player is never mistaken for a label", () => {
  const holes = "\t4\t5\t2\t5\t5\t4\t4\t2\t5\t36\t3\t4\t4\t3\t5\t5\t5\t2\t5\t36\t72\t";
  for (const name of ["Netherton, Sid (18)", "Parr, Ken (12)", "Score, Bill (9)"]) {
    const { cards } = parseScores(name + holes);
    assert.equal(cards.length, 1, name);
  }
});

test("the cards that survive are read exactly as they should be", () => {
  const { cards } = parseScores(REAL_PASTE);
  const rob = cards[0];
  assert.equal(rob.handicap, 18);
  assert.equal(rob.holesPlayed, 18);
  assert.equal(rob.mode, "net", "hole columns are net, as the low-net export writes them");
  assert.equal(rob.grossTotal, 90);
  assert.equal(rob.netTotal, 72);
  assert.equal(rob.holes.reduce<number>((a, h) => a + (h as number), 0), 72,
    "and the eighteen sum to the Net column");
});
