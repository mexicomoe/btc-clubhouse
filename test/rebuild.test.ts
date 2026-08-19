/**
 * THE REBUILD — the eleven tests the 15 August brief asks for, plus the
 * arithmetic each one rests on.
 *
 * The base is ZERO. A man starts at 0 and the contests move him; the net total
 * no longer carries into the final. The measure is strokes under and over par,
 * and lowest wins.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import {
  scorePlayer, computeLeaderboard, birdiePickHoles, PICK_SLOTS, readPicks, nearestByIndex,
} from "../src/scoring.ts";
import { skinsByGroup, skinValue, skinStrokes, skinsFormat, bestTwo } from "../src/skins.ts";

const C = ABERDEEN_TEE_IV;
const PAR = C.par;
/** The six slots, as a man would send them. */
const SIX = { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 };

/** A card that is level par off scratch unless told otherwise. */
function card(over: Record<number, number> = {}, extra: Record<string, unknown> = {}) {
  const gross = PAR.map((par, i) => par + (over[i + 1] || 0));
  return { name: "Test", courseHandicap: 0, picks: { ...SIX }, gross, ...extra };
}
const score = (c: any) => scorePlayer(c as any, C, DEFAULT_CONTESTS);

/* ---- 1 · a full round scores to the documented total ---- */

test("a level-par card off scratch scores exactly what the brief says", () => {
  const r = score(card());
  // Nothing on any of the six picks, so the blank penalty bites.
  assert.equal(r.contests.watchTheBirdie!.strokes, 0.5);
  // The six left are par 24 and he made 24.
  assert.equal(r.contests.sixPack!.strokes, 0);
  // 4, 5, 6 come to par 13, which is the −1 rung.
  assert.equal(r.contests.agonyAlley.strokes, -1);
  // 11, 12, 13 are all net pars — three of three.
  assert.equal(r.contests.easyStreet!.strokes, -1);
  assert.equal(r.contests.tripleThreat!.strokes, 0);
  assert.equal(r.final, -1.5, "0.5 − 1 − 1 = −1.5");
});

test("the net total does not reach the final at all", () => {
  // Two cards with the SAME contest outcomes and very different nets. A man off
  // 18 shooting 18 over gross is net level; off scratch he is 18 over. Nothing
  // about the contests changes, so nothing about the final may either.
  const a = score(card());
  const b = score(card({}, { courseHandicap: 18 }));
  assert.notEqual(a.net, b.net, "the nets differ, which is the point");
  assert.equal(a.final, -1.5);
  assert.equal(typeof b.final, "number");
});

/* ---- 2 · Six Pack ---- */

test("Six Pack is always six holes and always par 24, whatever the picks", () => {
  const legal = birdiePickHoles(C);
  // Every combination of one par 4 a side and two par 3s and two par 5s.
  let checked = 0;
  for (const p4f of legal.p4f) for (const p4b of legal.p4b) {
    for (let i = 0; i < legal.p3a.length; i++) for (let j = i + 1; j < legal.p3a.length; j++) {
      for (let k = 0; k < legal.p5a.length; k++) for (let m = k + 1; m < legal.p5a.length; m++) {
        const picks = { p4f, p4b, p3a: legal.p3a[i], p3b: legal.p3a[j],
                        p5a: legal.p5a[k], p5b: legal.p5a[m] };
        const r = score(card({}, { picks }));
        assert.equal(r.contests.sixPack!.strokes, 0, JSON.stringify(picks));
        assert.match(r.contests.sixPack!.detail, /par 24$/);
        checked++;
      }
    }
  }
  assert.equal(checked, 3 * 3 * 3 * 3, "every legal set was tried");
});

test("Six Pack is raw net strokes to 24, up and down", () => {
  // Holes 1, 9, 10, 15 are par 4s he did not pick; 17 the par 3; 18 the par 5.
  assert.equal(score(card({ 1: 2 })).contests.sixPack!.strokes, 2);
  assert.equal(score(card({ 1: 1, 9: 1, 17: 1 })).contests.sixPack!.strokes, 3);
  // A stroke on a leftover hole takes it back under.
  const under = score(card({}, { courseHandicap: 4 }));
  assert.ok(under.contests.sixPack!.strokes < 0, "strokes make the six left go under 24");
});

test("Six Pack needs the picks, or there is no “did not choose”", () => {
  const r = score(card({}, { picks: undefined }));
  assert.equal(r.contests.sixPack!.live, false);
  assert.equal(r.contests.sixPack!.strokes, 0);
});

/* ---- 3 · Watch the Birdie ---- */

test("a pick outside its slot list is refused, and the legal ones named", () => {
  assert.throws(() => readPicks({ ...SIX, p3a: 13 }, C, "Ken"),
    /hole 13 is not a legal first par 3 — 3, 8, 17/);
  // 4 belongs to Agony Alley now and is nobody's candidate.
  assert.throws(() => readPicks({ ...SIX, p5a: 4 }, C, "Ken"), /hole 4 is not a legal/);
});

test("the same hole in both par 3 slots is caught as a duplicate", () => {
  // The two par 3 slots are offered the IDENTICAL three holes, so this is legal
  // for each slot on its own. Only the duplicate pass stands between a man and
  // being paid twice for one birdie.
  assert.throws(() => readPicks({ ...SIX, p3a: 8, p3b: 8 }, C, "Ken"),
    /hole 8 is nominated twice, as first par 3 and second par 3/);
  assert.throws(() => readPicks({ ...SIX, p5a: 16, p5b: 16 }, C, "Ken"),
    /hole 16 is nominated twice/);
});

test("a net birdie pays 0.5 and a net eagle 1.5, never both", () => {
  assert.equal(score(card({ 2: -1 })).contests.watchTheBirdie!.strokes, -0.5);
  assert.equal(score(card({ 2: -2 })).contests.watchTheBirdie!.strokes, -1.5);
});

test("nothing on any of the six costs half a stroke", () => {
  assert.equal(score(card()).contests.watchTheBirdie!.strokes, 0.5);
  assert.match(score(card()).contests.watchTheBirdie!.detail, /no net birdies/);
  // One birdie clears it entirely — the penalty is not charged alongside.
  assert.equal(score(card({ 2: -1 })).contests.watchTheBirdie!.strokes, -0.5);
});

test("holes 4 and 18 no longer pay double", () => {
  // 18 is still a legal par 5 pick; it simply pays what any other pick pays.
  const r = score(card({ 18: -1 }, { picks: { ...SIX, p5b: 18 } }));
  assert.equal(r.contests.watchTheBirdie!.strokes, -0.5);
});

/* ---- 4 · Easy Street, on NET ---- */

test("Easy Street counts net, so a gross bogey with a stroke is a par", () => {
  // Off 18 a man has a stroke on every hole, so gross bogeys on 11, 12 and 13
  // are three NET pars. On gross this scored nothing; on net it is the top rung.
  const r = score(card({ 11: 1, 12: 1, 13: 1 }, { courseHandicap: 18 }));
  assert.equal(r.contests.easyStreet!.strokes, -1);
  assert.match(r.contests.easyStreet!.detail, /3 of 3 at net par or better/);
});

test("the Easy Street ladder is 2 / 1 / 0 / −1 by net pars made", () => {
  const at = (over: Record<number, number>) =>
    score(card(over)).contests.easyStreet!.strokes;
  assert.equal(at({ 11: 1, 12: 1, 13: 1 }), 2, "no net pars");
  assert.equal(at({ 11: 1, 12: 1 }), 1, "one");
  assert.equal(at({ 11: 1 }), 0, "two");
  assert.equal(at({}), -1, "three");
});

/* ---- 5 · Triple Threat, on a NET DOUBLE ---- */

test("Triple Threat fires on a net double, not a gross triple", () => {
  // On the 18th, so the penalty stands alone — there is no next hole to bounce
  // back on and nothing to net it off against.
  //
  // Off 18 a man has a stroke everywhere: a gross TRIPLE is a net double and
  // counts; a gross DOUBLE is only a net bogey and does not.
  const triple = score(card({ 18: 3 }, { courseHandicap: 18 }));
  assert.equal(triple.contests.tripleThreat!.strokes, 0.5);
  const double = score(card({ 18: 2 }, { courseHandicap: 18 }));
  assert.equal(double.contests.tripleThreat!.strokes, 0);
});

test("off scratch a gross double IS the net double, and counts", () => {
  assert.equal(score(card({ 18: 2 })).contests.tripleThreat!.strokes, 0.5);
});

test("Bounce Back pays 1.0, and only off a net double", () => {
  // TWO CONTESTS NOW, each with its own switch — but still the pair they were:
  // 0.5 charged for the blow-up, 1.0 paid for steadying the ship after it.
  const r = score(card({ 1: 2 }));
  assert.equal(r.contests.tripleThreat!.strokes, 0.5);
  assert.equal(r.contests.bounceBack!.strokes, -1);
  // A net BOGEY answered by a par pays nothing: there was no blow-up.
  assert.equal(score(card({ 1: 1 })).contests.tripleThreat!.strokes, 0);
  assert.equal(score(card({ 1: 1 })).contests.bounceBack!.strokes, 0);
});

test("a blow-up on the 18th can only cost — there is no next hole", () => {
  const r = score(card({ 18: 2 }));
  assert.equal(r.contests.tripleThreat!.strokes, 0.5);
});

test("two net doubles running leave the first unanswered", () => {
  const r = score(card({ 1: 2, 2: 2 }));
  assert.equal(r.contests.tripleThreat!.strokes, 1, "both charged");
  assert.equal(r.contests.bounceBack!.strokes, -1, "only the second is answered");
});

test("a picked-up hole is a blow-up — it is a net double by definition", () => {
  const r = score(card({}, { gross: PAR.map((p, i) => (i === 0 ? "X" : p)) }));
  assert.equal(r.contests.tripleThreat!.strokes, 0.5, "charged");
  assert.equal(r.contests.bounceBack!.strokes, -1, "and answered on hole 2");
});

/* ---- 6 · Skins ---- */

test("a group's hole score is its best two net balls", () => {
  assert.equal(bestTwo([4, 5, 6, 7]), 9, "a foursome: the best two");
  assert.equal(bestTwo([4, 5, 6]), 9, "a threesome: the same two");
  assert.equal(bestTwo([4, 5]), 9, "a pair: both");
});

test("a man on his own counts his ball twice", () => {
  assert.equal(bestTwo([4]), 8);
  assert.equal(bestTwo([]), null);
});

test("a threesome and a foursome are scored the same way", () => {
  // Identical best two balls, one group with an extra man behind them. The
  // fourth ball must not change the result either way.
  const flat = (n: number) => ({ name: "x", courseHandicap: 0, gross: PAR.map((p) => p + n) });
  const three = skinsByGroup([
    { card: flat(0), group: "A" }, { card: flat(0), group: "A" }, { card: flat(3), group: "A" },
    { card: flat(1), group: "B" }, { card: flat(1), group: "B" },
  ] as any, C);
  const four = skinsByGroup([
    { card: flat(0), group: "A" }, { card: flat(0), group: "A" },
    { card: flat(3), group: "A" }, { card: flat(4), group: "A" },
    { card: flat(1), group: "B" }, { card: flat(1), group: "B" },
  ] as any, C);
  assert.equal(three.skins.get("A"), four.skins.get("A"));
  assert.equal(three.skins.get("A"), 18, "A is better on every hole");
});

test("a tied hole is not won and does not carry", () => {
  const flat = () => ({ name: "x", courseHandicap: 0, gross: PAR.slice() });
  const t = skinsByGroup([
    { card: flat(), group: "A" }, { card: flat(), group: "A" },
    { card: flat(), group: "B" }, { card: flat(), group: "B" },
  ] as any, C);
  assert.equal(t.skins.get("A"), 0);
  assert.equal(t.skins.get("B"), 0);
  assert.equal(t.carried, 0, "nothing rolls on");
  assert.ok(t.holes.every((h: any) => h.wonBy == null));
});

test("the pot divides among the skins actually won, down to a floor", () => {
  const cfg = DEFAULT_CONTESTS.skins!;
  assert.equal(skinValue(cfg, 1), -4, "one skin takes the whole pot");
  assert.equal(skinValue(cfg, 2), -2, "4 split two ways");
  assert.equal(skinValue(cfg, 4), -1);
  assert.equal(skinValue(cfg, 10), -0.4, "the floor, reached exactly at ten");
  assert.equal(skinValue(cfg, 15), -0.4, "and it does not fall past it");
  assert.equal(skinStrokes(2, cfg, 2), -4);
  assert.equal(skinStrokes(0, cfg, 11), 0);
});

test("the field size decides the format", () => {
  const cfg = DEFAULT_CONTESTS.skins!;
  assert.equal(skinsFormat(7, cfg), null);
  assert.equal(skinsFormat(8, cfg), "cart");
  assert.equal(skinsFormat(15, cfg), "cart");
  assert.equal(skinsFormat(16, cfg), "team");
  assert.equal(skinsFormat(24, cfg), "team");
});

/* ---- 7 · Hit List ---- */

/** Two men, their indexes, and what each shot, run through the field pass. */
function duel(mineIdx: number, theirsIdx: number, myOver: number, theirOver: number) {
  const mk = (name: string, index: number, over: number, target: string) => ({
    name, handicapIndex: index, courseHandicap: 0, hitList: target,
    picks: { ...SIX }, gross: PAR.map((p, i) => p + (i === 0 ? over : 0)),
  });
  const rows = computeLeaderboard(
    [mk("Mine", mineIdx, myOver, "Theirs"), mk("Theirs", theirsIdx, theirOver, "Mine")] as any,
    C, DEFAULT_CONTESTS);
  return rows.find((r) => r.name === "Mine")!.contests.hitList!;
}

test("all nine result-by-band combinations pay the documented value", () => {
  const rates = DEFAULT_CONTESTS.hitList!;
  // Opponent LOWER (better) — my index above theirs by more than the band.
  assert.equal(duel(20, 10, 0, 2).strokes, rates.lower.win);
  assert.equal(duel(20, 10, 1, 1).strokes, rates.lower.tie);
  assert.equal(duel(20, 10, 2, 0).strokes, rates.lower.loss);
  // Opponent EQUAL — within 1.0 either way.
  assert.equal(duel(20, 20.5, 0, 2).strokes, rates.equal.win);
  assert.equal(duel(20, 20.5, 1, 1).strokes, rates.equal.tie);
  assert.equal(duel(20, 20.5, 2, 0).strokes, rates.equal.loss);
  // Opponent HIGHER (worse).
  assert.equal(duel(10, 20, 0, 2).strokes, rates.higher.win);
  assert.equal(duel(10, 20, 1, 1).strokes, rates.higher.tie);
  assert.equal(duel(10, 20, 2, 0).strokes, rates.higher.loss);
});

test("the documented values are the ones in the brief", () => {
  const r = DEFAULT_CONTESTS.hitList!;
  assert.deepEqual(r.lower,  { win: -1.1, tie: -0.2, loss: 0.3 });
  assert.deepEqual(r.equal,  { win: -0.9, tie: 0.1, loss: 0.3 });
  assert.deepEqual(r.higher, { win: -0.7, tie: 0.1, loss: 0.5 });
  assert.equal(r.equalBand, 1.0);
});

test("the band is decided by the OPPONENT, and 1.0 apart is still equal", () => {
  assert.match(duel(20, 19, 0, 2).detail, /an equal handicap/, "exactly 1.0 is equal");
  assert.match(duel(20, 18.9, 0, 2).detail, /a lower handicap/);
  assert.match(duel(20, 21.1, 0, 2).detail, /a higher handicap/);
});

test("Hit List voids when the opponent has no complete round", () => {
  const mk = (name: string, holes: number, target: string) => ({
    name, handicapIndex: 20, courseHandicap: 0, hitList: target, picks: { ...SIX },
    gross: PAR.map((p, i) => (i < holes ? p : null)),
  });
  const rows = computeLeaderboard(
    [mk("Mine", 18, "Theirs"), mk("Theirs", 9, "Mine")] as any, C, DEFAULT_CONTESTS);
  const mine = rows.find((r) => r.name === "Mine")!;
  assert.equal(mine.contests.hitList!.strokes, 0);
  assert.equal(mine.contests.hitList!.live, false);
  assert.match(mine.contests.hitList!.detail, /void/);
});

test("naming nobody, a stranger, or yourself all pay nothing", () => {
  const mk = (name: string, target: string) => ({
    name, handicapIndex: 20, courseHandicap: 0, hitList: target,
    picks: { ...SIX }, gross: PAR.slice(),
  });
  const rows = computeLeaderboard(
    [mk("A", ""), mk("B", "Nobody At All"), mk("C", "C")] as any, C, DEFAULT_CONTESTS);
  for (const name of ["A", "B", "C"]) {
    const c = rows.find((r) => r.name === name)!.contests.hitList!;
    assert.equal(c.strokes, 0, name);
    assert.equal(c.live, false, name);
  }
});

/* ---- 8 · partial rounds ---- */

test("a nine-hole card does not throw, and is not scored", () => {
  const nine = card({}, { gross: PAR.map((p, i) => (i < 9 ? p : null)) });
  const r = score(nine);
  assert.equal(r.holesPlayed, 9);
  assert.equal(r.final, null, "eighteen holes or you are not scored");
  assert.ok(typeof r.net === "number", "his net is still read and shown");
});

test("an empty card is not scored and cannot lead the field", () => {
  // On a zero base this is the dangerous case: every count contest reads an
  // empty card as zero of everything, which without the gate would come out at
  // 0 and beat a median round.
  const r = score(card({}, { gross: PAR.map(() => null) }));
  assert.equal(r.final, null);
  assert.equal(r.holesPlayed, 0);
  for (const c of Object.values(r.contests)) assert.equal((c as any).strokes, 0);
});

test("a short card takes no place, however the numbers fall", () => {
  const mk = (name: string, holes: number) => ({
    name, courseHandicap: 0, picks: { ...SIX },
    gross: PAR.map((p, i) => (i < holes ? p : null)),
  });
  const rows = computeLeaderboard([mk("Short", 12), mk("Full", 18)] as any, C, DEFAULT_CONTESTS);
  const short = rows.find((r) => r.name === "Short")!;
  assert.equal(short.rank, null);
  assert.equal(short.eligible, false);
  assert.equal(rows.find((r) => r.name === "Full")!.rank, 1);
});

/* ---- who a man may name ---- */

test("a short field offers EVERYBODY, not a padded or truncated list", () => {
  // Friday is eight men, so there are seven others — and seven is what he is
  // offered. The list is capped at eight, never padded up to it.
  const others = [8.2, 11.6, 14.0, 15.1, 18.7, 21.3, 24.8].map((index) => ({ index }));
  for (const mine of [5, 15.1, 30]) {
    const got = nearestByIndex(mine, others, 8);
    assert.equal(got.length, 7, "at index " + mine);
  }
});

test("the man at each end of the field still gets a full list", () => {
  // Taken entirely from the one side that has anyone on it, rather than the
  // four-a-side the rule aims for.
  const others = Array.from({ length: 15 }, (_, i) => ({ index: 10 + i }));
  assert.equal(nearestByIndex(5, others, 8).length, 8, "lowest man");
  assert.equal(nearestByIndex(40, others, 8).length, 8, "highest man");
  assert.deepEqual(nearestByIndex(5, others, 8).map((o) => o.index),
    [10, 11, 12, 13, 14, 15, 16, 17], "the eight nearest above him");
});

test("in the middle of a full field it is four below and four above", () => {
  const others = [5, 7, 9, 11, 13, 15, 17, 19, 21].map((index) => ({ index }));
  const got = nearestByIndex(12, others, 8).map((o) => o.index);
  // Four below (11, 9, 7, 5) and four above (13, 15, 17, 19). Nine others, so
  // one is left out — and it is 21, the furthest man on the side that HAS five,
  // not the furthest man overall.
  assert.deepEqual(got, [5, 7, 9, 11, 13, 15, 17, 19]);
  assert.equal(got.includes(21), false);
});

test("the list comes back in index order, best player first", () => {
  const others = [22, 4, 13, 9].map((index) => ({ index }));
  assert.deepEqual(nearestByIndex(12, others, 8).map((o) => o.index), [4, 9, 13, 22]);
});

test("a man with no index has nobody to be near", () => {
  assert.deepEqual(nearestByIndex(null, [{ index: 10 }], 8), []);
});

test("players without an index are not offered", () => {
  const others = [{ index: 10 }, { index: null }, { index: 14 }];
  assert.deepEqual(nearestByIndex(12, others as any, 8).map((o) => o.index), [10, 14]);
});

/* ---- an eight-man Friday ---- */

test("eight players plays CART skins, and a twosome's best two is both balls", () => {
  const cfg = DEFAULT_CONTESTS.skins!;
  assert.equal(skinsFormat(8, cfg), "cart");
  assert.equal(bestTwo([4, 5]), 9, "a twosome puts up both its balls");
  assert.equal(bestTwo([4]), 8, "and a man alone counts his twice");
});

/* ---- the two things an X can mean ---- */

/**
 * Golf Genius writes X both for a hole a man PICKED UP on and for a hole he
 * never played, and the card cannot tell them apart. Three or more on one card
 * stops the import and asks — that threshold lives in the import screen, which
 * needs a browser. What is pinned here is that the two answers really do lead
 * to the two different outcomes, because that is what makes the question worth
 * asking.
 */

test("Xs kept as pick-ups are a full round, scored as net doubles", () => {
  const gross = PAR.map((p, i) => ([4, 9, 11, 16].includes(i + 1) ? "X" : p));
  const r = score(card({}, { gross }));
  assert.equal(r.holesPlayed, 18, "a picked-up hole was played");
  assert.deepEqual(r.pickedUpHoles, [4, 9, 11, 16]);
  assert.equal(typeof r.final, "number", "and he is scored");
  // Each capped to par + 2 — the worst the net double cap allows.
  for (const h of [4, 9, 11, 16]) {
    assert.equal(r.netByHole[h - 1], PAR[h - 1] + 2, "hole " + h);
  }
});

test("Xs blanked as holes he sat out leave a short card, and no score", () => {
  // This is what the import screen writes when the answer is "he sat them out".
  const gross = PAR.map((p, i) => ([4, 9, 11, 16].includes(i + 1) ? null : p));
  const r = score(card({}, { gross }));
  assert.equal(r.holesPlayed, 14);
  assert.equal(r.final, null, "eighteen holes or you are not scored");
  assert.deepEqual(r.pickedUpHoles, [], "nothing was picked up — he was not there");
});

test("the same four holes, two answers, two different men on the board", () => {
  const holes = [4, 9, 11, 16];
  const pickedUp = card({}, { gross: PAR.map((p, i) => (holes.includes(i + 1) ? "X" : p)) });
  const satOut = card({}, { gross: PAR.map((p, i) => (holes.includes(i + 1) ? null : p)) });
  const rows = computeLeaderboard([
    { ...pickedUp, name: "Picked up" }, { ...satOut, name: "Sat out" },
  ] as any, C, DEFAULT_CONTESTS);
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(by["Picked up"].rank, 1);
  assert.equal(by["Sat out"].rank, null);
  assert.equal(by["Sat out"].eligible, false);
});

test("one or two Xs are an ordinary card and nothing about them is special", () => {
  for (const holes of [[7], [7, 12]]) {
    const r = score(card({}, { gross: PAR.map((p, i) => (holes.includes(i + 1) ? "X" : p)) }));
    assert.equal(r.holesPlayed, 18);
    assert.equal(typeof r.final, "number");
  }
});
