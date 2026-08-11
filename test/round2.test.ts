/**
 * Second test round — 31 July, real scores (build brief section 11).
 *
 * Eight cards, handicaps 14 to 34, same course (Aberdeen, Tee IV). A far wider
 * spread than section 9; an engine that reproduces both is proven on independent
 * data. Section 11 gives the course handicap directly, so the cards carry it
 * rather than a handicap index.
 *
 * These use the current ladders, including the retuned Bounce Back (section 12):
 * 3+/2/1 → −1.5/−1.0/−0.5. Nothing here is computed by the test.
 *
 * Call Your Number is gone; Watch the Birdie has replaced it. As in section 9,
 * the club recorded no picks for this round — the contest postdates it — so the
 * picks below are demo inputs rotating through the legal par 4s (front 1, 2, 5,
 * 6, 9 · back 10, 11, 12, 14, 15). Real picks would move these finals.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, birdiePickHoles, PICK_SLOTS,
         type PlayerCard, type BirdiePicks } from "../src/scoring.ts";
import { cartSkins, teamSkins, type CartEntry, type TeamEntry } from "../src/skins.ts";

interface Reference {
  card: PlayerCard;
  courseHandicap: number;
  gross: number;
  net: number;
  strokesOff: number;
  final: number;
}

/** The same mechanical rotation as section 9 — see the note there. */
function picks(i: number): BirdiePicks {
  const legal = birdiePickHoles(ABERDEEN_TEE_IV);
  return Object.fromEntries(
    PICK_SLOTS.map((s) => [s.key, legal[s.key][i % legal[s.key].length]])) as BirdiePicks;
}

// name | course hcp | picks | 18 gross | expected: gross, net, off, final
const REFERENCE: Reference[] = [
  ref("Dex",   23, picks(0), [5,5,4,6,6,6,7,3,5,4,4,6,3,6,6,6,6,5], 93, 70, 6.00, 64.00),
  ref("Alex",  18, picks(1), [5,5,3,6,5,5,6,3,5,7,5,5,4,4,6,6,3,7], 90, 72, 3.80, 68.20),
  ref("Finn",  26, picks(2), [5,6,6,7,5,4,7,4,7,6,7,5,3,5,5,6,4,7], 99, 73, 4.90, 68.10),
  ref("Boyd",  21, picks(3), [6,5,4,7,6,5,7,4,5,6,6,5,4,5,7,4,4,6], 96, 75, 3.30, 71.70),
  ref("Emmet", 14, picks(4), [6,5,3,7,7,6,5,3,5,4,5,5,3,5,6,7,3,6], 91, 77, -0.30, 77.30),
  ref("Chip",  15, picks(5), [6,5,4,8,6,5,5,4,5,5,6,3,5,6,6,5,4,6], 94, 79, 0.70, 78.30),
  ref("Grady", 34, picks(6), [7,6,4,9,7,7,7,5,5,6,7,7,3,8,6,7,3,9], 113,79, 0.00, 79.00),
  ref("Hoyt",  20, picks(7), [7,5,4,8,8,4,8,4,6,5,6,7,4,7,5,5,4,6], 103,82, 1.70, 80.30),
];

function ref(
  name: string, courseHandicap: number, picks: BirdiePicks, gross: number[],
  grossTotal: number, net: number, strokesOff: number, final: number,
): Reference {
  return {
    card: { name, courseHandicap, picks, gross },
    courseHandicap, gross: grossTotal, net, strokesOff, final,
  };
}

for (const r of REFERENCE) {
  test(`section 11 · ${r.card.name}`, () => {
    const result = scorePlayer(r.card, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
    assert.equal(result.courseHandicap, r.courseHandicap, "course handicap");
    assert.equal(result.gross, r.gross, "gross total");
    assert.equal(result.net, r.net, "capped net");
    // "+ 0" turns a negative zero back into zero: negating a strokesEarned of 0
    // gives -0, and strict equality says -0 is not 0. Grady earns exactly
    // nothing — eight triples and four answers cancel — so this is live.
    assert.equal(-result.strokesEarned + 0, r.strokesOff, "strokes off");
    assert.equal(result.final, r.final, "FINAL");
  });
}

// The point the brief calls out: nineteen shots of gross difference disappear
// into the handicap, and the contests — not the gross — decide who finishes
// ahead. Which of the two edges it IS pick-dependent (under Call Your Number
// Grady led; with these demo Birdie picks Chip does), so this pins the net
// parity, which no choice of picks can move.
test("section 11 · a 113 and a 94 come out level on net", () => {
  const grady = scorePlayer(REFERENCE.find((r) => r.card.name === "Grady")!.card, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const chip = scorePlayer(REFERENCE.find((r) => r.card.name === "Chip")!.card, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(grady.gross, 113);
  assert.equal(chip.gross, 94);
  assert.equal(grady.net, chip.net, "same net off a 19-shot gross gap");
  assert.equal(grady.net, 79);
});

// carts 1,1,2,2,3,3,4,4 in the order Alex, Boyd, Chip, Dex, Emmet, Finn, Grady, Hoyt
const CARTS: CartEntry[] = [
  { cart: 1, card: REFERENCE.find((r) => r.card.name === "Alex")!.card },
  { cart: 1, card: REFERENCE.find((r) => r.card.name === "Boyd")!.card },
  { cart: 2, card: REFERENCE.find((r) => r.card.name === "Chip")!.card },
  { cart: 2, card: REFERENCE.find((r) => r.card.name === "Dex")!.card },
  { cart: 3, card: REFERENCE.find((r) => r.card.name === "Emmet")!.card },
  { cart: 3, card: REFERENCE.find((r) => r.card.name === "Finn")!.card },
  { cart: 4, card: REFERENCE.find((r) => r.card.name === "Grady")!.card },
  { cart: 4, card: REFERENCE.find((r) => r.card.name === "Hoyt")!.card },
];

test("section 11 · Cart Skins reproduces 6, 9, 1, 2", () => {
  const { skins, carried } = cartSkins(CARTS, ABERDEEN_TEE_IV);
  assert.equal(skins.get("1"), 6, "Cart 1");
  assert.equal(skins.get("2"), 9, "Cart 2");
  assert.equal(skins.get("3"), 1, "Cart 3");
  assert.equal(skins.get("4"), 2, "Cart 4");
  const total = [...skins.values()].reduce((a, b) => a + b, 0);
  assert.equal(total + carried, 18, "eighteen skins accounted for");
  assert.equal(carried, 0);
});

// Team Skins is the same engine — membership is the only difference.
test("Team Skins with cart-sized membership matches Cart Skins", () => {
  // Same eight players, same groupings, expressed as teams instead of carts.
  const teams: TeamEntry[] = CARTS.map((e) => ({ card: e.card, team: (e.cart as number) }));
  const byTeam = teamSkins(teams, ABERDEEN_TEE_IV);
  const byCart = cartSkins(CARTS, ABERDEEN_TEE_IV);
  for (const id of ["1", "2", "3", "4"]) {
    assert.equal(byTeam.skins.get(id), byCart.skins.get(id), `group ${id} identical`);
  }
});

test("Team Skins on two teams of four", () => {
  // Alex, Boyd, Chip, Dex = Team A; Emmet, Finn, Grady, Hoyt = Team B.
  const A = ["Alex", "Boyd", "Chip", "Dex"];
  const teams: TeamEntry[] = REFERENCE.map((r) => ({
    card: r.card,
    team: A.includes(r.card.name) ? "A" : "B",
  }));
  const { skins, carried } = teamSkins(teams, ABERDEEN_TEE_IV);
  assert.equal(skins.get("A"), 13, "Team A");
  assert.equal(skins.get("B"), 5, "Team B");
  assert.equal(skins.get("A")! + skins.get("B")! + carried, 18, "eighteen accounted for");
  assert.equal(carried, 0);
});
