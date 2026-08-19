/**
 * Flights — the club splits the field and places each part separately.
 *
 * The line to hold: a flight changes who a man is MEASURED against, never what
 * he scores. The six individual contests are graded off fixed thresholds, so a
 * man's card is worth exactly the same whoever he is drawn with. Placings, the
 * card match that settles a tie, and Skins are the three things that look at
 * other players, and all three look only inside the flight.
 *
 * Flight is independent of cart. A man's team and his flight are different
 * groupings at this club, and nothing may assume they line up.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import {
  computeLeaderboard, computeFlights, flightOf, flightsInUse, sortFlights,
  scorePlayer, type PlayerCard,
} from "../src/scoring.ts";
import { skinStrokes } from "../src/skins.ts";

const PAR = ABERDEEN_TEE_IV.par;

function card(name: string, opts: Partial<PlayerCard> = {}, edit: (g: (number | null)[]) => void = () => {}): PlayerCard {
  const gross = PAR.slice() as (number | null)[];
  edit(gross);
  return { name, courseHandicap: 0, gross, picks: { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 }, ...opts };
}

/* ---- reading a flight ---- */

test("blank, absent or whitespace all mean the one undivided field", () => {
  assert.equal(flightOf(card("a")), "");
  assert.equal(flightOf(card("a", { flight: "" })), "");
  assert.equal(flightOf(card("a", { flight: "   " })), "");
  assert.equal(flightOf(card("a", { flight: null })), "");
  assert.equal(flightOf(card("a", { flight: " A " })), "A", "and it is trimmed");
});

test("flights read in a sensible order", () => {
  assert.deepEqual(sortFlights(["B", "A", ""]), ["", "A", "B"], "the undivided field first");
  // "Flight 10" after "Flight 2", not between "Flight 1" and "Flight 2".
  assert.deepEqual(sortFlights(["Flight 10", "Flight 2", "Flight 1"]),
    ["Flight 1", "Flight 2", "Flight 10"]);
});

test("the flights in use come off the field itself", () => {
  const field = [card("a", { flight: "B" }), card("b"), card("c", { flight: "A" }), card("d", { flight: "B" })];
  assert.deepEqual(flightsInUse(field), ["", "A", "B"]);
});

/* ---- a flight never changes a score ---- */

test("the six contests are worth the same in any flight", () => {
  const alone = scorePlayer(card("x"), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const flighted = scorePlayer(card("x", { flight: "A" }), ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(flighted.net, alone.net);
  assert.equal(flighted.strokesEarned, alone.strokesEarned);
  assert.equal(flighted.final, alone.final);
});

test("who a man is flighted with does not move his card", () => {
  const solo = computeLeaderboard([card("Solo", { flight: "A" })], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  // The same man, now sharing a flight with two much better rounds.
  const crowd = computeLeaderboard([
    card("Solo", { flight: "A" }),
    card("Better", { flight: "A" }, (g) => { for (let i = 0; i < 18; i++) g[i] = (g[i] as number) - 1; }),
    card("Best", { flight: "A" }, (g) => { for (let i = 0; i < 18; i++) g[i] = (g[i] as number) - 2; }),
  ], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const before = solo[0], after = crowd.find((r) => r.name === "Solo")!;
  assert.equal(after.final, before.final, "the final is untouched");
  assert.equal(after.rank, 3, "only his placing changed");
});

/* ---- placings are per flight ---- */

test("each flight is placed from one", () => {
  const field = [
    // A shot better on hole 4 — an AGONY ALLEY hole. On a zero base a birdie
    // on hole 1 changes nothing: the net does not reach the final and no
    // contest looks at that hole.
    card("A1", { flight: "A" }, (g) => { g[3] = (g[3] as number) - 1; }),
    card("A2", { flight: "A" }),
    card("B1", { flight: "B" }, (g) => { g[3] = (g[3] as number) - 1; }),
    card("B2", { flight: "B" }),
  ];
  const boards = computeFlights(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.deepEqual(boards.map((b) => b.flight), ["A", "B"]);
  for (const b of boards) {
    assert.deepEqual(b.results.map((r) => r.rank), [1, 2], `flight ${b.flight} placed from one`);
  }
  // The best round in flight B does not displace anyone in flight A.
  assert.equal(boards[0].results[0].name, "A1");
  assert.equal(boards[1].results[0].name, "B1");
});

test("a lower final in another flight does not take a place", () => {
  const field = [
    card("Modest", { flight: "A" }),
    card("Brilliant", { flight: "B" }, (g) => { for (let i = 0; i < 18; i++) g[i] = (g[i] as number) - 2; }),
  ];
  const board = computeLeaderboard(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));
  assert.ok(by["Brilliant"].final! < by["Modest"].final!, "a far better round");
  assert.equal(by["Modest"].rank, 1, "and it wins nothing in the other flight");
  assert.equal(by["Brilliant"].rank, 1);
});

test("ties are settled inside the flight", () => {
  // Two level cards in A, and a third in B that would have joined the tie.
  const field = [
    card("A even", { flight: "A" }),
    card("A better back", { flight: "A" }, (g) => { g[0] = 5; g[9] = 3; }),
    card("B even", { flight: "B" }),
  ];
  const boards = computeFlights(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const a = boards.find((b) => b.flight === "A")!.results;
  assert.equal(a[0].name, "A better back");
  assert.equal(a[0].cardMatch!.wonBy, "the back nine", "the card match ran within A");
  // B's man is alone in his flight, so nothing was settled against him.
  const b = boards.find((b) => b.flight === "B")!.results;
  assert.equal(b[0].rank, 1);
  assert.equal(b[0].cardMatch, undefined, "no tie to break");
});

/* ---- skins ignores flights entirely ---- */

/**
 * CLUBHOUSE SKINS IS PLAYED ACROSS THE WHOLE FIELD.
 *
 * The club's Saturday league runs its own flighted skins game. That is a
 * different contest and Clubhouse does not read its flights: settling skins
 * inside a flight quietly turned a sixteen-man group event into two eight-man
 * ones, and a twelve-man event split three ways played no skins at all.
 */

function flightOfEight(tag: string, better: (g: (number | null)[]) => void) {
  return Array.from({ length: 8 }, (_, i) =>
    card(tag + (i + 1), { flight: tag, cart: tag + (Math.floor(i / 2) + 1) },
         i === 0 ? better : () => {}));
}

test("carts face every cart in the round, not only their own flight", () => {
  // TWELVE men, so the field is still in the cart band — sixteen would make it
  // a team field, which is a different test below.
  //
  // Cart A1 wins every hole outright. If flights divided the contest, flight B
  // would have its own winner; they do not, so B wins nothing at all.
  const field = [
    ...Array.from({ length: 6 }, (_, i) =>
      card("A" + (i + 1), { flight: "A", cart: "A" + (Math.floor(i / 2) + 1) },
           i === 0 ? (g) => { for (let k = 0; k < 18; k++) g[k] = (g[k] as number) - 1; } : () => {})),
    ...Array.from({ length: 6 }, (_, i) =>
      card("B" + (i + 1), { flight: "B", cart: "B" + (Math.floor(i / 2) + 1) },
           i === 0 ? (g) => { g[0] = 3; } : () => {})),
  ];
  const board = computeLeaderboard(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));

  // Seventeen, not eighteen: B1's birdie on the 1st matched A1's cart exactly,
  // so that hole was TIED and nobody won it. Under flights it would have been a
  // skin for B in his own little contest.
  assert.equal(by["A1"].skins, 17, "everything except the hole he was matched on");
  assert.equal(by["B1"].skins, 0, "his birdie tied against the whole field, so won nothing");
});

test("two flights of four still play skins, because the FIELD is eight", () => {
  // The case that made this wrong: split into flights nobody reached the
  // eight-man floor, so a perfectly ordinary group event played no skins.
  const field = [
    ...Array.from({ length: 4 }, (_, i) =>
      card("A" + (i + 1), { flight: "A", cart: i + 1 }, i === 0 ? (g) => { g[0] = 3; } : () => {})),
    ...Array.from({ length: 4 }, (_, i) =>
      card("B" + (i + 1), { flight: "B", cart: i + 5 })),
  ];
  const board = computeLeaderboard(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));
  assert.equal(by["A1"].contests.skins!.live, true, "eight men is eight men");
  assert.equal(by["A1"].skins, 1);
});

test("sixteen men in two flights is a TEAM field, not two cart fields", () => {
  const field = [...flightOfEight("A", () => {}), ...flightOfEight("B", () => {})];
  field.forEach((c, i) => { (c as any).team = "T" + (Math.floor(i / 4) + 1); });
  const board = computeLeaderboard(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  // Sixteen in the field, so teams — even though each flight is only eight.
  assert.ok(board.some((r) => /for team T/.test(r.contests.skins!.detail)));
});

test("the pot is one pot for the round, not one per flight", () => {
  const field = [
    ...Array.from({ length: 6 }, (_, i) =>
      card("A" + (i + 1), { flight: "A", cart: "A" + (Math.floor(i / 2) + 1) },
           i === 0 ? (g) => { for (let k = 0; k < 18; k++) g[k] = (g[k] as number) - 1; } : () => {})),
    ...Array.from({ length: 6 }, (_, i) =>
      card("B" + (i + 1), { flight: "B", cart: "B" + (Math.floor(i / 2) + 1) })),
  ];
  const board = computeLeaderboard(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const a1 = board.find((r) => r.name === "A1")!;
  // Eighteen skins at the 0.4 floor — above ten the pot stops being fixed.
  assert.equal(a1.contests.skins!.strokes, -7.2);
});

test("A CART NUMBER IS NOW FIELD-WIDE — the same number in two flights is one cart", () => {
  // The consequence of dropping flights from skins, and the one that can bite
  // on a Saturday: cart 1 in flight A and cart 1 in flight B used to be two
  // separate groups. They are ONE group now, and are paid as one.
  //
  // Cart numbers written out rather than computed, because the whole point is
  // which men share one.
  const carts: Record<string, number> = {
    A1: 1, A2: 2, A3: 3, A4: 4, A5: 5, A6: 6,
    B1: 1, B2: 2, B3: 3, B4: 4, B5: 5, B6: 6,      // cart 1 exists in BOTH
  };
  const field = Object.keys(carts).map((name) =>
    card(name, { flight: name[0], cart: carts[name] },
         name === "A1" ? (g) => { g[0] = 3; } : () => {}));

  const board = computeLeaderboard(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));

  // A1 birdied the 1st. B1 shares his cart number and is in the other flight,
  // and is paid the same skin for it.
  assert.equal(by["A1"].skins, 1);
  assert.equal(by["B1"].skins, 1, "one cart number is one cart, whatever flight its men are in");
  assert.equal(by["A2"].skins, 0);
});

test("the placings are still divided by flight", () => {
  // Flights were only ever for this, and they still do it.
  const field = [
    card("A1", { flight: "A" }, (g) => { g[3] = (g[3] as number) - 1; }),
    card("A2", { flight: "A" }),
    card("B1", { flight: "B" }),
  ];
  const board = computeLeaderboard(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));
  assert.equal(by["A1"].rank, 1);
  assert.equal(by["A2"].rank, 2);
  assert.equal(by["B1"].rank, 1, "and B is placed from one in its own right");
});

/* ---- an unflighted field behaves exactly as before ---- */

test("no flights at all is one undivided field", () => {
  const field = [card("a", { cart: 1 }, (g) => { g[0] = 3; }), card("b", { cart: 2 })];
  const boards = computeFlights(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(boards.length, 1);
  assert.equal(boards[0].flight, "", "the undivided field");
  assert.deepEqual(boards[0].results.map((r) => r.rank), [1, 2]);
});
