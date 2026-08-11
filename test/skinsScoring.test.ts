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
 * A skin is worth `fairShare × groups / 18`: −0.18 over two groups, −0.36 over
 * four, −0.53 over six, −1.07 over twelve. That is the value at which an even
 * share of the eighteen comes to 1.6 whatever the size of the field. The total
 * is capped at 5.0, because the winning group's haul does
 * NOT shrink as the field grows — six or seven skins over four groups, six or
 * seven over twelve — so without a ceiling Skins would outgrow every other
 * contest in a large field.
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

// A skin is worth `fairShare × groups / 18` — the value at which an even share
// of the eighteen comes to the fair share at EVERY field size. So a skin is
// worth less in a small field, where a group's share of the eighteen is large,
// and more in a big one.
test("a skin is worth what makes an even share come to the fair share", () => {
  const config = DEFAULT_CONTESTS.skins!;
  assert.equal(config.fairShare, -1.6);

  const per = (g: number) => Number(skinValue(config, g).toFixed(2));
  assert.equal(per(2), -0.18, "two groups");
  assert.equal(per(4), -0.36, "four groups");
  assert.equal(per(6), -0.53, "six groups");
  assert.equal(per(12), -1.07, "twelve groups");
});

// This is the property the value exists to have, and the reason it is not
// `fairShare / groups`: that made a fair share worth 7.2 over two groups and
// 0.13 over twelve, which is the opposite of flat.
test("an even share of the eighteen is worth the same in any field", () => {
  const config = DEFAULT_CONTESTS.skins!;
  for (const groups of [2, 3, 6, 9, 18]) {
    const share = 18 / groups;              // a whole number for each of these
    const paid = Math.abs(share * skinValue(config, groups));
    assert.ok(Math.abs(paid - 1.6) < 0.05,
      `${groups} groups: an even share of ${share} paid ${paid.toFixed(2)}, not 1.6`);
  }
});

test("a skin is worth to the hundredth exactly what the tab prints", () => {
  // The figure on the Skins tab is the one that must multiply up. An unrounded
  // 0.1778 would print as 0.18 and pay as though it were not.
  const config = DEFAULT_CONTESTS.skins!;
  for (let groups = 1; groups <= 18; groups++) {
    const v = skinValue(config, groups);
    assert.equal(Math.round(v * 100) / 100, v, `${groups} groups`);
  }
});

test("winning more pays more, right up to the ceiling", () => {
  const config = DEFAULT_CONTESTS.skins!;
  for (const groups of [2, 4, 6, 8, 12]) {
    let last = 0;
    for (let n = 1; n <= 18; n++) {
      const v = skinStrokes(n, config, groups);
      assert.ok(v <= last, `${groups} groups: ${n} skins is worth at least ${n - 1}`);
      last = v;
    }
    assert.ok(skinStrokes(18, config, groups) < skinStrokes(1, config, groups),
      `${groups} groups: a rout still beats a single skin`);
  }
});

// At the field sizes this club plays the cap is slack — over four groups it
// sits past a rout of every hole, so nothing a group can actually do is held
// back. It exists for the large field, where the winner's haul does not shrink
// but the value of each skin keeps climbing.
test("the ceiling is 5.0", () => {
  const config = DEFAULT_CONTESTS.skins!;
  assert.equal(config.maxSkinStrokes, -5.0);

  assert.equal(skinStrokes(18, config, 4), -5.0, "a four-group rout reaches it");
  assert.ok(skinStrokes(13, config, 4) > -5.0, "but thirteen skins does not");
  assert.equal(skinStrokes(18, config, 12), -5.0, "and a big field cannot pass it");
  assert.equal(skinStrokes(5, config, 12), -5.0, "which at twelve groups is soon reached");
});

test("the same haul is worth more in a bigger field, until the ceiling", () => {
  const config = DEFAULT_CONTESTS.skins!;
  assert.ok(skinStrokes(4, config, 2) > skinStrokes(4, config, 4));
  assert.ok(skinStrokes(4, config, 4) > skinStrokes(4, config, 8));
});

test("every total is a clean tenth, at every field size", () => {
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
  // Two groups, so a skin is worth −0.18 and eighteen of them −3.2 — inside the
  // ceiling, because in a small field each skin is worth little.
  assert.equal(by["Strong"].contests.skins!.strokes, -3.2);
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
 * ceiling can be read straight off the winner where it bites at all.
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

// Two groups is inside the ceiling; four and six are held at it. A rout of every
// hole is the only thing that reaches it over four groups.
for (const [carts, eighteen, capped] of
     [[2, -3.2, false], [4, -5.0, true], [6, -5.0, true]] as const) {
  test(`a ${carts}-group rout pays ${eighteen}${capped ? ", held at the ceiling" : ""}`, () => {
    const board = computeLeaderboard(field(carts), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
    const winners = board.filter((r) => r.skins === 18);
    const losers = board.filter((r) => r.skins === 0);

    assert.equal(winners.length, 2, "both men in the winning cart");
    assert.equal(losers.length, (carts - 1) * 2, "everyone else");

    for (const r of winners) {
      assert.equal(r.contests.skins!.strokes, eighteen);
      assert.match(r.contests.skins!.detail, /18 skins for group 1/);
    }
    for (const r of losers) assert.equal(r.contests.skins!.strokes, 0);
    // Eighteen times what one skin is worth here, unless the ceiling took over.
    const uncapped = Math.round(18 * skinValue(DEFAULT_CONTESTS.skins!, carts) * 10) / 10;
    if (capped) assert.ok(uncapped < eighteen, "the ceiling is what is being read");
    else assert.equal(eighteen, uncapped);
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
  // Nine of eighteen over two groups is an even share, so each is paid the
  // 1.6 the fair share is worth — the property the value is built to have.
  assert.ok(level.every((r) => r.contests.skins!.strokes === -1.6), "and both paid the same");

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
