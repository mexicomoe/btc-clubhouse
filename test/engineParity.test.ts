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

/**
 * The seed round's finals, ON THE ZERO BASE — strokes under and over par, not
 * net scores in the sixties and seventies. This is the board the app opens on,
 * so it is also what an organiser sees before he has entered anything of his
 * own, and it should look like a real Saturday.
 *
 * RE-CUT WITH THE GAME. Four contests instead of eight, and nine picks instead
 * of six. The spread narrowed from 10.0 strokes to 6.3, which is the cut doing
 * exactly what it was for: four of the eight were mostly repeating the net
 * score, so taking them out takes the pile-on with them.
 */
const EXPECTED: Record<string, string> = {
  Alex: "-5.20", Finn: "-5.00", Dex: "-4.30", Boyd: "-3.20",
  Hoyt: "-0.40", Chip: "-0.20", Grady: "0.00", Emmet: "1.10",
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
  // Stamped with the build id — see stamping.test.ts for why — so the match
  // allows the query without requiring this test to know the hash.
  assert.match(html, /<script\s+src="engine\.js(\?v=[0-9a-f]+)?"><\/script>/, "loads engine.js");
  assert.match(html, /window\.ClubhouseEngine/, "uses the engine's global");
  // ROUTED THROUGH THE ENGINE, with the round's own rules. It used to be the
  // bare no-argument call — which was the demo round being scored on the
  // DEFAULTS while the Skins section beside it read the event's rules.
  assert.match(html, /E\.computeLeaderboard\(boardCards, undefined, contestConfig\(\)\)/,
    "renders the engine's leaderboard under this round's rules");
  assert.equal(/E\.computeLeaderboard\(\)/.test(html), false,
    "and never scores anything on the defaults behind the round's back");
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
