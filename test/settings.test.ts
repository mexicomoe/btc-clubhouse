/**
 * THE ADMIN CONSOLE — an event carrying its own rules.
 *
 * The settings live in the EVENT, not in browser storage. That was the sticking
 * point: browser storage means the laptop and the phone disagree and there is
 * no server to reconcile them. In the event it is free — the event code already
 * carries a round between devices, so the rules go with it, and a round scored
 * in March still scores the same way in August because it carries the rules it
 * was played under.
 *
 * Stored as a DIFF, never a copy: a full config is 735 characters of JSON and
 * would cost 980 in an event code, against 72 for one changed contest. A round
 * on the defaults stores nothing at all, which is also what makes "was this on
 * the defaults?" a null check on every surface that has to mark it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, computeLeaderboard, birdiePickHoles, PICK_SLOTS } from "../src/scoring.ts";

const E = (globalThis as any).ClubhouseEngine;
const C = ABERDEEN_TEE_IV;
const PAR = C.par;
const SIX = { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 };

const merge = (diff: any) => E.mergeContests(DEFAULT_CONTESTS, diff);
const diff = (full: any) => E.diffContests(DEFAULT_CONTESTS, full);
const check = (full: any) => E.checkContests(full, C);

function card(over: Record<number, number> = {}) {
  return { name: "Ken", courseHandicap: 0, picks: { ...SIX },
           gross: PAR.map((p, i) => p + (over[i + 1] || 0)) } as any;
}

/* ---- change a value, and the board follows ---- */

test("changing a value rescores from the scores already stored", () => {
  // The same card, twice, with nothing re-entered — only the rules moved.
  const c = card({ 18: 2 });               // one blow-up, on the last hole
  const before = scorePlayer(c, C, DEFAULT_CONTESTS);
  const after = scorePlayer(c, C, merge({ tripleThreat: { perTriple: 2 } }));
  assert.equal(before.contests.tripleThreat!.strokes, 0.5);
  assert.equal(after.contests.tripleThreat!.strokes, 2);
  assert.equal(after.final! - before.final!, 1.5, "and the final moved with it");
});

test("switching a contest off takes it off the card entirely", () => {
  const r = scorePlayer(card(), C, merge({ easyStreet: null }));
  assert.equal(r.contests.easyStreet, undefined, "absent, not a zero");
});

test("a switch is independent of every other switch", () => {
  const r = scorePlayer(card({ 1: 2 }), C, merge({ tripleThreat: null }));
  assert.equal(r.contests.tripleThreat, undefined);
  assert.equal(r.contests.bounceBack!.strokes, -1, "the recovery still pays");
});

/* ---- reset ---- */

test("reset restores the default exactly", () => {
  const changed = merge({ agonyAlley: [{ threshold: 99, strokes: 5 }] });
  assert.notDeepEqual(changed.agonyAlley, DEFAULT_CONTESTS.agonyAlley);
  // Which is what the Reset button does: put the default back and re-diff.
  const reset = { ...changed, agonyAlley: DEFAULT_CONTESTS.agonyAlley };
  assert.deepEqual(diff(reset), null, "and the round is back on the defaults");
});

test("a round on the defaults carries nothing at all", () => {
  assert.equal(diff(merge(null)), null);
  assert.equal(diff(DEFAULT_CONTESTS), null);
});

test("a diff carries only what changed, not a copy of everything", () => {
  const d = diff(merge({ tripleThreat: { perTriple: 0.8 } }));
  assert.deepEqual(d, { tripleThreat: { perTriple: 0.8 } });
  assert.ok(JSON.stringify(d).length < 60, "72 characters in an event code, not 980");
  // The value it did NOT change is still there when it is merged back.
  assert.equal(merge(d).tripleThreat.perTriple, 0.8);
  assert.equal(merge(d).agonyAlley, DEFAULT_CONTESTS.agonyAlley);
});

/* ---- what is refused ---- */

test("a barred list that leaves one legal hole in a slot is refused", () => {
  // Bar both 8 and 17 and the par 3 slots have only hole 3 left, which is not a
  // choice — it is a formality.
  const problems = check(merge({ watchTheBirdie: { barred: [4, 5, 6, 8, 11, 12, 13, 17] } }));
  assert.ok(problems.length >= 1);
  assert.match(problems[0], /par 3 would have only hole 3 left/);
});

test("a barred list that leaves NO legal hole is refused too", () => {
  const problems = check(merge({ watchTheBirdie: { barred: [3, 4, 5, 6, 8, 11, 12, 13, 17] } }));
  assert.match(problems[0], /no holes/);
});

test("a hole outside 1 to 18 is refused", () => {
  assert.match(check(merge({ watchTheBirdie: { barred: [19] } }))[0], /not a hole/);
  assert.match(check(merge({ watchTheBirdie: { barred: [0] } }))[0], /not a hole/);
});

test("an out-of-order Agony Alley ladder is refused", () => {
  const problems = check(merge({ agonyAlley: [
    { threshold: 13, strokes: -2 }, { threshold: 12, strokes: -1 }, { threshold: 99, strokes: 2 },
  ] }));
  assert.match(problems[0], /out of order: 13 is followed by 12/);
});

test("a ladder is refused for Easy Street on the same rule", () => {
  const problems = check(merge({ easyStreet: [
    { threshold: 2, strokes: 0 }, { threshold: 1, strokes: 1 },
  ] }));
  assert.match(problems[0], /Easy Street runs out of order/);
});

test("a skin worth more than the whole pot is refused", () => {
  const problems = check(merge({ skins: { pot: -4, minSkin: -9, minPlayers: 8, teamFrom: 16 } }));
  assert.match(problems[0], /cannot be worth more on its own/);
});

test("team skins starting below cart skins is refused", () => {
  const problems = check(merge({ skins: { pot: -4, minSkin: -0.4, minPlayers: 16, teamFrom: 8 } }));
  assert.match(problems[0], /must start above/);
});

test("the defaults themselves pass", () => {
  assert.deepEqual(check(DEFAULT_CONTESTS), []);
});

/* ---- barring a hole men have already picked ---- */

test("A PICK ON A HOLE BARRED LATER IS DROPPED, NOT THROWN", () => {
  // This is the one change that could take the whole board down rather than
  // give a wrong number. A man picks 8, the organiser bars it that evening, and
  // his round must still open.
  const c = card();
  const barred = merge({ watchTheBirdie: { barred: [4, 5, 6, 8, 11, 12, 13] } });
  const r = scorePlayer(c, C, barred);
  assert.equal(r.contests.watchTheBirdie!.live, true);
  // Down to five, and the card SAYS five rather than claiming six.
  assert.match(r.contests.watchTheBirdie!.detail, /no net birdies/);
  // And Six Pack cannot be scored on five, so it says so rather than inventing
  // a seventh hole to make the numbers work.
  assert.equal(r.contests.sixPack!.live, false);
});

test("the barred list is a contest value, overriding the course's own", () => {
  assert.deepEqual(birdiePickHoles(C).p3a, [3, 8, 17], "the course's list");
  const legal = birdiePickHoles(C, merge({ watchTheBirdie: { barred: [4, 5, 6, 8, 11, 12, 13] } }));
  assert.deepEqual(legal.p3a, [3, 17], "the event's");
});

/* ---- a round keeps the rules it was played under ---- */

test("two events on different rules score the same card differently", () => {
  const c = card({ 18: 2 });
  const march = scorePlayer(c, C, merge({ tripleThreat: { perTriple: 0.5 } }));
  const august = scorePlayer(c, C, merge({ tripleThreat: { perTriple: 3 } }));
  assert.notEqual(march.final, august.final);
  // Neither is "the right answer" — each round carries its own, which is the
  // whole reason the rules live in the event.
  assert.equal(march.contests.tripleThreat!.strokes, 0.5);
  assert.equal(august.contests.tripleThreat!.strokes, 3);
});

test("a whole field rescores on a changed rule with no card re-entered", () => {
  const field = ["A", "B", "C"].map((n, i) => ({
    ...card({ 18: 2 }), name: n, cart: String(i + 1), handicapIndex: 10 + i,
  }));
  const before = computeLeaderboard(field as any, C, DEFAULT_CONTESTS);
  const after = computeLeaderboard(field as any, C, merge({ tripleThreat: { perTriple: 2 } }));
  assert.equal(before.length, after.length);
  for (let i = 0; i < before.length; i++) {
    assert.equal(after[i].final! - before[i].final!, 1.5, after[i].name);
  }
});

/* ---- what must NOT be adjustable ---- */

test("par, the stroke index and the tee table are not contest values", () => {
  // Changing one would silently rewrite every net score ever stored, so none of
  // them is reachable from the config the console edits.
  for (const key of ["par", "strokeIndex", "slope", "courseRating"]) {
    assert.equal((DEFAULT_CONTESTS as any)[key], undefined, key);
  }
  assert.ok(Array.isArray(C.par) && C.par.length === 18);
});

/* ---- the rules travel with the round ---- */

test("an event carrying changed values survives an event code", async () => {
  const { encodeEvent, decodeEvent } = await import("../src/exportScores.ts");
  const event = {
    name: "Friday", date: "2026-08-22", format: "Individual net",
    allowancePercent: 100, skinsOn: true,
    contests: { tripleThreat: { perTriple: 2 }, hitList: { equalBand: 2.5 } },
    players: [{ id: "p1", name: "Ken", ghin: "", index: 18, tee: "IV", gender: "M",
                cart: "1", team: "", flight: "", hitList: "",
                p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 }],
    scores: { p1: PAR.slice() }, handicaps: {},
  };
  const back = decodeEvent(encodeEvent(event as any));
  const ev: any = (back as any).event || back;
  assert.deepEqual(ev.contests, event.contests, "the rules arrived with the round");

  // And they are the rules it is then scored on.
  // Off scratch, so the gross double on the 18th IS the net double — with a
  // stroke on it, it would only be a net bogey and prove nothing.
  const scored = scorePlayer(
    { name: "Ken", courseHandicap: 0, tee: "IV", picks: { ...SIX },
      gross: PAR.map((p, i) => p + (i === 17 ? 2 : 0)) } as any,
    undefined, E.mergeContests(DEFAULT_CONTESTS, ev.contests));
  assert.equal(scored.contests.tripleThreat!.strokes, 2, "not the default 0.5");
});

test("a code from before the console still reads, and means the defaults", () => {
  // The rules were appended past the end of the payload, so an older code has
  // nothing there — which is exactly right, because it was played on them.
  const older = [2, "Old round", "2026-07-01", "Individual net", 100, 1, []];
  const ev: any = E.mergeContests(DEFAULT_CONTESTS, null);
  assert.equal(older[7], undefined);
  assert.deepEqual(ev, DEFAULT_CONTESTS);
});

/* ---- a finished round keeps its own numbers ---- */

test("a share link made before a change still shows its original numbers", async () => {
  (globalThis as any).btoa = (s: string) => Buffer.from(s, "binary").toString("base64");
  (globalThis as any).atob = (s: string) => Buffer.from(s, "base64").toString("binary");
  const { encodeResults, decodeResults } = await import("../src/shareResults.ts");

  const field = [{ ...card({ 18: 2 }), name: "Ken", handicapIndex: 18 }];
  const rows = computeLeaderboard(field as any, C, DEFAULT_CONTESTS);
  const code = encodeResults({ course: "Aberdeen", date: "2026-08-22", tee: "IV", note: "" },
    rows as any, ["watchTheBirdie", "sixPack", "agonyAlley", "easyStreet",
                  "tripleThreat", "bounceBack", "hitList", "skins"]);
  const frozen = decodeResults(code);
  const was = frozen.round!.players[0].final;

  // Now the rules change. The LINK cannot change with them — it carries the
  // numbers themselves, not the scores to rebuild them from, which is the whole
  // reason a shared board is safe to send.
  const after = computeLeaderboard(field as any, C,
    E.mergeContests(DEFAULT_CONTESTS, { tripleThreat: { perTriple: 5 } }));
  assert.notEqual(after[0].final, was, "the round would score differently now");
  assert.equal(decodeResults(code).round!.players[0].final, was, "and the link still says what it said");
});

test("a round played on house rules says so in the shared note", () => {
  // The mark rides in the note the shared view already prints, so it costs the
  // payload nothing and cannot push the field size down.
  const note = "HOUSE RULES — not the default values (Triple Threat)";
  assert.match(note, /HOUSE RULES/);
  assert.ok(note.length < 60, "short enough not to cost a player off the field");
});

test("an Easy Street rung that makes the last one unreachable is refused", () => {
  // It counts three holes, so only 0, 1 and 2 are real counts and the last rung
  // covers all three. A middle rung of 3 can never be beaten, so the value for
  // sweeping the stretch would be silently never paid — and it reads perfectly
  // plausibly on screen, which is exactly what makes it worth refusing.
  const problems = check(merge({ easyStreet: [
    { threshold: 0, strokes: 2 }, { threshold: 1, strokes: 1 },
    { threshold: 3, strokes: 0 }, { threshold: 99, strokes: -1 },
  ] }));
  assert.match(problems[0], /counts only 3 holes/);
});

test("the ordinary Easy Street ladder is not caught by that", () => {
  assert.deepEqual(check(DEFAULT_CONTESTS), []);
});
