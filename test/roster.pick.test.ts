/**
 * Building a lineup by tapping names.
 *
 * Rob runs two or three events a week and every one starts the same way: make
 * the event, then pick the same regular men out of the roster. The roster went
 * behind the gear, so that was Setup → gear → the roster → back to Setup — a
 * round trip, twice a week, in the middle of a job. The gear is for things
 * touched once a month; the roster is touched every event.
 *
 * So the roster comes to Setup rather than Rob going to it. The roster SCREEN
 * stays where it is for what it is genuinely for: adding a new man, correcting
 * an index, changing a tee, fixing a mobile number.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import "../display.js";

const D = (globalThis as { ClubhouseDisplay: any }).ClubhouseDisplay;
const html = readFileSync(new URL("../leaderboard.html", import.meta.url), "utf8");

/* ---- the order the list is read in ---- */

test("men sort by surname, then by first name", () => {
  const men = [
    { name: "Abe Whitfield" }, { name: "Al Brightman" }, { name: "Cy Ashford" },
    { name: "Ken Ridgeway" }, { name: "Ben Castellan" },
  ];
  assert.deepEqual(men.slice().sort(D.bySurname).map((m) => m.name),
    ["Cy Ashford", "Al Brightman", "Ben Castellan", "Ken Ridgeway", "Abe Whitfield"]);
});

test("the same surname falls to the first name", () => {
  const men = [{ name: "Cy Ashford" }, { name: "Al Ashford" }];
  assert.deepEqual(men.slice().sort(D.bySurname).map((m) => m.name),
    ["Al Ashford", "Cy Ashford"]);
});

test("sorting on the whole name is what this replaced", () => {
  // Abe Whitfield and Al Brightman both sort under A on the full string, which
  // is why the list was not scannable.
  const men = [{ name: "Abe Whitfield" }, { name: "Al Brightman" }];
  const naive = men.slice().sort((a, b) => a.name.localeCompare(b.name)).map((m) => m.name);
  const ours = men.slice().sort(D.bySurname).map((m) => m.name);
  assert.deepEqual(naive, ["Abe Whitfield", "Al Brightman"]);
  assert.deepEqual(ours, ["Al Brightman", "Abe Whitfield"]);
});

test("a one-word name sorts on itself, and nothing throws on a blank", () => {
  assert.equal(D.surnameKey("Cher"), "cher");
  assert.equal(D.surnameKey(""), "");
  assert.equal(D.surnameKey(null), "");
  assert.equal(D.surnameKey("  Ken   Ridgeway  "), "ridgeway ken");
  assert.doesNotThrow(() => [{ name: null }, { name: "A B" }].sort(D.bySurname));
});

test("a double-barrelled surname keeps both halves", () => {
  assert.equal(D.surnameKey("Christiaan Bezuidenhout-Fotheringay"),
    "bezuidenhout-fotheringay christiaan");
});

/* ---- one implementation, in both places ---- */

test("both lists sort with the shared comparator", () => {
  assert.equal((html.match(/\.sort\(bySurname\)/g) || []).length, 2,
    "the tap list inside Add player, and the roster screen");
  assert.match(html, /duelSentence, bySurname \} = D;/, "and it comes from display.js");
});

test("there is ONE way a roster man becomes a player", () => {
  // `playerFromRoster` is the copy-not-link rule. Two copies of it is how the
  // two screens would start disagreeing about what a man brings with him.
  assert.equal((html.match(/playerFromRoster\(/g) || []).length, 2,
    "defined once, called once — from addFromRoster");
  assert.match(html, /function addFromRoster\(m\)\{/);
  // Both screens go through it.
  assert.equal((html.match(/addFromRoster\(/g) || []).length, 4);
});

test("his index and tee are COPIED, never linked", () => {
  const fn = html.slice(html.indexOf("function playerFromRoster"),
                        html.indexOf("function inField"));
  for (const field of ["p.name = m.name", "p.index = m.index", "p.tee = m.tee"]) {
    assert.ok(fn.includes(field), field);
  }
  // Nothing writes back to the roster man from a round.
  assert.equal(/m\.index\s*=/.test(fn), false, "a round must never edit the roster");
  assert.equal(/m\.tee\s*=/.test(fn), false);
});

/* ---- already in the round ---- */

test("a man already in the round is found, marked, and not offered twice", () => {
  assert.match(html, /function playerFor\(m\)\{/);
  assert.match(html, /function inField\(m\)\{\s*return !!playerFor\(m\);/);
  // By roster id first, then by normalised name — so a man added by hand or off
  // a tee sheet is still recognised.
  const fn = html.slice(html.indexOf("function playerFor"), html.indexOf("function addFromRoster"));
  assert.match(fn, /p\.rosterId && p\.rosterId === m\.id/);
  assert.match(fn, /IMP\.normaliseName/);
  // And the guard is inside the one add path.
  assert.match(html, /if\(inField\(m\)\) return false;/);
});

test("THE ROSTER LINK SURVIVES AN EDIT, or the mark stops working", () => {
  /* saveEditing used to rebuild the player from a fixed list of the fields the
     form owns and assign it over him — so a corrected index silently dropped
     his TEAM (which is on that very form, and so could never be set at all),
     his HIT LIST opponent, and his ROSTER LINK.

     The link is the one that bites here: without it a man tapped in from the
     roster stops being marked "in" the moment his index is corrected, and can
     be tapped in a second time — the duplicate this whole screen exists to
     prevent, created by the thing it exists to support. */
  assert.match(html, /const keep = state\.players\.find\(x => x\.id === p\.id\) \|\| \{\};/);
  assert.match(html, /const rec = Object\.assign\(\{\}, keep, \{/);
  assert.match(html, /team: \(p\.team \|\| ""\)\.trim\(\)/, "team survives, and can now be set at all");
  assert.match(html, /if\(p\.rosterId\) rec\.rosterId = p\.rosterId;/);
});

/* ---- taking him out again ---- */

test("tapping again removes him, and asks first only when there is something to lose", () => {
  assert.match(html, /function hasWork\(p\)\{/);
  const fn = html.slice(html.indexOf("function hasWork"), html.indexOf("/**\n * The order both"));
  assert.match(fn, /scoresFor\(p\)\.some/, "a card");
  assert.match(fn, /E\.PICK_SLOTS\.some/, "his picks");
  assert.match(fn, /p\.hitList/, "and the man he named");
  assert.match(fn, /if\(hasWork\(p\) && !window\.confirm\(/,
    "silent when there is nothing in him, a question when there is");
  assert.match(fn, /delete state\.scores\[p\.id\]/);
});

/* ---- typing a man in ---- */

test("a new man typed in is offered the roster, and an existing one is not", () => {
  assert.match(html, /editing\.alsoRoster = !found;/, "offered, and on by default, for a NEW man");
  assert.match(html, /p\.isNew \? `<div class="field"><span class="flab">Save him to the roster/);
  // Saving only ever ADDS — a man already saved is matched by name and left be.
  const fn = html.slice(html.indexOf("if(rec.rosterId == null && editing.alsoRoster"));
  assert.match(fn.slice(0, 600), /IMP\.normaliseName\(m\.name \|\| ""\) === IMP\.normaliseName\(rec\.name\)/);
  assert.match(fn.slice(0, 600), /already \|\| addToRoster\(/);
});

/* ---- the empty case, and the full one ---- */

test("an empty roster says so in a line, rather than leaving a blank", () => {
  const fn = html.slice(html.indexOf("function drawRosterPick"), html.indexOf("function refreshFieldBoxes"));
  assert.match(fn, /if\(men\.length === 0\)\{/);
  assert.match(fn, /Nobody on the roster yet/);
  assert.match(fn, /⚙ Settings › The roster/, "and says where to go and what to do");
});

test("a full round says so rather than letting taps do nothing", () => {
  const fn = html.slice(html.indexOf("function drawRosterPick"), html.indexOf("function refreshFieldBoxes"));
  assert.match(fn, /This round is full at \$\{MAX_PLAYERS\} players/);
  assert.match(fn, /\(!here && full \? " disabled" : ""\)/, "and the rows that cannot be tapped are");
  assert.match(html, /if\(state\.players\.length >= MAX_PLAYERS\) return false;/);
});

/* ---- the screen it came from is untouched ---- */

test("the roster screen stays behind the gear, doing what it is for", () => {
  assert.match(html, /<section id="more" class="screen">/);
  const more = html.slice(html.indexOf('<section id="more"'), html.indexOf('<section id="roster"'));
  assert.match(more, /The roster/, "still reached from the gear");
  // And it keeps its own jobs.
  assert.match(html, /id="rosterNew"/, "add a man to the roster");
  assert.match(html, /id="rosterFromField"/, "save this round's players to the roster");
  assert.match(html, /id="rosterAddAll"/, "add everyone not in this round");
  assert.match(html, /function editRosterMan/, "and edit him");
});

test("an open Hit List does not go stale as men are tapped in", () => {
  // A fold's contents are built when it is opened and not touched again, which
  // was harmless while men only ever arrived from another screen.
  assert.match(html, /function refreshFieldBoxes\(\)\{/);
  assert.match(html, /if\(hit && hit\.open\) showHitListBox\(\);/);
  assert.match(html, /drawFoldSubs\(\);\n  refreshFieldBoxes\(\);/,
    "called from renderSetup, which runs after every way the field can change");
});
