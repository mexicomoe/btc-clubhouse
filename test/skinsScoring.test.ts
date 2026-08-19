/**
 * Skins scoring into FINAL — what a skin is worth, and to whom.
 *
 * Skins cannot be settled on a single card: it needs the whole field, group
 * against group. So it is added by `computeLeaderboard` rather than by
 * `scorePlayer`.
 *
 * A FIXED POT, divided among however many skins were actually won. The whole
 * contest is worth 4.0 every week whatever the round does, so a lean day makes
 * each skin worth MORE, not less. That replaced a per-skin value that scaled
 * with the field and a ceiling on top of it, which existed only to stop Skins
 * outgrowing the other contests in a big field — a fixed pot cannot.
 *
 * Every player in a winning group takes the FULL per-skin amount; it is not
 * divided between them.
 *
 * THE FIELD SIZE DECIDES THE FORMAT: none under 8, cart against cart from 8 to
 * 15, team against team from 16.
 *
 * The hole-by-hole engine — best two balls, the lone ball counted twice, the
 * tied hole nobody wins — is covered in cartSkins.test.ts. This is about what
 * the skins are then worth.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ABERDEEN_TEE_IV, DEFAULT_CONTESTS } from "../src/courseConfig.ts";
import { computeLeaderboard, type PlayerCard } from "../src/scoring.ts";
import { cartSkins, skinStrokes, skinValue, skinsFormat } from "../src/skins.ts";

const PAR = ABERDEEN_TEE_IV.par;
const CFG = DEFAULT_CONTESTS.skins!;
const SIX = { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 };

function card(name: string, cart: number | null, edit: (g: (number | null)[]) => void = () => {}): PlayerCard {
  const gross = PAR.slice() as (number | null)[];
  edit(gross);
  return { name, courseHandicap: 0, gross, picks: { ...SIX },
           cart: cart == null ? undefined : cart } as PlayerCard;
}

/** A field of `n` men in carts of two — enough to clear the 8-player floor. */
function field(n: number, edit: (i: number, g: (number | null)[]) => void = () => {}) {
  return Array.from({ length: n }, (_, i) =>
    card("P" + (i + 1), Math.floor(i / 2) + 1, (g) => edit(i, g)));
}
const board = (cards: PlayerCard[]) =>
  computeLeaderboard(cards, ABERDEEN_TEE_IV, DEFAULT_CONTESTS);

/* ---- what a skin is worth ---- */

test("the pot is split by the skins actually won, down to a floor", () => {
  assert.equal(CFG.pot, -4);
  assert.equal(CFG.minSkin, -0.4);
  assert.equal(skinValue(CFG, 1), -4, "one skin takes the lot");
  assert.equal(skinValue(CFG, 2), -2);
  assert.equal(skinValue(CFG, 4), -1);
  assert.equal(skinValue(CFG, 8), -0.5);
  assert.equal(skinValue(CFG, 10), -0.4, "at ten the division reaches the floor");
});

test("a skin is never worth less than the floor", () => {
  // Past ten the division would keep shrinking. It does not.
  for (const won of [11, 12, 15, 18]) {
    assert.equal(skinValue(CFG, won), -0.4, won + " skins");
  }
});

test("ABOVE THE FLOOR THE POT IS NO LONGER FIXED, and that is deliberate", () => {
  // Ten skins pay out the 4.0. Eighteen pay out 7.2 between them, because a
  // hole won is a hole won and the men should not find their skins quietly
  // worth less than the round before.
  const paidOut = (won: number) => Math.abs(skinValue(CFG, won)) * won;
  assert.equal(paidOut(10), 4);
  assert.equal(Math.round(paidOut(18) * 10) / 10, 7.2);
  assert.equal(Math.round(paidOut(5) * 10) / 10, 4, "below the floor it is still one pot");
});

test("a lean round makes each skin worth MORE", () => {
  // Which is the point of a pot, and the opposite of the old per-skin model.
  assert.ok(Math.abs(skinValue(CFG, 7)) > Math.abs(skinValue(CFG, 11)));
  assert.equal(skinValue(CFG, 7), -0.57, "the brief's lean round");
});

test("a skin is worth to the hundredth exactly what the tab prints", () => {
  // The Skins tab prints this figure and a man checks his own total against it.
  // Rounded at the hundredth, not left long, or five skins will not add up.
  assert.equal(skinValue(CFG, 3), -1.33);
  assert.equal(skinValue(CFG, 6), -0.67);
  assert.equal(skinValue(CFG, 9), -0.44);
});

test("no skins won is worth nothing rather than dividing by zero", () => {
  assert.equal(skinValue(CFG, 0), 0);
  assert.equal(skinStrokes(0, CFG, 0), 0);
});

test("winning every skin is worth the whole pot, up to the floor", () => {
  for (const won of [1, 5, 10]) {
    assert.equal(Math.abs(skinStrokes(won, CFG, won) + 4) < 0.15, true,
      won + " skins: " + skinStrokes(won, CFG, won));
  }
  // Past ten it is worth MORE than the pot, by design.
  assert.equal(skinStrokes(18, CFG, 18), -7.2);
});

test("nought skins is nought, never a negative nought", () => {
  const s = skinStrokes(0, CFG, 11);
  assert.equal(s, 0);
  assert.equal(Object.is(s, -0), false);
});

test("every total is a clean tenth", () => {
  for (let won = 1; won <= 18; won++) {
    for (let mine = 0; mine <= won; mine++) {
      const s = skinStrokes(mine, CFG, won);
      assert.equal(Math.round(s * 10) / 10, s, mine + "/" + won);
    }
  }
});

/* ---- the format follows the field ---- */

test("the field size decides the format, not a switch", () => {
  assert.equal(skinsFormat(0, CFG), null);
  assert.equal(skinsFormat(7, CFG), null);
  assert.equal(skinsFormat(8, CFG), "cart");
  assert.equal(skinsFormat(15, CFG), "cart");
  assert.equal(skinsFormat(16, CFG), "team");
});

test("a field under eight plays no skins at all", () => {
  const rows = board(field(6));
  for (const r of rows) {
    assert.equal(r.contests.skins!.live, false);
    assert.equal(r.contests.skins!.strokes, 0);
    assert.match(r.contests.skins!.detail, /no skins under 8/);
  }
});

test("eight men is enough, and it is carts", () => {
  const rows = board(field(8, (i, g) => { if (i === 0) g[0] = PAR[0] - 2; }));
  assert.ok(rows.some((r) => r.contests.skins!.live), "skins ran");
});

test("sixteen men is teams, and a field with no teams pays nobody", () => {
  // Everyone has a cart and nobody has a team. At sixteen the contest asks for
  // teams, so it must say so rather than quietly falling back to carts.
  const rows = board(field(16));
  for (const r of rows) {
    assert.equal(r.contests.skins!.live, false);
    assert.match(r.contests.skins!.detail, /no teams entered/);
  }
});

test("sixteen men in teams play team skins", () => {
  const cards = field(16, (i, g) => { if (i < 2) g[0] = PAR[0] - 2; });
  cards.forEach((c, i) => { (c as any).team = "T" + (Math.floor(i / 4) + 1); });
  const rows = board(cards);
  assert.ok(rows.some((r) => r.contests.skins!.live));
  assert.match(rows.find((r) => r.contests.skins!.live)!.contests.skins!.detail, /for team T/);
});

/* ---- into the final ---- */

test("skins is shown as a contest and moves the final by exactly its worth", () => {
  // Cart 1 alone birdies the first, so it wins one hole and nobody else wins
  // any: one skin won in the whole round, worth the entire pot.
  const cards = field(8, (i, g) => { if (i === 0) g[0] = PAR[0] - 2; });
  const rows = board(cards);
  const winner = rows.find((r) => r.name === "P1")!;
  const loser = rows.find((r) => r.name === "P5")!;

  assert.equal(winner.contests.skins!.live, true);
  assert.match(winner.contests.skins!.detail, /skin.* for group 1/);
  assert.equal(loser.contests.skins!.strokes, 0);

  // The base is ZERO, so the final IS the contest total — skins included.
  const sum = (r: typeof winner) =>
    Math.round(Object.values(r.contests).reduce((n, c) => n + (c as any).strokes, 0) * 10) / 10;
  assert.equal(winner.final, sum(winner));
  assert.equal(loser.final, sum(loser));
});

test("both men in a winning cart take the full amount, not half each", () => {
  const cards = field(8, (i, g) => { if (i === 0) g[0] = PAR[0] - 2; });
  const rows = board(cards);
  const a = rows.find((r) => r.name === "P1")!.contests.skins!.strokes;
  const b = rows.find((r) => r.name === "P2")!.contests.skins!.strokes;
  assert.equal(a, b);
  assert.ok(a < 0, "and it is worth something");
});

/* ---- who is in it ---- */

test("a player with no cart scores zero from skins rather than breaking", () => {
  const cards = field(8);
  (cards[7] as any).cart = undefined;
  const rows = board(cards);
  const out = rows.find((r) => r.name === "P8")!;
  assert.equal(out.contests.skins!.strokes, 0);
  assert.equal(out.contests.skins!.live, false);
  assert.match(out.contests.skins!.detail, /no group/);
});

test("one cart out means no skins at all", () => {
  // Uncontested it would win every hole by default for going round on its own.
  const cards = field(8).map((c) => { (c as any).cart = 1; return c; });
  const rows = board(cards);
  for (const r of rows) {
    assert.equal(r.contests.skins!.live, false);
    assert.match(r.contests.skins!.detail, /only one group out/);
  }
});

test("a man who did not finish takes no skins, even from a cart that won them", () => {
  // His card would otherwise win holes for his group and then abandon it.
  const cards = field(8, (i, g) => { if (i === 0) g[0] = PAR[0] - 2; });
  (cards[1] as any).gross = PAR.map((p, h) => (h < 9 ? p : null));
  const rows = board(cards);
  const short = rows.find((r) => r.name === "P2")!;
  assert.equal(short.contests.skins!.strokes, 0);
  assert.match(short.contests.skins!.detail, /no full round/);
  assert.equal(short.final, null, "and he is not scored at all");
});

test("skins switched off scores nothing and reads no cart", () => {
  const rows = computeLeaderboard(field(8), ABERDEEN_TEE_IV,
    { ...DEFAULT_CONTESTS, skins: null } as any);
  for (const r of rows) assert.equal(r.contests.skins, undefined);
});

/* ---- the table itself ---- */

test("the table reports what it settled, for the tab to print", () => {
  const cards = field(8, (i, g) => { if (i === 0) g[0] = PAR[0] - 2; });
  const t = cartSkins(cards.map((c) => ({ card: c, cart: (c as any).cart })), ABERDEEN_TEE_IV);
  let won = 0; t.skins.forEach((n) => { won += n; });
  const tied = t.holes.filter((h) => h.wonBy == null).length;
  assert.equal(won + tied, 18, "every hole is won or tied, and none carries");
  assert.equal(t.carried, 0);
});
