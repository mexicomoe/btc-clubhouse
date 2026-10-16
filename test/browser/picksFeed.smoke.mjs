/**
 * THE PERMANENT PICKS LINK: the bare page reads the field from the Index feed.
 *
 * The feed is played by a stub, so every case is under the test's control:
 * a good field, a field without the stored man, no answer, and too few men.
 *
 *     npm i --no-save playwright
 *     node test/browser/picksFeed.smoke.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "fs";

const ROOT = new URL("../../", import.meta.url);
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const FIELD = [
  "name,index,tee,playing",
  '"Tanenbaum, Rob",23.5,IV,TRUE',
  '"Smith, Alan",12.4,IV,TRUE',
  '"Levy, Rich",20.1,IV,TRUE',
  '"Wallach, Mike",8,III,TRUE',
  '"Abel, Tom",22.0,IV,TRUE',
  '"Zane, Bob",19.0,IV,FALSE',
].join("\n");

const fails = [];
const ok = (c,m) => { if(!c) fails.push(m); console.log((c?"  ok   ":"  FAIL ")+m); };

/** A fresh phone (its own storage) whose feed answers with `feed`, or not at all. */
async function phone(feed){
  const ctx = await b.newContext({ viewport:{width:375,height:760} });
  const seen = [];
  await ctx.route("**/*", async route => {
    const u = new URL(route.request().url());
    const file = u.pathname.split("/").pop();
    if (u.host === "x" && /^[\w.]+\.(html|js|css|png)$/.test(file)) {
      const type = {html:"text/html", js:"text/javascript", css:"text/css", png:"image/png"}[file.split(".").pop()];
      return route.fulfill({contentType:type, body:readFileSync(new URL(file, ROOT))});
    }
    if (u.host === "docs.google.com" && /output=csv/.test(u.search)) {
      seen.push(u.search);
      if (feed == null) return route.abort();
      return route.fulfill({contentType:"text/csv", body:feed});
    }
    return route.fulfill({status:200, body:""});
  });
  return { ctx, seen };
}
const names = (p) => p.$$eval("#pickWho button.who", bs => bs.map(x => x.firstChild.textContent));

// 1 · the bare page lists the playing men, sorted by surname, and asks once
let { ctx, seen } = await phone(FIELD);
let p = await ctx.newPage();
await p.goto("http://x/picks.html"); await p.waitForTimeout(400);
ok(seen.length === 1 && /cachebust=\d+/.test(seen[0]), "the feed is read once, cache-busted");
ok(JSON.stringify(await names(p)) === JSON.stringify(["Abel, Tom","Levy, Rich","Smith, Alan","Tanenbaum, Rob","Wallach, Mike"]),
   "five playing men, by surname, Rob not first: " + (await names(p)).join(" / "));
ok(!(await p.isVisible("#who")), "no name box when there is a list");
ok(/read <b>just now<\/b> and has <b>5<\/b> players/.test(await p.innerHTML("#fieldNote")), "says what was read and when");
await p.click("text=Smith, Alan");
ok(await p.isVisible("text=Is this you?") && await p.isVisible("text=Yes, that's me"), "a tap asks: is this you?");
ok(!(await p.$("#oppBox section")) && !(await p.isVisible("#slots")), "no picking before he says yes");
await p.click("text=No, go back");
ok((await names(p)).length === 5, "no goes back to the list");
await p.click("text=Smith, Alan"); await p.click("text=Yes, that's me");
ok(/Smith, Alan/.test(await p.innerText(".mine")), "yes puts his name at the top");
const opp = await p.$$eval("#oppBox button.who", bs => bs.map(x => x.firstChild.textContent));
ok(opp.length === 4 && !opp.includes("Smith, Alan"), "his opponents come from the engine: " + opp.join(" / "));
await p.close();

// 2 · the next visit lands straight on the question
p = await ctx.newPage();
await p.goto("http://x/picks.html"); await p.waitForTimeout(400);
ok(/Smith, Alan/.test(await p.innerText(".mine")) && !(await p.$("text=Is this you?")), "remembered: no list, no question");
await p.click("#notMe");
ok((await names(p)).length === 5, "not you? clears him and shows the list");
await p.close();
p = await ctx.newPage();
await p.goto("http://x/picks.html"); await p.waitForTimeout(400);
ok((await names(p)).length === 5, "and he stays forgotten");
await p.close(); await ctx.close();

// 3 · a stored man who is not on this week's list is asked, not dropped in
({ ctx } = await phone(FIELD));
await ctx.addInitScript(() => localStorage.setItem("clubhouse.picks.me", "Zane, Bob"));
p = await ctx.newPage();
await p.goto("http://x/picks.html"); await p.waitForTimeout(400);
ok(/You're not in this week's list/.test(await p.innerText("#pickWho")), "not on the list: said so, above the list");
ok((await names(p)).length === 5, "and the list is there to tap");
await p.close(); await ctx.close();

// 4 · no feed, and too few men: the typed-name page, with the reason
for (const [feed, why] of [[null, "no answer"], ["name,index,tee,playing\n\"Tanenbaum, Rob\",23.5,IV,TRUE", "one man"]]) {
  ({ ctx } = await phone(feed));
  p = await ctx.newPage();
  await p.goto("http://x/picks.html"); await p.waitForTimeout(400);
  ok(await p.isVisible("#who"), why + ": the name box is back");
  ok(/Couldn't reach the player list/.test(await p.innerText("#feedNote")), why + ": and it says so");
  ok((await names(p)).length === 0, why + ": no empty list");
  await p.close(); await ctx.close();
}

// 5 · ?f= and ?p= work as they did, and never touch the feed
await import("../../fieldlink.js");
const FL = globalThis.ClubhouseFieldLink;
({ ctx, seen } = await phone(FIELD));
p = await ctx.newPage();
await p.goto(FL.fieldLink("http://x/picks.html",
  [{name:"Zed Old",index:10},{name:"Ann Early",index:12},{name:"Bo Mid",index:11}], "1 October 2026"));
await p.waitForTimeout(400);
ok(JSON.stringify(await names(p)) === JSON.stringify(["Ann Early","Bo Mid","Zed Old"]), "?f= still lists its own field, sorted");
ok(/made <b>1 October 2026<\/b>/.test(await p.innerHTML("#fieldNote")), "?f= keeps its own note");
await p.goto(FL.manLink("http://x/picks.html", "Rich Levy", [{name:"Alan Smith",band:"l"}]));
await p.waitForTimeout(400);
ok(/Rich Levy/.test(await p.innerText(".mine")) && !(await p.$("#notMe")), "?p= is his own sheet, no list");
ok(/Alan Smith/.test(await p.innerText("#oppBox")), "?p= brings his six");
ok(seen.length === 0, "neither link read the feed");
await p.close(); await ctx.close();

await b.close();
console.log(fails.length ? "\nFAILED: "+fails.length : "\nall feed checks passed");
process.exit(fails.length?1:0);
