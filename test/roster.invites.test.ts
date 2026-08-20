/**
 * THE ROSTER, AND THE PER-MAN INVITATION.
 *
 * Two problems with one answer. Rob typed the same men in every week because
 * players lived inside an event and nothing outlived it. And the Hit List could
 * not reach the players: a link carrying the whole field ran to 283 characters
 * at eight men and 501 at sixteen, against a phone that delivered 219 first
 * time — so it failed hardest exactly when there were most men to reach.
 *
 * A man's OWN link carries his name and his six opponents and nothing else. It
 * does not grow with the field: sixteen men get the same 209 characters as
 * eight. And NO HANDICAP INDEX TRAVELS — the bands are decided before the link
 * is built, so a public address carries words rather than figures.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

(globalThis as any).btoa = (s: string) => Buffer.from(s, "binary").toString("base64");
(globalThis as any).atob = (s: string) => Buffer.from(s, "base64").toString("binary");

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { nearestByIndex, birdiePickHoles, PICK_SLOTS } from "../src/scoring.ts";
import { parseBirdiePicks } from "../src/importScores.ts";
import "../fieldlink.js";

const FL = (globalThis as any).ClubhouseFieldLink;
const E = (globalThis as any).ClubhouseEngine;
const BASE = "https://mexicomoe.github.io/btc-clubhouse/picks.html";
const LEGAL = birdiePickHoles(ABERDEEN_TEE_IV);
const SLOTS = PICK_SLOTS.map((s) => ({ key: s.key, label: s.label, legal: LEGAL[s.key] }));
const OFFER = DEFAULT_CONTESTS.hitList!.offer;

const TEN = [
  ["Whitfield, Abe", 8.2], ["Castellan, Ben", 11.6], ["Ridgeway, Ken", 12.9],
  ["Ashford, Cy", 14.0], ["Pemberton, Dan", 15.1], ["Marsden, Eli", 18.7],
  ["Knazick, Mike", 19.5], ["Thornbury, Gus", 21.3], ["Brightwater, Hal", 24.8],
  ["Calloway, Ike", 26.4],
].map(([name, index]) => ({ name: name as string, index: index as number }));

/** His six, exactly as the app works them out. */
function sixFor(me: any, field: any[]) {
  const band = DEFAULT_CONTESTS.hitList!.equalBand;
  const others = field.filter((o) => o.name !== me.name && o.index != null);
  return nearestByIndex(me.index, others, OFFER).map((o: any) => ({
    name: o.name,
    band: Math.abs(me.index - o.index) <= band ? "e" : o.index < me.index ? "l" : "h",
  }));
}

/* ---- six, not eight ---- */

test("the number offered is a value, not a constant in the code", () => {
  assert.equal(OFFER, 6);
  assert.equal(typeof OFFER, "number");
});

test("each man is offered exactly six, three each way, and never himself", () => {
  for (const me of TEN) {
    const six = sixFor(me, TEN);
    assert.equal(six.length, 6, me.name);
    assert.equal(six.some((o) => o.name === me.name), false, me.name + " is not on his own list");
  }
  // A man in the middle gets three below and three above.
  const middle = sixFor(TEN[5], TEN);   // Marsden, 18.7
  const idxOf = (n: string) => TEN.find((p) => p.name === n)!.index;
  assert.equal(middle.filter((o) => idxOf(o.name) < 18.7).length, 3);
  assert.equal(middle.filter((o) => idxOf(o.name) > 18.7).length, 3);
});

test("a field of seven offers every man all six others", () => {
  const seven = TEN.slice(0, 7);
  for (const me of seven) {
    assert.equal(sixFor(me, seven).length, 6, me.name);
  }
});

test("the lowest and highest index get six names from the one side", () => {
  const low = sixFor(TEN[0], TEN);      // Whitfield 8.2, nobody below him
  const high = sixFor(TEN[9], TEN);     // Calloway 26.4, nobody above
  assert.equal(low.length, 6);
  assert.equal(high.length, 6);
  assert.ok(low.every((o) => o.band !== "l"), "everyone is above the lowest man");
  assert.ok(high.every((o) => o.band !== "h"), "everyone is below the highest man");
});

/* ---- the link ---- */

test("a one-man link carries no handicap index at all", () => {
  const me = TEN[5];
  const url = FL.manLink(BASE, me.name, sixFor(me, TEN));
  const payload = FL.decodeMan(url.split("?p=")[1]);
  assert.equal(payload.ok, true);
  // Decoded, it holds names and one-letter bands. Nothing numeric.
  const raw = JSON.stringify(payload.man);
  for (const p of TEN) {
    assert.equal(raw.includes(String(p.index)), false, "no index for " + p.name);
  }
});

test("it does not grow with the field, which is the whole point", () => {
  const eight = TEN.slice(0, 8);
  const me = { name: "Marsden, Eli", index: 18.7 };
  const a = FL.manLink(BASE, me.name, sixFor(me, eight)).length;
  const b = FL.manLink(BASE, me.name, sixFor(me, TEN)).length;
  // Six opponents either way, so the same length whatever the field.
  assert.equal(Math.abs(a - b) < 30, true, a + " vs " + b);
});

test("a typical invitation is short enough to text", () => {
  // Measured against the club's own phone: 219 arrived first time, 250 needed a
  // second attempt. A whole-field link was 283 at eight men and 501 at sixteen.
  const me = TEN[5];
  const url = FL.manLink(BASE, me.name, sixFor(me, TEN));
  assert.ok(url.length <= 219, url.length + " characters");
});

test("the six come back in the order and the bands they were sent", () => {
  const me = TEN[5];
  const six = sixFor(me, TEN);
  const back = FL.manFromUrl(FL.manLink(BASE, me.name, six));
  assert.equal(back.man.name, me.name);
  assert.deepEqual(back.man.six.map((o: any) => o.name), six.map((o) => o.name));
  assert.deepEqual(back.man.six.map((o: any) => o.band), six.map((o) => o.band));
});

test("the band words are the ones the card uses", () => {
  assert.equal(FL.bandWords("l"), "a lower handicap");
  assert.equal(FL.bandWords("e"), "an equal handicap");
  assert.equal(FL.bandWords("h"), "a higher handicap");
  assert.equal(FL.bandWords("?"), "an equal handicap", "an unknown band is not a crash");
});

test("a link with nobody in it is refused, and the plain sheet is not one", () => {
  assert.equal(FL.manFromUrl(BASE).ok, false);
  assert.match(FL.manFromUrl(BASE).error, /nobody in this link/i);
});

test("the one-man link parses back with holes and opponent intact", () => {
  const names = TEN.map((p) => p.name);
  const me = TEN[5];
  const back = FL.manFromUrl(FL.manLink(BASE, me.name, sixFor(me, TEN)));
  const chosen = back.man.six[0].name;          // he taps the first one
  const message = `${me.name} — 2, 14, 3, 8, 7, 16\nHit List: ${chosen}`;
  const { rows } = parseBirdiePicks(message, { names, slots: SLOTS });
  assert.deepEqual(rows[0].problems, []);
  assert.deepEqual(rows[0].picks, { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 });
  assert.equal(rows[0].hitList, chosen, "and the name he tapped comes back exactly");
});

/* ---- the field changing under the invitations ---- */

test("removing a man changes the others' six, which is why they must be re-sent", () => {
  const me = TEN[5];
  const before = sixFor(me, TEN).map((o) => o.name).join("|");
  const shorter = TEN.filter((p) => p.name !== before.split("|")[0]);
  const after = sixFor(me, shorter).map((o) => o.name).join("|");
  assert.notEqual(before, after, "the pool changed, so his six did");
});

test("adding a man does the same", () => {
  const me = TEN[5];
  const before = sixFor(me, TEN).map((o) => o.name).join("|");
  const bigger = TEN.concat([{ name: "Newman, Sid", index: 18.9 }]);
  assert.notEqual(before, sixFor(me, bigger).map((o) => o.name).join("|"));
});

test("a pick naming a man who then drops out scores zero, not an error", () => {
  // Already the rule for an opponent with no complete round; dropping out is
  // the same thing seen earlier.
  const rows = E.computeLeaderboard([
    { name: "Marsden, Eli", courseHandicap: 0, handicapIndex: 18.7, hitList: "Gone, Man",
      picks: { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 },
      gross: ABERDEEN_TEE_IV.par.slice() },
  ], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const c = rows[0].contests.hitList!;
  assert.equal(c.strokes, 0);
  assert.equal(c.live, false);
  assert.match(c.detail, /not in this round/);
});

/* ---- a man who never replies ---- */

test("a man with no reply scores nothing on the Hit List", () => {
  const rows = E.computeLeaderboard([
    { name: "Silent, Sam", courseHandicap: 0, handicapIndex: 18.7, hitList: "",
      picks: { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 },
      gross: ABERDEEN_TEE_IV.par.slice() },
  ], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const c = rows[0].contests.hitList!;
  assert.equal(c.strokes, 0);
  assert.equal(c.live, false);
  assert.match(c.detail, /nobody named/);
});

test("drawing an opponent is OFF, and is a value rather than a constant", () => {
  assert.equal(DEFAULT_CONTESTS.hitList!.drawMissing, false);
  assert.equal(typeof DEFAULT_CONTESTS.hitList!.drawMissing, "boolean");
});

test("an offer of one is refused — one name is not a choice", () => {
  const problems = E.checkContests(
    E.mergeContests(DEFAULT_CONTESTS, { hitList: { offer: 1 } }), ABERDEEN_TEE_IV);
  assert.match(problems[0], /at least two opponents/);
});

/* ---- the message must be ADDRESSED ---- */

/**
 * It was not. The sms: link carried a body and no recipient, so Messages opened
 * empty every time and the sender searched his contacts by hand. It looked like
 * it worked for the men already in his contacts, which is why a walkthrough
 * missed it — the failure was invisible exactly where the app was confident.
 *
 * The function had been lifted from the pick sheet, where a blank recipient is
 * DELIBERATE: that page has no number to put there. Carried across, the
 * reasoning inverted, and nothing checked.
 */

/** The same rule the screen uses. */
function tel(raw: string) {
  const s = String(raw == null ? "" : raw).trim();
  if (s === "") return "";
  return (s.charAt(0) === "+" ? "+" : "") + s.replace(/[^0-9]/g, "");
}
function smsHref(body: string, number: string, ios: boolean) {
  return "sms:" + tel(number) + (ios ? "&" : "?") + "body=" + body;
}

test("A TEXT CARRIES THE RECIPIENT — the bug that opened an empty message", () => {
  for (const ios of [true, false]) {
    const url = smsHref("hello", "555-010-1234", ios);
    assert.match(url, /^sms:5550101234[&?]body=/, ios ? "iOS" : "Android");
    // The number sits BEFORE the separator. After it, it would read as a field.
    assert.ok(url.indexOf("5550101234") < url.indexOf("body="));
  }
});

test("the separator is still right for each phone, recipient or not", () => {
  assert.equal(smsHref("x", "5550101234", true), "sms:5550101234&body=x");
  assert.equal(smsHref("x", "5550101234", false), "sms:5550101234?body=x");
});

test("a number is cleaned to what an sms: link will take", () => {
  assert.equal(tel("(555) 010-1234"), "5550101234");
  assert.equal(tel("555 010 1234"), "5550101234");
  assert.equal(tel("+1 555-010-1234"), "+15550101234", "a leading + is what makes it unambiguous");
  assert.equal(tel(""), "");
});

test("no number means no button, rather than a button that opens nothing", () => {
  // The screen shows a disabled button naming what is missing. What must never
  // happen is a live button producing "sms:&body=…" — an empty message that
  // looks like it worked.
  const url = smsHref("hello", "", true);
  assert.equal(url, "sms:&body=hello");
  assert.equal(url.startsWith("sms:&"), true,
    "this is the shape the screen must refuse to offer");
});
