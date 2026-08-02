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
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { scorePlayer, type PlayerCard } from "../src/scoring.ts";
import { cartSkins, teamSkins, type CartEntry, type TeamEntry } from "../src/skins.ts";

interface Reference {
  card: PlayerCard;
  courseHandicap: number;
  gross: number;
  net: number;
  strokesOff: number;
  final: number;
}

// name | course hcp | predicted | 18 gross | expected: gross, net, off, final
const REFERENCE: Reference[] = [
  ref("Dex",  23, 95, [5,5,4,6,6,6,7,3,5,4,4,6,3,6,6,6,6,5], 93, 70, 6.50, 63.50),
  ref("Alex",   18, 92, [5,5,3,6,5,5,6,3,5,7,5,5,4,4,6,6,3,7], 90, 72, 6.50, 65.50),
  ref("Finn",  26, 102,[5,6,6,7,5,4,7,4,7,6,7,5,3,5,5,6,4,7], 99, 73, 6.00, 67.00),
  ref("Boyd",  21, 94, [6,5,4,7,6,5,7,4,5,6,6,5,4,5,7,4,4,6], 96, 75, 6.50, 68.50),
  ref("Emmet",  14, 94, [6,5,3,7,7,6,5,3,5,4,5,5,3,5,6,7,3,6], 91, 77, 1.50, 75.50),
  ref("Grady", 34, 111,[7,6,4,9,7,7,7,5,5,6,7,7,3,8,6,7,3,9], 113,79, 2.00, 77.00),
  ref("Chip", 15, 89, [6,5,4,8,6,5,5,4,5,5,6,3,5,6,6,5,4,6], 94, 79, 0.50, 78.50),
  ref("Hoyt",  20, 97, [7,5,4,8,8,4,8,4,6,5,6,7,4,7,5,5,4,6], 103,82, 2.50, 79.50),
];

function ref(
  name: string, courseHandicap: number, predicted: number, gross: number[],
  grossTotal: number, net: number, strokesOff: number, final: number,
): Reference {
  return {
    card: { name, courseHandicap, predicted, gross },
    courseHandicap, gross: grossTotal, net, strokesOff, final,
  };
}

for (const r of REFERENCE) {
  test(`section 11 · ${r.card.name}`, () => {
    const result = scorePlayer(r.card, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
    assert.equal(result.courseHandicap, r.courseHandicap, "course handicap");
    assert.equal(result.gross, r.gross, "gross total");
    assert.equal(result.net, r.net, "capped net");
    assert.equal(-result.strokesEarned, r.strokesOff, "strokes off");
    assert.equal(result.final, r.final, "FINAL");
  });
}

// The result the brief calls out: a 113 finishing ahead of a 94.
test("section 11 · Grady's 113 beats Chip's 94 on net", () => {
  const grady = scorePlayer(REFERENCE.find((r) => r.card.name === "Grady")!.card, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const chip = scorePlayer(REFERENCE.find((r) => r.card.name === "Chip")!.card, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(grady.gross, 113);
  assert.equal(chip.gross, 94);
  assert.ok(grady.final! < chip.final!, "lower FINAL wins");
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

test("section 11 · Cart Skins reproduces 5, 9, 1, 3", () => {
  const { skins, carried } = cartSkins(CARTS, ABERDEEN_TEE_IV);
  assert.equal(skins.get("1"), 5, "Cart 1");
  assert.equal(skins.get("2"), 9, "Cart 2");
  assert.equal(skins.get("3"), 1, "Cart 3");
  assert.equal(skins.get("4"), 3, "Cart 4");
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
