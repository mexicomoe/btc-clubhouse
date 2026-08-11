/**
 * Score import tests — the parser must handle both export shapes.
 *
 * Fixtures under test/fixtures/ mirror the two real spreadsheets, one TSV each:
 *   · tgif_demo.tsv     — Golf Genius low-net leaderboard: hole columns are NET.
 *   · december_demo.tsv — the December hole-by-hole export: hole columns are GROSS.
 *
 * Every number in them — holes, Out/In, Total, Net and the course handicaps — is
 * the real figure from the source spreadsheets, because the numbers are what is
 * under test. Only the player names are demo stand-ins: the club's real rosters
 * are member data and are kept out of this repo (see .gitignore).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseScores, grossCardToPlayer, splitName } from "../src/importScores.ts";
import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, birdiePickHoles, PICK_SLOTS, type BirdiePicks } from "../src/scoring.ts";

const read = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("splits the course handicap out of the trailing parenthesis", () => {
  assert.deepEqual(splitName("Sid Ferndale (18)"), { name: "Sid Ferndale", handicap: 18 });
  assert.deepEqual(splitName("Gus Thornbury (20)"), { name: "Gus Thornbury", handicap: 20 });
  assert.deepEqual(splitName("No Handicap Here"), { name: "No Handicap Here", handicap: null });
});

test("TGIF low-net export: hole columns detected as NET", () => {
  const { cards, errors } = parseScores(read("tgif_demo.tsv"));
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.ok(cards.length >= 16, "all players parsed");
  assert.ok(cards.every((c) => c.mode === "net"), "every row is net");

  const sid = cards.find((c) => c.name === "Sid Ferndale")!;
  assert.equal(sid.handicap, 19);
  assert.equal(sid.holesPlayed, 18);
  assert.equal(sid.grossTotal, 92, "Total column is the gross total");
  assert.equal(sid.netTotal, 73);
  // Recomputed from the 18 holes, never trusting Out/In/Net.
  const sum = sid.holes.reduce<number>((a, h) => a + (h ?? 0), 0);
  assert.equal(sum, 73, "18 net holes sum to the Net column");
  // A net 1 on a par 3 is a net 1, not a hole in one — nothing is re-subtracted.
  assert.equal(sid.holes[2], 2); // hole 3, par 3
});

test("December export: hole columns detected as GROSS", () => {
  const { cards, errors } = parseScores(read("december_demo.tsv"));
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.equal(cards.length, 8);
  assert.ok(cards.every((c) => c.mode === "gross"), "every row is gross");

  const gus = cards.find((c) => c.name === "Gus Thornbury")!;
  assert.equal(gus.handicap, 20);
  assert.equal(gus.grossTotal, 97);
  const sum = gus.holes.reduce<number>((a, h) => a + (h ?? 0), 0);
  assert.equal(sum, 97, "18 gross holes sum to the Total column");
});

// The payoff: import → engine → the section 9 finals, end to end.
test("December import feeds the engine and reproduces section 9", () => {
  // Picks are a setup input, not part of the export — same demo picks as the
  // section 9 unit test, so the finals must agree with it exactly.
  const order = ["Abe Whitfield", "Ben Castellan", "Cy Ashford", "Dan Pemberton",
                 "Eli Marsden", "Gus Thornbury", "Hal Brightwater", "Ike Calloway"];
  const legal = birdiePickHoles(ABERDEEN_TEE_IV);
  const picks: Record<string, BirdiePicks> = Object.fromEntries(order.map((name, i) => [name,
    Object.fromEntries(PICK_SLOTS.map((s) =>
      [s.key, legal[s.key][i % legal[s.key].length]])) as BirdiePicks]));
  const expectedFinal: Record<string, number> = {
    "Abe Whitfield": 71.2, "Ben Castellan": 72.3, "Cy Ashford": 74.4, "Dan Pemberton": 73.2,
    "Eli Marsden": 73.8, "Gus Thornbury": 74.3, "Hal Brightwater": 77.1, "Ike Calloway": 78.8,
  };

  const { cards } = parseScores(read("december_demo.tsv"));
  for (const card of cards) {
    const player = grossCardToPlayer(card, picks[card.name]);
    const result = scorePlayer(player, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
    assert.equal(result.final, expectedFinal[card.name], `${card.name} FINAL`);
  }
  // Gus's cap survives the round-trip through the parser.
  const gus = grossCardToPlayer(cards.find((c) => c.name === "Gus Thornbury")!, picks["Gus Thornbury"]);
  assert.equal(scorePlayer(gus, ABERDEEN_TEE_IV, DEFAULT_CONTESTS).net, 76);
});

test("a broken paste is reported, not silently accepted", () => {
  // Sid's holes sum to 70, matching neither his Total (92) nor his Net (73).
  const header = "\t1\t2\t3\t4\t5\t6\t7\t8\t9\tOut\t10\t11\t12\t13\t14\t15\t16\t17\t18\tIn\tTotal\tNet";
  const broken = "Sid Ferndale (19)\t4\t4\t2\t5\t5\t3\t6\t3\t4\t36\t5\t4\t5\t4\t4\t3\t5\t2\t2\t37\t92\t73";
  const { errors } = parseScores(`${header}\n${broken}`);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Sid Ferndale: 18 holes sum to 70/);
  assert.match(errors[0], /looks broken/);
});

test("parses player rows with no header, using the fixed section-10 layout", () => {
  // Two real TGIF rows, pasted without the header line.
  const rows =
    "Sid Ferndale (19)\t4\t4\t2\t5\t5\t3\t6\t3\t4\t36\t5\t4\t5\t4\t4\t3\t5\t2\t5\t37\t92\t73\n" +
    "Lou Barrington (17)\t4\t4\t3\t5\t5\t4\t5\t3\t5\t38\t5\t3\t4\t3\t5\t5\t4\t3\t5\t37\t92\t75";
  const { cards, errors } = parseScores(rows);
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.equal(cards.length, 2);
  assert.equal(cards[0].name, "Sid Ferndale");
  assert.equal(cards[0].mode, "net");
  assert.equal(cards[1].handicap, 17);
});
