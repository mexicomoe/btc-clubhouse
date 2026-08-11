/**
 * One engine, no drift.
 *
 * The leaderboard HTML and the tests must never disagree, because they run the
 * same file: engine.js. This suite pins engine.js's section-11 output to the
 * brief, and then proves the HTML carries no scoring of its own — so the only
 * numbers it can show are the ones tested here. Re-inline an engine or hardcode
 * a final into the page and this fails.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import "../engine.js";
import { computeLeaderboard } from "../src/scoring.ts";

const E = (globalThis as { ClubhouseEngine: any }).ClubhouseEngine;
const html = readFileSync(new URL("../leaderboard.html", import.meta.url), "utf8");

// The section-11 finals, with Watch the Birdie in place of Call Your Number.
const EXPECTED: Record<string, string> = {
  Dex: "64.00", Finn: "68.10", Alex: "68.20", Boyd: "71.70",
  Emmet: "77.30", Chip: "78.30", Grady: "79.00", Hoyt: "80.30",
};

test("engine.js reproduces the section 11 leaderboard", () => {
  const board = E.computeLeaderboard(); // defaults to the section 11 seed round
  const got = Object.fromEntries(board.map((r: any) => [r.name, r.final.toFixed(2)]));
  assert.deepEqual(got, EXPECTED);
  // Ranks are 1..8 in finishing order, lowest final first.
  assert.deepEqual(board.map((r: any) => r.rank), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("the TypeScript view returns exactly what engine.js does", () => {
  const viaView = computeLeaderboard().map((r) => [r.name, r.final]);
  const viaEngine = E.computeLeaderboard().map((r: any) => [r.name, r.final]);
  assert.deepEqual(viaView, viaEngine);
});

test("the HTML loads the shared engine and routes scoring through it", () => {
  assert.match(html, /<script\s+src="engine\.js"><\/script>/, "loads engine.js");
  assert.match(html, /window\.ClubhouseEngine/, "uses the engine's global");
  assert.match(html, /E\.computeLeaderboard\(\)/, "renders the engine's leaderboard");
});

test("the HTML carries no scoring engine of its own", () => {
  // None of the engine's internals may reappear inside the page.
  for (const marker of [
    /function\s+scorePlayer/,
    /gradeAtMost|gradeAtLeast/,
    /strokesOnHole|netOnHole/,
    /maxContestStrokes\s*:/, // a threshold-config literal → would be a second copy
  ]) {
    assert.doesNotMatch(html, marker, `HTML must not redefine engine internals: ${marker}`);
  }
});

test("the HTML hardcodes none of the section 11 finals", () => {
  // If the page ever prints a baked-in number instead of computing it, catch it.
  for (const [name, final] of Object.entries(EXPECTED)) {
    assert.ok(!html.includes(final), `HTML must not hardcode ${name}'s final (${final})`);
  }
});
