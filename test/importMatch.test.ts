/**
 * The real Golf Genius paste — two things about it break a naive importer.
 *
 * 1. It prints "Last, First (hcp)", while the setup sheet carries "First L.".
 *    Every row misses on an exact-name match.
 * 2. It does not always print the empty cell above the name column, so the
 *    header row is one column to the LEFT of the data it labels. Uncorrected,
 *    hole 1 reads the name cell and hole 10 reads the Out total, and the card
 *    imports as quiet nonsense rather than failing.
 *
 * The fixture is that export's exact shape — 22 header cells over 23 data
 * columns, net hole scores, names reversed — with demo names on it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseScores, matchName, unreverseName, initialKey } from "../src/importScores.ts";

const read = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const PASTE = read("golfgenius_lastfirst.tsv");

/* ---- the column shift ---- */

test("a header one column left of the data is realigned", () => {
  const { cards, errors } = parseScores(PASTE);
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.equal(cards.length, 4);

  // Every card reads as a full round, not 17 holes with the Out total in it.
  for (const c of cards) {
    assert.equal(c.holesPlayed, 18, `${c.name} holes played`);
    assert.equal(c.mode, "net", `${c.name} mode`);
    assert.ok(!c.holes.includes(null), `${c.name} has no phantom blank hole`);
  }
  const ken = cards.find((c) => c.name === "Ridgeway, Ken")!;
  assert.deepEqual(ken.holes, [4,4,2,5,4,4,5,2,4,6,4,4,3,3,5,5,2,6]);
  assert.equal(ken.holes[0], 4, "hole 1 is a score, not the name cell");
  assert.equal(ken.holes[9], 6, "hole 10 is a score, not the Out total");
  assert.equal(ken.grossTotal, 90);
  assert.equal(ken.netTotal, 72);
  // The parser's own check: 18 net holes must sum to the Net column.
  assert.equal(ken.holes.reduce<number>((a, h) => a + (h ?? 0), 0), 72);
});

test("the leading-blank header still parses as it always did", () => {
  // The December fixture DOES carry the empty cell, so nothing may shift.
  const { cards, errors } = parseScores(read("december_demo.tsv"));
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.equal(cards.length, 8);
  assert.ok(cards.every((c) => c.holesPlayed === 18 && c.mode === "gross"));
});

test("a header that is not one column out is left alone", () => {
  // Two extra data columns is not the Golf Genius shape; rather than shuffle on
  // a guess, the hole totals are left to catch it.
  const odd = "\t1\t2\tTotal\tNet\nSomebody (10)\t4\t4\t8\t7\tx\ty";
  const { cards } = parseScores(odd);
  assert.ok(cards.length === 0 || cards[0].mode === "unknown");
});

/* ---- the name rules ---- */

test("“Last, First” is turned back around", () => {
  assert.equal(unreverseName("Ridgeway, Ken"), "Ken Ridgeway");
  assert.equal(unreverseName("Van Dyke, Sal"), "Sal Van Dyke", "a two-word surname survives");
  assert.equal(unreverseName("Ken Ridgeway"), null, "no comma, nothing to undo");
});

test("a name reduces to first name plus last initial", () => {
  assert.equal(initialKey("Ken Ridgeway"), "ken r");
  assert.equal(initialKey("Ken R."), "ken r");
  assert.equal(initialKey("KEN   r"), "ken r");
  assert.equal(initialKey("Ken"), null, "a single word has no initial");
});

test("the three matching rules, in order", () => {
  const roster = ["Ken Ridgeway", "Sal M.", "Otto Kessler"];
  // 1 · exact
  assert.deepEqual(matchName("Ken Ridgeway", roster), { index: 0, how: "exact" });
  // 2 · reversed
  assert.deepEqual(matchName("Kessler, Otto", roster), { index: 2, how: "reversed" });
  // 3 · first name + last initial, through the reversal
  assert.deepEqual(matchName("Merrick, Sal", roster), { index: 1, how: "initial" });
});

test("the real paste's names find a roster written as First L.", () => {
  const roster = ["Ken R.", "Sal M.", "Mitch K.", "Mike D."];
  const { cards } = parseScores(PASTE);
  const got = cards.map((c) => matchName(c.name, roster));

  assert.deepEqual(got[0], { index: 0, how: "initial" }, "Ridgeway, Ken → Ken R.");
  assert.deepEqual(got[1], { index: 1, how: "initial" }, "Merrick, Sal → Sal M.");
  assert.deepEqual(got[3], { index: 3, how: "initial" }, "Danforth, Mike → Mike D.");
  // "Mitchell" is not "Mitch": no rule covers a shortened first name, so this
  // one comes back unmatched for the organiser to assign rather than guessed.
  assert.equal(got[2].index, -1, "Kingsley, Mitchell does not match Mitch K.");
  assert.equal(got[2].how, null);
});

test("a shared initial is reported ambiguous, never guessed", () => {
  // Both roster names reduce to "ken r", and so does the pasted one — there is
  // no way to tell which man played the round, so it is handed back unresolved.
  const roster = ["Ken Ridgeway", "Ken Rutherford"];
  assert.deepEqual(matchName("Rankin, Ken", roster), { index: -1, how: "ambiguous" });
});

test("an unknown name matches nobody", () => {
  assert.deepEqual(matchName("Nobody, At All", ["Ken R.", "Sal M."]), { index: -1, how: null });
});

test("matching against an empty roster is not a match", () => {
  assert.deepEqual(matchName("Ridgeway, Ken", []), { index: -1, how: null });
});
