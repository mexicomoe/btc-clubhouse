/**
 * Skins, settled ONCE.
 *
 * THERE USED TO BE TWO OF IT. The leaderboard settled Skins in the engine,
 * across the whole field and excluding men who never finished. The Skins tab
 * settled it again in the page — inside the current FLIGHT, and counting
 * everybody who had a group whether they went round or not.
 *
 * The two disagreed in ordinary rounds. Ten men in two flights of five had the
 * board paying every man a skin while the tab said there were no skins at all,
 * because five is under the minimum. A man who birdied the 1st and walked in
 * after twelve won a hole for his group on one screen and nothing on the other.
 *
 * A tab apart that was survivable. On one screen, one scroll apart, it is not —
 * so the screen reads `skinsSettlement`, which is the same call `applySkins`
 * makes, and the two cannot disagree by construction. These tests are the ones
 * that would have caught it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { computeLeaderboard, type PlayerCard } from "../src/scoring.ts";
import "../engine.js";

const E = (globalThis as { ClubhouseEngine: any }).ClubhouseEngine;
const PAR = ABERDEEN_TEE_IV.par;

function man(name: string, cart: string, flight: string,
             opts: { birdie?: number; holes?: number } = {}): PlayerCard {
  const gross = PAR.slice() as (number | null)[];
  if (opts.birdie) gross[opts.birdie - 1] = PAR[opts.birdie - 1] - 1;
  if (opts.holes != null) for (let i = opts.holes; i < 18; i++) gross[i] = null;
  return { name, courseHandicap: 0, handicapIndex: 20, cart, flight, gross } as PlayerCard;
}

/** Ten men, two flights of five, carts of two — the shape that broke. */
const FLIGHTED = [
  man("A1", "1", "A", { birdie: 1 }), man("A2", "1", "A"),
  man("A3", "2", "A", { birdie: 2 }), man("A4", "2", "A"),
  man("B1", "3", "B", { birdie: 3 }), man("B2", "3", "B"),
  man("B3", "4", "B", { birdie: 4 }), man("B4", "4", "B"),
  man("C1", "5", "A", { birdie: 5 }), man("C2", "5", "A"),
];

const settle = (cards: PlayerCard[]) =>
  E.skinsSettlement(cards, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
const board = (cards: PlayerCard[]) =>
  computeLeaderboard(cards, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);

/* ---- the two are the same answer ---- */

test("what the section shows is what the board paid", () => {
  const settled = settle(FLIGHTED);
  const results = board(FLIGHTED);
  for (const g of settled.groups) {
    for (const name of g.members) {
      const r = results.find((x) => x.name === name)!;
      assert.equal(r.contests.skins!.strokes, g.strokes,
        name + " — the section and his card must not disagree");
      assert.match(r.contests.skins!.detail, new RegExp("^" + g.count + " skin"));
    }
  }
});

test("FLIGHTS DO NOT DIVIDE SKINS, and the section no longer thinks they do", () => {
  // This is the exact round that used to have the board paying a skin to every
  // man while the tab printed "No skins at 5 players".
  const settled = settle(FLIGHTED);
  assert.equal(settled.format, "cart", "ten men is a cart round, not two five-man non-rounds");
  assert.equal(settled.reason, null, "it runs");
  assert.equal(settled.fieldSize, 10, "the WHOLE field, not the flight");
  assert.equal(settled.groups.length, 5, "all five carts, across both flights");
  assert.equal(settled.skinsWon, 5);

  const results = board(FLIGHTED);
  assert.ok(results.every((r) => r.contests.skins!.live), "and the board pays every one of them");
});

test("a man who did not finish is in neither", () => {
  // He birdies the 1st and walks in after twelve. On the old tab that birdie
  // won hole 1 for his group; the engine has always excluded him.
  const cards = [
    man("Walked in", "1", "", { birdie: 1, holes: 12 }), man("Partner", "1", ""),
    man("B1", "2", ""), man("B2", "2", ""),
    man("C1", "3", ""), man("C2", "3", ""),
    man("D1", "4", ""), man("D2", "4", ""),
  ];
  const settled = settle(cards);
  const results = board(cards);

  const one = settled.groups.find((g: any) => g.id === "1")!;
  assert.equal(one.count, 0, "his group wins nothing from a hole he abandoned");
  assert.deepEqual(one.members, ["Partner"], "and he is not counted a member");
  assert.deepEqual(settled.left, [{ name: "Walked in", why: "no full round" }],
    "he is named, with the reason — a group one man short must not look like a loss");
  assert.equal(results.find((r) => r.name === "Walked in")!.contests.skins!.detail, "no full round");
  assert.equal(settled.table.holes[0].wonBy, null, "hole 1 is won by nobody");
});

test("a man with no group is named too", () => {
  const cards = [
    man("Nomad", "", ""), man("A2", "1", ""), man("A1", "1", ""),
    man("B1", "2", ""), man("B2", "2", ""),
    man("C1", "3", ""), man("C2", "3", ""), man("D1", "4", ""),
  ];
  const settled = settle(cards);
  assert.deepEqual(settled.left, [{ name: "Nomad", why: "no group" }]);
});

/* ---- the cases where it does not run ---- */

test("too few players says so, and says the same thing on both", () => {
  const cards = [man("A", "1", ""), man("B", "1", ""), man("C", "2", ""), man("D", "2", "")];
  const settled = settle(cards);
  assert.equal(settled.reason, "tooFew");
  assert.equal(settled.format, null);
  assert.equal(settled.fieldSize, 4);
  assert.deepEqual(settled.groups, [], "nothing to show");
  const results = board(cards);
  assert.match(results[0].contests.skins!.detail, /no skins under 8 players/);
});

test("nobody with a group at all", () => {
  const cards = Array.from({ length: 8 }, (_, i) => man("P" + i, "", ""));
  const settled = settle(cards);
  assert.equal(settled.reason, "noneEntered");
  assert.equal(settled.left.length, 8);
});

test("one group out has nobody to play against", () => {
  const cards = Array.from({ length: 8 }, (_, i) => man("P" + i, "1", ""));
  const settled = settle(cards);
  assert.equal(settled.reason, "oneGroup");
  assert.equal(settled.groups.length, 1);
  assert.equal(settled.groups[0].count, 0, "and wins nothing for going round on its own");
  assert.equal(settled.groups[0].members.length, 8, "but the men in it are still named");
});

test("switched off is not the same as not running", () => {
  const off = E.skinsSettlement(FLIGHTED, ABERDEEN_TEE_IV,
    { ...DEFAULT_CONTESTS, skins: null });
  assert.equal(off.on, false);
  assert.equal(off.reason, "off");
  const results = computeLeaderboard(FLIGHTED, ABERDEEN_TEE_IV,
    { ...DEFAULT_CONTESTS, skins: null } as any);
  assert.equal(results[0].contests.skins, undefined, "absent from the card, not a zero");
});

/* ---- the figures the section prints ---- */

test("the settlement carries everything the old tab drew", () => {
  const settled = settle(FLIGHTED);
  assert.equal(typeof settled.skinValue, "number", "what a skin is worth today");
  assert.equal(settled.skinsWon, 5);
  assert.equal(settled.table.holes.length, 18, "hole by hole, all eighteen");
  assert.ok(settled.table.holes.every((h: any) => "wonBy" in h && "scores" in h));
  assert.ok(settled.groups.every((g: any) => g.members.length > 0), "with the men named");
  assert.equal(settled.config, DEFAULT_CONTESTS.skins, "and the pot and floor to explain it");
});

test("groups come out best first, so the table reads as a table", () => {
  const cards = [
    man("A1", "1", "", { birdie: 1 }), man("A2", "1", "", { birdie: 2 }),
    man("B1", "2", ""), man("B2", "2", ""),
    man("C1", "3", ""), man("C2", "3", ""),
    man("D1", "4", ""), man("D2", "4", ""),
  ];
  const counts = settle(cards).groups.map((g: any) => g.count);
  assert.deepEqual(counts.slice().sort((a: number, b: number) => b - a), counts);
});

test("a skin is worth the same to every man in the group", () => {
  const settled = settle(FLIGHTED);
  const results = board(FLIGHTED);
  const winners = settled.groups.filter((g: any) => g.count > 0);
  assert.ok(winners.length > 0);
  for (const g of winners) {
    const paid = g.members.map((n: string) =>
      results.find((r) => r.name === n)!.contests.skins!.strokes);
    assert.deepEqual(paid, g.members.map(() => g.strokes),
      "not divided among them — each takes the full amount");
  }
});
