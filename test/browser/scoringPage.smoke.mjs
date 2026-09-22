/**
 * THE SCORING PAGE, DRIVEN BY A REAL PHONE-SIZED BROWSER.
 *
 * test/scoringPage.test.ts runs the page's decisions. This runs the page —
 * 375 pixels wide, with a made-up feed and every send intercepted — because
 * some of what the brief asks for only exists once there is a screen: that a
 * double tap on Send sends once, that a hole moves on by itself, that a send
 * with no signal is held and says so, and that nothing runs off the side.
 *
 * IT IS NOT PART OF `npm test`, ON PURPOSE. The suite has no dependencies and
 * should keep none — a page used in a cart must not need a browser download to
 * be checked. Run it by hand when the page changes:
 *
 *     npm i --no-save playwright
 *     node test/browser/scoringPage.smoke.mjs /tmp/shots
 *
 * The second argument is where it leaves screenshots of the three screens.
 */
import { chromium } from "playwright";
import { readFileSync } from "fs";

const SRC = new URL("../../score.html", import.meta.url);
const OUT = process.argv[2] || ".";

// A feed with a comma in every name, a team off the 10th, a BLIND and a threesome.
const H = "team,start,seat,name," + Array.from({length:18},(_,i)=>"h"+(i+1)).join(",");
const r = (t,s,q,n,h={}) => [t,s,q,`"${n}"`,...Array.from({length:18},(_,i)=>h[i+1]??"")].join(",");
const FEED = [H,
  r(1,1,1,"Tanenbaum, Rob",{1:5,2:4}), r(1,1,2,"Schwartz, Harvey",{1:6,2:5}),
  r(1,1,3,"Horvitz, Stu",{1:7,2:6}),   r(1,1,4,"Edson, Andy",{1:6,2:6}),
  r(2,10,1,"Finkelstein, Dave"), r(2,10,2,"Levy, Rich"),
  r(2,10,3,"Wallach, Mike"),    r(2,10,4,"BLIND"),
  r(3,1,1,"Finkelstein, Dave"), r(3,1,2,"Lohrman, Gary"),
  r(3,1,3,"Marks, Dick"),       r(3,1,4,""),
].join("\n");

// Point the page at a feed we serve, and record every send.
// Point the page at a feed we serve, whatever address it is configured with —
// pinning the old value here made this file pass by testing nothing the day
// the real address was filled in.
let page = readFileSync(SRC,"utf8");
const unstubbed = page;
page = page.replace(/^var FEED_CSV = "[^"]*";$/m, 'var FEED_CSV = "/feed.csv";');
if (page === unstubbed) throw new Error("FEED_CSV was not stubbed — score.html has changed shape");
// Blanked so the not-drawn case below is testable whatever address is shipped.
// The shipped value's own shape is the unit tests' job, not this file's.
const unblanked = page;
page = page.replace(/^var LEADERBOARD_URL = "[^"]*";$/m, 'var LEADERBOARD_URL = "";');
if (page === unblanked) throw new Error("LEADERBOARD_URL was not blanked — score.html has changed shape");

// The leaderboard tab as Rob lays it out — two boards, subtitles, footnotes,
// a spacer column, a star on a Thru.
const BOARDS = [
  "CLUBHOUSE,,,,", "Slowest group thru 12,,,,", ",,,,",
  ",Player,Thru,Net,Clubhouse",
  '1,"Tanenbaum, Rob",18,71,-3.5',
  '2,"Granville, Loren",18*,74,-1.0',
  '3,"Schwartz, Harvey",12,48,+0.5',
  ",,,,", "* started on the 10th,,,,", ",,,,",
  "THE TEAM GAME,,,,", "Best 2 balls,,,,", ",,,,",
  ",Team,Players,Thru,,Total",
  '1,2,"Granville, Loren & Levy, Rich & Wallach, Mike",18,,-6.0',
  '2,1,"Tanenbaum, Rob & Schwartz, Harvey & Horvitz, Stu",12,,-2.0',
].join("\n");

const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await b.newContext({ viewport:{width:375,height:760}, deviceScaleFactor:2 });
const sends = []; let offline = false;
await ctx.route("**/*", async route => {
  const u = route.request().url();
  if (u.endsWith("/index.html") || u.endsWith("/")) return route.fulfill({contentType:"text/html", body:page});
  if (u.includes("/feed.csv")) return offline ? route.abort("internetdisconnected")
                                              : route.fulfill({contentType:"text/csv", body:FEED});
  if (u.includes("/board.csv")) return offline ? route.abort("internetdisconnected")
                                               : route.fulfill({contentType:"text/csv", body:BOARDS});
  if (u.includes("formResponse")) {
    if (offline) return route.abort("internetdisconnected");
    sends.push(route.request().postData()); return route.fulfill({status:200, body:"ok"});
  }
  if (u.includes("tgif_logo.png")) return route.abort();
  return route.fulfill({status:404, body:""});
});
const p = await ctx.newPage();
const fails = [];
const ok = (c,m) => { if(!c) fails.push(m); console.log((c?"  ok   ":"  FAIL ")+m); };
const noScroll = async () => p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);

await p.goto("http://x/index.html"); await p.waitForTimeout(500);

// 1 · the team screen lists every team from the feed, with names
const btns = await p.$$eval(".teamBtn", e=>e.map(x=>x.innerText.replace(/\n/g," ")));
ok(btns.length===3, "three teams offered: "+btns.length);
ok(btns[0].includes("Rob Tanenbaum")&&btns[0].includes("Andy Edson"), "team 1 shows its men");
ok(btns[1].includes("starts on 10"), "team 2 is marked as off the 10th");
ok(!btns[1].includes("BLIND"), "BLIND is not shown as a man");
ok(await noScroll(), "no sideways scroll on the team screen");

// 2 · "No" gives a card with no buttons
await p.click(".teamBtn:nth-of-type(1)"); await p.click("#roleNo"); await p.waitForTimeout(150);
ok(await p.isVisible("#screenCard"), "No gives the card");
const cardBtns = await p.$$eval("#cardBody button", e=>e.length);
ok(cardBtns===0, "the card has no buttons in it: "+cardBtns);
ok((await p.innerText("#cardBody")).includes("Rob"), "the card shows the men");
ok(await noScroll(), "no sideways scroll on the card");

// 3 · reload remembers watcher
await p.reload(); await p.waitForTimeout(400);
ok(await p.isVisible("#screenCard"), "a watcher comes back to his card after a reload");

// 4 · a team off the 10th opens on 10
await p.click("#cardTeam"); await p.click(".teamBtn:nth-of-type(2)"); await p.click("#roleYes");
await p.waitForTimeout(200);
ok((await p.innerText("#holeName")).startsWith("Hole 10"), "team 2 opens on hole 10: "+await p.innerText("#holeName"));

// 5 · each par gives the right seven buttons  (10 is par 4, 13 is par 3, 16 par 5)
const rowBtns = async () => p.$$eval(".man:first-child .scores button", e=>e.map(x=>x.textContent));
ok(JSON.stringify(await rowBtns())==='["2","3","4","5","6","7","8"]', "par 4 gives 2-8");
for(let i=0;i<3;i++) await p.click("#holeNext");
ok((await p.innerText("#holeName")).includes("Par 3"), "hole 13 is par 3");
ok(JSON.stringify(await rowBtns())==='["1","2","3","4","5","6","7"]', "par 3 gives 1-7");
for(let i=0;i<3;i++) await p.click("#holeNext");
ok(JSON.stringify(await rowBtns())==='["3","4","5","6","7","8","9"]', "par 5 gives 3-9");
// back to 10
for(let i=0;i<12;i++) await p.click("#holeNext");
ok((await p.innerText("#holeName")).startsWith("Hole 10"), "18 came round to 1 and on to 10");

// 6 · only three rows — BLIND has none
ok((await p.$$(".man")).length===3, "a BLIND gets no row");

// 7 · review names the man who is missing
await p.click(".man:nth-child(1) .scores button:nth-child(4)");   // Loren 5
await p.click(".man:nth-child(3) .scores button:nth-child(5)");   // Mike 6
await p.click("#toReview"); await p.waitForTimeout(100);
ok((await p.innerText("#scoreMsg")).includes("Rich Levy"), "review names the missing man: "+await p.innerText("#scoreMsg"));
ok(await p.isVisible("#screenScore"), "review refuses to move on");

await p.click(".man:nth-child(2) .scores button:nth-child(3)");   // Rich 4
await p.click("#toReview"); await p.waitForTimeout(100);
ok(await p.isVisible("#screenReview"), "review opens once every man has a score");
ok(/Dave Finkelstein\s+5/.test(await p.innerText("#reviewList")), "the check screen shows the scores: "+JSON.stringify(await p.innerText("#reviewList")));

// 8 · a double tap on Send sends once, and the hole moves on
await Promise.all([p.click("#doSend"), p.click("#doSend").catch(()=>{})]);
await p.waitForTimeout(600);
ok(sends.length===1, "a double tap on Send sent once: "+sends.length);
const body = new URLSearchParams(sends[0]);
ok(body.get("entry.571884128")==="2" && body.get("entry.605471460")==="10", "team 2, hole 10");
ok(!body.has("entry.1378388490"), "the BLIND's box went in EMPTY");
ok(body.get("entry.828466984")==="5" && body.get("entry.378353848")==="6", "the three scores went in");
ok((await p.innerText("#holeName")).startsWith("Hole 11"), "Send moved on to hole 11");
ok((await p.innerText("#scoreMsg")).includes("sent"), "it said sent");

// 9 · left the round — empty box from that hole on, and undone
p.on("dialog", d => d.accept());
await p.click(".man:nth-child(3) .outBtn"); await p.waitForTimeout(150);
ok((await p.innerText(".man:nth-child(3)")).includes("Left the round at hole 11"), "he is out from hole 11");
await p.click(".man:nth-child(1) .scores button:nth-child(4)");
await p.click(".man:nth-child(2) .scores button:nth-child(4)");
await p.click("#toReview"); await p.waitForTimeout(100);
ok(await p.isVisible("#screenReview"), "review lets the hole go without him");
await p.click("#doSend"); await p.waitForTimeout(500);
const b2 = new URLSearchParams(sends[1]);
ok(!b2.has("entry.378353848") && !b2.has("entry.1378388490"), "the man who left went in EMPTY, beside the BLIND");
await p.click("#holePrev"); await p.waitForTimeout(100);
ok((await p.$$(".man:nth-child(3) .scores button")).length===0, "still out on hole 11");
await p.click("#holeNext"); await p.click(".man:nth-child(3) .outBtn"); await p.waitForTimeout(150);
ok((await p.$$(".man:nth-child(3) .scores button")).length===7, "back in — the mis-tap is undone");

// 10 · a hole already in warns and will not be re-sent
await p.click("#holePrev"); await p.waitForTimeout(100);
ok((await p.innerText("#sentWarn")).includes("already sent"), "hole 11 is shown as already in");
ok(await p.isDisabled("#toReview"), "and is locked until he says he means to change it");
ok((await p.$$(".man:nth-child(1) .scores button[disabled]")).length===7, "its buttons are locked too");
const wasSent = sends.length;
await p.click("#sentWarn button"); await p.waitForTimeout(150);
ok(!(await p.isDisabled("#toReview")), "saying yes unlocks the hole");
for (const n of [1,2,3]) await p.click(`.man:nth-child(${n}) .scores button:nth-child(2)`);
await p.click("#toReview"); await p.waitForTimeout(100);
await p.click("#doSend"); await p.waitForTimeout(700);
ok(sends.length===wasSent+1, "the correction went: "+(sends.length-wasSent));
ok(new URLSearchParams(sends.at(-1)).get("entry.605471460")==="11", "against hole 11, to replace it");
await p.click("#holePrev"); await p.waitForTimeout(150);
ok(await p.isDisabled("#toReview"), "and hole 11 is locked again on the way back in");

// 11 · no signal: not lost, not falsely confirmed
offline = true;
const sentBeforeBlackout = sends.length;   // relative, so adding a case above
await p.click("#holeNext");                //  cannot silently break this one await p.click("#holeNext"); await p.waitForTimeout(100);
const at = await p.innerText("#holeName");
await p.click(".man:nth-child(1) .scores button:nth-child(4)");
await p.click(".man:nth-child(2) .scores button:nth-child(4)");
await p.click(".man:nth-child(3) .scores button:nth-child(4)");
await p.click("#toReview"); await p.click("#doSend"); await p.waitForTimeout(900);
ok(sends.length===sentBeforeBlackout, "nothing was sent with no signal: "+(sends.length-sentBeforeBlackout));
ok((await p.innerText("#scoreMsg")).includes("saved on this phone"), "it did NOT say sent");
ok(await p.isVisible("#queueBar"), "the waiting hole is on screen: "+await p.innerText("#queueBar"));
ok((await p.innerText("#queueBar")).includes(at.match(/Hole (\d+)/)[1]), "it names the hole waiting");

// 12 · the last feed survives a lost signal
await p.reload(); await p.waitForTimeout(500);
ok((await p.innerText("#topNames")).includes("Dave"), "the team is still there with no signal");
ok((await p.innerText("#holeName")).length>0, "progress survived the reload with no signal");
ok(await p.isVisible("#queueBar"), "the held hole survived the reload");

// 13 · the signal comes back
offline = false;
await p.evaluate(()=>window.dispatchEvent(new Event("online")));
await p.waitForTimeout(900);
ok(sends.length===sentBeforeBlackout+1,
   "the held hole went on its own once there was signal: "+(sends.length-sentBeforeBlackout));
ok(!(await p.isVisible("#queueBar")), "and the warning cleared");

// 14 · the leaderboard, from both screens a man sits on
const LB = "https://example.invalid/board";
ok(!(await p.isVisible("#lbScore")), "an unconfigured leaderboard is not drawn");
await p.evaluate(u => { window.LEADERBOARD_URL = u;
  for (const id of ["lbScore","lbCard"]) {
    const a = document.getElementById(id); a.href = u; a.classList.remove("hide");
  } }, LB);
ok(await p.isVisible("#lbScore"), "it is on the scoring screen");
ok(await p.getAttribute("#lbScore","target")==="_blank", "and opens a new tab");
const box = await p.$eval("#lbScore", e => e.getBoundingClientRect().height);
ok(box >= 44, "its tap target is big enough: "+Math.round(box));

ok(await noScroll(), "no sideways scroll on the scoring screen");
await p.screenshot({path:OUT+"/score.png"});
await p.click("#scoreToCard"); await p.waitForTimeout(200);
ok(await p.isVisible("#lbCard"), "it is on the card too");
// Following it really does open a SECOND tab, leaving this one loaded and
// still retrying whatever it is holding.
const [tab] = await Promise.all([ctx.waitForEvent("page"), p.click("#lbCard")]);
ok(ctx.pages().length === 2, "a second tab opened: "+ctx.pages().length);
ok(!p.isClosed(), "and the scoring page is still open behind it");
await tab.close();
ok(await noScroll(), "no sideways scroll on the card at 375");
await p.screenshot({path:OUT+"/card.png", fullPage:true});
await p.click("#cardTeam"); await p.waitForTimeout(200);
await p.screenshot({path:OUT+"/teams.png"});

// 15 · the leaderboard read INTO the page, rather than handed to Google
// An ABSOLUTE address, because the page refuses anything else — a relative
// one is indistinguishable from a paste that lost its front half. The route
// above catches it by path, so nothing leaves the machine.
page = unblanked.replace(/^var LEADERBOARD_CSV = "[^"]*";$/m,
                         'var LEADERBOARD_CSV = "https://sheets.invalid/board.csv";');
if (page === unblanked) throw new Error("LEADERBOARD_CSV was not stubbed");
await p.goto("http://x/index.html"); await p.waitForTimeout(500);
await p.click(".teamBtn:nth-of-type(1)"); await p.click("#roleYes"); await p.waitForTimeout(300);
const tabsBefore = ctx.pages().length;
await p.click("#lbScore"); await p.waitForTimeout(400);
ok(await p.isVisible("#screenBoard"), "the leaderboard opens IN the page");
ok(ctx.pages().length === tabsBefore, "and does not hand him to Google: "+ctx.pages().length);
const boards = await p.$$eval(".board h2", e => e.map(x => x.textContent));
ok(JSON.stringify(boards) === '["CLUBHOUSE","THE TEAM GAME"]', "both boards are there: "+boards);
const txt = await p.innerText("#boardBody");
ok(txt.includes("18*"), "the star on a Thru survived");
ok(txt.includes("Rob Tanenbaum"), "names are turned round");
ok(txt.includes("Loren Granville · Rich Levy"), "a team's men read as men");
ok(!txt.includes("started on the 10th"), "the footnote did not become a row");
ok(txt.includes("-3.5"), "the scores came through");
const sizes = await p.$$eval(".board td", e => e.map(x => parseFloat(getComputedStyle(x).fontSize)));
ok(Math.min(...sizes) >= 18, "nothing on the board is under 18px: "+Math.min(...sizes));
ok(await noScroll(), "no sideways scroll on the leaderboard at 375");
await p.screenshot({path:OUT+"/board.png", fullPage:true});

await p.click("#boardBack"); await p.waitForTimeout(200);
ok(await p.isVisible("#screenScore"), "Back returns him to the scoring screen");
await p.click("#scoreToCard"); await p.waitForTimeout(200);
await p.click("#lbCard"); await p.waitForTimeout(300);
ok(await p.isVisible("#screenBoard"), "it is reachable from the card too");
await p.click("#boardBack"); await p.waitForTimeout(200);
ok(await p.isVisible("#screenCard"), "and Back returns him to the card, not the scoring screen");

await b.close();
console.log(fails.length ? "\nFAILED: "+fails.length : "\nall browser checks passed");
process.exit(fails.length?1:0);
