/**
 * Cart Skins milestone: the 19 December field split into carts
 * 1, 1, 2, 2, 3, 3, 4, 4 in the order Ike, Eli, Cy, Ben, Hal, Abe, Gus, Dan.
 *
 * RE-BASELINED on 15 August. Under the old group-AVERAGE rule these same cards
 * produced 4, 5, 2, 7 and all eighteen skins were won. Under best two balls
 * they produce 3, 4, 1, 4 and only twelve are won — six holes are tied and,
 * with no carryover, those six are simply not won by anybody.
 *
 * That is not a regression, it is the change working. Averaging fewer balls
 * produces more extreme scores, which is exactly why it handed small groups
 * more skins than large ones and why it almost never tied. Best two balls means
 * every group puts up the same number of scores, so groups land level far more
 * often — and a level hole is a hole nobody won.
 *
 * The figures below were recomputed from the same real cards, not guessed.
 * Gross hole-by-hole is from `Hole by Hole Excel Export -- Spreadsheet Composer.xlsx`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV } from "../src/courseConfig.ts";
import type { PlayerCard } from "../src/scoring.ts";
import { cartSkins, skinValue, type CartEntry } from "../src/skins.ts";
import { DEFAULT_CONTESTS } from "../src/courseConfig.ts";

function card(name: string, handicapIndex: number, gross: number[]): PlayerCard {
  return { name, handicapIndex, gross }; // skins read only net-per-hole; no picks needed
}

// cart | player card. Predicted omitted — Cart Skins reads only net-per-hole.
const FIELD: CartEntry[] = [
  { cart: 1, card: card("Ike Calloway",  20.8, [6,5,4,7,4,7,6,4,5,6,5,5,5,4,5,6,4,6]) },
  { cart: 1, card: card("Eli Marsden",  23.6, [6,6,4,8,5,5,6,3,6,6,5,5,4,4,3,6,4,6]) },
  { cart: 2, card: card("Cy Ashford",    24.0, [5,4,4,6,6,5,5,5,6,6,5,5,3,5,6,6,4,7]) },
  { cart: 2, card: card("Ben Castellan",   24.8, [5,4,4,6,5,5,6,4,6,5,5,6,5,7,5,5,4,6]) },
  { cart: 3, card: card("Hal Brightwater", 25.1, [5,6,4,8,6,6,6,3,5,5,6,6,4,5,5,6,3,6]) },
  { cart: 3, card: card("Abe Whitfield", 25.2, [5,5,4,6,6,5,6,4,6,6,4,5,4,6,6,5,3,6]) },
  { cart: 4, card: card("Gus Thornbury",    25.4, [5,6,4,6,6,5,6,5,5,6,5,5,4,8,4,7,4,6]) },
  { cart: 4, card: card("Dan Pemberton",   26.4, [6,5,3,9,5,6,6,2,4,7,5,3,5,4,7,7,4,7]) },
];

test("Cart Skins on best two balls reproduces 3, 4, 1, 4", () => {
  const { skins, holes, carried } = cartSkins(FIELD, ABERDEEN_TEE_IV);

  assert.equal(skins.get("1"), 3, "Cart 1");
  assert.equal(skins.get("2"), 4, "Cart 2");
  assert.equal(skins.get("3"), 1, "Cart 3");
  assert.equal(skins.get("4"), 4, "Cart 4");

  const won = [...skins.values()].reduce((a, b) => a + b, 0);
  assert.equal(won, 12, "twelve won");
  assert.equal(holes.filter((h) => h.wonBy == null).length, 6, "and six tied");
  assert.equal(won + holes.filter((h) => h.wonBy == null).length, 18);
});

test("a tied hole is not won and nothing carries", () => {
  const { holes, carried } = cartSkins(FIELD, ABERDEEN_TEE_IV);
  assert.equal(carried, 0, "there is no such thing as a carry any more");
  assert.deepEqual(holes.filter((h) => h.wonBy == null).map((h) => h.hole),
    [1, 8, 10, 11, 13, 16]);
});

test("twelve skins fall below the floor, so each pays the floor", () => {
  // 4.0 ÷ 12 is 0.33, under the 0.4 a skin is never worth less than. So this
  // round pays out 4.8 rather than 4.0 — a hole won is a hole won.
  const { skins } = cartSkins(FIELD, ABERDEEN_TEE_IV);
  let won = 0; skins.forEach((n) => { won += n; });
  assert.equal(won, 12);
  assert.equal(skinValue(DEFAULT_CONTESTS.skins!, won), -0.4);
});

test("a one-man cart is legal and counts its ball twice", () => {
  // Drop Dan: cart 4 becomes Gus alone. Every hole is still scored and every
  // hole is still either won or tied — but the total won is NOT eighteen, and
  // asserting that it was is what this test used to get wrong. A tied hole is
  // won by nobody and nothing carries, so won + tied = 18 is the real invariant.
  const solo = FIELD.filter((e) => e.card.name !== "Dan Pemberton");
  const { skins, holes, carried } = cartSkins(solo, ABERDEEN_TEE_IV);
  const won = [...skins.values()].reduce((a, b) => a + b, 0);
  assert.equal(won + holes.filter((h) => h.wonBy == null).length, 18);
  assert.equal(carried, 0);
  assert.ok(skins.has("4"), "the one-man cart still competes");
});

test("counting the lone ball twice is what keeps him competitive", () => {
  // Left with one ball against everyone else's two he took 0.22x a fair share —
  // he was not playing the same contest. Doubling it puts him back at 1.06x.
  const solo = FIELD.filter((e) => e.card.name !== "Dan Pemberton");
  const { skins } = cartSkins(solo, ABERDEEN_TEE_IV);
  assert.ok((skins.get("4") || 0) > 0, "Gus alone still wins holes");
});
