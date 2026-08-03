/**
 * Cart Skins milestone: the 19 December field split into carts
 * 1, 1, 2, 2, 3, 3, 4, 4 in the order Ike, Eli, Cy, Ben, Hal, Abe, Gus, Dan
 * must produce skins 4, 5, 2, 7 — eighteen in total, all accounted for.
 *
 * Gross hole-by-hole is from `Hole by Hole Excel Export -- Spreadsheet Composer.xlsx`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV } from "../src/courseConfig.ts";
import type { PlayerCard } from "../src/scoring.ts";
import { cartSkins, type CartEntry } from "../src/skins.ts";

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

test("Cart Skins reproduces 4, 5, 2, 7", () => {
  const { skins, carried } = cartSkins(FIELD, ABERDEEN_TEE_IV);

  assert.equal(skins.get("1"), 4, "Cart 1");
  assert.equal(skins.get("2"), 5, "Cart 2");
  assert.equal(skins.get("3"), 2, "Cart 3");
  assert.equal(skins.get("4"), 7, "Cart 4");

  const total = [...skins.values()].reduce((a, b) => a + b, 0);
  assert.equal(total + carried, 18, "all eighteen skins accounted for");
  assert.equal(carried, 0, "no skin left carrying at the end");
});

test("a one-man cart is legal and competes on its own average", () => {
  // Drop Dan: cart 4 becomes Gus alone. It must still score every hole and the
  // eighteen skins must still all be accounted for.
  const solo = FIELD.filter((e) => e.card.name !== "Dan Pemberton");
  const { skins, carried } = cartSkins(solo, ABERDEEN_TEE_IV);
  const total = [...skins.values()].reduce((a, b) => a + b, 0);
  assert.equal(total + carried, 18, "still eighteen skins");
  assert.ok(skins.has("4"), "the one-man cart still competes");
});
