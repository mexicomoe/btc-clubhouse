/**
 * Skins scoring into FINAL — −0.2 a skin, capped at one cart's share.
 *
 * Skins is the one contest that cannot be settled on a single card: it needs the
 * whole field, cart against cart. So it is added by `computeLeaderboard` rather
 * than by `scorePlayer`, and it sits outside `maxContestStrokes`, which governs
 * the six individual contests, with a cap of its own.
 *
 * That cap has to scale with the field. Eighteen skins split two ways clear any
 * fixed ceiling both ways, so a fixed cap pays both carts the same and the
 * contest decides nothing. The cap is therefore an even share of the eighteen —
 * (18 ÷ carts) × −0.2 — which is −1.8 over two carts, −0.9 over four, −0.6 over
 * six, and tightens as the field grows.
 *
 * The hole-by-hole engine (averaging, carryovers, the one-man cart) is covered
 * in cartSkins.test.ts. This is about what the skins are then worth.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { computeLeaderboard, type PlayerCard } from "../src/scoring.ts";
import { cartSkins, skinStrokes, skinCap } from "../src/skins.ts";

const PAR = ABERDEEN_TEE_IV.par;

function card(name: string, cart: number | null, edit: (g: (number | null)[]) => void = () => {}): PlayerCard {
  const gross = PAR.slice() as (number | null)[];
  edit(gross);
  return { name, courseHandicap: 0, gross, cart: cart == null ? undefined : cart };
}

/* ---- the rate and the cap ---- */

test("a skin is worth −0.2", () => {
  const config = DEFAULT_CONTESTS.skins!;
  assert.equal(config.perSkin, -0.2);
  assert.equal(config.capSkins, 18, "eighteen skins are on offer");

  assert.equal(skinStrokes(0, config, 4), 0);
  assert.equal(skinStrokes(1, config, 4), -0.2);
  // Three skins in a six-cart field: −0.6, and exactly at that field's cap.
  assert.equal(skinStrokes(3, config, 6), -0.6, "no floating-point crumbs");
});

// Math.round takes −4.5 to −4 but 4.5 to 5, so a cap and a credit of the same
// size would round different ways. Every value rounds on its magnitude instead.
test("a half rounds the same way either side of zero", () => {
  const config = DEFAULT_CONTESTS.skins!;
  // Eight carts: 18/8 = 2.25 skins each, × −0.2 = −0.45, which must land on −0.5.
  assert.equal(skinCap(config, 8), -0.5);
  assert.equal(skinCap(config, 16), -0.2, "18/16 × −0.2 = −0.225");
});

// A fixed cap breaks with a small field: eighteen skins split two ways clear
// any fixed ceiling both ways, so the contest pays both carts the same and
// decides nothing. The cap is one cart's even share of the eighteen instead.
test("the cap is one cart's share of the eighteen, so it tightens with the field", () => {
  const config = DEFAULT_CONTESTS.skins!;
  assert.equal(skinCap(config, 2), -1.8, "two carts");
  assert.equal(skinCap(config, 4), -0.9, "four carts");
  assert.equal(skinCap(config, 6), -0.6, "six carts");
  assert.equal(skinCap(config, 3), -1.2);
  assert.equal(skinCap(config, 9), -0.4);
  // Rounded to a tenth like every other value in the game.
  for (let carts = 1; carts <= 12; carts++) {
    const cap = skinCap(config, carts);
    assert.equal(Math.round(cap * 10) / 10, cap, `${carts} carts is a clean tenth`);
  }
});

test("two carts are separated rather than both being pinned at the cap", () => {
  const config = DEFAULT_CONTESTS.skins!;
  // The split that used to break it: 10 skins against 8. Under a fixed −1.5
  // both came out at −1.5. Under the field's own cap of −1.8 they differ.
  assert.equal(skinStrokes(10, config, 2), -1.8, "capped, but at the field's cap");
  assert.equal(skinStrokes(8, config, 2), -1.6, "and this one is not capped at all");
  assert.notEqual(skinStrokes(10, config, 2), skinStrokes(8, config, 2),
    "the contest still decides something");
});

test("the cap bites at each field size", () => {
  const config = DEFAULT_CONTESTS.skins!;
  // Two carts: an even 9 each is exactly the cap.
  assert.equal(skinStrokes(9, config, 2), -1.8);
  assert.equal(skinStrokes(18, config, 2), -1.8, "and holds above it");
  // Four carts: the even share is 4.5 skins, so 5 is over and 4 is under.
  assert.equal(skinStrokes(4, config, 4), -0.8, "under the cap");
  assert.equal(skinStrokes(5, config, 4), -0.9, "over it, so capped");
  // Six carts: an even 3 each.
  assert.equal(skinStrokes(3, config, 6), -0.6);
  assert.equal(skinStrokes(4, config, 6), -0.6, "capped");
  assert.equal(skinStrokes(2, config, 6), -0.4, "under");
});

test("every skin value is a multiple of a tenth, at every field size", () => {
  const config = DEFAULT_CONTESTS.skins!;
  for (let carts = 1; carts <= 12; carts++) {
    for (let n = 0; n <= 18; n++) {
      const v = skinStrokes(n, config, carts);
      assert.equal(Math.round(v * 10) / 10, v, `${n} skins over ${carts} carts`);
    }
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
  // Two carts, so the cap is one cart's share of the eighteen: −1.8.
  assert.equal(by["Strong"].contests.skins!.strokes, -1.8, "capped at the field's cap");
  assert.equal(by["Strong"].contests.skins!.live, true);
  assert.match(by["Strong"].contests.skins!.detail, /18 skins for cart 1/);
  assert.match(by["Strong"].contests.skins!.detail, /capped/, "and says so");

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
  assert.equal(a.contests.skins!.strokes, skinStrokes(a.skins!, DEFAULT_CONTESTS.skins!, 2));
  assert.equal(Math.round((b.final! - a.final!) * 10) / 10, -a.contests.skins!.strokes,
    "the difference is the skins and nothing else");
});

/* ---- a real field, at two, four and six carts ---- */

/**
 * Build a field of `carts` carts, two men each, where cart 1 wins every hole
 * outright and the rest win nothing — the most lopsided round there is, so the
 * cap is certain to bite and can be read straight off the winner.
 */
function field(carts: number): PlayerCard[] {
  const players: PlayerCard[] = [];
  for (let c = 1; c <= carts; c++) {
    for (let seat = 0; seat < 2; seat++) {
      players.push(card(`Cart ${c} seat ${seat}`, c, (g) => {
        // Cart 1 goes round in one under par a hole; everyone else in one over.
        for (let i = 0; i < 18; i++) g[i] = (g[i] as number) + (c === 1 ? -1 : 1);
      }));
    }
  }
  return players;
}

for (const [carts, cap] of [[2, -1.8], [4, -0.9], [6, -0.6]] as const) {
  test(`a ${carts}-cart field caps skins at ${cap}`, () => {
    const board = computeLeaderboard(field(carts), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
    const winners = board.filter((r) => r.skins === 18);
    const losers = board.filter((r) => r.skins === 0);

    assert.equal(winners.length, 2, "both men in the winning cart");
    assert.equal(losers.length, (carts - 1) * 2, "everyone else");

    for (const r of winners) {
      assert.equal(r.contests.skins!.strokes, cap, "capped at this field's cap");
      assert.match(r.contests.skins!.detail, /capped/);
    }
    for (const r of losers) {
      assert.equal(r.contests.skins!.strokes, 0);
      assert.doesNotMatch(r.contests.skins!.detail, /capped/, "nothing to cap");
    }
    // The cap really is the number the field size implies.
    assert.equal(skinCap(DEFAULT_CONTESTS.skins!, carts), cap);
  });
}

test("a two-cart field is decided rather than levelled", () => {
  // Cart 1 takes the odd holes, cart 2 the even ones, so the skins split 9–9...
  const even = [
    card("One A", 1, (g) => { for (let i = 0; i < 18; i += 2) g[i] = (g[i] as number) - 1; }),
    card("Two A", 2, (g) => { for (let i = 1; i < 18; i += 2) g[i] = (g[i] as number) - 1; }),
  ];
  const level = computeLeaderboard(even, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.deepEqual(level.map((r) => r.skins).sort(), [9, 9], "nine skins each");
  assert.ok(level.every((r) => r.contests.skins!.strokes === -1.8), "and both at the cap");

  // ...but tilt it and the contest separates them, which a fixed −1.5 could not.
  const tilted = [
    card("One B", 1, (g) => { for (let i = 0; i < 18; i += 2) g[i] = (g[i] as number) - 2; }),
    card("Two B", 2, (g) => { for (let i = 5; i < 18; i += 2) g[i] = (g[i] as number) - 1; }),
  ];
  const board = computeLeaderboard(tilted, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const strokes = board.map((r) => r.contests.skins!.strokes);
  assert.notEqual(strokes[0], strokes[1], "the two carts are paid differently");
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
