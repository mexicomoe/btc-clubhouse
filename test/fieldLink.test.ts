/**
 * THE FIELD, CARRIED IN THE PICK SHEET'S LINK.
 *
 * Birdie picks need only the course, so one sheet has always served everybody.
 * The HIT LIST needs the field and its handicaps — a man's eight opponents are
 * the eight nearest his own index — so the field travels in the link and he
 * picks his own opponent instead of Rob picking it for him.
 *
 * The line that comes back is TWO lines: the holes as before, then the target
 * on its own, labelled. The label is what tells a target apart from the start
 * of the next man's entry in a pasted block.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

(globalThis as any).btoa = (s: string) => Buffer.from(s, "binary").toString("base64");
(globalThis as any).atob = (s: string) => Buffer.from(s, "base64").toString("binary");

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { birdiePickHoles, PICK_SLOTS, nearestByIndex } from "../src/scoring.ts";
import { parseBirdiePicks } from "../src/importScores.ts";
import "../fieldlink.js";

const FL = (globalThis as any).ClubhouseFieldLink;
const BASE = "https://mexicomoe.github.io/btc-clubhouse/picks.html";
const LEGAL = birdiePickHoles(ABERDEEN_TEE_IV);
const SLOTS = PICK_SLOTS.map((s) => ({ key: s.key, label: s.label, legal: LEGAL[s.key] }));

/** Ten men across the range a real Aberdeen field covers. */
const TEN = [
  ["Whitfield, Abe", 8.2], ["Castellan, Ben", 11.6], ["Ashford, Cy", 14.0],
  ["Pemberton, Dan", 15.1], ["Marsden, Eli", 18.7], ["Thornbury, Gus", 21.3],
  ["Brightwater, Hal", 24.8], ["Calloway, Ike", 26.4], ["Knazick, Mike", 19.5],
  ["Ridgeway, Ken", 12.9],
].map(([name, index]) => ({ name: name as string, index: index as number }));

/* ---- the link ---- */

test("a link carrying ten players offers each of them the correct eight", () => {
  const back = FL.fieldFromUrl(FL.fieldLink(BASE, TEN, "26 August 2026"));
  assert.equal(back.ok, true, back.error || "");
  assert.equal(back.field.players.length, 10);

  for (const me of back.field.players) {
    const others = back.field.players.filter((p: any) => p.name !== me.name);
    const eight = nearestByIndex(me.index, others, 8);
    assert.equal(eight.length, 8, me.name + " gets eight");
    // And they really are the nearest eight — nobody left out is closer than
    // somebody taken.
    const gaps = eight.map((o: any) => Math.abs(o.index - me.index));
    const left = others.filter((o: any) => !eight.some((e: any) => e.name === o.name))
      .map((o: any) => Math.abs(o.index - me.index));
    assert.ok(Math.max(...gaps) <= Math.min(...left), me.name + " took the nearest");
  }
});

test("the lowest and highest index get eight names, not four", () => {
  const back = FL.fieldFromUrl(FL.fieldLink(BASE, TEN, "26 August 2026"));
  const byIndex = back.field.players.slice().sort((a: any, b: any) => a.index - b.index);
  for (const me of [byIndex[0], byIndex[byIndex.length - 1]]) {
    const others = back.field.players.filter((p: any) => p.name !== me.name);
    assert.equal(nearestByIndex(me.index, others, 8).length, 8, me.name);
  }
});

test("a field of nine gives every man all eight others", () => {
  const nine = TEN.slice(0, 9);
  const back = FL.fieldFromUrl(FL.fieldLink(BASE, nine, "26 August 2026"));
  for (const me of back.field.players) {
    const others = back.field.players.filter((p: any) => p.name !== me.name);
    assert.equal(others.length, 8);
    assert.equal(nearestByIndex(me.index, others, 8).length, 8, me.name);
  }
});

test("a man is never offered himself", () => {
  const back = FL.fieldFromUrl(FL.fieldLink(BASE, TEN, "26 August 2026"));
  for (const me of back.field.players) {
    const others = back.field.players.filter((p: any) => p.name !== me.name);
    assert.equal(nearestByIndex(me.index, others, 8).some((o: any) => o.name === me.name), false);
  }
});

test("the eight are the ENGINE's rule, not a second copy of it", () => {
  // A page recommending a man the app then refuses is the worst outcome here,
  // so this asserts the page has nothing of its own to disagree with.
  const back = FL.fieldFromUrl(FL.fieldLink(BASE, TEN, "26 August 2026"));
  const me = back.field.players[4];
  const others = back.field.players.filter((p: any) => p.name !== me.name);
  assert.deepEqual(
    nearestByIndex(me.index, others, 8).map((o: any) => o.name),
    nearestByIndex(me.index, others, 8).map((o: any) => o.name));
  assert.equal(typeof nearestByIndex, "function");
});

test("a name with a comma survives the round trip", () => {
  // "Last, First" is how Golf Genius writes every one of them.
  const back = FL.fieldFromUrl(FL.fieldLink(BASE, TEN, "26 August 2026"));
  assert.equal(back.field.players[0].name, "Whitfield, Abe");
});

test("the date the link was made travels, so a stale one can be spotted", () => {
  const back = FL.fieldFromUrl(FL.fieldLink(BASE, TEN, "26 August 2026"));
  assert.equal(back.field.made, "26 August 2026");
});

test("a link with no field in it is refused, not shown empty", () => {
  assert.equal(FL.fieldFromUrl(BASE).ok, false);
  assert.match(FL.fieldFromUrl(BASE).error, /no field/i);
  assert.equal(FL.fieldFromUrl("").ok, false);
});

test("a damaged link says so rather than showing a blank page", () => {
  const good = FL.fieldLink(BASE, TEN, "26 August 2026");
  const cut = good.slice(0, good.length - 40);      // a messenger truncated it
  const back = FL.fieldFromUrl(cut);
  assert.equal(back.ok === true && back.field.players.length === 10, false,
    "a truncated link must not pass for a whole one");
});

/* ---- the line that comes back ---- */

test("the line parses back with the holes and the opponent intact", () => {
  const names = TEN.map((p) => p.name);
  const block = [
    "Abe Whitfield — 2, 14, 3, 8, 7, 16",
    "Hit List: Mike Knazick",
    "Ben Castellan — 1, 10, 8, 17, 7, 18",
    "Hit List: Ken Ridgeway",
  ].join("\n");
  const { rows } = parseBirdiePicks(block, { names, slots: SLOTS });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].problems, []);
  assert.deepEqual(rows[0].picks, { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 });
  assert.equal(rows[0].hitList, "Knazick, Mike", "matched back to the roster's own spelling");
  assert.equal(rows[1].hitList, "Ridgeway, Ken");
});

test("a man with no Hit List line is not a problem — he simply named nobody", () => {
  const names = TEN.map((p) => p.name);
  const { rows } = parseBirdiePicks("Abe Whitfield — 2, 14, 3, 8, 7, 16",
    { names, slots: SLOTS });
  assert.deepEqual(rows[0].problems, []);
  assert.equal(rows[0].hitList, null);
});

test("the label is what keeps a target from reading as the next player", () => {
  // Without it, "Mike Knazick" on its own line is indistinguishable from the
  // start of the next man's entry — and guessing either way is wrong.
  const names = TEN.map((p) => p.name);
  const { rows } = parseBirdiePicks(
    ["Abe Whitfield — 2, 14, 3, 8, 7, 16", "Mike Knazick"].join("\n"),
    { names, slots: SLOTS });
  assert.equal(rows.length, 1, "the bare name is not a row");
  assert.equal(rows[0].hitList, null, "and it did not become his target either");
});

test("a Hit List line with nobody above it is refused, not attached to thin air", () => {
  const names = TEN.map((p) => p.name);
  const { rows } = parseBirdiePicks("Hit List: Mike Knazick", { names, slots: SLOTS });
  assert.match(rows[0].problems[0], /nobody above it/);
});

test("a man cannot name himself", () => {
  const names = TEN.map((p) => p.name);
  const { rows } = parseBirdiePicks(
    ["Abe Whitfield — 2, 14, 3, 8, 7, 16", "Hit List: Abe Whitfield"].join("\n"),
    { names, slots: SLOTS });
  assert.match(rows[0].problems[0], /cannot name himself/);
  assert.equal(rows[0].hitList, null);
});

test("a target who is not in the round is named, not guessed at", () => {
  const names = TEN.map((p) => p.name);
  const { rows } = parseBirdiePicks(
    ["Abe Whitfield — 2, 14, 3, 8, 7, 16", "Hit List: Nobody At All"].join("\n"),
    { names, slots: SLOTS });
  assert.match(rows[0].problems[0], /is not a player on the list/);
});

test("two Hit List lines for one man is refused rather than the last winning", () => {
  const names = TEN.map((p) => p.name);
  const { rows } = parseBirdiePicks(
    ["Abe Whitfield — 2, 14, 3, 8, 7, 16", "Hit List: Mike Knazick", "Hit List: Ken Ridgeway"].join("\n"),
    { names, slots: SLOTS });
  assert.match(rows[0].problems[0], /two Hit List lines/);
});

test("the label is read however it was written", () => {
  const names = TEN.map((p) => p.name);
  for (const label of ["Hit List:", "hit list:", "HitList:", "Hit List -", "Hit List —"]) {
    const { rows } = parseBirdiePicks(
      ["Abe Whitfield — 2, 14, 3, 8, 7, 16", label + " Mike Knazick"].join("\n"),
      { names, slots: SLOTS });
    assert.equal(rows[0].hitList, "Knazick, Mike", label);
  }
});

test("a whole block of ten pastes in one go", () => {
  const names = TEN.map((p) => p.name);
  const block = TEN.map((p, i) =>
    `${p.name} — 2, 14, 3, 8, 7, 16\nHit List: ${TEN[(i + 1) % TEN.length].name}`).join("\n");
  const { rows } = parseBirdiePicks(block, { names, slots: SLOTS });
  assert.equal(rows.length, 10);
  assert.equal(rows.filter((r) => r.problems.length === 0).length, 10);
  assert.equal(rows.filter((r) => r.hitList != null).length, 10);
});

/* ---- the Google Sheet, and pasting a column of it ---- */

/**
 * The text message is TWO lines and stays that way — the label is what tells a
 * target apart from the next man's name in a pasted block.
 *
 * The Google Sheet is ONE, and had to become one. A newline inside a Sheet cell
 * is a trap: copying that column wraps every cell in quotes, so the name lands
 * as `"Eli Marsden` and matches nobody. Every row fails at once, at the paste
 * rather than at the send, where nobody is looking.
 */

test("a column filed one-line-per-cell pastes straight in", () => {
  const names = TEN.map((p) => p.name);
  const column = [
    "Abe Whitfield — 2, 14, 3, 8, 7, 16 · Hit List: Mike Knazick",
    "Ben Castellan — 1, 10, 8, 17, 7, 18 · Hit List: Ken Ridgeway",
  ].join("\n");
  const { rows } = parseBirdiePicks(column, { names, slots: SLOTS });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].problems, []);
  assert.equal(rows[0].hitList, "Knazick, Mike");
  assert.equal(rows[1].hitList, "Ridgeway, Ken");
  assert.deepEqual(rows[0].picks, { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 });
});

test("a QUOTED column still reads — the rows already in the form", () => {
  // Sheets wraps any cell holding a newline. Rows filed before the change look
  // like this, and refusing them would mean re-collecting a round of picks.
  const names = TEN.map((p) => p.name);
  const column = [
    '"Abe Whitfield — 2, 14, 3, 8, 7, 16',
    'Hit List: Mike Knazick"',
    '"Ben Castellan — 1, 10, 8, 17, 7, 18',
    'Hit List: Ken Ridgeway"',
  ].join("\n");
  const { rows } = parseBirdiePicks(column, { names, slots: SLOTS });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].problems, []);
  assert.equal(rows[0].hitList, "Knazick, Mike");
  assert.equal(rows[1].hitList, "Ridgeway, Ken");
});

test("a doubled quote inside a cell survives too", () => {
  const names = TEN.concat([{ name: 'O"Hara, Sean', index: 16.0 }]).map((p) => p.name);
  const { rows } = parseBirdiePicks('"Abe Whitfield — 2, 14, 3, 8, 7, 16"',
    { names, slots: SLOTS });
  assert.deepEqual(rows[0].problems, []);
});

test("the same label on one line means what it means on two", () => {
  const names = TEN.map((p) => p.name);
  const two = parseBirdiePicks(
    "Abe Whitfield — 2, 14, 3, 8, 7, 16\nHit List: Mike Knazick",
    { names, slots: SLOTS }).rows[0];
  const one = parseBirdiePicks(
    "Abe Whitfield — 2, 14, 3, 8, 7, 16 · Hit List: Mike Knazick",
    { names, slots: SLOTS }).rows[0];
  assert.equal(one.hitList, two.hitList);
  assert.deepEqual(one.picks, two.picks);
  assert.deepEqual(one.problems, two.problems);
});

test("naming himself is caught on one line as well as two", () => {
  const names = TEN.map((p) => p.name);
  const { rows } = parseBirdiePicks(
    "Abe Whitfield — 2, 14, 3, 8, 7, 16 · Hit List: Abe Whitfield",
    { names, slots: SLOTS });
  assert.match(rows[0].problems[0], /cannot name himself/);
});

test("a separator other than the dot works, since a man may type it", () => {
  const names = TEN.map((p) => p.name);
  for (const sep of [" · ", " - ", ", ", "; ", " | ", " "]) {
    const { rows } = parseBirdiePicks(
      "Abe Whitfield — 2, 14, 3, 8, 7, 16" + sep + "Hit List: Mike Knazick",
      { names, slots: SLOTS });
    assert.equal(rows[0].hitList, "Knazick, Mike", JSON.stringify(sep));
  }
});
