/**
 * THE INDEX SHEET, READ BY THE REAL INVITES SCREEN.
 *
 * The sheet is served from here in place of Google, so each case can change
 * it between visits: an index moves, a man is added, one is not playing, one
 * row is wrong. The rules themselves are pinned in test/indexFeed.test.ts;
 * this proves the screen applies them, keeps them over a reload, and asks
 * before anybody leaves the round.
 *
 *     npm i --no-save playwright
 *     node test/browser/indexSheet.smoke.mjs
 */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";

const ROOT = new URL("../../", import.meta.url);
const SHEET_URL = "https://sheets.invalid/index.csv";
let page = readFileSync(new URL("leaderboard.html", ROOT), "utf8");
const shipped = page;
page = page.replace(/^const INDEX_CSV = "[^"]*";$/m, `const INDEX_CSV = "${SHEET_URL}";`);
if (page === shipped) throw new Error("INDEX_CSV was not stubbed — leaderboard.html has changed shape");

const HEAD = "name,index,tee,playing";
let sheet = "";
let sheetDown = false;

// A round of four, one with picks in (so taking him out has something to lose).
const player = (id, name, index, tee, extra = {}) =>
  ({ id, name, ghin: "", index, tee, gender: "M", cart: null, team: "", flight: "", hitList: "", ...extra });
const STORE = {
  version: 2, nextEventId: 2, currentId: "e1", roster: [],
  events: [{
    id: "e1", name: "Friday", date: "2026-09-30", format: "Individual net",
    nextId: 5, scores: {}, handicaps: {}, autoPicks: false, autoHitList: false,
    allowancePercent: 100, flight: "", lastTee: "IV", tab: "round", invitesSent: {},
    contests: null, exportedAt: null, exportedSignature: null,
    players: [
      player("p1", "Smith, Alan", 12.4, "IV"),
      player("p2", "Levy, Rich", 20.1, "IV"),
      player("p3", "Wallach, Mike", 8, "III"),
      player("p4", "Brown, Tom", 15, "IV", { hitList: "Smith, Alan" }),
    ],
  }],
};

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await b.newContext({ viewport: { width: 375, height: 760 } });
await ctx.addInitScript(s => {
  if (!sessionStorage.getItem("seeded")) {
    localStorage.setItem("btc.clubhouse.v2", s); sessionStorage.setItem("seeded", "1");
  }
}, JSON.stringify(STORE));
let sheetReads = 0;
await ctx.route("**/*", async route => {
  const u = new URL(route.request().url());
  if (u.href.startsWith(SHEET_URL)) {
    sheetReads++;
    return sheetDown ? route.abort("internetdisconnected")
                     : route.fulfill({ contentType: "text/csv", body: sheet });
  }
  const file = u.pathname.split("/").pop();
  if (file === "leaderboard.html") return route.fulfill({ contentType: "text/html", body: page });
  const f = new URL(file, ROOT);
  if (u.host === "x" && file && existsSync(f)) {
    const type = { js: "text/javascript", css: "text/css", png: "image/png" }[file.split(".").pop()] || "text/plain";
    return route.fulfill({ contentType: type, body: readFileSync(f) });
  }
  return route.fulfill({ status: 404, body: "" });
});

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? "  ok   " : "  FAIL ") + m); };
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", e => errors.push(String(e)));
await p.goto("http://x/leaderboard.html"); await p.waitForTimeout(400);

const openInvites = async () => {
  await p.evaluate(() => { const back = document.getElementById("invitesBack");
    if (back && back.offsetParent) back.click(); });
  await p.evaluate(() => document.getElementById("goInvites").click());
  await p.waitForTimeout(500);
  return p.innerText("#invitesScreen");
};
const stored = () => p.evaluate(() =>
  JSON.parse(localStorage.getItem("btc.clubhouse.v2")).events[0]);

// 1 · the sheet agrees with the round: it says so, and every man is invited
sheet = [HEAD, '"Smith, Alan",12.4,IV,TRUE', '"Levy, Rich",20.1,IV,TRUE',
         '"Wallach, Mike",8,III,TRUE', '"Brown, Tom",15,IV,TRUE'].join("\n");
let txt = await openInvites();
ok(sheetReads === 1, "opening Invites read the sheet once: " + sheetReads);
ok(/Index sheet read at .*Nothing had changed/.test(txt), "it says nothing had changed");
ok((await p.$$("#invitesScreen .pvn")).length === 4, "all four men are on the list");

// Record Smith's six as sent, as tapping Text would, so a change can be seen.
await p.evaluate(() => { const e = JSON.parse(localStorage.getItem("btc.clubhouse.v2"));
  return e; });
await p.evaluate(() => {
  // markSent is the page's own function; this is exactly what its button calls.
  // eslint-disable-next-line no-undef
  markSent(state.players.find(x => x.id === "p1"), "text");
});

// 2 · the sheet moves: an index, an add, one not playing, one bad row
sheet = [HEAD,
  '"Smith, Alan",12.4,IV,TRUE',
  '"Levy, Rich",20.1,Blue,TRUE',        // a tee the course does not have
  '"Wallach, Mike",12,III,TRUE',        // 8 → 12: now inside Smith's equal band
  '"Brown, Tom",15,IV,',                // not playing
  '"Knazick, Mike",19.5,IV,TRUE',       // new
].join("\n");
txt = await openInvites();
ok(/Wallach, Mike 8 → 12/.test(txt), "the index change is named: " + (txt.match(/Index sheet read[^\n]*/) || [""])[0]);
ok(/added Knazick, Mike/.test(txt), "the new man is named as added");
ok(/Levy, Rich: no tee called “Blue”/.test(txt), "the bad row is refused and named");
ok(/Take Brown, Tom out — not marked TRUE/.test(txt), "the man not playing is listed with a button");
const names = await p.$$eval("#invitesScreen .pvn", e => e.map(x => x.textContent));
ok(!names.some(n => /Tom Brown/.test(n)), "and he is sent nothing: " + names.join(", "));
ok(names.some(n => /Mike Knazick/.test(n)), "the added man is sent a link");
ok(/Alan Smith[\s\S]*his six have CHANGED/.test(txt), "Smith's row says his six have changed");
let e = await stored();
ok(e.players.find(x => x.id === "p3").index === 12, "Wallach's index is 12 in the round");
ok(e.players.find(x => x.id === "p2").tee === "IV", "Levy's refused row changed nothing");
ok(e.players.some(x => x.name === "Knazick, Mike" && x.index === 19.5 && x.tee === "IV"), "Knazick is in the round");
ok(e.players.some(x => x.id === "p4"), "Brown is still in the round — listed, not removed");

// 3 · Smith's six no longer holds Brown, who is not playing
const six = await p.evaluate(() => sixFor(state.players.find(x => x.id === "p1")).map(o => o.name));
ok(!six.includes("Tom Brown"), "Brown counts toward nobody's six: " + six.join(", "));

// 4 · taking him out asks first, and No keeps him
let asked = "";
p.once("dialog", d => { asked = d.message(); d.dismiss(); });
await p.click("[data-sheet-out='p4']"); await p.waitForTimeout(200);
ok(/picks and Hit List pick go with him/.test(asked), "it asks, and says what he loses: " + JSON.stringify(asked));
ok((await stored()).players.some(x => x.id === "p4"), "No keeps him in");
p.once("dialog", d => d.accept());
await p.click("[data-sheet-out='p4']"); await p.waitForTimeout(300);
ok(!(await stored()).players.some(x => x.id === "p4"), "Yes takes him out");
ok(!/Take Brown/.test(await p.innerText("#invitesScreen")), "and the button goes with him");

// 5 · no signal: nothing changes, and the screen says why
sheetDown = true;
sheet = [HEAD, '"Smith, Alan",30,IV,TRUE'].join("\n");
txt = await openInvites();
ok(/Could not read the Index sheet/.test(txt), "a failed read says so");
ok((await stored()).players.find(x => x.id === "p1").index === 12.4, "and changes nothing");

// 6 · a wrong header reads nothing and says what it should be
sheetDown = false;
sheet = "Name,Handicap,Tee\n\"Smith, Alan\",30,IV";
txt = await openInvites();
ok(/first row should be name,index,tee,playing/.test(txt), "a wrong header is named");
ok((await stored()).players.find(x => x.id === "p1").index === 12.4, "and nothing is read from it");

// 7 · what the sheet said survives a reload
await p.reload(); await p.waitForTimeout(400);
e = await stored();
ok(e.indexSheet && Array.isArray(e.indexSheet.notPlaying), "the last reading was kept over a reload");

ok(errors.length === 0, "no script errors: " + errors.join(" | "));
await b.close();
console.log(fails.length ? "\nFAILED: " + fails.length : "\nall index sheet checks passed");
process.exit(fails.length ? 1 : 0);
