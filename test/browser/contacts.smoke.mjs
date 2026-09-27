/**
 * MOBILES AND E-MAILS, PASTED ON THE ROSTER SCREEN, REACHING INVITES.
 *
 * Starts where Rob was: every man in the round says "no mobile in the roster".
 * One paste of the Roster tab later, the men it names can be texted, the one
 * it misspells is named and left alone, and nothing it leaves blank is erased.
 *
 *     npm i --no-save playwright
 *     node test/browser/contacts.smoke.mjs
 */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";

const ROOT = new URL("../../", import.meta.url);
let page = readFileSync(new URL("leaderboard.html", ROOT), "utf8");
const shipped = page;
// No Index feed here: this is about contacts, and nothing may leave the machine.
page = page.replace(/^const INDEX_CSV = "[^"]*";$/m, 'const INDEX_CSV = "";');
if (page === shipped) throw new Error("INDEX_CSV was not blanked — leaderboard.html has changed shape");

const player = (id, name, index, extra = {}) =>
  ({ id, name, ghin: "", index, tee: "IV", gender: "M", cart: null, team: "", flight: "", hitList: "", ...extra });
const STORE = {
  version: 2, nextEventId: 2, currentId: "e1",
  roster: [
    { id: "r1", name: "Tanenbaum, Rob", index: 23.6, tee: "IV", gender: "M", email: "", mobile: "" },
    // Saved the other way round, and never tied to his round player by id:
    // only a lookup by name EITHER WAY ROUND finds him from the round.
    { id: "r2", name: "Stu Horvitz", index: 33, tee: "IV", gender: "M", email: "", mobile: "" },
  ],
  events: [{
    id: "e1", name: "Friday", date: "2026-09-30", format: "Individual net",
    nextId: 5, scores: {}, handicaps: {}, autoPicks: false, autoHitList: false,
    allowancePercent: 100, flight: "", lastTee: "IV", tab: "round", invitesSent: {},
    indexSheet: null, contests: null, exportedAt: null, exportedSignature: null,
    players: [
      player("p1", "Tanenbaum, Rob", 23.6, { rosterId: "r1" }),
      player("p2", "Alan Smith", 12.4),          // the other way round from the paste
      player("p3", "Levy, Rich", 20.1),
      player("p4", "Horvitz, Stu", 33),
    ],
  }],
};

const T = (...c) => c.join("\t");
const PASTE = [
  T("THE ROSTER — every man who plays with you", "", "", "", ""),
  T("Name", "Handicap index", "Tee", "Email", "Mobile"),
  T("Tanenbaum, Rob", "23.6", "IV", "rob@example.com", "845-555-0101"),
  T("Smith, Alan", "12.4", "IV", "alan@example.com", "(845) 555-0102"),
  T("Levi, Rich", "20.1", "IV", "", "845-555-0103"),        // a misspelling
  T("Knazick, Mike", "19.5", "IV", "mike@example.com", "845-555-0104"),
  T("Horvitz, Stu", "33", "IV", "", "845-555-0105"),
].join("\n");

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await b.newContext({ viewport: { width: 375, height: 760 } });
await ctx.addInitScript(s => {
  if (!sessionStorage.getItem("seeded")) {
    localStorage.setItem("btc.clubhouse.v2", s); sessionStorage.setItem("seeded", "1");
  }
}, JSON.stringify(STORE));
await ctx.route("**/*", async route => {
  const u = new URL(route.request().url());
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

const invites = async () => {
  await p.evaluate(() => { show("round"); document.getElementById("goInvites").click(); });
  await p.waitForTimeout(200);
  const txt = await p.innerText("#invitesScreen");
  await p.evaluate(() => document.getElementById("invitesBack").click());
  await p.waitForTimeout(150);
  return txt;
};
const roster = () => p.evaluate(() => JSON.parse(localStorage.getItem("btc.clubhouse.v2")).roster);
const openPaste = async (text) => {
  // The roster lives on Start a round.
  await p.evaluate(() => { show("start"); document.getElementById("foldRoster").open = true; });
  await p.click("#contactsOpen");
  await p.fill("#contactsPaste", text);
  await p.click("#contactsRead"); await p.waitForTimeout(100);
  return p.innerText("#contactsOut");
};

// 1 · where Rob was
let txt = await invites();
ok((txt.match(/no mobile in the roster/g) || []).length === 4, "every man starts with no mobile");

// 2 · the whole tab pasted: read back before anything is set
const preview = await openPaste(PASTE);
ok(/4 to set/i.test(preview), "four men to set");
ok(/Levi, Rich[\s\S]*could be Levy, Rich/.test(preview), "the misspelling is named, with who it could be");
ok(/Knazick, Mike[\s\S]*new to the roster/.test(preview), "a man new to the roster says so");
ok(/2 lines ignored/.test(preview), "the title and heading rows are ignored and counted");
ok((await roster()).find(m => m.name === "Tanenbaum, Rob").mobile === "", "nothing is set before Set is tapped");

// 3 · set
await p.click("#contactsSet"); await p.waitForTimeout(200);
let r = await roster();
ok(r.find(m => m.name === "Tanenbaum, Rob").mobile === "845-555-0101", "Rob's mobile is in the roster");
ok(r.find(m => m.name === "Smith, Alan")?.email === "alan@example.com", "Alan is a new roster man with his e-mail");
ok(r.some(m => m.name === "Knazick, Mike"), "Knazick is in the roster");
ok(!r.some(m => /Levi/.test(m.name)), "the misspelling made no roster man");

// 4 · Invites can now text the men the paste named
txt = await invites();
ok(/Text Rob on 845-555-0101/.test(txt), "Rob can be texted");
ok(/Text Alan on \(845\) 555-0102/.test(txt), "so can Alan, whose round name is the other way round");
ok(/Text Stu on 845-555-0105/.test(txt), "so can Stu, saved in the roster the other way round");
ok((txt.match(/no mobile in the roster/g) || []).length === 1, "only Levy is still missing one");

// 5 · a blank in a later paste does not erase what is there
await openPaste(T("Tanenbaum, Rob", "23.6", "IV", "rob@new.example.com", ""));
await p.click("#contactsSet"); await p.waitForTimeout(200);
r = await roster();
const rob = r.find(m => m.name === "Tanenbaum, Rob");
ok(rob.mobile === "845-555-0101" && rob.email === "rob@new.example.com",
   "a new e-mail is taken and the blank mobile keeps the old one: " + JSON.stringify([rob.mobile, rob.email]));

// 6 · kept over a reload
await p.reload(); await p.waitForTimeout(400);
ok((await roster()).find(m => m.name === "Smith, Alan")?.mobile === "(845) 555-0102", "the roster kept them over a reload");
ok(/Text Alan on/.test(await invites()), "and Invites still has them");

ok(errors.length === 0, "no script errors: " + errors.join(" | "));
await b.close();
console.log(fails.length ? "\nFAILED: " + fails.length : "\nall contacts checks passed");
process.exit(fails.length ? 1 : 0);
