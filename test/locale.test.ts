/**
 * The app is American, and says so explicitly rather than asking the browser.
 *
 * Two separate faults, both reported off a laptop:
 *
 *   · Dates read "22 August 2026". This is a Florida golf club; nobody here
 *     writes a date that way.
 *   · The rules screen showed "−0,5". Not our formatting — `<input
 *     type="number">` is rendered in the BROWSER's locale, so a laptop set to
 *     a comma-decimal language rewrote every value on the screen.
 *
 * The fix for the second is not to format harder. It is to stop handing a
 * number to something that will reformat it: a text input renders the string
 * it is given, exactly, on every machine.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "../display.js";

const D = (globalThis as { ClubhouseDisplay: any }).ClubhouseDisplay;
const read = (f: string) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const PAGES = ["leaderboard.html", "picks.html", "results.html", "index.html"];

test("dates are month, day, year", () => {
  assert.equal(D.niceDate("2026-08-22"), "August 22, 2026");
  assert.equal(D.niceDate("2026-01-01"), "January 1, 2026");
  assert.equal(D.niceDate("2026-12-31"), "December 31, 2026");
  // No leading zero on the day — "August 04" is a filename, not a date.
  assert.equal(D.niceDate("2026-09-04"), "September 4, 2026");
});

test("a date it cannot read comes back as it went in", () => {
  assert.equal(D.niceDate(""), "");
  assert.equal(D.niceDate("not a date"), "not a date");
  assert.equal(D.niceDate(null), "");
});

test("every page declares en-US", () => {
  // The lever the browser actually reads when it decides how to render a
  // number field, among other things.
  for (const p of PAGES) assert.match(read(p), /<html lang="en-US">/, p);
});

test("no value box is a number input", () => {
  /* THIS IS THE WHOLE FIX. `type="number"` hands the value to the browser to
     render in its own locale; `type="text"` renders what we wrote. Every box
     that holds a stroke value, a threshold or a handicap must be text. */
  const html = read("leaderboard.html");
  const numbers = [...html.matchAll(/<input[^>]*type="number"[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(numbers, [], "still localizable: " + numbers.join(" | "));
});

test("the value boxes keep a numeric keypad on a phone", () => {
  // Dropping type="number" must not cost the men the number pad.
  const html = read("leaderboard.html");
  const settings = html.slice(html.indexOf("function numField"), html.indexOf("function settingsGet"));
  assert.match(settings, /type="text" inputmode="decimal"/);
});

test("a comma typed out of habit is still understood", () => {
  // The reader is deliberately forgiving in the one direction that is safe:
  // it accepts a comma, it never writes one.
  const html = read("leaderboard.html");
  const reader = html.slice(html.indexOf("const readNumber"), html.indexOf("const readNumber") + 500);
  assert.match(reader, /replace\("," *, *"\."\)/);
});

test("nothing in the app formats a number through the browser's locale", () => {
  for (const f of ["display.js", "engine.js", "leaderboard.html", "importer.js", "exporter.js"]) {
    assert.equal(/toLocaleString\(|toLocaleDateString\(|new Intl\./.test(read(f)), false,
      f + " asks the browser to format something");
  }
});

/* ---- American spelling ---- */

test("the spelling is American throughout", () => {
  const pattern = new RegExp("\\b(" + [
    "colour", "colours", "behaviour", "honour", "honours", "centre",
    "organis\\w*", "recognis\\w*", "realis\\w*", "normalis\\w*", "summaris\\w*",
    "labelled", "unlabelled", "travelled", "cancelled",
    "whilst", "amongst", "grey", "greys", "misspelt", "defence", "licence",
  ].join("|") + ")\\b", "gi");
  const files = ["engine.js", "importer.js", "exporter.js", "display.js", "results.js",
                 "fieldlink.js", "boardimage.js", "clubhouse.css",
                 "leaderboard.html", "picks.html", "results.html", "index.html"];
  const found: string[] = [];
  for (const f of files) {
    for (const m of read(f).matchAll(pattern)) found.push(f + ": " + m[0]);
  }
  assert.deepEqual(found, [], found.join(" · "));
});

test("every sort names its locale", () => {
  /* `localeCompare` with no locale uses the MACHINE's. Two phones could then
     order the same forty men differently — which is not a crash, just a list
     that is wrong somewhere and right nowhere. */
  for (const f of ["display.js", "engine.js", "leaderboard.html"]) {
    // By line: a nested call makes a balanced-paren match unreliable, and
    // every one of these is written on one line.
    const bare = read(f).split("\n")
      .filter((l) => l.includes(".localeCompare(") && !l.includes('"en-US"'));
    assert.deepEqual(bare, [], f + ": " + bare.join(" · "));
  }
});

test("the renamed helper is the one that is exported", () => {
  // normaliseName → normalizeName crossed the importer's public surface, the
  // app, and the tests. A half-done rename is a runtime error, not a typo.
  const imp = read("importer.js");
  assert.match(imp, /normalizeName,/);
  assert.equal(/normaliseName/.test(imp), false);
  assert.equal(/normalise/.test(read("leaderboard.html")), false);
});

/* ---- the date box ----
 *
 * `<input type="date">` is drawn by the BROWSER in the BROWSER's locale, and
 * nothing on the page reaches it — not `lang`, not a format attribute, because
 * there is no such attribute. A laptop set to a British locale showed the event
 * date as 28/08/2026 while every date the app printed read August 28, 2026.
 *
 * Same fault as the rules screen showing −0,5, and the same fix: stop handing
 * the value to something that will redraw it.
 */

test("no native date, time or month input anywhere", () => {
  for (const p of PAGES) {
    const native = [...read(p).matchAll(/<input[^>]*type="(date|time|datetime-local|month|week)"[^>]*>/g)]
      .map((m) => m[0]);
    assert.deepEqual(native, [], p + " still lets the browser draw a date: " + native.join(" | "));
  }
});

test("the date box is text, in month-day-year, and says what it stored", () => {
  const html = read("leaderboard.html");
  const box = html.slice(html.indexOf('for="fEventDate"'), html.indexOf('for="fEventDate"') + 500);
  assert.match(box, /type="text"/);
  assert.match(box, /placeholder="MM\/DD\/YYYY"/);
  assert.match(box, /usDate\(e\.date\)/, "shown US");
  assert.match(box, /niceDate\(e\.date\)/, "and spelled out underneath, so there is no doubt");
});

test("a date goes out US and comes back ISO", () => {
  assert.equal(D.usDate("2026-08-28"), "08/28/2026");
  assert.equal(D.usDate(""), "");
  assert.equal(D.usDate(null), "");
  assert.equal(D.isoFromUs("08/28/2026"), "2026-08-28");
  // Forgiving where it is safe: single digits, other separators, a pasted ISO.
  for (const t of ["8/28/2026", "8-28-2026", "08.28.2026", "2026-08-28", " 8/28/2026 "]) {
    assert.equal(D.isoFromUs(t), "2026-08-28", t);
  }
});

test("it refuses what it cannot be sure of, rather than guessing", () => {
  for (const t of ["", "rubbish", "8/28/26", "13/01/2026", "02/30/2026", "28/08/2026", "8/28"]) {
    assert.equal(D.isoFromUs(t), null, t + " should not have been read");
  }
});

test("a date that will not read leaves the stored one alone", () => {
  // Half a date typed in is not a reason to lose the round's date.
  const html = read("leaderboard.html");
  const fn = html.slice(html.indexOf("const readDate"), html.indexOf("$(\"fEventDate\").addEventListener(\"input\""));
  assert.match(fn, /if\(iso == null\)\{/);
  assert.match(fn, /return;/);
  assert.match(fn, /Not a date I can read/);
});

test("a round trip through the box changes nothing", () => {
  for (const iso of ["2026-01-01", "2026-08-28", "2026-12-31", "2027-02-28"]) {
    assert.equal(D.isoFromUs(D.usDate(iso)), iso, iso);
  }
});
