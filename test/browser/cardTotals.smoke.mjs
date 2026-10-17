/**
 * OUT, IN AND THE ROUND ON THE CARD; THE TOP TWO TEAMS ONCE THE ROUND IS IN.
 *
 * Driven at 400 pixels, the width the brief named, and again at 360, the
 * narrowest phone in the group. A total a man has to scroll sideways to reach
 * is worse than no total, so "no sideways scroll" is the check that matters.
 *
 * Not part of `npm test`, like the other browser checks. Run it by hand:
 *
 *     npm i --no-save playwright
 *     node test/browser/cardTotals.smoke.mjs /tmp/shots
 */
import { chromium } from "playwright";
import { readFileSync } from "fs";

const SRC = new URL("../../score.html", import.meta.url);
const OUT = process.argv[2] || ".";

const H = "team,start,seat,name," + Array.from({length:18},(_,i)=>"h"+(i+1)).join(",");
const r = (t,s,q,n,h) => [t,s,q,`"${n}"`,...Array.from({length:18},(_,i)=>h[i]??"")].join(",");
// Team 1 has finished. Harvey has played the front nine only. Stu went 10s and 11s.
const ROB  = [4,5,3,4,4,5,4,3,4, 5,4,4,3,5,4,4,5,4];   // 36 + 38 = 74
const STU  = [9,10,8,9,10,11,9,8,10, 10,11,9,8,10,9,11,10,9];  // 84 + 87 = 171
const FEED = [H,
  r(1,1,1,"Tanenbaum, Rob",ROB),
  r(1,1,2,"Schwartz, Harvey",[5,5,4,5,5,6,5,4,5]),      // 44, back nine blank
  r(1,1,3,"Horvitz, Stu",STU),
  r(1,1,4,"BLIND",[]),
].join("\n");

const board = (thru2, clubThru = "18*") => [
  "CLUBHOUSE,,,,", ",,,,",
  ",Player,Thru,Net,Clubhouse",
  '1,"Tanenbaum, Rob",18,71,-3.5',
  `2,"Granville, Loren",${clubThru},74,-1.0`,
  ",,,,",
  "THE TEAM GAME,,,,", "Best 2 balls,,,,", ",,,,",
  ",Team,Players,Thru,,Total",
  '1,2,"Granville, Loren & Levy, Rich & Wallach, Mike",18,,-6.0',
  `2,1,"Tanenbaum, Rob & Schwartz, Harvey & Horvitz, Stu",${thru2},,-2.0`,
  '3,3,"Marks, Dick & Lohrman, Gary",18,,+1.0',
  // The Hit List as on the tab: 25 slots, the unused ones blank.
  ",,,,", "HIT LIST,,,,", "The one man each player named, and how it went,,,,", ",,,,",
  ",Player,Named,Net,Score",
  ',"Tanenbaum, Rob","Levy, Rich",71,-1.1',
  ',"Granville, Loren","Schwartz, Harvey",74,-1.1',
  ',"Wallach, Mike","Horvitz, Stu",76,-0.6',
  ...Array(22).fill(",,,,"),
].join("\n");
let BOARDS = board("12");

const page = readFileSync(SRC,"utf8")
  .replace(/^var FEED_CSV = "[^"]*";$/m, 'var FEED_CSV = "/feed.csv";')
  .replace(/^var LEADERBOARD_CSV = "[^"]*";$/m, 'var LEADERBOARD_CSV = "https://sheets.invalid/board.csv";');

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const fails = [];
const ok = (c,m) => { if(!c) fails.push(m); console.log((c?"  ok   ":"  FAIL ")+m); };

for (const width of [400, 360]) {
  console.log(`at ${width}px`);
  const ctx = await b.newContext({ viewport:{width,height:800}, deviceScaleFactor:2 });
  await ctx.route("**/*", route => {
    const u = route.request().url();
    if (u.endsWith("/index.html")) return route.fulfill({contentType:"text/html", body:page});
    if (u.includes("/feed.csv")) return route.fulfill({contentType:"text/csv", body:FEED});
    if (u.includes("/board.csv")) return route.fulfill({contentType:"text/csv", body:BOARDS});
    return route.fulfill({status:404, body:""});
  });
  const p = await ctx.newPage();
  const noScroll = () => p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);
  BOARDS = board("12", "12");
  await p.goto("http://x/index.html"); await p.waitForTimeout(400);
  await p.click(".teamBtn:nth-of-type(1)"); await p.click("#roleNo"); await p.waitForTimeout(200);

  // 1 · the card's totals
  const sums = await p.$$eval("table.sums tr", rows => rows.map(r =>
    [...r.children].map(c => c.textContent)));
  ok(JSON.stringify(sums[0]) === '["Gross","Out","In","Total"]', "the totals have their headings: "+JSON.stringify(sums[0]));
  ok(sums[1][0] === "Par" && Number(sums[1][3]) === Number(sums[1][1]) + Number(sums[1][2]),
     "par is added up too: "+JSON.stringify(sums[1]));
  ok(JSON.stringify(sums[2]) === '["Rob","36","38","74"]', "a finished man has all three: "+JSON.stringify(sums[2]));
  ok(JSON.stringify(sums[3]) === '["Harvey","44","",""]', "half a round gives the nine and nothing else: "+JSON.stringify(sums[3]));
  ok(JSON.stringify(sums[4]) === '["Stu","84","87","171"]', "three figures fit: "+JSON.stringify(sums[4]));
  ok(sums.length === 5, "the BLIND has no line: "+sums.length);
  const cut = await p.$$eval("table.sums td, table.sums th", e => e.filter(x => x.scrollWidth > x.clientWidth + 1).map(x => x.textContent));
  ok(cut.length === 0, "nothing in the totals is cut off: "+JSON.stringify(cut));
  ok(await noScroll(), "no sideways scroll on the card");
  await p.screenshot({path:`${OUT}/card-${width}.png`, fullPage:true});

  // 2 · the team board, mid-round: nothing shaded
  await p.click("#lbCard"); await p.waitForTimeout(300);
  let shaded = await p.$$eval(".board tr.first, .board tr.second", e => e.length);
  ok(shaded === 0, "nothing shaded while a team is out, Hit List included: "+shaded);
  ok(await noScroll(), "no sideways scroll on the board");

  // 3 · every team in, one of them off the 10th: green then yellow
  BOARDS = board("18*");
  await p.click("#boardBack"); await p.waitForTimeout(150);
  await p.click("#lbCard"); await p.waitForTimeout(400);
  const rows = await p.$$eval(".board", bs => bs.map(b => ({
    title: b.querySelector("h2").textContent,
    rows: [...b.querySelectorAll("tbody tr")].map(r => ({ cls: r.className,
      bg: getComputedStyle(r.querySelector("td")).backgroundColor,
      ink: getComputedStyle(r.querySelector("td")).color })),
  })));
  const team = rows.find(x => x.title === "THE TEAM GAME");
  ok(team.rows.map(x => x.cls).join("|") === "first|second|", "first green, second yellow, third plain: "+team.rows.map(x=>x.cls));
  ok(team.rows[0].bg === "rgb(205, 238, 214)" && team.rows[1].bg === "rgb(255, 241, 166)",
     "the tints are the tints: "+team.rows[0].bg+" / "+team.rows[1].bg);
  ok(team.rows.every(x => x.ink === "rgb(0, 0, 0)"), "the text on them stays black");
  const club = rows.find(x => x.title === "CLUBHOUSE");
  ok(club.rows.every(x => x.cls === ""), "the CLUBHOUSE board is not shaded");
  const hit = rows.find(x => x.title === "HIT LIST");
  ok(hit && hit.rows.length === 3, "the Hit List is drawn, and its blank slots are not rows: "+(hit&&hit.rows.length));
  ok(hit && hit.rows.map(x => x.cls).join("|") === "first|first|", "both men level at -1.1 are green, the third plain: "+(hit&&hit.rows.map(x=>x.cls)));
  ok(hit && hit.rows[0].bg === team.rows[0].bg, "the same green as the team board");
  ok(hit && hit.rows.every(x => x.cls !== "second"), "no yellow on the Hit List");
  ok(await noScroll(), "no sideways scroll on the finished board");
  await p.screenshot({path:`${OUT}/board-${width}.png`, fullPage:true});
  await ctx.close();
}

await b.close();
console.log(fails.length ? "\nFAILED: "+fails.length : "\nall browser checks passed");
process.exit(fails.length?1:0);
