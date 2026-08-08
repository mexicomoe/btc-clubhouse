/**
 * Skins scoring into FINAL — what a skin is worth, and to whom.
 *
 * Skins is the one contest that cannot be settled on a single card: it needs the
 * whole field, group against group. So it is added by `computeLeaderboard`
 * rather than by `scorePlayer`, and it sits outside `maxContestStrokes`, which
 * governs the six individual contests.
 *
 * A "group" is whatever the round is played in — carts of two some weeks, teams
 * of four others. The engine does not care which; only the membership changes.
 *
 * A skin is worth `skinBudget / groups`: −0.40 over two groups, −0.20 over four,
 * −0.13 over six, −0.10 over eight. There is NO ceiling. A cap did almost
 * nothing at four groups and, when it did bite, it held back the group that had
 * gone out and won the most holes.
 *
 * The hole-by-hole engine (averaging, carryovers, the group of one) is covered
 * in cartSkins.test.ts. This is about what the skins are then worth.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { computeLeaderboard, type PlayerCard } from "../src/scoring.ts";
import { cartSkins, skinStrokes, skinValue } from "../src/skins.ts";

const PAR = ABERDEEN_TEE_IV.par;

function card(name: string, cart: number | null, edit: (g: (number | null)[]) => void = () => {}): PlayerCard {
  const gross = PAR.slice() as (number | null)[];
  edit(gross);
  return { name, courseHandicap: 0, gross, cart: cart == null ? undefined : cart };
}

/* ---- what a skin is worth ---- */

// A skin is worth `skinBudget / groups`, so it is worth more in a small field
// and less in a large one. There is NO ceiling: a cap did almost nothing at
// four groups and, when it did bite, it held back the group that had gone out
// and won the most holes — which is the opposite of what the contest is for.
test("a skin is worth the budget divided by the groups out", () => {
  const config = DEFAULT_CONTESTS.skins!;
  assert.equal(config.skinBudget, -0.8);

  const per = (g: number) => Number(skinValue(config, g).toFixed(2));
  assert.equal(per(2), -0.40, "two groups");
  assert.equal(per(4), -0.20, "four groups");
  assert.equal(per(6), -0.13, "six groups");
  assert.equal(per(8), -0.10, "eight groups");
});

test("winning more always pays more — there is no ceiling", () => {
  const config = DEFAULT_CONTESTS.skins!;
  for (const groups of [2, 4, 6, 8]) {
    let last = 0;
    for (let n = 1; n <= 18; n++) {
      const v = skinStrokes(n, config, groups);
      assert.ok(v <= last, `${groups} groups: ${n} skins is worth at least ${n - 1}`);
      last = v;
    }
    // The old cap would have flattened the top of that range. Nothing does now.
    assert.ok(skinStrokes(18, config, groups) < skinStrokes(9, config, groups),
      `${groups} groups: a rout still beats an even split`);
  }
});

test("the same haul is worth less in a bigger field", () => {
  const config = DEFAULT_CONTESTS.skins!;
  const six = skinStrokes(6, config, 2);
  assert.ok(six < skinStrokes(6, config, 4));
  assert.ok(skinStrokes(6, config, 4) < skinStrokes(6, config, 8));
});

test("every total is a clean tenth, at every field size", () => {
  // The per-skin figure is kept whole and only the TOTAL is rounded, so six
  // groups at −0.1333 a skin still pays in tenths rather than hundredths.
  const config = DEFAULT_CONTESTS.skins!;
  for (let groups = 1; groups <= 12; groups++) {
    for (let n = 0; n <= 18; n++) {
      const v = skinStrokes(n, config, groups);
      assert.equal(Math.round(v * 10) / 10, v, `${n} skins over ${groups} groups`);
    }
  }
});

test("nought skins is nought, never a negative nought", () => {
  const config = DEFAULT_CONTESTS.skins!;
  for (const groups of [1, 2, 4, 8]) assert.equal(skinStrokes(0, config, groups), 0);
});

/* ---- into the final ---- */

test("skins are added to the final and shown as a contest", () => {
  // Cart 1 wins every hole outright; cart 2 wins none.
  const strong = card("Strong", 1, (g) => { for (let i = 0; i < 18; i++) g[i] = (g[i] as number) - 1; });
  const weak = card("Weak", 2, (g) => { for (let i = 0; i < 18; i++) g[i] = (g[i] as number) + 1; });
  const board = computeLeaderboard([strong, weak], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));

  assert.equal(by["Strong"].skins, 18, "all eighteen");
  // Two groups, so a skin is worth −0.40 and eighteen of them −7.2. Nothing held back.
  assert.equal(by["Strong"].contests.skins!.strokes, -7.2);
  assert.equal(by["Strong"].contests.skins!.live, true);
  assert.match(by["Strong"].contests.skins!.detail, /18 skins for group 1/);

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

for (const [carts, eighteen] of [[2, -7.2], [4, -3.6], [6, -2.4]] as const) {
  test(`a ${carts}-group rout pays ${eighteen}, with nothing held back`, () => {
    const board = computeLeaderboard(field(carts), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
    const winners = board.filter((r) => r.skins === 18);
    const losers = board.filter((r) => r.skins === 0);

    assert.equal(winners.length, 2, "both men in the winning cart");
    assert.equal(losers.length, (carts - 1) * 2, "everyone else");

    for (const r of winners) {
      assert.equal(r.contests.skins!.strokes, eighteen, "all eighteen, uncapped");
      assert.match(r.contests.skins!.detail, /18 skins for group 1/);
    }
    for (const r of losers) assert.equal(r.contests.skins!.strokes, 0);
    // Which is exactly eighteen times what one skin is worth in this field.
    assert.equal(eighteen, Math.round(18 * skinValue(DEFAULT_CONTESTS.skins!, carts) * 10) / 10);
  });
}

test("a two-group field is decided rather than levelled", () => {
  // Cart 1 takes the odd holes, cart 2 the even ones, so the skins split 9–9...
  const even = [
    card("One A", 1, (g) => { for (let i = 0; i < 18; i += 2) g[i] = (g[i] as number) - 1; }),
    card("Two A", 2, (g) => { for (let i = 1; i < 18; i += 2) g[i] = (g[i] as number) - 1; }),
  ];
  const level = computeLeaderboard(even, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.deepEqual(level.map((r) => r.skins).sort(), [9, 9], "nine skins each");
  assert.ok(level.every((r) => r.contests.skins!.strokes === -3.6), "and both paid the same");

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
  assert.equal(by["No cart"].contests.skins!.detail, "no group");
  assert.ok(by["No cart"].final != null, "and the round still scores");
  // The carts that did enter are unaffected by him.
  assert.equal(by["Carted"].skins, 1);
});

// One cart is nobody to play against: uncontested it wins all eighteen holes by
// default and would be paid the cap for going round on its own.
test("one cart out means no skins at all", () => {
  const a = card("A", 1, (g) => { g[0] = 3; });
  const b = card("B", 1);
  const board = computeLeaderboard([a, b], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);

  for (const r of board) {
    assert.equal(r.contests.skins!.strokes, 0, `${r.name} is paid nothing`);
    assert.equal(r.contests.skins!.live, false, "and it is shown as not running");
    assert.equal(r.contests.skins!.detail, "only one group out");
    assert.equal(r.skins, undefined, "no skin count to report");
  }
  // The rest of the round is untouched.
  assert.ok(board.every((r) => r.final != null));
});

test("a second cart is all it takes for skins to run", () => {
  const a = card("A", 1, (g) => { g[0] = 3; });
  const alone = computeLeaderboard([a, card("B", 1)], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const paired = computeLeaderboard([a, card("B", 2)], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);

  assert.equal(alone.find((r) => r.name === "A")!.contests.skins!.live, false);
  assert.equal(paired.find((r) => r.name === "A")!.contests.skins!.live, true);
  assert.equal(paired.find((r) => r.name === "A")!.skins, 1, "and the hole is won");
});

test("one cart among uncarted players still pays nobody", () => {
  // The trap: carted men would take the cap while the rest took nothing.
  const board = computeLeaderboard(
    [card("Carted", 1, (g) => { g[0] = 3; }), card("Loose", null)],
    ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));
  assert.equal(by["Carted"].contests.skins!.strokes, 0, "no free cap for the only cart");
  assert.equal(by["Carted"].contests.skins!.detail, "only one group out");
  assert.equal(by["Loose"].contests.skins!.strokes, 0);
  assert.equal(by["Loose"].contests.skins!.detail, "no group");
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
