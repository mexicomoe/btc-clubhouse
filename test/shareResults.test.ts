/**
 * The shareable results link.
 *
 * A finished round, packed small enough to text, opened on any phone with
 * nothing installed. The round rides INSIDE the link — there is no server.
 *
 * The thing these tests are really protecting is that the numbers are SETTLED
 * before they leave. Finals, contest values and placings all travel as decided
 * on the organiser's phone, so a link keeps its numbers for good however the
 * club's settings move afterwards. Nothing at the far end recomputes anything;
 * results.html has no engine on it at all.
 *
 * The link is OBFUSCATED, NOT ENCRYPTED — nothing is legible in the address bar,
 * but a decoder gives the names back. Treat a shared link as public.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { computeLeaderboard, birdiePickHoles, PICK_SLOTS, type PlayerCard } from "../src/scoring.ts";
import {
  encodeResults, decodeResults, resultsLink, maxPlayersThatFit,
  RESULT_PREFIX, RESULT_CONTESTS, MAX_URL_LENGTH,
} from "../src/shareResults.ts";

const PAR = ABERDEEN_TEE_IV.par;
const BASE = "https://mexicomoe.github.io/btc-clubhouse/results.html";
const LEGAL = birdiePickHoles(ABERDEEN_TEE_IV);

/** Demo names of the right shape and length for a real club field. */
const NAMES = ["Whitfield, Abe", "Castellan, Ben", "Ashford, Cy", "Pemberton, Dan",
               "Marsden, Eli", "Thornbury, Gus", "Brightwater, Hal", "Calloway, Ike",
               "Ridgeway, Ken", "Merrick, Sal", "Kingsley, Moe", "Danforth, Roy",
               "Copeland, Ned", "Netherton, Sid", "Harkness, Fred", "Marlow, Andrew",
               "Bramwell, Otto", "Sackville, Pete", "Thorne, Quentin", "Underhill, Russ",
               "Vance, Toby", "Winslow, Ulric", "Yardley, Vince", "Zeller, Wade"];

/** A field of `n` men, each a slightly different card, scored by the engine. */
function field(n: number) {
  const cards: PlayerCard[] = Array.from({ length: n }, (_, i) => ({
    name: NAMES[i % NAMES.length],
    courseHandicap: 8 + (i % 20),
    cart: 1 + Math.floor(i / 4),
    gross: PAR.map((p, h) => p + ((h * 7 + i * 5) % 5 === 0 ? -1 : (h + i) % 3 === 0 ? 0 : 1)),
    picks: Object.fromEntries(PICK_SLOTS.map((s) =>
      [s.key, LEGAL[s.key][i % LEGAL[s.key].length]])),
  } as PlayerCard));
  return computeLeaderboard(cards, undefined, DEFAULT_CONTESTS);
}

const HEADING = { course: "Aberdeen Golf & Country Club", date: "2026-08-14", tee: "IV", note: "" };
const link = (n: number, note = "") =>
  resultsLink(BASE, { ...HEADING, note }, field(n), RESULT_CONTESTS);

/* ---- it fits ---- */

test("eight players and fifteen both fit, with room", () => {
  for (const n of [8, 15]) {
    const l = link(n);
    assert.ok(l.fits, `${n} players came to ${l.length}`);
    assert.ok(l.length < MAX_URL_LENGTH * 0.75,
      `${n} players is ${l.length} — too close to the ${MAX_URL_LENGTH} limit for comfort`);
  }
});

// MAX_PLAYERS in the app is 24, so a share that broke at 20 would be a feature
// the app lets you outgrow without saying so.
test("a full 24-man field fits — the app's own maximum", () => {
  const l = link(24);
  assert.ok(l.fits, `24 players came to ${l.length}, over the ${MAX_URL_LENGTH} limit`);
});

test("the ceiling is where it is claimed to be", () => {
  // Worst case: every contest paying, so no value is a short "0".
  const at14 = maxPlayersThatFit(BASE, 14);
  assert.ok(at14 >= 23, `only ${at14} players fit at a 14-character name`);
  // A longer average name costs players, and it should cost them gradually.
  assert.ok(maxPlayersThatFit(BASE, 19) < at14, "longer names must fit fewer men");
});

test("a round too big to send is refused rather than truncated", () => {
  const l = resultsLink(BASE, HEADING, field(60), RESULT_CONTESTS);
  assert.equal(l.fits, false, "sixty men cannot fit");
  assert.ok(l.length > MAX_URL_LENGTH);
  assert.equal(l.players, 60, "and it still says how many there were");
});

/* ---- what comes back is what went in ---- */

test("the shared board matches the app's, line for line", () => {
  const board = field(15);
  const read = decodeResults(link(15).url);
  assert.equal(read.ok, true);
  const got = read.round!.players;

  assert.equal(got.length, board.length);
  assert.deepEqual(got.map((p) => p.name), board.map((r) => r.name), "same order");
  assert.deepEqual(got.map((p) => p.final), board.map((r) => r.final), "same finals");
  assert.deepEqual(got.map((p) => p.rank), board.map((r) => r.rank), "same placings");
  assert.deepEqual(got.map((p) => p.net), board.map((r) => r.net), "same nets");
  assert.deepEqual(got.map((p) => p.gross), board.map((r) => r.gross), "same gross");
  assert.deepEqual(got.map((p) => p.courseHandicap), board.map((r) => r.courseHandicap));
});

test("every contest value survives, to the tenth", () => {
  const board = field(12);
  const got = decodeResults(link(12).url).round!.players;
  board.forEach((r, i) => {
    for (const key of RESULT_CONTESTS) {
      const was = r.contests[key as keyof typeof r.contests];
      if (!was) continue;
      assert.equal(got[i].contests[key], was.strokes, `${r.name} ${key}`);
    }
  });
});

test("a tie travels as it was settled, not as something to work out again", () => {
  // Two identical cards but for where the shot fell, so the card match decides.
  const even: PlayerCard = { name: "Level, Abe", courseHandicap: 0, gross: PAR.slice() };
  const back: PlayerCard = { name: "Backnine, Ben", courseHandicap: 0,
    gross: PAR.map((p, i) => i === 0 ? p + 1 : i === 9 ? p - 1 : p) };
  const board = computeLeaderboard([even, back], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  assert.equal(board[0].final, board[1].final, "a real tie on the final");

  const withNotes = board.map((r) => ({ ...r,
    tieNote: r.cardMatch ? "won on " + r.cardMatch.wonBy : "" }));
  const got = decodeResults(resultsLink(BASE, HEADING, withNotes, RESULT_CONTESTS).url).round!;
  assert.deepEqual(got.players.map((p) => p.rank), [1, 2], "the placing arrived decided");
  assert.match(got.players[0].tieNote, /won on the back nine/);
});

test("a man who did not finish is still marked as not eligible", () => {
  const short: PlayerCard = { name: "Walked, In", courseHandicap: 10,
    gross: PAR.map((p, i) => (i < 12 ? p : null)) as (number | null)[] };
  const board = computeLeaderboard([short, ...field(3).map(() => short)].slice(0, 1)
    .concat([{ name: "Finished, Fred", courseHandicap: 10, gross: PAR.slice() } as PlayerCard]
      .map((c) => c) as never[]) as never[], ABERDEEN_TEE_IV, DEFAULT_CONTESTS);
  const got = decodeResults(resultsLink(BASE, HEADING, board, RESULT_CONTESTS).url).round!;
  const walked = got.players.find((p) => p.name === "Walked, In")!;
  assert.equal(walked.eligible, false);
  assert.equal(walked.holesPlayed, 12, "and how far he got");
});

test("the round's heading and its off-default note travel", () => {
  const read = decodeResults(link(8, "85% handicap allowance · skins not played").url);
  const r = read.round!;
  assert.equal(r.course, "Aberdeen Golf & Country Club");
  assert.equal(r.date, "2026-08-14");
  assert.equal(r.tee, "IV");
  assert.equal(r.note, "85% handicap allowance · skins not played");
});

// A round scored before a contest existed must not sprout an empty line for it.
test("only the contests that were live travel", () => {
  const live = ["watchTheBirdie", "agonyAlley", "damageControl"];
  const read = decodeResults(
    resultsLink(BASE, HEADING, field(6), live).url);
  assert.deepEqual(read.round!.contests, live);
  for (const p of read.round!.players) {
    assert.deepEqual(Object.keys(p.contests).sort(),
      live.filter((k) => p.contests[k] != null).sort());
    assert.equal(p.contests.easyStreet, undefined, "a contest not sent is not invented");
  }
});

/* ---- a link that arrives damaged ---- */

test("a truncated link says so rather than showing an empty board", () => {
  const url = link(15).url;
  // 0.4 upward: below that the cut lands inside the address itself, which no
  // longer looks like a results link at all and gets the other sentence.
  for (const cut of [0.4, 0.5, 0.7, 0.9, 0.99]) {
    const read = decodeResults(url.slice(0, Math.floor(url.length * cut)));
    assert.equal(read.ok, false, `cut at ${cut}`);
    assert.equal(read.round, null, "and nothing half-read comes through");
    assert.match(read.error!, /\S/, "with a sentence saying why");
  }
});

test("every refusal is a sentence a man can act on", () => {
  const cases: [string, RegExp][] = [
    ["", /does not carry a round/],
    // A results.html address with no round on the end of it is the
    // messenger-ate-it case, and gets its own sentence — see below.
    ["https://example.com/results.html", /only the address arrived/],
    [RESULT_PREFIX, /arrived empty/],
    [RESULT_PREFIX + "not base64 !!", /not part of one/],
  ];
  for (const [text, want] of cases) {
    const read = decodeResults(text);
    assert.equal(read.ok, false, JSON.stringify(text));
    assert.match(read.error!, want, JSON.stringify(text));
  }
});

test("a link from a newer version says so instead of half-reading it", () => {
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const read = decodeResults(RESULT_PREFIX + b64("9\tAberdeen\t2026-08-14\tIV\t0\t"));
  assert.equal(read.ok, false);
  assert.match(read.error!, /newer version/);
});

test("a row that lost its tail is refused, not read short", () => {
  // The fields are positional: a short row would read a final as a rank.
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const read = decodeResults(RESULT_PREFIX +
    b64("1\tAberdeen\t2026-08-14\tIV\t0,1\t\nWhitfield, Abe\t19\t92"));
  assert.equal(read.ok, false);
  assert.match(read.error!, /cut short/);
});

/* ---- the link itself ---- */

test("no name is legible in the link", () => {
  const url = link(8).url;
  for (const n of NAMES.slice(0, 8)) {
    assert.ok(!url.includes(n), n + " must not be readable in the address");
    assert.ok(!url.includes(n.split(",")[0]), n.split(",")[0] + " must not be readable either");
  }
});

// Obfuscation, not encryption. This test exists to record that plainly: if it
// ever fails because the payload became unreadable, the trade has changed and
// the comment at the top of results.js needs changing with it.
test("but it is obfuscation, not encryption — a decoder gets the names back", () => {
  const url = link(4).url;
  const body = url.slice(url.indexOf(RESULT_PREFIX) + RESULT_PREFIX.length);
  const plain = Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  assert.ok(plain.includes(NAMES[0]), "readable to anyone who pastes it into a decoder");
});

test("the link is made only of characters a message will not break", () => {
  const body = link(15).code.slice(RESULT_PREFIX.length);
  assert.match(body, /^[A-Za-z0-9_-]+$/,
    "base64url only — a + or / is where a message decides the URL ended");
});

test("the code carries its own marker and version", () => {
  assert.ok(link(8).code.startsWith(RESULT_PREFIX));
  // Ends in an underscore, not a colon: a colon here reads as a URI scheme and
  // a link detector drops everything after it. See "surviving the trip" below.
  assert.match(RESULT_PREFIX, /^BTCR\d+_$/);
});

/* ---- the read-only page is read-only by construction ---- */

const RESULTS_HTML = readFileSync(new URL("../results.html", import.meta.url), "utf8");

/** Every file the page actually pulls in. Prose in a comment is not loading. */
const SCRIPTS = [...RESULTS_HTML.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);

// Not a flag that could be flipped — the scoring and setup code is simply not
// on the page, so there is nothing to reach however the address is edited.
test("results.html loads no engine, importer or exporter", () => {
  assert.deepEqual(SCRIPTS, ["display.js", "results.js"],
    "these two and nothing else");
  for (const forbidden of ["engine.js", "importer.js", "exporter.js", "version.js"]) {
    assert.ok(!SCRIPTS.includes(forbidden),
      forbidden + " must not be loaded by the read-only page");
  }
});

test("results.html writes nothing and scores nothing", () => {
  for (const forbidden of ["localStorage", "sessionStorage", "ClubhouseEngine",
                           "computeLeaderboard", "scorePlayer"]) {
    assert.ok(!RESULTS_HTML.includes(forbidden), forbidden + " must not appear");
  }
});

test("results.html has no route into setup or scoring", () => {
  for (const forbidden of ["leaderboard.html", 'id="setup"', 'id="import"', 'id="edit"']) {
    assert.ok(!RESULTS_HTML.includes(forbidden), forbidden + " must not appear");
  }
});

test("both pages share one stylesheet and one set of display helpers", () => {
  const app = readFileSync(new URL("../leaderboard.html", import.meta.url), "utf8");
  for (const shared of ["clubhouse.css", "display.js"]) {
    assert.ok(app.includes(shared), "the app must load " + shared);
    assert.ok(RESULTS_HTML.includes(shared), "the shared view must load " + shared);
  }
  assert.ok(!app.includes("<style>"), "the app must not keep a second copy of the styles");
});

/* ---- surviving the trip ----
 *
 * A link sent by e-mail worked and the same link sent by text arrived with
 * nothing after the "#". The colon in the old "BTCR1:" marker was the only
 * character in the whole fragment that is not base64url, and it could do two
 * separate kinds of damage: it has the exact shape of a URI scheme, which lets
 * a link detector end the https URL at the "#" and drop the rest as a second
 * unknown-scheme URI; and a sender that percent-encodes the fragment writes
 * "BTCR1%3A", which a literal marker match no longer finds.
 */

// iOS Messages ends the link AT THE HASH — the message arrives in two pieces,
// the address on one line and everything from the "#" on the next, and only the
// address is tappable. Taking the colon out of the marker did not help, because
// the hash itself was the boundary. So there is no hash in the link any more.
test("there is no hash in the link at all", () => {
  const url = link(8).url;
  assert.ok(!url.includes("#"),
    "iOS Messages breaks the link at the hash, whatever follows it");
  assert.ok(url.includes("?r="), "the round rides in a query string now");
});

test("the payload is one unbroken run of characters no parser will touch", () => {
  const url = link(8).url;
  const payload = url.slice(url.indexOf("?r=") + 3);
  assert.match(payload, /^[A-Za-z0-9_-]+$/,
    "anything else is something a link detector can take an interest in");
  assert.ok(!payload.includes(":"),
    "a colon here reads as a URI scheme and the round gets dropped in transit");
});

test("the marker cannot be mistaken for a URI scheme", () => {
  // scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) ":"  — RFC 3986.
  assert.ok(!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(RESULT_PREFIX), RESULT_PREFIX);
});

test("a percent-encoded payload still opens", () => {
  const url = link(8).url;
  const [page, payload] = url.split("?r=");
  const encoded = page + "?r=" + encodeURIComponent(payload);
  const read = decodeResults(encoded);
  assert.equal(read.ok, true, read.error || "");
  assert.equal(read.round!.players.length, 8);
});

// Links made before the marker changed are already in people's messages.
test("a link sent with the old colon marker still opens", () => {
  for (const old of ["BTCR1:", "BTCR1%3A", "BTCR1-"]) {
    const url = link(8).url.replace(RESULT_PREFIX, old);
    const read = decodeResults(url);
    assert.equal(read.ok, true, old + ": " + (read.error || ""));
    assert.equal(read.round!.players.length, 8, old);
  }
});

// Links made before the move are already in people's messages, and on a phone
// that does not mangle a fragment they work perfectly. They must keep working.
test("a link made when the round rode in the fragment still opens", () => {
  const read = decodeResults(link(8).url.replace("?r=", "#"));
  assert.equal(read.ok, true, read.error || "");
  assert.equal(read.round!.players.length, 8);
});

test("a link that lost its round says so, rather than showing an empty board", () => {
  for (const url of ["https://x.github.io/btc-clubhouse/results.html",
                     "https://x.github.io/btc-clubhouse/results.html?r=",
                     "https://x.github.io/btc-clubhouse/results.html#"]) {
    const read = decodeResults(url);
    assert.equal(read.ok, false, url);
    assert.match(read.error!, /only the address arrived/, url);
  }
});

test("something that was never a round says that instead", () => {
  const read = decodeResults("https://example.com/some/other/page");
  assert.equal(read.ok, false);
  assert.match(read.error!, /does not carry a round/);
});
