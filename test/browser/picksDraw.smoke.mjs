/**
 * WATCH THE BIRDIE, EIGHT DEALT AND FOUR PICKED — at 400px, every draw.
 *
 * The Index feed is played by a stub carrying a "draw" column in E. Each of the
 * nine draws is walked: his eight holes and no others, Agony Alley and Easy
 * Street named in words, what each hole pays printed, the four-pick counter,
 * the Copy text, and the filed card carrying exactly four numbers.
 *
 *     npm i --no-save playwright
 *     node test/browser/picksDraw.smoke.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "fs";

const ROOT = new URL("../../", import.meta.url);
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const DRAWS = {
  A: [1, 5, 7, 12, 13, 14, 16, 17], B: [2, 6, 7, 10, 11, 15, 16, 17],
  C: [2, 3, 4, 9, 10, 11, 13, 18],  D: [1, 3, 5, 6, 8, 9, 11, 16],
  E: [2, 4, 6, 7, 8, 9, 12, 13],    F: [1, 5, 9, 14, 15, 16, 17, 18],
  G: [3, 4, 8, 10, 12, 14, 15, 18], H: [2, 3, 5, 6, 7, 8, 12, 15],
  I: [1, 4, 10, 11, 13, 14, 17, 18],
};
const MEN = [
  ["Abel, Tom", 22.0, "A"], ["Baker, Al", 18.0, "B"], ["Cohen, Sy", 15.0, "C"],
  ["Dorn, Ed", 25.0, "D"], ["Engel, Lou", 12.0, "E"], ["Fink, Hal", 20.0, "F"],
  ["Gold, Sam", 9.0, "G"], ["Hirsch, Ben", 30.0, "H"], ["Isaacs, Moe", 16.0, "i"],
  ["Mallace, Bob", 21.0, ""], ["Nadel, Ira", 14.0, "Q"], ["Wolberg, Larry", 21.5, "C"],
];
const FEED = ["name,index,tee,playing,draw",
  ...MEN.map(([n, i, d]) => `"${n}",${i},IV,TRUE,${d}`)].join("\n");

const fails = [];
const ok = (c,m) => { if(!c) fails.push(m); console.log((c?"  ok   ":"  FAIL ")+m); };

async function phone(name){
  const ctx = await b.newContext({ viewport:{width:400,height:800} });
  // http://x is not a secure context, so the clipboard is played by a stub.
  await ctx.addInitScript(() => Object.defineProperty(navigator, "clipboard",
    { configurable:true, value:{ writeText: async (t) => { window.__clip = t; } } }));
  const filed = [];
  await ctx.route("**/*", async route => {
    const u = new URL(route.request().url());
    const file = u.pathname.split("/").pop();
    if (u.host === "x" && /^[\w.]+\.(html|js|css|png)$/.test(file)) {
      const type = {html:"text/html", js:"text/javascript", css:"text/css", png:"image/png"}[file.split(".").pop()];
      return route.fulfill({contentType:type, body:readFileSync(new URL(file, ROOT))});
    }
    if (u.host === "docs.google.com" && /output=csv/.test(u.search))
      return route.fulfill({contentType:"text/csv", body:FEED});
    if (/formResponse/.test(u.pathname)) {
      filed.push(new URLSearchParams(route.request().postData() || "").get("entry.1094711796"));
    }
    return route.fulfill({status:200, body:""});
  });
  await ctx.addInitScript((n) => localStorage.setItem("clubhouse.picks.me", n), name);
  const p = await ctx.newPage();
  await p.goto("http://x/picks.html"); await p.waitForTimeout(400);
  return { ctx, p, filed };
}
const shown = (p) => p.$$eval("#slots .hole", bs => bs.map(x => Number(x.dataset.hole)));

for (const [letter, holes] of Object.entries(DRAWS)) {
  const man = MEN.find(m => m[2].toUpperCase() === letter)[0];
  const { ctx, p, filed } = await phone(man);
  const got = await shown(p);
  ok(JSON.stringify(got) === JSON.stringify(holes), `${letter}: ${man} sees his eight: ${got.join(",")}`);
  ok(!/pick four|Pick 4 of your 8/i.test(await p.innerText("#slots")), `${letter}: the holes box does not restate the rule`);
  ok(!(await p.isVisible("text=Couldn't find your eight holes")), `${letter}: no fallback note`);
  const txt = await p.innerText("#slots");
  const tags = (await p.$$eval("#slots .hole .tag", ts => ts.map(t => t.textContent))).join(" ");
  ok(holes.some(h => h === 4 || h === 5) === /AGONY ALLEY/.test(tags), `${letter}: Agony Alley tag on a hole exactly when he holds 4 or 5`);
  ok(holes.some(h => h === 11 || h === 12) === /ECSTASY STREET/.test(tags), `${letter}: Ecstasy Street tag on a hole exactly when he holds 11 or 12`);
  const lead = await p.innerText("#slots .lead");
  ok(holes.some(h => h === 4 || h === 5) === /AGONY ALLEY \(4, 5\) — even a net par is a stroke off, and you make one 4 times in\s10\./.test(lead),
     `${letter}: Agony Alley line exactly when he holds 4 or 5`);
  ok(holes.some(h => h === 11 || h === 12) === /ECSTASY STREET \(11, 12\) — a net birdie is a stroke off, a net bogey or worse a stroke on\./.test(lead),
     `${letter}: Ecstasy Street line exactly when he holds 11 or 12`);
  ok(/You've drawn eight holes\. Pick any four\.\s+Every net birdie counts\./.test(await p.innerText("header")), `${letter}: the subhead`);
  ok(!/Every birdie counts/.test(await p.innerText("body")), `${letter}: the old line is gone`);
  ok(!/easy street|ecstacy/i.test(await p.innerText("body")), `${letter}: no Easy Street and no misspelled Ecstacy anywhere`);
  ok(await p.$eval("#slots .lead", l => l.compareDocumentPosition(document.querySelector("#slots .hole")) & 4) > 0, `${letter}: headline above the first hole`);
  if (holes.includes(4)) ok(/pays 36 times in 100/.test(txt), `${letter}: hole 4 pays 36 in 100`);
  if (holes.includes(5)) ok(/pays 42 times in 100/.test(txt), `${letter}: hole 5 pays 42 in 100`);
  if (holes.includes(11)) ok(/birdie 24 in 100, but bogey costs you — 30 in 100/.test(txt), `${letter}: hole 11 risk and reward`);
  if (holes.includes(12)) ok(/birdie 28 in 100, but bogey costs you — 21 in 100/.test(txt), `${letter}: hole 12 risk and reward`);
  ok(await p.innerText("#summary") === "0 of 4 picked.", `${letter}: the tray counts from 0 of 4`);

  const btns = await p.$$("#slots .hole");
  await btns[6].click(); await btns[1].click();
  ok(await p.innerText("#summary") === "2 of 4 picked.", `${letter}: counter reads 2 of 4 picked`);
  await btns[0].click(); await btns[3].click(); await btns[4].click();   // a fifth drops the oldest
  const picked = await p.$$eval('#slots .hole[aria-pressed="true"]', bs => bs.map(x => Number(x.dataset.hole)));
  ok(picked.length === 4 && !picked.includes(holes[6]), `${letter}: a fifth tap drops the oldest, four stay`);
  ok(/Now pick your Hit List man/.test(await p.innerText("#summary")), `${letter}: then asks for the Hit List`);
  await p.click("#oppBox button.who >> nth=0");
  const opp = await p.$eval("#oppBox button.who[aria-pressed=true]", x => x.firstChild.textContent);
  const want = `${man} — ${picked.sort((a,b)=>a-b).join(", ")}`;
  await p.click("#send"); await p.waitForTimeout(300);
  const clip = await p.evaluate(() => window.__clip);
  ok(clip === want + "\nHit List: " + opp, `${letter}: Copy text: ${JSON.stringify(clip)}`);
  ok(filed.length === 1 && filed[0] === want + " · Hit List: " + opp, `${letter}: filed: ${filed[0]}`);
  ok(filed[0] && filed[0].split(" · ")[0].split(" — ")[1].split(",").length === 4, `${letter}: filed card carries exactly four numbers`);
  const wide = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(wide <= 400, `${letter}: no sideways scroll at 400px (${wide})`);
  if (letter === "A") await p.screenshot({ path: process.env.SHOT || "/tmp/picks-A.png", fullPage: true });
  await ctx.close();
}

// No draw, and a letter that is not A to I: all eighteen and the line, never a dead page
for (const [man, why] of [["Mallace, Bob", "blank draw"], ["Nadel, Ira", "draw Q"]]) {
  const { ctx, p, filed } = await phone(man);
  ok((await shown(p)).length === 18, `${why}: all 18 holes`);
  ok(/AGONY ALLEY/.test(await p.innerText("#slots .lead")) && /ECSTASY STREET/.test(await p.innerText("#slots .lead")), `${why}: both street lines, since he may pick any hole`);
  ok(await p.isVisible("text=Couldn't find your eight holes — pick any four and I'll sort it out."), `${why}: says so`);
  for (const h of [3, 9, 12, 17]) await p.click(`#slots .hole[data-hole="${h}"]`);
  await p.click("#oppBox button.who >> text=Wolberg, Larry").catch(() => p.click("#oppBox button.who >> nth=0"));
  await p.click("#sendsms"); await p.waitForTimeout(300);
  ok(filed.length === 1 && filed[0].startsWith(man + " — 3, 9, 12, 17 · Hit List: "), `${why}: still files his four: ${filed[0]}`);
  await ctx.close();
}

await b.close();
console.log(fails.length ? "\nFAILED: "+fails.length : "\nall draw checks passed");
process.exit(fails.length?1:0);
