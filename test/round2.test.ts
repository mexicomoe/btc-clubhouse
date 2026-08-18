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
  final: number;
}

/** The same mechanical rotation as section 9 — see the note there. */
function picks(i: number): BirdiePicks {
  const legal = birdiePickHoles(ABERDEEN_TEE_IV);
  // Stepped around what is taken: the two par 3 slots are handed the identical
  // three holes and so are the par 5s.
  const taken: number[] = [];
  const out: Record<string, number> = {};
  for (const s of PICK_SLOTS) {
    const free = legal[s.key].filter((h) => !taken.includes(h));
    out[s.key] = free[i % free.length];
    taken.push(out[s.key]);
  }
  return out as BirdiePicks;
}

// name | course hcp | picks | 18 gross | expected: gross, net, final
const REFERENCE: Reference[] = [
  ref("Dex",   23, picks(0), [5,5,4,6,6,6,7,3,5,4,4,6,3,6,6,6,6,5], 93, 70, -2.5),
  ref("Alex",  18, picks(1), [5,5,3,6,5,5,6,3,5,7,5,5,4,4,6,6,3,7], 90, 72, -2.0),
  ref("Finn",  26, picks(2), [5,6,6,7,5,4,7,4,7,6,7,5,3,5,5,6,4,7], 99, 73, -4.0),
  ref("Boyd",  21, picks(3), [6,5,4,7,6,5,7,4,5,6,6,5,4,5,7,4,4,6], 96, 75, -2.0),
  ref("Emmet", 14, picks(4), [6,5,3,7,7,6,5,3,5,4,5,5,3,5,6,7,3,6], 91, 77, 2.0),
  ref("Chip",  15, picks(5), [6,5,4,8,6,5,5,4,5,5,6,3,5,6,6,5,4,6], 94, 79, 4.5),
  ref("Grady", 34, picks(6), [7,6,4,9,7,7,7,5,5,6,7,7,3,8,6,7,3,9], 113,79, 6.0),
  ref("Hoyt",  20, picks(7), [7,5,4,8,8,4,8,4,6,5,6,7,4,7,5,5,4,6], 103,82, 2.5),
];

function ref(
  name: string, courseHandicap: number, picks: BirdiePicks, gross: number[],
  grossTotal: number, net: number, final: number,
): Reference {
  return { card: { name, courseHandicap, picks, gross }, courseHandicap, gross: grossTotal, net, final };
}

for (const r of REFERENCE) {
  test(`section 11 · ${r.card.name}`, () => {
    const result = scorePlayer(r.card, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
    assert.equal(result.courseHandicap, r.courseHandicap, "course handicap");
    assert.equal(result.gross, r.gross, "gross total");
    assert.equal(result.net, r.net, "capped net");
    assert.equal(result.final, r.final, "FINAL");
    // ON A ZERO BASE THESE ARE THE SAME NUMBER. The contests no longer come off
    // a net total, so what a man earned IS what he finished on. They used to
    // differ by his whole net score, which is why it is worth pinning.
    assert.equal(result.strokesEarned, result.final, "earned is the final");
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

// RE-BASELINED. Under the old group-average rule these four carts produced
// 6, 9, 1, 2 and won all eighteen holes between them. On best two balls they
// produce 5, 3, 1, 1 — TEN won and EIGHT tied.
//
// Eight tied out of eighteen is the sharpest illustration in the suite of what
// changed. Averaging fewer balls produced more extreme group scores, so two
// groups almost never landed level; best two balls has every group put up the
// same number of scores, and on a par-72 course with handicaps 14 to 34 they
// land level very often indeed. A tied hole is won by nobody and nothing
// carries, so nearly half the round pays out to no one — and the fixed pot
// makes each of the ten survivors worth proportionally more.
test("section 11 · Cart Skins on best two balls reproduces 5, 3, 1, 1", () => {
  const { skins, holes, carried } = cartSkins(CARTS, ABERDEEN_TEE_IV);
  assert.equal(skins.get("1"), 5, "Cart 1");
  assert.equal(skins.get("2"), 3, "Cart 2");
  assert.equal(skins.get("3"), 1, "Cart 3");
  assert.equal(skins.get("4"), 1, "Cart 4");
  const won = [...skins.values()].reduce((a, b) => a + b, 0);
  assert.equal(won, 10);
  assert.equal(holes.filter((h) => h.wonBy == null).length, 8, "eight holes tied");
  assert.equal(won + holes.filter((h) => h.wonBy == null).length, 18,
    "every hole is won or tied, and none carries");
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
  const { skins, holes, carried } = teamSkins(teams, ABERDEEN_TEE_IV);
  assert.equal(skins.get("A"), 10, "Team A");
  assert.equal(skins.get("B"), 4, "Team B");
  // Fewer than eighteen won, and that is the change working: four holes were
  // level on best two balls, and a level hole is won by nobody.
  assert.equal(skins.get("A")! + skins.get("B")!, 14);
  assert.equal(holes.filter((h) => h.wonBy == null).length, 4);
  assert.equal(carried, 0);
});
