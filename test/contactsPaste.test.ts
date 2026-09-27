/**
 * MOBILES AND E-MAILS, PASTED FROM THE ROSTER TAB.
 *
 * They never travel through a published feed. They are pasted onto the one
 * phone that sends invitations, and matched to its roster by the same rules
 * as every other name in the app: either way round, never on a guess.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import "../importer.js";

const I = (globalThis as { ClubhouseImporter: any }).ClubhouseImporter;
const T = (...cells: string[]) => cells.join("\t");

// The Roster tab copied whole from Google Sheets: its title lines, its
// heading row, then Name, Handicap index, Tee, Email, Mobile.
const WHOLE_TAB = [
  T("THE ROSTER — every man who plays with you", "", "", "", ""),
  T("Fill this in once. After that, pick a name on the Players tab.", "", "", "", ""),
  T("", "", "", "", ""),
  T("Name", "Handicap index", "Tee", "Email", "Mobile"),
  T("Tanenbaum, Rob", "23.6", "IV", "rob@example.com", "845-555-0101"),
  T("Schwartz, Harvey", "25.5", "IV", "harvey@example.com", "(845) 555-0102"),
  T("Horvitz, Stu", "33", "IV", "", "845.555.0103"),
].join("\n");

test("the whole Roster tab pastes in: titles and headings ignored, contacts read", () => {
  const { rows, ignored } = I.readContacts(WHOLE_TAB,
    ["Tanenbaum, Rob", "Schwartz, Harvey", "Horvitz, Stu"], []);
  assert.equal(ignored, 3, "two title lines and the heading row; a blank line is not counted");
  assert.deepEqual(rows.map((r: any) => [r.name, r.mobile, r.email, r.at, r.why]), [
    ["Tanenbaum, Rob", "845-555-0101", "rob@example.com", 0, null],
    ["Schwartz, Harvey", "(845) 555-0102", "harvey@example.com", 1, null],
    ["Horvitz, Stu", "845.555.0103", "", 2, null],
  ]);
});

test("the index is never mistaken for a mobile", () => {
  const { rows } = I.readContacts(T("Tanenbaum, Rob", "23.6", "IV", "", "8455550101"), ["Tanenbaum, Rob"], []);
  assert.equal(rows[0].mobile, "8455550101");
});

test("columns in any order, and a comma list rejoins the name", () => {
  const { rows } = I.readContacts("845-555-0101, rob@example.com, Tanenbaum, Rob\n" +
    "Tanenbaum, Rob, 845-555-0101, rob@example.com", ["Tanenbaum, Rob"], []);
  // The first line has no name before its contacts, so it is ignored, not guessed.
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Tanenbaum, Rob");
  assert.equal(rows[0].at, 0);
});

test("names match either way round, on case and spacing", () => {
  const { rows } = I.readContacts(T("rob  TANENBAUM", "845-555-0101"), ["Tanenbaum, Rob"], []);
  assert.equal(rows[0].at, 0);
});

test("a man not in the roster is a new roster man, tied to his round player", () => {
  const { rows } = I.readContacts(T("Knazick, Mike", "845-555-0104"),
    [], ["Tanenbaum, Rob", "Mike Knazick"]);
  assert.deepEqual([rows[0].at, rows[0].round, rows[0].why], [-1, 1, null]);
});

test("a mobile that is not ten digits is refused and named", () => {
  const { rows } = I.readContacts(T("Tanenbaum, Rob", "555-0101"), ["Tanenbaum, Rob"], []);
  assert.equal(rows[0].why, "mobile “555-0101” is not a ten-digit number");
  const us = I.readContacts(T("Tanenbaum, Rob", "+1 845 555 0101"), ["Tanenbaum, Rob"], []);
  assert.equal(us.rows[0].why, null, "a leading 1 is a US number, not an eleventh digit");
});

test("a near miss is refused as a spelling, not added as a second man", () => {
  const { rows } = I.readContacts(T("Tanenbaum, Robb", "845-555-0101"), ["Tanenbaum, Rob"], []);
  assert.match(rows[0].why, /could be Tanenbaum, Rob/);
  const inRound = I.readContacts(T("Knazik, Mike", "845-555-0104"), [], ["Knazick, Mike"]);
  assert.match(inRound.rows[0].why, /could be Knazick, Mike/);
});

test("but a close name is a new man when the one he resembles is accounted for", () => {
  const { rows } = I.readContacts(
    [T("Levy, Rich", "845-555-0105"), T("Levy, Rick", "845-555-0106")].join("\n"),
    ["Levy, Rich"], []);
  assert.deepEqual(rows.map((r: any) => [r.at, r.why]), [[0, null], [-1, null]]);
});

test("the same man twice in the paste is refused, both lines", () => {
  const { rows } = I.readContacts(
    [T("Tanenbaum, Rob", "845-555-0101"), T("Rob Tanenbaum", "845-555-0199")].join("\n"),
    ["Tanenbaum, Rob"], []);
  assert.ok(rows.every((r: any) => r.why === "is in the paste twice"));
});

test("a name that is two men in the roster is refused", () => {
  const { rows } = I.readContacts(T("Tanenbaum, Rob", "845-555-0101"),
    ["Tanenbaum, Rob", "Rob Tanenbaum"], []);
  assert.equal(rows[0].why, "matches more than one man in the roster");
});

test("a man with neither a mobile nor an e-mail has nothing to fill, and is skipped", () => {
  const { rows, ignored } = I.readContacts(T("Tanenbaum, Rob", "23.6", "IV", "", ""), ["Tanenbaum, Rob"], []);
  assert.deepEqual([rows.length, ignored], [0, 1]);
});
