/**
 * Skins scoring into FINAL — −0.2 a skin, capped at −1.5.
 *
 * Skins is the one contest that cannot be settled on a single card: it needs the
 * whole field, cart against cart. So it is added by `computeLeaderboard` rather
 * than by `scorePlayer`, and it sits outside `maxContestStrokes`, which governs
 * the six individual contests, with a cap of its own.
 *
 * The hole-by-hole engine (averaging, carryovers, the one-man cart) is covered
 * in cartSkins.test.ts. This is about what the skins are then worth.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { computeLeaderboard, type PlayerCard } from "../src/scoring.ts";
import { cartSkins, skinStrokes } from "../src/skins.ts";

const PAR = ABERDEEN_TEE_IV.par;

function card(name: string, cart: number | null, edit: (g: (number | null)[]) => void = () => {}): PlayerCard {
  const gross = PAR.slice() as (number | null)[];
  edit(gross);
  return { name, courseHandicap: 0, gross, cart: cart == null ? undefined : cart };
}

/* ---- the rate and the cap ---- */

test("a skin is worth −0.2, and the lot is capped at −1.5", () => {
  const config = DEFAULT_CONTESTS.skins!;
  assert.equal(config.perSkin, -0.2);
  assert.equal(config.cap, -1.5);

  assert.equal(skinStrokes(0, config), 0);
  assert.equal(skinStrokes(1, config), -0.2);
  assert.equal(skinStrokes(3, config), -0.6, "no floating-point crumbs");
  assert.equal(skinStrokes(7, config), -1.4, "just under the cap");
  assert.equal(skinStrokes(8, config), -1.5, "the cap bites");
  assert.equal(skinStrokes(18, config), -1.5, "and holds, however many are won");
});

test("every skin value is a multiple of a tenth", () => {
  const config = DEFAULT_CONTESTS.skins!;
  for (let n = 0; n <= 18; n++) {
    const v = skinStrokes(n, config);
    assert.equal(Math.round(v * 10) / 10, v, `${n} skins is a clean tenth`);
  }
});

/* ---- into the final ---- */

test("skins are added to the final and shown as a contest", () => {
  // Cart 1 wins every hole outright; cart 2 wins none.
  const strong = card("Strong", 1, (g) => { for (let i = 0; i < 18; i++) g[i] = (g[i] as number) - 1; });
  const weak = card("Weak", 2, (g) => { for (let i = 0; i < 18; i++) g[i] = (g[i] as number) + 1; });
  const board = computeLeaderboard([strong, weak], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));

  assert.equal(by["Strong"].skins, 18, "all eighteen");
  assert.equal(by["Strong"].contests.skins!.strokes, -1.5, "capped");
  assert.equal(by["Strong"].contests.skins!.live, true);
  assert.match(by["Strong"].contests.skins!.detail, /18 skins for cart 1/);

  assert.equal(by["Weak"].skins, 0);
  assert.equal(by["Weak"].contests.skins!.strokes, 0);

  // The final carries it: net + every contest including skins.
  for (const r of board) {
    const earned = Object.values(r.contests).reduce((a, c) => a + c.strokes, 0);
    assert.ok(Math.abs(r.strokesEarned - earned) < 1e-9, `${r.name} strokes add up`);
    assert.equal(r.final, Math.round((r.net! + r.strokesEarned) * 100) / 100, `${r.name} final`);
  }
});

test("skins moves the final by exactly what it is worth", () => {
  const one = card("One", 1, (g) => { g[0] = 3; });   // wins the 1st, nothing else
  const two = card("Two", 2);
  const withSkins = computeLeaderboard([one, two], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const without = computeLeaderboard([one, two], ABERDEEN_TEE_IV, { ...DEFAULT_CONTESTS, skins: null });

  const a = withSkins.find((r) => r.name === "One")!;
  const b = without.find((r) => r.name === "One")!;
  assert.equal(a.contests.skins!.strokes, skinStrokes(a.skins!, DEFAULT_CONTESTS.skins!));
  assert.equal(Math.round((b.final! - a.final!) * 10) / 10, -a.contests.skins!.strokes,
    "the difference is the skins and nothing else");
});

/* ---- the edges ---- */

test("a player with no cart scores zero from skins rather than breaking", () => {
  const carted = card("Carted", 1, (g) => { g[0] = 3; });
  const stray = card("No cart", null);
  const other = card("Other", 2);
  const board = computeLeaderboard([carted, stray, other], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));

  assert.equal(by["No cart"].contests.skins!.strokes, 0);
  assert.equal(by["No cart"].contests.skins!.live, false, "shown as not competing");
  assert.equal(by["No cart"].contests.skins!.detail, "no cart");
  assert.ok(by["No cart"].final != null, "and the round still scores");
  // The carts that did enter are unaffected by him.
  assert.equal(by["Carted"].skins, 1);
});

test("nobody in a cart at all leaves the round scoring as before", () => {
  const a = card("A", null), b = card("B", null);
  const board = computeLeaderboard([a, b], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  for (const r of board) {
    assert.equal(r.contests.skins, undefined, "no skins line at all");
    assert.ok(r.final != null);
  }
});

test("skins switched off scores nothing and reads no cart", () => {
  const one = card("One", 1, (g) => { g[0] = 3; });
  const two = card("Two", 2);
  const board = computeLeaderboard([one, two], ABERDEEN_TEE_IV, { ...DEFAULT_CONTESTS, skins: null });
  for (const r of board) assert.equal(r.contests.skins, undefined);
});

test("skins still carrying after the 18th simply vanish", () => {
  // Two identical carts: every hole ties, so the pot carries all the way out.
  const a = card("A", 1), b = card("B", 2);
  const table = cartSkins([{ card: a, cart: 1 }, { card: b, cart: 2 }], ABERDEEN_TEE_IV);
  assert.equal(table.skins.get("1"), 0);
  assert.equal(table.skins.get("2"), 0);
  assert.equal(table.carried, 18, "all eighteen carried off the end");

  // And nobody is paid for them.
  const board = computeLeaderboard([a, b], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  for (const r of board) assert.equal(r.contests.skins!.strokes, 0);
});

test("a one-man cart is legal and needs no blind partner", () => {
  const solo = card("Solo", 1, (g) => { g[0] = 3; });
  const pairA = card("Pair A", 2);
  const pairB = card("Pair B", 2);
  const board = computeLeaderboard([solo, pairA, pairB], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));
  assert.equal(by["Solo"].skins, 1, "the one-man cart competes and wins its hole");
  // Both men in a cart are paid the cart's skins, not a share of them.
  assert.equal(by["Pair A"].skins, by["Pair B"].skins);
});
