/**
 * The leaderboard as a picture.
 *
 * WHY IT EXISTS. The share link works by e-mail and does not survive iOS
 * Messages. Measured on the club's own phone: 154, 159, 190 and 219 characters
 * arrived first time; 250 and 299 failed once each and arrived only on a second
 * attempt; 350 failed twice. The break sits between 299 and 350 and is flaky
 * from 250 up — and a ten-man round cannot get under 250 while still carrying
 * the contest breakdown. A link that works on the second try is not good enough,
 * so the board goes as a picture, which has no length limit anywhere.
 *
 * `layout()` returns drawing operations and touches no canvas, so the whole
 * arrangement is testable here with no browser at all. The text measurer is a
 * stub — what matters is that the figures are present, that the sizes never go
 * below the floor, and that the picture grows to fit the field.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import "../boardimage.js";

const IMG = (globalThis as { ClubhouseBoardImage: any }).ClubhouseBoardImage;

/** A crude but monotonic stand-in for canvas text measurement. */
const measure = (t: string, s: number) => t.length * s * 0.55;

interface Player {
  name: string; net: number | null; final: number | null;
  rank: number | null; tieNote: string; eligible: boolean; holesPlayed: number;
}
const man = (name: string, rank: number, net: number, final: number,
             extra: Partial<Player> = {}): Player => ({
  name, net, final, rank, tieNote: "", eligible: true, holesPlayed: 18, ...extra });

const ROUND = {
  course: "Aberdeen Golf & Country Club", date: "2026-08-14",
  dateText: "14 August 2026", note: "",
  players: [
    man("Whitfield, Abe", 1, 72, 63.8),
    man("Castellan, Ben", 2, 71, 64.3),
    man("Ashford, Cy", 3, 69, 66.1),
  ],
};
const plan = (round: unknown = ROUND, opts: Record<string, unknown> = {}) =>
  IMG.layout(round, { measure, ...opts });

const texts = (p: { ops: { text?: string }[] }) =>
  p.ops.filter((o) => o.text != null).map((o) => o.text as string);

/* ---- everything on the board is in the picture ---- */

test("every man's name, net and final is drawn", () => {
  const t = texts(plan());
  for (const p of ROUND.players) {
    assert.ok(t.includes(p.name), p.name + " is missing");
    assert.ok(t.some((x) => x.includes("Net " + p.net)), "net for " + p.name);
    assert.ok(t.includes(p.final.toFixed(1)), "final for " + p.name);
  }
});

test("the finals carry their decimal, as the board does", () => {
  const t = texts(plan());
  assert.ok(t.includes("63.8"));
  assert.ok(t.includes("64.3"), "64.3, not 64");
});

test("the heading says where, when and how many", () => {
  const t = texts(plan());
  assert.ok(t.includes("Leaderboard"));
  // The sub-heading wraps, so it is read as a whole rather than a single line.
  const sub = t.slice(1, 4).join(" ");
  assert.match(sub, /Aberdeen Golf & Country Club/);
  assert.match(sub, /14 August 2026/);
  assert.match(sub, /3 players/);
});

// The heading, the footer and the names all overflowed the right edge on the
// first drawing — the tests passed because they only checked the words were
// there, not that they fitted. Nothing may now be drawn wider than the picture.
test("nothing is drawn past the right edge", () => {
  for (const round of [ROUND,
    { ...ROUND, note: "85% handicap allowance · skins not played" },
    { ...ROUND, players: [man("Bezuidenhout-Wolstenholme, Christiaan", 1, 72, 63.8)] }]) {
    for (const op of plan(round).ops as { text?: string; size: number; x: number; align?: string }[]) {
      if (op.text == null) continue;
      const w = measure(op.text, op.size);
      const right = op.align === "right" ? op.x : op.align === "center" ? op.x + w / 2 : op.x + w;
      assert.ok(right <= IMG.W + 0.5,
        JSON.stringify(op.text) + " runs to " + right.toFixed(0) + ", past " + IMG.W);
    }
  }
});

test("a name never overlaps the final beside it", () => {
  const p = plan({ ...ROUND, players: [man("Bezuidenhout-Wolstenholme, Chris", 1, 72, 63.8)] });
  const name = (p.ops as { text?: string; size: number; x: number; align?: string }[])
    .find((o) => o.text != null && /Bezuidenhout|Chris/.test(o.text))!;
  const final = (p.ops as { text?: string; size: number; x: number; align?: string }[])
    .find((o) => o.text === "63.8")!;
  const nameRight = name.x + measure(name.text!, name.size);
  const finalLeft = final.x - measure(final.text!, final.size);
  assert.ok(nameRight < finalLeft, "the name reaches " + nameRight.toFixed(0) +
    " and the final starts at " + finalLeft.toFixed(0));
});

test("prose wraps on words, never mid-word", () => {
  const lines = IMG.wrap("Final = net score less the strokes earned in the contests.",
    200, 18, measure);
  assert.ok(lines.length > 1, "it has to wrap at all");
  assert.equal(lines.join(" "), "Final = net score less the strokes earned in the contests.",
    "and nothing is lost or added in the wrapping");
  for (const line of lines) assert.ok(measure(line, 18) <= 200, JSON.stringify(line));
});

test("one man is a player, not players", () => {
  const one = plan({ ...ROUND, players: [ROUND.players[0]] });
  assert.ok(texts(one).some((x) => /1 player\b/.test(x) && !/players/.test(x)));
});

test("an off-default note rides on the picture too", () => {
  const t = texts(plan({ ...ROUND, note: "85% handicap allowance" }));
  assert.ok(t.includes("85% handicap allowance"));
});

test("the footer says what a final is", () => {
  assert.ok(texts(plan()).some((x) => /Final = net score less/.test(x)));
});

/* ---- legibility, which is the whole point of the product ---- */

// The app never renders anything below 18px and neither may the picture. A
// scoreboard nobody can read is worse than no scoreboard.
test("nothing is drawn below the 18-point floor", () => {
  for (const round of [ROUND, { ...ROUND, players: [
    man("Bezuidenhout-Wolstenholme, Christiaan", 1, 72, 63.8)] }]) {
    for (const op of plan(round).ops) {
      if (op.text == null) continue;
      assert.ok(op.size >= IMG.MIN_TYPE,
        JSON.stringify(op.text) + " drawn at " + op.size);
    }
  }
});

test("a long name shrinks, then loses its surname, and never goes below the floor", () => {
  const long = "Bezuidenhout-Wolstenholme, Christiaan";
  const tight = IMG.fitName(long, 60, measure);
  assert.equal(tight.size, IMG.MIN_TYPE, "shrunk all the way to the floor");
  assert.ok(tight.text.length < long.length, "and then shortened");

  const roomy = IMG.fitName("Ashford, Cy", 300, measure);
  assert.equal(roomy.text, "Ashford, Cy", "a short name is left alone");
  assert.equal(roomy.size, IMG.TYPE.name, "at full size");
});

test("the surname becomes an initial the way the app does it", () => {
  assert.equal(IMG.abbreviate("Christiaan Bezuidenhout"), "Christiaan B.");
  assert.equal(IMG.abbreviate("Cher"), "Cher", "one word is left alone");
});

/* ---- the picture grows to fit the field ---- */

test("more men make a taller picture, and the width never moves", () => {
  const heights = [1, 3, 8, 16].map((n) => plan({ ...ROUND,
    players: Array.from({ length: n }, (_, i) => man("Player " + i, i + 1, 70 + i, 65 + i)) }));
  for (let i = 1; i < heights.length; i++) {
    assert.ok(heights[i].height > heights[i - 1].height, "taller at step " + i);
    assert.equal(heights[i].width, heights[0].width, "and the same width");
  }
});

test("it is drawn at three times size, so the type stays crisp", () => {
  const p = plan();
  assert.equal(p.scale, 3);
  assert.equal(p.width, 360, "laid out for a 360-point phone");
});

/* ---- the things the board says about a man ---- */

test("the leader's row is tinted, and only his", () => {
  const p = plan();
  const gold = p.ops.filter((o: { rect?: boolean; fill: string; w: number }) =>
    o.rect && o.fill === IMG.LEADER && o.w === IMG.W);
  assert.equal(gold.length, 1, "exactly one row is the leader's");
});

test("a tie note is drawn when there was one to settle", () => {
  const t = texts(plan({ ...ROUND, players: [
    man("Whitfield, Abe", 1, 72, 63.8, { tieNote: "won on the back nine" }),
    man("Castellan, Ben", 2, 72, 63.8)] }));
  assert.ok(t.includes("won on the back nine"));
});

test("a man who did not finish is under his own heading and marked", () => {
  const t = texts(plan({ ...ROUND, players: [
    man("Whitfield, Abe", 1, 72, 63.8),
    man("Walked, In", null, 55, 50, { eligible: false, holesPlayed: 12 })] }));
  assert.ok(t.some((x) => /NOT ELIGIBLE/.test(x)), "the heading");
  assert.ok(t.includes("not eligible"), "and the line on his row");
  assert.ok(t.includes("–"), "his placing is a dash, not a number");
});

test("a partial round says how far he got", () => {
  const t = texts(plan({ ...ROUND, players: [
    man("Walked, In", 1, 55, 50, { holesPlayed: 12 })] }));
  assert.ok(t.some((x) => /12 holes/.test(x)));
});

test("a man with no card says so rather than showing a nothing", () => {
  const t = texts(plan({ ...ROUND, players: [
    man("Nocard, Ned", 1, null, null, { holesPlayed: 0 })] }));
  assert.ok(t.includes("no card"));
  assert.ok(t.includes("—"), "and an em dash where the final would be");
});

/* ---- painting ---- */

test("paint puts every operation onto the context, and nothing else", () => {
  const calls: string[] = [];
  const ctx = {
    save: () => calls.push("save"), restore: () => calls.push("restore"),
    scale: (x: number) => calls.push("scale " + x),
    fillRect: () => calls.push("rect"),
    fillText: (t: string) => calls.push("text " + t),
    set fillStyle(_v: string) { /* ignored */ },
    set font(_v: string) { /* ignored */ },
    set textAlign(_v: string) { /* ignored */ },
    set textBaseline(_v: string) { /* ignored */ },
  };
  const p = plan();
  IMG.paint(ctx, p);
  assert.equal(calls[0], "save");
  assert.equal(calls[1], "scale 3");
  assert.equal(calls[calls.length - 1], "restore");
  const drawn = calls.filter((c) => c.startsWith("rect") || c.startsWith("text"));
  assert.equal(drawn.length, p.ops.length + 1, "every op, plus the paper underneath");
});

/* ---- the picture has to look like the app ---- */

// The canvas has no cascade, so the palette is repeated in boardimage.js. These
// hold the two copies together: change clubhouse.css and this fails.
test("the colours are the stylesheet's own", () => {
  const css = readFileSync(new URL("../clubhouse.css", import.meta.url), "utf8");
  for (const [name, value] of [["--band", IMG.BAND], ["--wash", IMG.WASH]]) {
    assert.ok(css.includes(name + ": " + value),
      name + " is " + value + " in boardimage.js but not in clubhouse.css");
  }
  assert.ok(css.includes(IMG.LEADER), "the leader tint " + IMG.LEADER + " is not in the stylesheet");
});

test("the type sizes are the stylesheet's own", () => {
  const css = readFileSync(new URL("../clubhouse.css", import.meta.url), "utf8");
  const row = css.slice(css.indexOf("  .row {"), css.indexOf(".row.leader"));
  for (const [what, size] of [["name", IMG.TYPE.name], ["meta", IMG.TYPE.meta],
                              ["final", IMG.TYPE.final], ["rank", IMG.TYPE.rank]]) {
    assert.ok(row.includes("font-size: " + size + "px"),
      what + " is " + size + " in the picture but not in the row style");
  }
});

/* ---- the file it becomes ---- */

test("the picture is named after the round and its date", () => {
  assert.equal(IMG.imageFilename("Friday", "2026-08-14"), "Friday 2026-08-14 leaderboard.png");
  assert.equal(IMG.imageFilename("", ""), "round leaderboard.png", "never a nameless file");
  assert.equal(IMG.imageFilename("Sat/Sun 9am", "2026-08-14"),
    "Sat-Sun 9am 2026-08-14 leaderboard.png", "nothing a file system objects to");
});
