/**
 * THE TEAM MAKER, DRIVEN AT 400 PIXELS.
 *
 * Every send is intercepted; the roll call is a made-up feed served here.
 * Covers the awkward counts (12, 13, 17, 21, 24, and 25, which must refuse),
 * a feed that will not load, a page with no feed address, swap, lock, and
 * what Copy puts on the clipboard. The Pairs log is served here too: the
 * rule split, the rule broken and said by name, an unplayed round ignored,
 * and a log that will not load, which must never stop the teams.
 *
 * Not part of `npm test`, like the other browser checks. Run it by hand:
 *
 *     npm i --no-save playwright
 *     node test/browser/teams.smoke.mjs /tmp/shots
 */
import { chromium } from "playwright";
import { readFileSync } from "fs";

const SRC = readFileSync(new URL("../../teams.html", import.meta.url), "utf8");
const OUT = process.argv[2] || ".";
const stubbed = SRC.replace(/^var ROLL_CSV = "[^"]*";$/m, 'var ROLL_CSV = "https://sheets.invalid/roll.csv";')
  .replace(/^var PAIRS_CSV = "[^"]*";$/m, 'var PAIRS_CSV = "https://sheets.invalid/pairs.csv";');
if (!stubbed.includes("roll.csv") || !stubbed.includes("pairs.csv")) throw new Error("feeds were not stubbed — teams.html has changed shape");

/** A Pairs log: one column per round, rows 2-25 the seats. */
const pairsLog = cols => {
  const q = x => '"' + x + '"';
  const rows = [cols.map(c => q(c.date))];
  for (let r = 0; r < 24; r++) rows.push(cols.map(c => q(c.names[r] ?? "")));
  return rows.map(r => r.join(",")).join("\n");
};
const nm = i => `Surname${String.fromCharCode(65 + (i % 26))}${i >= 26 ? i : ""}, First`;

const roll = n => ["name,index,tee", ...Array.from({ length: n }, (_, i) =>
  `"Surname${String.fromCharCode(65 + (i % 26))}${i >= 26 ? i : ""}, First",${(19 + (15 * i) / Math.max(1, n - 1)).toFixed(1)},IV`)].join("\n");

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? "  ok   " : "  FAIL ") + m); };

async function open(feed, { page = stubbed, offline = false, pairs = "", pairsOffline = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
  await ctx.route("**/*", route => {
    const u = route.request().url();
    if (u.endsWith("/teams.html")) return route.fulfill({ contentType: "text/html", body: page });
    if (u.includes("roll.csv")) return offline ? route.abort("internetdisconnected")
                                               : route.fulfill({ contentType: "text/csv", body: feed });
    if (u.includes("pairs.csv")) return pairsOffline ? route.abort("internetdisconnected")
                                                     : route.fulfill({ contentType: "text/csv", body: pairs });
    return route.fulfill({ status: 404, body: "" });
  });
  // The test page is plain http, where a browser gives no clipboard; GitHub
  // Pages is https. A stand-in records what Copy writes.
  await ctx.addInitScript(() => {
    let held = "";
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: t => { held = t; return Promise.resolve(); }, readText: () => Promise.resolve(held) } });
  });
  const p = await ctx.newPage();
  await p.goto("http://x/teams.html"); await p.waitForTimeout(300);
  return { ctx, p };
}
const noScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const [n, T, blinds] of [[12, 3, 0], [13, 4, 3], [17, 5, 3], [21, 6, 3], [24, 6, 0]]) {
  console.log(`${n} men`);
  const { ctx, p } = await open(roll(n));
  ok((await p.innerText("#status")).startsWith(`${n} men said yes — ${T} teams.`), "says who and how many: " + await p.innerText("#status"));
  await p.click("#make"); await p.waitForTimeout(150);
  const teams = await p.$$eval(".team", ts => ts.map(t => ({
    head: t.querySelector("h2").textContent,
    labs: [...t.querySelectorAll(".lab")].map(x => x.textContent).join(""),
    men: [...t.querySelectorAll(".man .nm")].map(x => x.textContent),
  })));
  ok(teams.length === T, `${T} teams drawn: ${teams.length}`);
  ok(teams.every(t => t.labs === "ABCD"), "every team is lettered A-D");
  ok(teams.every(t => /total \d+\.\d · avg \d+\.\d/.test(t.head)), "every team shows its index total and average");
  const bl = teams.map(t => t.men.filter(x => x === "BLIND").length);
  ok(bl.reduce((a, c) => a + c, 0) === blinds && bl.every(x => x <= 1), "BLINDs, at most one per team: " + bl);
  const notes = await p.innerText("#notes");
  ok(blinds ? notes.includes(`${blinds} BLINDs fill the empty seats`) : !notes.includes("BLIND"), "says how many BLINDs");
  ok(await noScroll(p), "no sideways scroll at 400px");
  const cut = await p.$$eval(".man .ix", e => e.filter(x => x.getBoundingClientRect().right > window.innerWidth).length);
  ok(cut === 0, "every index is on screen");
  if (n === 24) {
    // swap: tap A of team 1, then A of team 2
    const before = await p.$$eval(".team", ts => ts.map(t => [...t.querySelectorAll(".man .nm")].map(x => x.textContent)));
    await p.locator(".man").nth(0).click(); await p.locator(".man").nth(4).click(); await p.waitForTimeout(100);
    const after = await p.$$eval(".team", ts => ts.map(t => [...t.querySelectorAll(".man .nm")].map(x => x.textContent)));
    ok(after[0].includes(before[1][0]) && after[1].includes(before[0][0]), "two taps swap two men");
    // lock a man on team 3, make again, he is still there
    const locked = after[2][1];
    await p.locator(".team").nth(2).locator(".lock").nth(1).click(); await p.waitForTimeout(50);
    const clipped = await p.$$eval(".lock", e => e.filter(x => x.scrollWidth > x.clientWidth + 1).map(x => x.textContent));
    ok(clipped.length === 0, "Lock and Locked both fit: " + clipped);
    for (let k = 0; k < 4; k++) {
      await p.click("#again"); await p.waitForTimeout(100);
      const t3 = await p.$$eval(".team", ts => [...ts[2].querySelectorAll(".man .nm")].map(x => x.textContent));
      ok(t3.includes(locked), `a locked man stays on team 3 (again #${k + 1})`);
    }
    // copy
    await p.click("#copy"); await p.waitForTimeout(150);
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    const lines = clip.split("\n");
    ok(lines.length === 24 && lines.every(l => /^Surname\w+, First$/.test(l)), "Copy: 24 names, spelled as the feed spelled them");
    const shown = (await p.$$eval(".team", ts => ts.map(t => [...t.querySelectorAll(".man .nm")].map(x => x.textContent)))).flat();
    ok(JSON.stringify(lines) === JSON.stringify(shown), "Copy is team then seat, as shown");
    ok((await p.innerText("#copied")).includes("Select A4:A27 in Players, press Delete, then click in A4 and paste."), "says where it goes, clear first");
    const order = await p.evaluate(() => !!(document.getElementById("clearFirst").compareDocumentPosition(document.getElementById("copy")) & Node.DOCUMENT_POSITION_FOLLOWING));
    ok(order && (await p.innerText("#clearFirst")) === "Select A4:A27 in Players, press Delete, then click in A4 and paste.", "the clear-first instruction sits above Copy");
    await p.click("#again"); await p.waitForTimeout(100);
    ok(!(await p.innerText("#notes")).includes("recent pairings"), "an empty Pairs log gives no recent pairings");
    ok((await p.innerText("#notes")).includes("no rounds in the Pairs log before this Friday"), "and says so");
    await p.screenshot({ path: OUT + "/teams-24.png", fullPage: true });
  }
  if (n === 13) {
    await p.click("#copy"); await p.waitForTimeout(150);
    const lines = (await p.evaluate(() => navigator.clipboard.readText())).split("\n");
    ok(lines.length === 24 && lines.slice(16).every(l => l === ""), "13 men: 16 seats, then 8 blank lines");
    ok(lines.filter(l => l === "BLIND").length === 3, "BLIND spelled exactly that way, three times");
    await p.screenshot({ path: OUT + "/teams-13.png", fullPage: true });
  }
  await ctx.close();
}

console.log("25 men");
{
  const { ctx, p } = await open(roll(25));
  const s = await p.innerText("#status");
  ok(s.includes("25 men said yes. The sheet holds 24") && s.includes("Take 1 off"), "25 refuses plainly: " + s);
  ok(!(await p.isVisible("#make")), "and offers no button");
  ok((await p.innerText("#who")).split(" · ").length === 25, "and still lists all 25, so Rob can see who");
  await ctx.close();
}

console.log("feed will not load");
{
  const { ctx, p } = await open("", { offline: true });
  ok((await p.innerText("#status")).startsWith("Couldn't reach the roll call."), "says so plainly");
  ok(!(await p.isVisible("#make")), "no button");
  await ctx.close();
}

console.log("feed is an error page");
{
  const { ctx, p } = await open("<!DOCTYPE html><html><body>Sign in</body></html>");
  ok((await p.innerText("#status")).includes("without a name column"), "says so plainly");
  await ctx.close();
}

console.log("nobody yet");
{
  const { ctx, p } = await open("name,index,tee\n,,\n,,");
  ok((await p.innerText("#status")) === "Nobody has said yes yet.", "says so plainly");
  await ctx.close();
}

console.log("no address set");
{
  const blank = SRC.replace(/^var ROLL_CSV = "[^"]*";$/m, 'var ROLL_CSV = "";');
  const { ctx, p } = await open("", { page: blank });
  ok((await p.innerText("#status")).includes("address isn't set yet"), "says so, rather than an empty screen");
  await ctx.close();
}

console.log("Pairs log: the rule split");
{
  // 12 men, the lowest four together the last two rounds; an unplayed round far ahead is ignored.
  const four = [0, 1, 2, 3].map(nm);
  const { ctx, p } = await open(roll(12), { pairs: pairsLog([
    { date: "2026-01-02", names: four }, { date: "2026-01-09", names: four }, { date: "2099-01-02", names: [nm(4), nm(5)] }]) });
  await p.click("#make"); await p.waitForTimeout(300);
  const teams = await p.$$eval(".team", ts => ts.map(t => [...t.querySelectorAll(".man .nm")].map(x => x.textContent)));
  const worst = Math.max(...teams.map(t => t.filter(x => four.includes(x)).length));
  ok(worst <= 2, "the four are spread, at most two on a team (12 men, 3 teams): " + worst);
  const notes = await p.innerText("#notes");
  ok(notes.includes("History: rounds of 2 Jan and 9 Jan."), "names the two rounds read, not the unplayed one");
  ok(/Avoided \d+ of 6 recent pairings\./.test(notes), "says how many recent pairings were avoided");
  // 12 men in 3 teams from 4 old partners: one team must hold two of them.
  ok((notes.match(/Had to allow/g) || []).length === 1 && notes.includes("a 3rd week running"), "the one forced pair said by name");
  ok(await noScroll(p), "no sideways scroll at 400px with the long lines");
  await p.screenshot({ path: OUT + "/teams-pairs.png", fullPage: true });
  await ctx.close();
}

console.log("Pairs log: lock wins");
{
  const two = [nm(0), nm(11)];
  const { ctx, p } = await open(roll(12), { pairs: pairsLog([{ date: "2026-01-02", names: two }, { date: "2026-01-09", names: two }]) });
  await p.click("#make"); await p.waitForTimeout(300);
  // Swap the two together by hand, then lock both and make again.
  const where = async () => p.$$eval(".team", ts => ts.map(t => [...t.querySelectorAll(".man .nm")].map(x => x.textContent)));
  let t = await where();
  const ta = t.findIndex(x => x.includes(two[0])), tb = t.findIndex(x => x.includes(two[1]));
  ok(ta !== tb, "split to begin with");
  const seatB = t[tb].indexOf(two[1]), victim = t[ta].findIndex(x => x !== two[0]);
  await p.locator(".team").nth(ta).locator(".man").nth(victim).click();
  await p.locator(".team").nth(tb).locator(".man").nth(seatB).click(); await p.waitForTimeout(100);
  ok((await p.innerText("#notes")).includes("because they were swapped together by hand."), "a hand swap is said");
  t = await where();
  for (const n of two) await p.locator(".team").nth(ta).locator(".lock").nth(t[ta].indexOf(n)).click();
  await p.click("#again"); await p.waitForTimeout(300);
  ok((await p.innerText("#notes")).includes("because both are locked on this team."), "a lock is named as the cause");
  await ctx.close();
}

console.log("Pairs log will not load");
{
  const { ctx, p } = await open(roll(12), { pairsOffline: true });
  await p.click("#make"); await p.waitForTimeout(300);
  ok((await p.$$(".team")).length === 3, "teams are still made");
  ok((await p.innerText("#notes")).includes("Couldn't read the Pairs log, so no history was used."), "and it says so");
  await ctx.close();
}

console.log("Pairs log address not set");
{
  const blank = stubbed.replace(/^var PAIRS_CSV = "[^"]*";$/m, 'var PAIRS_CSV = "";');
  const { ctx, p } = await open(roll(12), { page: blank });
  await p.click("#make"); await p.waitForTimeout(300);
  ok((await p.$$(".team")).length === 3 && (await p.innerText("#notes")).includes("Pairs log address isn't set yet"), "teams made, and it says why no history");
  await ctx.close();
}

console.log("storage blocked");
{
  const blocked = stubbed.replace("<script>", "<script>Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}});</script><script>");
  const { ctx, p } = await open(roll(16), { page: blocked });
  await p.click("#make"); await p.waitForTimeout(100);
  ok((await p.$$(".team")).length === 4, "a private window still makes teams");
  await p.click("#copy"); await p.waitForTimeout(150);
  ok((await p.innerText("#copied")).startsWith("Copied."), "and still copies");
  await ctx.close();
}

await b.close();
console.log(fails.length ? "\nFAILED: " + fails.length : "\nall browser checks passed");
process.exit(fails.length ? 1 : 0);
