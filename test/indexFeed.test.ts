/**
 * THE INDEX SHEET, READ AGAINST THE ROUND.
 *
 * Rob's sheet is the master copy. What it says is applied; what it cannot say
 * clearly is refused and named; and nobody leaves the round on its say-so,
 * because taking a man out deletes his picks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import "../engine.js";
import "../importer.js";

const E = (globalThis as { ClubhouseEngine: any }).ClubhouseEngine;
const I = (globalThis as { ClubhouseImporter: any }).ClubhouseImporter;
const OPTS = { tees: E.TEE_IDS, parseIndex: E.parseHandicapIndex };
const HEAD = "name,index,tee,playing";
const read = (rows: string[], players: any[]) =>
  I.readIndexFeed([HEAD, ...rows].join("\n"), players, OPTS);

const ROUND = [
  { id: "p1", name: "Smith, Alan", index: 12.4, tee: "IV" },
  { id: "p2", name: "Levy, Rich", index: 20.1, tee: "IV" },
  { id: "p3", name: "Wallach, Mike", index: 8.0, tee: "III" },
];

test("a man whose index moved on the sheet is updated, and the rest are left alone", () => {
  const r = read([
    '"Smith, Alan",11.9,IV,TRUE',
    '"Levy, Rich",20.1,IV,TRUE',
    '"Wallach, Mike",8,III,TRUE',
  ], ROUND);
  assert.equal(r.ok, true);
  assert.deepEqual(r.updates, [{ id: "p1", name: "Smith, Alan", index: 11.9, tee: "IV",
                                 was: { index: 12.4, tee: "IV" } }]);
  assert.deepEqual(r.adds, []);
  assert.deepEqual(r.notPlaying, []);
  assert.deepEqual(r.refused, []);
  assert.deepEqual(r.playing, ["p1", "p2", "p3"]);
});

test("a tee change is an update too", () => {
  const r = read(['"Smith, Alan",12.4,III,TRUE', '"Levy, Rich",20.1,IV,TRUE',
                  '"Wallach, Mike",8,III,TRUE'], ROUND);
  assert.equal(r.updates.length, 1);
  assert.equal(r.updates[0].tee, "III");
});

test("a plus handicap is written as a minus and read as one", () => {
  const r = read(['"Smith, Alan",-2.1,IV,TRUE'], ROUND);
  assert.equal(r.updates[0].index, -2.1);
});

test("a TRUE man not in the round is added from the sheet's name, index and tee", () => {
  const r = read(['"Knazick, Mike",19.5,IV,TRUE'], ROUND);
  assert.deepEqual(r.adds, [{ name: "Knazick, Mike", index: 19.5, tee: "IV" }]);
});

test("a round man the sheet does not mark TRUE is listed, never removed", () => {
  const r = read(['"Smith, Alan",12.4,IV,TRUE', '"Levy, Rich",20.1,IV,'], ROUND);
  assert.deepEqual(r.notPlaying, [
    { id: "p2", name: "Levy, Rich", why: "not marked TRUE" },
    { id: "p3", name: "Wallach, Mike", why: "not on the Index sheet" },
  ]);
  assert.deepEqual(r.playing, ["p1"]);
});

test("a checkbox's FALSE is read as blank, anything else is refused", () => {
  const r = read(['"Levy, Rich",20.1,IV,FALSE', '"Smith, Alan",12.4,IV,yes'], ROUND);
  assert.equal(r.notPlaying.find((n: any) => n.id === "p2").why, "not marked TRUE");
  assert.deepEqual(r.refused, [{ name: "Smith, Alan", why: "playing says “yes”, not TRUE or blank" }]);
  // Refused, so he is named there and NOT also listed as not playing.
  assert.equal(r.notPlaying.some((n: any) => n.id === "p1"), false);
});

test("names match either way round, and on case and spacing", () => {
  const r = read(['"alan  smith",12.4,IV,TRUE'], ROUND);
  assert.deepEqual(r.adds, []);
  assert.deepEqual(r.playing, ["p1"]);
});

test("a TRUE row that cannot be read whole is refused and named", () => {
  const r = read([
    '"Smith, Alan",+2.1,IV,TRUE',
    '"Levy, Rich",,IV,TRUE',
    '"Wallach, Mike",8,Blue,TRUE',
    '"Knazick, Mike",19.5,,TRUE',
  ], ROUND);
  assert.deepEqual(r.refused.map((x: any) => x.name),
    ["Smith, Alan", "Levy, Rich", "Wallach, Mike", "Knazick, Mike"]);
  assert.match(r.refused[0].why, /plus handicap write it as a minus/);
  assert.equal(r.refused[1].why, "no index");
  assert.equal(r.refused[2].why, "no tee called “Blue”");
  assert.equal(r.refused[3].why, "no tee");
  assert.deepEqual(r.updates, []);
  assert.deepEqual(r.adds, []);
});

test("a row that is not TRUE is not checked — its index cannot matter", () => {
  const r = read(['"Levy, Rich",junk,Blue,'], ROUND);
  assert.deepEqual(r.refused, []);
});

test("a near miss is refused as a spelling, not added as a second man", () => {
  const r = read(['"Smith, Al",12.4,IV,TRUE'], ROUND);
  assert.deepEqual(r.adds, []);
  assert.equal(r.refused.length, 1);
  assert.match(r.refused[0].why, /could be Smith, Alan/);
});

test("but a close name is a new man when the round man he resembles is already on the sheet", () => {
  const r = read(['"Levy, Rich",20.1,IV,TRUE', '"Levy, Rick",15,IV,TRUE'], ROUND);
  assert.deepEqual(r.adds, [{ name: "Levy, Rick", index: 15, tee: "IV" }]);
  assert.deepEqual(r.refused, []);
});

test("the same man twice on the sheet is refused, both rows", () => {
  const r = read(['"Smith, Alan",12.4,IV,TRUE', '"Alan Smith",13,IV,TRUE'], ROUND);
  assert.equal(r.refused.length, 2);
  assert.ok(r.refused.every((x: any) => x.why === "is on the sheet twice"));
  assert.deepEqual(r.updates, []);
});

test("a sheet name that is two men in the round is refused", () => {
  const twins = [...ROUND, { id: "p4", name: "Alan Smith", index: 30, tee: "IV" }];
  const r = read(['"Smith, Alan",12.4,IV,TRUE'], twins);
  assert.equal(r.refused[0].why, "matches more than one man in the round");
});

test("a wrong header reads nothing at all", () => {
  const r = I.readIndexFeed("Name,Handicap,Tee\n\"Smith, Alan\",12,IV", ROUND, OPTS);
  assert.equal(r.ok, false);
  assert.match(r.problem, /first row should be name,index,tee,playing/);
  assert.deepEqual([r.updates, r.adds, r.notPlaying], [[], [], []]);
});

test("the header is read whatever its case, and a byte-order mark is ignored", () => {
  const r = I.readIndexFeed("﻿Name,Index,Tee,Playing\n\"Smith, Alan\",12.4,IV,TRUE", ROUND, OPTS);
  assert.equal(r.ok, true);
});
