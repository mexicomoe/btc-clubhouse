/**
 * Tees and stroke index — the setup screen's inputs (build brief sections 2 and 4).
 *
 * Aberdeen is one course played from nine tees by two fields. Par is 72 from
 * every tee, but rating and slope change with tee AND gender, and the women play
 * a different stroke index. That last part matters more than it looks: the
 * stroke index decides WHICH holes receive strokes, so it moves every contest,
 * not just the net total.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ABERDEEN_TEE_IV, ABERDEEN_TEES, TEE_IDS, DEFAULT_CONTESTS, courseForTee,
} from "../src/courseConfig.ts";
import {
  courseHandicap, scorePlayer, computeLeaderboard, grossFromNet, cappedNetByHole,
  birdiePickHoles, type PlayerCard,
} from "../src/scoring.ts";

// Golf Genius's allocation — the one that actually computes the posted net.
const MENS_SI = [9, 5, 17, 1, 3, 7, 13, 15, 11, 6, 10, 8, 16, 14, 4, 12, 18, 2];
const WOMENS_SI = [9, 11, 17, 1, 3, 7, 5, 15, 13, 4, 12, 16, 18, 8, 6, 10, 14, 2];

test("nine tees, each rated for both fields", () => {
  assert.deepEqual(TEE_IDS, ["I", "I/II", "II", "II/III", "III", "III/IV", "IV", "IV/V", "V"]);
  for (const id of TEE_IDS) {
    for (const g of ["M", "F"] as const) {
      const t = ABERDEEN_TEES[id][g];
      assert.ok(t.courseRating > 55 && t.courseRating < 85, `${id} ${g} rating`);
      assert.ok(t.slope >= 55 && t.slope <= 155, `${id} ${g} slope`);
    }
    // The women's tees are rated harder than the men's from the same markers.
    assert.ok(ABERDEEN_TEES[id].F.courseRating > ABERDEEN_TEES[id].M.courseRating, `${id} rating order`);
    assert.ok(ABERDEEN_TEES[id].F.slope > ABERDEEN_TEES[id].M.slope, `${id} slope order`);
  }
});

test("par is 72 from every tee, and the holes don't move", () => {
  for (const id of TEE_IDS) {
    for (const g of ["M", "F"] as const) {
      const c = courseForTee(id, g);
      assert.equal(c.par.reduce((a, b) => a + b, 0), 72, `${id} ${g} par total`);
      assert.deepEqual(c.par, ABERDEEN_TEE_IV.par, `${id} ${g} par by hole`);
      assert.deepEqual(c.agonyHoles, [4, 5, 6]);
    }
  }
});

test("the two stroke indexes are the ones the club uses", () => {
  assert.deepEqual(courseForTee("IV", "M").strokeIndex, MENS_SI);
  assert.deepEqual(courseForTee("IV", "F").strokeIndex, WOMENS_SI);
  // Both are a real allocation: 1..18 once each, odds out, evens home.
  for (const si of [MENS_SI, WOMENS_SI]) {
    assert.deepEqual([...si].sort((a, b) => a - b), Array.from({ length: 18 }, (_, i) => i + 1));
    assert.ok(si.slice(0, 9).every((n) => n % 2 === 1), "front nine takes the odd indexes");
    assert.ok(si.slice(9).every((n) => n % 2 === 0), "back nine takes the even indexes");
  }
  // Gender defaults to the men's card when unspecified.
  assert.deepEqual(courseForTee("IV").strokeIndex, MENS_SI);
});

test("the sections 9 and 11 reference course is still men's Tee IV", () => {
  const built = courseForTee("IV", "M");
  assert.equal(ABERDEEN_TEE_IV.courseRating, 65.3);
  assert.equal(ABERDEEN_TEE_IV.slope, 117);
  assert.deepEqual(ABERDEEN_TEE_IV.strokeIndex, built.strokeIndex);
  assert.equal(ABERDEEN_TEE_IV.name, "Aberdeen Golf & Country Club, Tee IV");
});

test("course handicap moves with the tee and with the field", () => {
  // ROUND(index x slope / 113 + (rating - par))
  assert.equal(courseHandicap(10, courseForTee("I", "M")), 12);
  assert.equal(courseHandicap(10, courseForTee("V", "M")), 1);
  assert.equal(courseHandicap(10, courseForTee("I", "F")), 20);
  // The same index off the same markers, men and women.
  assert.equal(courseHandicap(20, courseForTee("IV", "M")), 14);
  assert.equal(courseHandicap(20, courseForTee("IV", "F")), 21);
});

test("the birdie picks are the same par 4s whichever tee is played", () => {
  for (const id of TEE_IDS) {
    assert.deepEqual(birdiePickHoles(courseForTee(id, "F")), { front: [1, 2, 5, 6, 9], back: [10, 11, 12, 14, 15] });
  }
});

// A card that names its own tee is scored against that tee, with no course passed.
const LEVEL: (number | null)[] = ABERDEEN_TEE_IV.par.map((p) => p);

test("a card carries its own tee and gender", () => {
  const men: PlayerCard = { name: "Men's IV", handicapIndex: 20, tee: "IV", gender: "M", gross: LEVEL };
  const women: PlayerCard = { name: "Women's IV", handicapIndex: 20, tee: "IV", gender: "F", gross: LEVEL };

  assert.equal(scorePlayer(men).courseHandicap, 14);
  assert.equal(scorePlayer(women).courseHandicap, 21);
  // Same gross round, different strokes received, so a different net.
  assert.equal(scorePlayer(men).net, 72 - 14);
  assert.equal(scorePlayer(women).net, 72 - 21);
});

test("the women's stroke index changes which holes get the strokes", () => {
  // Hole 12 is stroke index 8 for the men and 16 for the women, so off a course
  // handicap of 12 the men take a shot there and the women take none.
  assert.equal(MENS_SI[11], 8);
  assert.equal(WOMENS_SI[11], 16);
  const card: PlayerCard = { name: "x", courseHandicap: 12, gross: LEVEL, tee: "IV" };
  const asMen = cappedNetByHole({ ...card, gender: "M" }, undefined as never);
  const asWomen = cappedNetByHole({ ...card, gender: "F" }, undefined as never);
  assert.equal(asMen[11], 4 - 1, "men: a shot on hole 12");
  assert.equal(asWomen[11], 4, "women: none");
});

test("a mixed field is scored tee by tee in one leaderboard", () => {
  const field: PlayerCard[] = [
    { name: "Back tee", handicapIndex: 12, tee: "I", gender: "M", gross: LEVEL },
    { name: "Forward tee", handicapIndex: 12, tee: "V", gender: "M", gross: LEVEL },
    { name: "Women's tee", handicapIndex: 12, tee: "IV", gender: "F", gross: LEVEL },
  ];
  const board = computeLeaderboard(field, undefined, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));
  assert.equal(by["Back tee"].courseHandicap, courseHandicap(12, courseForTee("I", "M")));
  assert.equal(by["Forward tee"].courseHandicap, courseHandicap(12, courseForTee("V", "M")));
  assert.equal(by["Women's tee"].courseHandicap, courseHandicap(12, courseForTee("IV", "F")));
  // Everyone shot the same gross round, so the biggest course handicap takes the
  // most strokes off and wins: the back tee (15) ahead of the women's IV (12)
  // ahead of the forward tee (3).
  assert.equal(by["Back tee"].courseHandicap, 15);
  assert.equal(by["Women's tee"].courseHandicap, 12);
  assert.equal(by["Forward tee"].courseHandicap, 3);
  assert.deepEqual(board.map((r) => r.net), [72 - 15, 72 - 12, 72 - 3]);
  assert.equal(board[0].name, "Back tee");
});

test("an unknown tee is refused rather than guessed", () => {
  assert.throws(() => courseForTee("VI", "M"), /Unknown tee: VI/);
});

// Golf Genius posts NET holes. Putting the strokes back must be exactly undone
// when the engine takes them off again — otherwise the round would be scored twice.
test("net holes rebuilt as gross come back to the same net", () => {
  const course = courseForTee("IV", "M");
  const ch = 18;
  const netHoles: (number | null)[] = [4,4,3,5,4,4,5,3,4,4,4,4,3,4,4,5,3,5];
  const gross = grossFromNet(netHoles, course, ch);

  const card: PlayerCard = { name: "Round trip", courseHandicap: ch, tee: "IV", gender: "M", gross };
  const back = cappedNetByHole(card, undefined as never);
  assert.deepEqual(back, netHoles, "the strokes are put back and taken off again");
  assert.equal(scorePlayer(card).net, netHoles.reduce<number>((a, n) => a + (n ?? 0), 0));
});

test("an unplayed hole stays unplayed through the net-to-gross rebuild", () => {
  const course = courseForTee("IV", "F");
  const netHoles: (number | null)[] = ABERDEEN_TEE_IV.par.map((p, i) => (i === 3 ? null : p));
  const gross = grossFromNet(netHoles, course, 24);
  assert.equal(gross[3], null, "blank stays blank, never zero");
  assert.equal(gross.filter((g) => g != null).length, 17);
});
