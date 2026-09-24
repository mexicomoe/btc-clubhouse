/**
 * THE PICKS PAGE'S TEXT BUTTON, WHEN NOTHING TAKES THE LINK.
 *
 * A browser built into another app (Outlook, Gmail, Facebook) can drop an
 * sms: link without a word. A headless browser drops it the same way, which
 * makes it a fair stand-in for that case. The other case, Messages opening, is
 * the page going into the background, and that is played by hand.
 *
 *     npm i --no-save playwright
 *     node test/browser/picksPage.smoke.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "fs";

const ROOT = new URL("../../", import.meta.url);
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await b.newContext({ viewport:{width:375,height:760} });
await ctx.route("**/*", async route => {
  const u = new URL(route.request().url());
  const file = u.pathname.split("/").pop();
  if (u.host === "x" && /^[\w.]+\.(html|js|css|png)$/.test(file)) {
    const type = {html:"text/html", js:"text/javascript", css:"text/css", png:"image/png"}[file.split(".").pop()];
    return route.fulfill({contentType:type, body:readFileSync(new URL(file, ROOT))});
  }
  return route.fulfill({status:200, body:""});   // the filing POST, and nothing else leaves
});
const fails = [];
const ok = (c,m) => { if(!c) fails.push(m); console.log((c?"  ok   ":"  FAIL ")+m); };

async function readyPage(){
  const p = await ctx.newPage();
  await p.goto("http://x/picks.html"); await p.waitForTimeout(300);
  await p.fill("#who", "Rob Tanenbaum");
  for (const sec of await p.$$("section.pick")) {
    const want = Number((await sec.$eval("h2", h => h.textContent)).match(/pick (\w+)/)[1]
      .replace(/^one$/,"1").replace(/^two$/,"2").replace(/^three$/,"3").replace(/^four$/,"4"));
    const holes = await sec.$$(".hole");
    for (let i = 0; i < want; i++) await holes[i].click();
  }
  return p;
}

// 1 · the link is dropped: after the wait, Copy is offered, and led with
let p = await readyPage();
ok(await p.getAttribute("#sendsms","aria-disabled")==="false", "the card is complete and the text button is live");
ok(!(await p.$eval("#send", e => e.classList.contains("lead"))), "Copy starts as the quiet button");
await p.click("#sendsms"); await p.waitForTimeout(800);
ok(!/did not open/.test(await p.innerText("#copied")), "nothing is said before the wait is up");
await p.waitForTimeout(2200);
ok(/Messages did not open\? Tap Copy my picks/.test(await p.innerText("#copied")), "then it says what to do: "+await p.innerText("#copied"));
ok(await p.$eval("#send", e => e.classList.contains("lead")), "and Copy takes the lead");
await p.close();

// 2 · Messages opened: the page went into the background, so nothing is said
p = await readyPage();
await p.click("#sendsms");
await p.evaluate(() => {
  Object.defineProperty(document, "visibilityState", {configurable:true, get:() => "hidden"});
  Object.defineProperty(document, "hidden", {configurable:true, get:() => true});
  document.dispatchEvent(new Event("visibilitychange"));
});
await p.waitForTimeout(500);
await p.evaluate(() => {   // and back from Messages, a while later
  Object.defineProperty(document, "visibilityState", {configurable:true, get:() => "visible"});
  Object.defineProperty(document, "hidden", {configurable:true, get:() => false});
  document.dispatchEvent(new Event("visibilitychange"));
});
await p.waitForTimeout(2800);
ok(!/did not open/.test(await p.innerText("#copied")), "when Messages opened, no warning follows him back");
ok(!(await p.$eval("#send", e => e.classList.contains("lead"))), "and Copy stays quiet");
await p.close();

await b.close();
console.log(fails.length ? "\nFAILED: "+fails.length : "\nall picks checks passed");
process.exit(fails.length?1:0);
