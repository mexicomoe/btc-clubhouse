/**
 * The minigame boards — a top-five table for each contest, and every Hit List
 * duel in the round.
 *
 * WHY THEY EXIST. With eight contests the screen had room for the final and
 * nothing else, and a contest was a number in a column on a detail screen
 * nobody opened. Four leaves room to say who won each one, so a man who
 * finished eleventh overall can still have taken Agony Alley and hear about it.
 *
 * TWO THINGS ARE LOAD-BEARING HERE and neither is the arithmetic.
 *
 * THE DEPTH IS A FLOOR, NEVER A CEILING. Every man level with the last one
 * shown is shown too, and the board says so. Cutting a tie off at five looks
 * broken, and ties are the norm rather than the exception: on an average round
 * 2.5 men share the top of Agony Alley, 2.8 the Hit List and 4.3 Team Skins.
 *
 * A TIE IS BROKEN ON THE CONTEST'S OWN TERMS. `placeField` settles the round on
 * a match of cards, which says nothing about who played hole 4 better, so each
 * board carries its own order of tiebreaks and names the one that decided it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { computeLeaderboard, contestBoard, hitListDuels, ordinal,
         type PlayerCard, type PlayerResult } from "../src/scoring.ts";
import "../display.js";

const D = (globalThis as { ClubhouseDisplay: any }).ClubhouseDisplay;
const PAR = ABERDEEN_TEE_IV.par;

/** The nine slots, in the order a man sends them. */
const NINE = { p5a: 7, p5b: 16, p3a: 3, p3b: 8, p3c: 13, p4f: 2, p4b: 14, p4c: 1, p4d: 10 };

interface Extra {
  over?: Record<number, number>;
  courseHandicap?: number;
  handicapIndex?: number;
  hitList?: string;
  cart?: string;
  holes?: number;
}
function card(name: string, x: Extra = {}): PlayerCard {
  const gross = PAR.map((p, i) => p + ((x.over || {})[i + 1] || 0)) as (number | null)[];
  if (x.holes != null) for (let i = x.holes; i < 18; i++) gross[i] = null;
  return {
    name, courseHandicap: x.courseHandicap ?? 0,
    handicapIndex: x.handicapIndex, hitList: x.hitList, cart: x.cart ?? "1",
    picks: { ...NINE }, gross,
  } as PlayerCard;
}
const board = (cards: PlayerCard[]) =>
  computeLeaderboard(cards, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);

/* ---- only the four in the game get a board ---- */

test("the cut contests have no board because they are not on a card", () => {
  const results = board([card("A"), card("B")]);
  for (const key of ["sixPack", "easyStreet", "tripleThreat", "bounceBack"]) {
    const b = contestBoard(results, key, { depth: 5 });
    assert.equal(b.rows.length, 0, key);
    assert.equal(b.entered, 0, key);
  }
});

test("Six Pack and Easy Street are absent from the board, not zero on it", () => {
  // The board draws one line per contest IN PLAY, and a contest that is off is
  // not in the result at all — which is a different thing from one that is in
  // the game and scored a man nothing.
  const results = board([card("A"), card("B")]);
  assert.deepEqual(Object.keys(results[0].contests).sort(),
    ["agonyAlley", "hitList", "skins", "watchTheBirdie"].sort());
});

/* ---- ranking, and the depth floor ---- */

test("a board is ranked on the contest, not on the final", () => {
  // Ben wins Agony Alley outright and finishes behind Abe on the round.
  const results = board([
    card("Abe", { over: { 2: -1, 7: -1, 16: -1 } }),      // three birdies on picks
    card("Ben", { over: { 4: -1, 5: -1 } }),              // two shots better on the stretch
  ]);
  assert.equal(results[0].name, "Abe", "Abe leads the round");
  const agony = contestBoard(results, "agonyAlley", { depth: 5 });
  assert.equal(agony.rows[0].name, "Ben", "and Ben leads Agony Alley");
  assert.equal(agony.rows[0].rank, 1);
  assert.equal(agony.rows[1].name, "Abe");
});

test("men genuinely level share a place", () => {
  const results = board([card("A"), card("B"), card("C")]);
  const b = contestBoard(results, "watchTheBirdie", { depth: 5 });
  assert.deepEqual(b.rows.map((r) => r.rank), [1, 1, 1], "nothing separates them");
  assert.equal(b.tieNote, "", "and nothing to explain — the table fits its depth");
});

test("the depth is a floor: a six-way tie for third shows all six, with a count", () => {
  // Two men clear at the top on birdies, then six level on the blank penalty.
  const clear = [
    card("Alpha", { over: { 2: -1, 7: -1 } }),
    card("Bravo", { over: { 2: -1 } }),
  ];
  const level = ["C", "D", "E", "F", "G", "H"].map((n) => card(n));
  const b = contestBoard(board([...clear, ...level]), "watchTheBirdie", { depth: 5 });

  assert.equal(b.rows.length, 8, "five deep, but the tie for third is kept whole");
  assert.deepEqual(b.rows.slice(2).map((r) => r.rank), [3, 3, 3, 3, 3, 3]);
  assert.equal(b.tied, 6);
  assert.equal(b.tieNote, "5 deep · 6 tied for 3rd, all shown");
  assert.deepEqual(b.rows.slice(2).map((r) => r.name), ["C", "D", "E", "F", "G", "H"]);
});

test("a table that fits its depth says nothing about ties", () => {
  const b = contestBoard(board([
    card("A", { over: { 2: -1, 7: -1 } }),
    card("B", { over: { 2: -1 } }),
    card("C"),
  ]), "watchTheBirdie", { depth: 5 });
  assert.equal(b.rows.length, 3);
  assert.equal(b.tieNote, "");
  assert.equal(b.tied, 0);
});

test("the depth is adjustable, and one is as legal as fifty", () => {
  const cards = ["A", "B", "C", "D", "E", "F"].map((n, i) =>
    card(n, { over: { 2: -1, 7: i < 3 ? -1 : 0 } }));
  const results = board(cards);
  assert.equal(contestBoard(results, "watchTheBirdie", { depth: 1 }).rows.length, 3,
    "one deep, but the three-way tie at the top is still whole");
  assert.equal(contestBoard(results, "watchTheBirdie", { depth: 50 }).rows.length, 6,
    "past the end of the field is simply the whole field");
  assert.equal(contestBoard(results, "watchTheBirdie", {}).depth, 5, "five by default");
});

/* ---- the tiebreakers, each in its documented order ---- */

test("Watch the Birdie: most net birdies, then the eagle", () => {
  // Three birdies and one eagle both come to −1.5, and the strokes cannot part
  // them. Three birdies wins.
  const results = board([
    card("Eagle", { over: { 7: -2 } }),
    card("Three", { over: { 2: -1, 3: -1, 8: -1 } }),
  ]);
  const b = contestBoard(results, "watchTheBirdie", { depth: 5 });
  assert.equal(b.rows[0].strokes, b.rows[1].strokes, "level on strokes");
  assert.equal(b.rows[0].name, "Three");
  assert.equal(b.rows[0].wonBy, "most net birdies");
  assert.deepEqual(b.rows.map((r) => r.rank), [1, 2], "not a shared place");
});

test("Watch the Birdie: level on birdies, the eagle takes it", () => {
  /* AT THE DEFAULT VALUES THIS RULE CANNOT FIRE, and that is worth stating
     rather than leaving for somebody to discover. The strokes are −0.5 a birdie
     and −1.5 an eagle, so two men level on strokes AND level on birdies are
     necessarily level on eagles too — the second tiebreak is unreachable.
     It is in the documented order all the same, and it becomes reachable the
     moment the values move — so it is tested on a house rule that reaches it
     rather than left to be right by never running. An eagle paying NOTHING is
     the only shape that gets there: with any other value, equal strokes and
     equal birdies force equal eagles as well. It is a strange rule to play, and
     it is one the rules screen will accept. */
  const houseRules = {
    ...DEFAULT_CONTESTS,
    watchTheBirdie: { birdie: -0.5, eagle: 0, blank: 0.5 },
  } as typeof DEFAULT_CONTESTS;
  const results = computeLeaderboard([
    card("One birdie", { over: { 2: -1 } }),
    card("Birdie and an eagle", { over: { 2: -1, 7: -2 } }),
  ], ABERDEEN_TEE_IV, houseRules);
  const b = contestBoard(results, "watchTheBirdie", { depth: 5 });
  assert.equal(b.rows[0].strokes, b.rows[1].strokes, "level on strokes");
  assert.equal(b.rows[0].contest.birdies, b.rows[1].contest.birdies,
    "and level on birdies — nothing above the eagle can part them");
  assert.equal(b.rows[0].name, "Birdie and an eagle");
  assert.equal(b.rows[0].wonBy, "the eagle");
});

test("Agony Alley: hole 4, then hole 5, then hole 6", () => {
  // All three men come to net 13 across the stretch and grade the same. They
  // are parted by 4, then 5, then 6 — in that order and no other.
  const results = board([
    card("Best on 4", { over: { 4: -1, 5: 1 } }),
    card("Best on 5", { over: { 5: -1, 6: 1 } }),
    card("Best on 6", { over: { 6: -1, 5: 1 } }),
    card("Level",     { }),
  ]);
  const b = contestBoard(results, "agonyAlley", { depth: 5 });
  assert.deepEqual(b.rows.map((r) => r.name),
    ["Best on 4", "Best on 5", "Level", "Best on 6"]);
  assert.equal(b.rows[0].wonBy, "hole 4");
  // The last three are level on 4, so 5 decides all of them — the man who saved
  // his shot for the 6th is LAST, which is the order doing its job.
  assert.equal(b.rows[1].wonBy, "hole 5");
  assert.equal(b.rows[2].wonBy, "hole 5");
  assert.deepEqual(b.rows.map((r) => r.strokes), [-1, -1, -1, -1], "all on the same rung");
});

test("Agony Alley: level on 4 and 5, hole 6 decides it", () => {
  // Net 14 and net 15 both grade 0 — the same rung off different totals, which
  // is the only way to reach the third tiebreak. Level on 4 and 5, parted on 6.
  const results = board([
    card("Better on 6", { over: { 6: 1 } }),   // 5, 4, 5 = 14
    card("Worse on 6",  { over: { 6: 2 } }),   // 5, 4, 6 = 15
  ]);
  const b = contestBoard(results, "agonyAlley", { depth: 5 });
  assert.deepEqual(b.rows.map((r) => r.strokes), [0, 0], "the same rung");
  assert.deepEqual(b.rows.map((r) => r.name), ["Better on 6", "Worse on 6"]);
  assert.equal(b.rows[0].wonBy, "hole 6");
});

test("Hit List: the higher index wins, then the bigger margin", () => {
  // Three men who all beat a lower-index opponent for the same −1.1. The one
  // with least business doing it takes it.
  const results = board([
    card("Low",  { handicapIndex: 10, over: { 18: -1 }, hitList: "Mark" }),
    card("Mid",  { handicapIndex: 20, over: { 18: -1 }, hitList: "Mark" }),
    card("High", { handicapIndex: 30, over: { 18: -1 }, hitList: "Mark" }),
    card("Mark", { handicapIndex: 5 }),
  ]);
  const b = contestBoard(results, "hitList", { depth: 5 });
  assert.deepEqual(b.rows.slice(0, 3).map((r) => r.name), ["High", "Mid", "Low"]);
  assert.equal(b.rows[0].wonBy, "the higher index");

  // Level on index, and the bigger beating takes it.
  const margins = board([
    card("By one",  { handicapIndex: 20, over: { 18: -1 }, hitList: "Mark" }),
    card("By three", { handicapIndex: 20, over: { 16: -1, 17: -1, 18: -1 }, hitList: "Mark" }),
    card("Mark", { handicapIndex: 5 }),
  ]);
  const mb = contestBoard(margins, "hitList", { depth: 5 });
  assert.equal(mb.rows[0].name, "By three");
  assert.equal(mb.rows[0].wonBy, "the bigger margin");
});

test("Team Skins has no tiebreak — it is already shown hole by hole", () => {
  // Two carts level on skins share the place rather than being parted by
  // something the Skins tab does not show.
  const results = board([
    card("A1", { cart: "1" }), card("A2", { cart: "1" }),
    card("B1", { cart: "2" }), card("B2", { cart: "2" }),
    card("C1", { cart: "3" }), card("C2", { cart: "3" }),
    card("D1", { cart: "4" }), card("D2", { cart: "4" }),
  ]);
  const b = contestBoard(results, "skins", { depth: 5 });
  assert.ok(b.rows.length >= 5);
  assert.deepEqual(b.rows.map((r) => r.wonBy), b.rows.map(() => null),
    "nothing was used to part anybody");
});

test("a man who did not contest it is not last in it — he is not in it", () => {
  const results = board([
    card("Named", { handicapIndex: 20, hitList: "Other" }),
    card("Other", { handicapIndex: 20, hitList: "Named" }),
    card("Nobody", { handicapIndex: 20 }),
  ]);
  const b = contestBoard(results, "hitList", { depth: 5 });
  assert.deepEqual(b.rows.map((r) => r.name).sort(), ["Named", "Other"]);
  assert.equal(b.entered, 2);
});

test("a short card takes no place on any board", () => {
  const results = board([card("Full"), card("Walked in", { holes: 12 })]);
  for (const key of ["watchTheBirdie", "agonyAlley"]) {
    const b = contestBoard(results, key, { depth: 5 });
    assert.deepEqual(b.rows.map((r) => r.name), ["Full"], key);
  }
});

/* ---- the Hit List results table ---- */

test("every duel is named, with both men and the margin", () => {
  const results = board([
    card("Wallach",    { handicapIndex: 20, over: { 16: -1, 17: -1, 18: -1 }, hitList: "Teitelbaum" }),
    card("Teitelbaum", { handicapIndex: 20, hitList: "Wallach" }),
    card("Finkelstein", { handicapIndex: 20, over: { 18: -1 }, hitList: "Smith" }),
    card("Smith",      { handicapIndex: 20, hitList: "Finkelstein" }),
  ]);
  const duels = hitListDuels(results);
  assert.equal(duels.length, 4, "two men who named each other make TWO rows");

  const said = duels.map(D.duelSentence);
  assert.ok(said.includes("Wallach beat Teitelbaum by 3"), said.join(" | "));
  assert.ok(said.includes("Teitelbaum lost to Wallach by 3"), said.join(" | "));
  assert.ok(said.includes("Finkelstein beat Smith by 1"), said.join(" | "));
  assert.ok(said.includes("Smith lost to Finkelstein by 1"), said.join(" | "));

  // Biggest margin first — the table is read aloud, and the heaviest beating
  // is the one worth leading with.
  assert.deepEqual(duels.map((d) => d.margin), [3, 3, 1, 1]);
});

test("a tie is said as a tie, not as a nought-stroke win", () => {
  const results = board([
    card("A", { handicapIndex: 20, hitList: "B" }),
    card("B", { handicapIndex: 20, hitList: "A" }),
  ]);
  const duels = hitListDuels(results);
  assert.equal(duels[0].outcome, "tie");
  assert.equal(duels[0].margin, 0);
  assert.equal(D.duelSentence(duels[0]), "A and B tied");
});

test("a man who did not finish is still on the table, with the reason", () => {
  const results = board([
    card("Finished", { handicapIndex: 20, hitList: "Walked in" }),
    card("Walked in", { handicapIndex: 20, hitList: "Finished", holes: 12 }),
  ]);
  const duels = hitListDuels(results);
  const said = duels.map(D.duelSentence);

  // HIS card being short and the OTHER man's card being short are different
  // sentences. "Void" reads as an excuse when it was the player himself who
  // walked in.
  assert.ok(said.includes("Finished named Walked in, who has no full round — void"), said.join(" | "));
  assert.ok(said.includes("Walked in named Finished — no full round, so it is void"), said.join(" | "));
  // And the unsettled ones sort to the bottom, under the duels that came off.
  assert.deepEqual(duels.map((d) => d.settled), [false, false]);
});

test("naming a stranger or yourself is said plainly", () => {
  const results = board([
    card("Lonely", { handicapIndex: 20, hitList: "Lonely" }),
    card("Hopeful", { handicapIndex: 20, hitList: "Ned Copeland" }),
    card("Third", { handicapIndex: 20 }),
  ]);
  const said = hitListDuels(results).map(D.duelSentence);
  assert.ok(said.includes("Lonely named himself"), said.join(" | "));
  assert.ok(said.includes("Hopeful named Ned Copeland, who is not in this round"), said.join(" | "));
  assert.equal(said.length, 2, "the man who named nobody has no duel to show");
});

test("settled duels come before the ones that never came off", () => {
  const results = board([
    card("Winner", { handicapIndex: 20, over: { 18: -1 }, hitList: "Loser" }),
    card("Loser", { handicapIndex: 20, hitList: "Winner" }),
    card("Short", { handicapIndex: 20, hitList: "Winner", holes: 9 }),
  ]);
  const duels = hitListDuels(results);
  assert.deepEqual(duels.map((d) => d.settled), [true, true, false]);
});

/* ---- small things the board leans on ---- */

test("ordinals read the way a man says them", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal),
    ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st"]);
});

/* ---- and the screen actually draws them ---- */

const html = readFileSync(new URL("../leaderboard.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../clubhouse.css", import.meta.url), "utf8");

test("the Leaders screen draws a board for every contest in play", () => {
  assert.match(html, /<div id="boards"><\/div>/, "there is somewhere to put them");
  assert.match(html, /E\.contestBoard\(/, "and the engine decides what goes in them");
  assert.match(html, /E\.hitListDuels\(/, "including every duel");
  // THE BOARDS SEE THE WHOLE FIELD, before the flight filter. Flights divide
  // placings and the card match; the contests are graded against fixed
  // thresholds and Skins and the Hit List are settled field-wide.
  assert.match(html, /drawBoards\(fieldResults\)/);
});

test("the depth is a rule of the round and travels with it", () => {
  assert.equal(DEFAULT_CONTESTS.boards.depth, 5);
  assert.match(html, /boards\.depth/, "and it is on the rules screen");
});

test("the picture carries the boards too", () => {
  // The picture is the one that always arrives — the link is flaky through iOS
  // Messages from 250 characters up — so who won each contest goes in it.
  assert.match(html, /boards: boardContests\(\)\.map/);
  assert.match(html, /duels: contestConfig\(\)\.hitList == null/);
});

/* ---- three tabs and a gear ----
   The old three were named for the app's own machinery — Leaders, Setup,
   Import — so a man had to know which one held the thing he wanted. These are
   named for the stages of a round. */

test("three tabs, named for the stages of a round, and no fourth", () => {
  const tabs = html.split("\n").find((l) => l.includes("const TAB_LABELS ="))!;
  assert.equal((tabs.match(/\["/g) || []).length, 3, "three labels: " + tabs);
  for (const label of ["Start a round", "The round", "Finish a round"]) {
    assert.ok(tabs.includes(label), label);
  }
  for (const gone of ["Leaders", "Setup", "Import", "Skins"]) {
    assert.equal(tabs.includes(gone), false, gone + " is not a tab any more");
  }
});

test("the gear is labeled, not just an icon", () => {
  // A tooltip is no use on a phone, where nothing hovers, so it carries the
  // word beside the shape.
  assert.match(html, /<button class="gear" data-gear>⚙<span>Settings<\/span><\/button>/);
  assert.equal((html.match(/class="gear"/g) || []).length, 3, "one on each of the three tabs");
});

test("the bar and the gear are in one sticky block, so neither scrolls away", () => {
  // The green band used to carry the gear and scroll off with it, which put
  // Settings out of reach from the bottom of a long board.
  for (const id of ["start", "round", "finish"]) {
    const screen = html.slice(html.indexOf(`<section id="${id}"`));
    const bar = screen.slice(0, screen.indexOf("</div>", screen.indexOf('class="topbar"')) + 6);
    assert.match(bar, /<nav class="tabs" data-tabs><\/nav>/, id + " has the tabs in the bar");
    assert.match(bar, /class="gear"/, id + " has the gear in the same bar");
  }
  assert.match(css, /\.topbar \{[^}]*position: sticky;[^}]*top: 0;/,
    "and the bar is stuck to the top");
});

test("every item off the old four tabs is still reachable", () => {
  // Nothing was dropped — only moved, and renamed where the old name was the
  // app's word for it rather than Rob's.
  const reachable = [
    // Start a round
    "The roster", "Paste a list", "The round", "Start a new round",
    // The round
    "The players", "Type a player in", "Paste a list of players", "The player cards",
    "Watch the birdie", "Hit list", "Draw missing picks", "One message a man",
    // Finish a round
    "Paste the scores", "Check paste first",
    // behind the gear
    "The rules and their values", "How to run Clubhouse", "Questions and answers",
    "Move this event", "About", "Archive",
    // and the plain sheet, which lost its button on The round
    "Open the plain pick sheet",
  ];
  for (const item of reachable) {
    assert.ok(html.includes(item), item + " is no longer anywhere in the app");
  }
  // And the screens they live on all exist.
  for (const id of ["start", "round", "finish", "more", "settings", "howto", "qa",
                    "archive", "invites", "player", "edit"]) {
    assert.match(html, new RegExp('<section id="' + id + '"'), id);
  }
  for (const gone of ["skins", "board", "setup", "import", "roster"]) {
    assert.equal(new RegExp('<section id="' + gone + '"').test(html), false,
      gone + " is not a screen any more");
  }
});

/* ---- THE WHITE SCREEN, THE SECOND TIME ----
   The last restructure left a guard that rewrote an unknown tab name to
   "board". Renaming the screens took the fallback away with everything else —
   so the guard would have pointed at a screen that no longer existed, nothing
   would have taken the `on` class, and the app would have drawn a white page
   for exactly the reason it did before. */

test("every tab name this app has ever stored maps to a screen that exists", () => {
  const map = html.slice(html.indexOf("const TAB_ALIASES ="),
                         html.indexOf("}", html.indexOf("const TAB_ALIASES =")));
  const sections = new Set([...html.matchAll(/<section id="([a-z]+)"/g)].map((m) => m[1]));
  for (const old of ["setup", "board", "import", "skins"]) {
    const to = new RegExp(old + ':\\s*"([a-z]+)"').exec(map);
    assert.ok(to, old + " has no alias, so a phone holding it has nowhere to go");
    assert.ok(sections.has(to![1]), old + " maps to " + to![1] + ", which is not a screen");
  }
});

test("the fallback is not a hardcoded screen name that a rename can take away", () => {
  const fn = html.slice(html.indexOf("function screenFor("), html.indexOf("function show("));
  assert.match(fn, /if\(document\.getElementById\(want\)\) return want;/, "the wanted screen first");
  assert.match(fn, /TABS\[0\]/, "then the first tab, whatever it is called");
  assert.match(fn, /SCREENS\.find\(s => document\.getElementById\(s\)\)/,
    "and then anything at all that exists");
  assert.equal(/return "board"/.test(fn), false, "never a name written down here");
});

test("show() cannot throw on a screen that is not in the document", () => {
  const fn = html.slice(html.indexOf("function show(id){"), html.indexOf("/** All three, always. */"));
  assert.match(fn, /const want = screenFor\(id\);/);
  assert.match(fn, /if\(!want\) return;/, "nothing to show is not an exception");
  // The old loop called .classList on whatever getElementById returned.
  assert.match(fn, /const el = document\.getElementById\(s\);\s*\n\s*if\(el\)/,
    "every element is checked before it is touched");
});

test("a stored tab is carried through the loader rather than thrown away", () => {
  const fn = html.slice(html.indexOf("function normalizeEvent("), html.indexOf("function currentEvent("));
  assert.match(fn, /tab: typeof e\.tab === "string" && e\.tab \? e\.tab : "round"/,
    "the word survives; screenFor is the only thing that decides what it means");
});

/* ---- the board, five deep ---- */

test("the board is not a fold, so the accordion cannot shut it", () => {
  const board = html.slice(html.indexOf('<section id="finish"'), html.indexOf('<section id="more"'));
  assert.match(board, /<div id="rows"><\/div>/, "the rows are plain markup");
  /* AND NOT INSIDE ONE. There is a fold above the board now — Paste the scores
     — so "is there a <details> before the rows" is no longer the question. The
     question is whether every one of them is CLOSED before the rows begin. */
  const before = board.slice(0, board.indexOf('<div id="rows">'));
  assert.equal((before.match(/<details/g) || []).length,
               (before.match(/<\/details>/g) || []).length,
    "every section above the board is closed before the rows start");
});

test("five men, and the control at both ends of the list", () => {
  const board = html.slice(html.indexOf('<section id="finish"'), html.indexOf('<section id="more"'));
  assert.ok(board.indexOf('id="boardMoreTop"') < board.indexOf('id="rows"'), "one above");
  assert.ok(board.indexOf('id="rows"') < board.indexOf('id="boardMoreBot"'), "and one below");

  assert.match(html, /const BOARD_SHOWN = 5;/);
  const fn = html.slice(html.indexOf("function drawBoardMore("), html.indexOf("/**\n * THE SHUT LINE FOR ONE CONTEST"));
  assert.match(fn, /const label = boardOpen \? "Show fewer" : hidden \+ " more";/,
    "it says the figure when shut and the way back when open");
  assert.match(fn, /top\.innerHTML = html;\s*\n\s*bot\.innerHTML = html;/,
    "both ends, in both states — a control that moves has to be found again");
});

test("the share bar is fixed at the bottom of Finish a round", () => {
  const board = html.slice(html.indexOf('<section id="finish"'), html.indexOf('<section id="more"'));
  assert.match(board, /<div class="sharebar" id="shareBox"><\/div>/);
  assert.match(css, /\.sharebar\.on \{[^}]*position: fixed;[^}]*bottom: 0;/);
  assert.match(css, /section\.tab\.hasbar \{ padding-bottom:/,
    "and the screen leaves room, so the last board is not under it");
});

/* ---- the Leaders accordion ---- */

test("the two accordions never close each other", () => {
  // Setup's rule closes every `details.fold.step` in the document. The Leaders
  // sections carry `.lead` instead, so opening Agony Alley cannot shut "Paste
  // birdie picks" on a screen nobody is looking at.
  assert.match(html, /details\.fold\.lead/);
  assert.match(html, /class="fold lead"/);
  assert.match(html, /querySelectorAll\("details\.fold\.step"\)/, "Setup's rule is still by .step");
});

test("opening one Leaders section shuts the others", () => {
  const fn = html.slice(html.indexOf("function wireLeadSections"));
  assert.match(fn.slice(0, 900), /if\(o !== d && o\.open\) o\.open = false;/);
});

test("the sections remember without forgetting Setup's", () => {
  // One store, keyed by element id. Both writers MERGE — a fresh object from
  // either would drop the other's, because the Leaders folds are drawn after
  // startup and are not always in the document when Setup saves.
  assert.equal((html.match(/const now = readFolds\(\);/g) || []).length, 2,
    "both the Setup and the Leaders writer merge");
});

/* ---- the shut lines ---- */

test("each shut line carries the figure that section is about", () => {
  const results = board([
    card("Wolfson", { over: { 2: -1, 3: -1, 8: -1 }, handicapIndex: 30, hitList: "Teitelbaum" }),
    card("Teitelbaum", { over: { 4: -1, 5: -1 }, handicapIndex: 10, hitList: "Wolfson" }),
  ]);
  const wtb = contestBoard(results, "watchTheBirdie", { depth: 5 });
  assert.equal(wtb.rows[0].name, "Wolfson");
  assert.equal(wtb.rows[0].contest.birdies, 3, "the shut line says '3 birdies'");

  const agony = contestBoard(results, "agonyAlley", { depth: 5 });
  assert.equal(agony.rows[0].name, "Teitelbaum");
  const net = agony.rows[0].contest.netHoles!.reduce((a, n) => a + (n || 0), 0);
  assert.equal(net, 11, "the shut line says 'net 11'");
});

test("an UPSET is a man who backed himself against a better player and won", () => {
  // The "lower" band — priced hardest at −1.1 precisely because it is the hard
  // way to do it. Nothing else about the Hit List belongs on a shut line.
  const results = board([
    card("Upset", { handicapIndex: 30, over: { 18: -1 }, hitList: "Star" }),
    card("Star", { handicapIndex: 5, hitList: "Upset" }),
  ]);
  const duels = hitListDuels(results);
  const upsets = duels.filter((d) => d.outcome === "win" && d.band === "lower");
  assert.equal(upsets.length, 1);
  assert.equal(upsets[0].name, "Upset");
  // Beating a WORSE player is a win, and is not an upset.
  const other = duels.find((d) => d.name === "Star")!;
  assert.equal(other.outcome, "loss");
});

test("a contest that is off has no section to summarize", () => {
  const off = { ...DEFAULT_CONTESTS, skins: null } as typeof DEFAULT_CONTESTS;
  const results = computeLeaderboard(
    ["A", "B", "C", "D", "E", "F", "G", "H"].map((n, i) => card(n, { cart: String(1 + (i >> 1)) })),
    ABERDEEN_TEE_IV, off);
  assert.equal(contestBoard(results, "skins", { depth: 5 }).rows.length, 0);
  assert.equal(results[0].contests.skins, undefined, "absent, not a zero");
  // And the screen only draws a Skins section when it is in the game.
  assert.match(html, /if\(cfg\.skins != null\)\{/);
});

/* ---- the Skins section, folded in from the old tab ---- */

test("the Skins section reads the engine rather than settling it again", () => {
  assert.match(html, /E\.skinsSettlement\(boardCards, undefined, cfg\)/);
  assert.equal(/E\.skinsByGroup\(/.test(html), false,
    "the page no longer works skins out for itself");
});

test("there is no flight picker on the Skins section", () => {
  // Skins ignores flights, so a picker there would be a control that changes
  // nothing — worse than none.
  assert.equal(/skinsFlights/.test(html), false);
  assert.match(html, /played across the whole field/);
});

test("everything the old Skins tab drew is still drawn", () => {
  const at = html.indexOf("function skinsSectionHtml");
  const fn = html.slice(at, html.indexOf("\nfunction ", at + 40));
  for (const piece of ["Totals by ", "Hole by hole", "a skin today", "best two net balls",
                       "nothing carries over", "No skins at ", "Nobody has a ",
                       "only one ", "not playing for skins", "tied — nobody wins it"]) {
    assert.ok(fn.includes(piece), "the section lost: " + piece);
  }
});
