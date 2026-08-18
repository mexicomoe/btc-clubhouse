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

/* ---- skins competes within a flight ---- */

/**
 * EIGHT MEN A FLIGHT, because skins is played inside a flight and the field
 * size that decides the format is the flight's own. A twelve-man event split
 * into three flights of four plays no skins at all — which is right: four men
 * are not a field, however many are in the car park.
 */
function flightOfEight(tag: string, better: (g: (number | null)[]) => void) {
  return Array.from({ length: 8 }, (_, i) =>
    card(tag + (i + 1), { flight: tag, cart: tag + (Math.floor(i / 2) + 1) },
         i === 0 ? better : () => {}));
}

test("carts only face carts in their own flight", () => {
  // Cart A1 wins every hole in flight A. Flight B has its own four carts.
  const field = [
    ...flightOfEight("A", (g) => { for (let i = 0; i < 18; i++) g[i] = (g[i] as number) - 1; }),
    ...flightOfEight("B", (g) => { g[0] = 3; }),
  ];
  const board = computeLeaderboard(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));

  assert.equal(by["A1"].skins, 18, "all eighteen inside flight A");
  assert.equal(by["A3"].skins, 0);
  // Flight B's skins are its own — A1's rout does not touch them.
  assert.equal(by["B1"].skins, 1, "his cart took the 1st in flight B");
  assert.equal(by["B3"].skins, 0);
});

test("a flight too small for skins plays none, and the others are unaffected", () => {
  const field = [
    ...flightOfEight("A", (g) => { g[0] = 3; }),
    card("B1", { flight: "B", cart: "B1" }),
    card("B2", { flight: "B", cart: "B2" }),
  ];
  const board = computeLeaderboard(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));
  assert.equal(by["A1"].contests.skins!.live, true, "flight A is eight and plays");
  assert.equal(by["B1"].contests.skins!.live, false);
  assert.match(by["B1"].contests.skins!.detail, /no skins under 8/);
});

test("a skin is worth what the FLIGHT won, not what the whole field won", () => {
  const config = DEFAULT_CONTESTS.skins!;
  // Flight A's cart takes all eighteen; flight B ties every hole and wins none.
  // The pot is divided inside each flight, so A's eighteen are worth the whole
  // pot between them and B's men are paid nothing at all.
  const field = [
    ...flightOfEight("A", (g) => { for (let i = 0; i < 18; i++) g[i] = (g[i] as number) - 1; }),
    ...flightOfEight("B", () => {}),
  ];
  const board = computeLeaderboard(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const a1 = board.find((r) => r.name === "A1")!;
  assert.equal(a1.contests.skins!.strokes, skinStrokes(18, config, 18));
  assert.equal(skinStrokes(18, config, 18), -4, "the whole pot, and no more");

  // Flight B tied all eighteen, so nobody there won anything.
  const b1 = board.find((r) => r.name === "B1")!;
  assert.equal(b1.contests.skins!.strokes, 0);
});

test("a flight with one group skips skins while the others play", () => {
  const oneGroup = Array.from({ length: 8 }, (_, i) =>
    card("C" + (i + 1), { flight: "C", cart: "C1" }));
  const field = [...flightOfEight("A", (g) => { g[0] = 3; }), ...oneGroup];
  const board = computeLeaderboard(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));
  assert.equal(by["A1"].contests.skins!.live, true);
  assert.equal(by["C1"].contests.skins!.live, false);
  assert.match(by["C1"].contests.skins!.detail, /only one group out/);
});

test("a cart number may repeat across flights without joining them", () => {
  // Cart 1 exists in both flights and they must not be pooled.
  const field = [
    ...flightOfEight("A", (g) => { g[0] = 3; }),
    ...flightOfEight("B", (g) => { g[0] = 3; }),
  ].map((c, i) => ({ ...c, cart: (i % 4) + 1 }));   // carts 1–4 in BOTH flights
  const board = computeLeaderboard(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const by = Object.fromEntries(board.map((r) => [r.name, r]));
  assert.equal(by["A1"].skins, 1, "cart 1 of flight A took the 1st");
  assert.equal(by["B1"].skins, 1, "and so did cart 1 of flight B, separately");
  assert.equal(by["A2"].skins, 0);
});

test("men in one cart may be in different flights", () => {
  // Nothing about a cart implies a flight, so this must simply work.
  const field = [
    ...flightOfEight("A", (g) => { g[0] = 3; }),
    ...flightOfEight("B", () => {}),
  ].map((c) => ({ ...c, cart: c.name.endsWith("1") ? 1 : c.cart }));
  const board = computeLeaderboard(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(board.length, 16, "everyone scored");
  const by = Object.fromEntries(board.map((r) => [r.name, r]));
  assert.equal(by["A1"].flight, "A");
  assert.equal(by["B1"].flight, "B");
  assert.equal(by["A1"].skins, 1, "cart 1 in flight A won the 1st");
  assert.equal(by["B1"].skins, 0, "cart 1 in flight B is a different cart");
});

/* ---- an unflighted field behaves exactly as before ---- */

test("no flights at all is one undivided field", () => {
  const field = [card("a", { cart: 1 }, (g) => { g[0] = 3; }), card("b", { cart: 2 })];
  const boards = computeFlights(field, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(boards.length, 1);
  assert.equal(boards[0].flight, "", "the undivided field");
  assert.deepEqual(boards[0].results.map((r) => r.rank), [1, 2]);
});
