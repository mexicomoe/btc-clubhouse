/**
 * THE SCORING PAGE, RUN RATHER THAN READ.
 *
 * score.html is one file with no imports, because a page used in a dead patch
 * on the 12th cannot depend on three round trips going well. That leaves it
 * unreachable by an ordinary import, so its decision-making functions are
 * LIFTED OUT of the source by brace matching and executed here — the same
 * trick screens.test.ts uses on the leaderboard, and for the same reason: a
 * rule that is only read is a rule that drifts.
 *
 * What is checked here is everything that can score a round wrong:
 *  · the feed, including names with a comma in them
 *  · which seven buttons a par gives
 *  · the review refusing to go on, and naming the man
 *  · 18 coming round to 1, and a team that starts on the 10th
 *  · an empty box going in EMPTY, for a BLIND, a threesome, and a man out
 *  · one send for one team and hole, however many times Send is tapped
 * and the two floors that exist for eyesight: 18px of type, 44px of target.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGE = readFileSync(new URL("../score.html", import.meta.url), "utf8");

/* ---------- lifting the page's own functions out ---------- */

/** The source of one top-level function, brace-matched. */
function fnSource(name: string): string {
  const at = PAGE.indexOf("function " + name + "(");
  assert.ok(at > -1, name + " is not in score.html");
  let depth = 0;
  for (let i = PAGE.indexOf("{", at); i < PAGE.length; i++) {
    if (PAGE[i] === "{") depth++;
    else if (PAGE[i] === "}") { depth--; if (depth === 0) return PAGE.slice(at, i + 1); }
  }
  throw new Error("unbalanced braces in " + name);
}

/** One `var NAME = ...;` line, read off the page so the test cannot hold a
 *  stale copy of the form's field ids or of Aberdeen's pars. */
function varSource(name: string): string {
  const m = PAGE.match(new RegExp("^var " + name + " = [^\\n]*;$", "m"));
  assert.ok(m, "var " + name + " is not in score.html");
  return m![0];
}

const LIFTED = [
  "FORM_TEAM", "FORM_HOLE", "FORM_SEAT", "PAR",
].map(varSource).join("\n") + "\n" + [
  "parseCsv", "parseFeed", "isEmptySeat", "displayName", "firstName", "parOf",
  "scoreButtons", "nextHole", "prevHole", "playIndex", "feedSentHoles",
  "feedHoleLine", "isOut", "playingSeats", "missingMan", "sendBody",
  "sendId", "outboxNext",
].map(fnSource).join("\n");

const P = new Function(LIFTED + "\nreturn {" + [
  "parseCsv", "parseFeed", "isEmptySeat", "displayName", "firstName", "parOf",
  "scoreButtons", "nextHole", "prevHole", "playIndex", "feedSentHoles",
  "feedHoleLine", "isOut", "playingSeats", "missingMan", "sendBody",
  "sendId", "outboxNext",
].join(",") + "};")() as any;

/* ---------- a feed to work from ---------- */

const HEAD = "team,start,seat,name," + Array.from({length:18},(_,i)=>"h"+(i+1)).join(",");
const BLANKS = ",".repeat(18);

/** One feed row. `holes` is a sparse map of hole number to score. */
function row(team:number,start:number,seat:number,name:string,holes:Record<number,number>={}){
  const cells = Array.from({length:18},(_,i)=>holes[i+1]==null?"":String(holes[i+1]));
  const quoted = name.indexOf(",") > -1 ? '"'+name+'"' : name;
  return [team,start,seat,quoted,...cells].join(",");
}

const FEED = [
  HEAD,
  row(1,1,1,"Tanenbaum, Rob",   {1:5,2:4,7:6}),
  row(1,1,2,"Schwartz, Harvey", {1:6,2:5,7:7}),
  row(1,1,3,"Horvitz, Stu",     {1:7,2:6,7:5}),
  row(1,1,4,"Edson, Andy",      {1:6,2:6,7:8}),
  row(2,10,1,"Granville, Loren"),
  row(2,10,2,"Levy, Rich"),
  row(2,10,3,"Wallach, Mike"),
  row(2,10,4,"BLIND"),
  row(3,1,1,"Finkelstein, Dave"),
  row(3,1,2,"Lohrman, Gary"),
  row(3,1,3,"Marks, Dick"),
  row(3,1,4,""),
].join("\n");

const teams = P.parseFeed(FEED);
const T1 = teams[0], T2 = teams[1], T3 = teams[2];

/* ================================================================== */

test("the feed gives every team, with its men, in seat order", () => {
  assert.equal(teams.length, 3);
  assert.deepEqual(teams.map((t:any)=>t.team), [1,2,3]);
  assert.deepEqual(T1.seats.map((s:any)=>P.displayName(s.name)),
    ["Rob Tanenbaum","Harvey Schwartz","Stu Horvitz","Andy Edson"]);
});

test("a name with a comma in it survives the CSV intact", () => {
  // The whole sheet keeps men as "Surname, First". A naive split puts
  // "Tanenbaum" in the name column and shifts all eighteen holes one left,
  // which would score the round wrong rather than fail.
  assert.equal(T1.seats[0].name, "Tanenbaum, Rob");
  assert.deepEqual(T1.seats[0].holes.slice(0,2), [5,4]);
});

test("a team off the 10th carries its start", () => {
  assert.equal(T1.start, 1);
  assert.equal(T2.start, 10);
});

test("the page opens a team on its own start hole", () => {
  // The screen's own line, read off the source: there is no second place a
  // starting hole could come from.
  assert.match(PAGE, /openHole\(t\?t\.start:1\)/);
  assert.match(PAGE, /if\(S\.hole==null\) S\.hole=t\.start;/);
});

test("BLIND and an unfilled seat are both empty seats", () => {
  assert.equal(P.isEmptySeat(T2.seats[3]), true);   // BLIND
  assert.equal(P.isEmptySeat(T3.seats[3]), true);   // a threesome
  assert.equal(P.isEmptySeat(T1.seats[0]), false);
});

test("each par gives its seven buttons", () => {
  assert.deepEqual(P.scoreButtons(3), [1,2,3,4,5,6,7]);
  assert.deepEqual(P.scoreButtons(4), [2,3,4,5,6,7,8]);
  assert.deepEqual(P.scoreButtons(5), [3,4,5,6,7,8,9]);
});

test("Aberdeen's pars are the ones on the card", () => {
  const pars = Array.from({length:18},(_,i)=>P.parOf(i+1));
  assert.deepEqual(pars, [4,4,3,5,4,4,5,3,4,4,4,4,3,4,4,5,3,5]);
  // Every button the page can offer is one the form's grid will take.
  for (const par of pars) for (const n of P.scoreButtons(par)) assert.ok(n>=1 && n<=9);
});

test("review stops on a missing score and names the man", () => {
  assert.equal(P.missingMan(T1, 3, {1:4,2:5,3:6,4:7}, {}), null);
  assert.equal(P.missingMan(T1, 3, {1:4,3:6,4:7}, {}), "Harvey Schwartz");
  // A BLIND and a threesome are never the missing man.
  assert.equal(P.missingMan(T2, 3, {1:4,2:5,3:6}, {}), null);
  assert.equal(P.missingMan(T3, 3, {1:4,2:5,3:6}, {}), null);
});

test("18 comes round to 1", () => {
  assert.equal(P.nextHole(17), 18);
  assert.equal(P.nextHole(18), 1);
  assert.equal(P.prevHole(1), 18);
});

test("a hole in the feed reads as sent", () => {
  const sent = P.feedSentHoles(T1);
  assert.deepEqual(Object.keys(sent).map(Number).sort((a,b)=>a-b), [1,2,7]);
  assert.equal(sent[3], undefined);
  assert.deepEqual(P.feedSentHoles(T2), {});
});

test("a hole already in says what it holds", () => {
  assert.equal(P.feedHoleLine(T1, 7), "Rob 6, Harvey 7, Stu 5, Andy 8");
  // A man with nothing on that hole is simply not in the line.
  assert.equal(P.feedHoleLine(T1, 3), "");
});

test("a man who leaves is out from that hole on, in HIS team's order", () => {
  // Team 2 starts on the 10th, so 18 comes BEFORE 1 for them. A man out from
  // 16 is out on 18 and still out on 1 — a plain number comparison gets both
  // of those backwards.
  const left = {1: 16};
  assert.equal(P.isOut(left, 1, 15, 10), false);
  assert.equal(P.isOut(left, 1, 16, 10), true);
  assert.equal(P.isOut(left, 1, 18, 10), true);
  assert.equal(P.isOut(left, 1, 1,  10), true);
  assert.equal(P.isOut({}, 1, 1, 10), false);       // the undo puts him back
});

test("a man who has left owes no score, so review lets the hole go", () => {
  const left = {3: 5};
  assert.deepEqual(P.playingSeats(T1, 6, left).map((s:any)=>s.seat), [1,2,4]);
  assert.equal(P.missingMan(T1, 6, {1:4,2:5,4:7}, left), null);
  assert.equal(P.missingMan(T1, 4, {1:4,2:5,4:7}, left), "Stu Horvitz");
});

test("an empty box is sent EMPTY — no key at all", () => {
  const four = P.sendBody(1, 7, {1:5,2:6,3:4,4:7});
  assert.deepEqual(four, {
    "entry.571884128":"1", "entry.605471460":"7",
    "entry.828466984":"5", "entry.1307241763":"6",
    "entry.378353848":"4", "entry.1378388490":"7",
  });
  // A BLIND in seat 4, a threesome, and a man who left all look the same to
  // the form: his key is simply not there, which is what an untouched radio
  // does and what the sheet reads as an empty box.
  const three = P.sendBody(2, 12, {1:5,2:6,3:4});
  assert.equal("entry.1378388490" in three, false);
  assert.equal(Object.keys(three).length, 5);
  const gone = P.sendBody(1, 9, {1:5,2:6,4:7});
  assert.equal("entry.378353848" in gone, false);
  // Team and hole are required by the form and are always there.
  assert.equal(gone["entry.571884128"], "1");
  assert.equal(gone["entry.605471460"], "9");
});

test("a send is named by its team and hole, so a double tap is one send", () => {
  assert.equal(P.sendId(1,7), P.sendId(1,7));
  assert.notEqual(P.sendId(1,7), P.sendId(2,7));
  assert.notEqual(P.sendId(1,7), P.sendId(1,8));
  // The queue refuses a second job for a team and hole already waiting...
  assert.match(PAGE, /if\(q\[i\]\.id===id&&q\[i\]\.state==="pending"\) return q\[i\];/);
  // ...and the button is dead before the first one is even built.
  assert.match(PAGE, /if\(S\.sending\) return;\s*S\.sending=true;\s*var btn=\$\("doSend"\);btn\.disabled=true;/);
});

test("held sends go oldest first", () => {
  const q = [
    {id:"t1h9", at:300, state:"pending"},
    {id:"t1h7", at:100, state:"pending"},
    {id:"t1h8", at:200, state:"done"},
  ];
  assert.equal(P.outboxNext(q).id, "t1h7");
  assert.equal(P.outboxNext([{id:"x",at:1,state:"done"}]), null);
  assert.equal(P.outboxNext([]), null);
});

/* ---------- the promises the page makes about signal ---------- */

test("a score is written down before it is sent, and never falsely confirmed", () => {
  // queueSend runs before postOnce: the score is on the phone before the
  // radio is asked for anything.
  const send = PAGE.slice(PAGE.indexOf('$("doSend").addEventListener'));
  assert.ok(send.indexOf("queueSend(") < send.indexOf("postOnce("),
    "the send is tried before it is written down");
  // "sent" only in the resolved branch; the rejected branch says saved.
  assert.match(send, /postOnce\(job\)\.then\(function\(\)\{[\s\S]*?" sent\."/);
  assert.match(send, /\.catch\(function\(\)\{[\s\S]*?saved on this phone/);
  // It is only struck off the outbox once the request came back.
  assert.match(send, /\.then\(function\(\)\{\s*markDone\(job\);/);
  // And the word is written AFTER the move to the next hole. Written before,
  // it is wiped by the move and the captain is carried on in silence — which
  // is the same thing as not telling him whether his hole went.
  const head = send.slice(0, send.indexOf("drawQueueBar();", send.indexOf("S.sending=false")));
  assert.ok(head.indexOf("openHole(nextHole(hole));") < head.indexOf('$("scoreMsg").textContent=word;'),
    "the confirmation is written before the hole moves, so it is wiped");
});

test("the post can tell a failure from a send", () => {
  // no-cors hides Google's status, but a rejected fetch still means the
  // request never left. sendBeacon cannot tell those apart, so it is not used.
  assert.match(PAGE, /mode:"no-cors"/);
  // sendBeacon is named once, in the comment saying why it is not used.
  const CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/sendBeacon/.test(CODE), false);
  // Held sends are retried on every event a phone gives us.
  assert.match(PAGE, /window\.addEventListener\("online"/);
  assert.match(PAGE, /visibilitychange/);
  assert.match(PAGE, /setInterval\(function\(\)\{ if\(outboxNext\(outbox\(\)\)\) drainOutbox\(\); \},RETRY_EVERY\);/);
});

test("the outbox outlives the day, and everything else does not", () => {
  // A pending send is a score a man believes he filed; it must survive
  // midnight and a reload. Today's screen state must not survive to next week.
  assert.match(PAGE, /var OUTBOX_KEY=NS\+"outbox";/);
  assert.match(PAGE, /k!==OUTBOX_KEY&&k\.indexOf\(NS\+DAY\+"\."\)!==0/);
  assert.match(PAGE, /sweepOldDays\(\);/);
});

test("the last feed is kept on the phone", () => {
  assert.match(PAGE, /keep\("feed",\{text:text,at:S\.stamp\}\)/);
  assert.match(PAGE, /function loadFeedFromPhone/);
  assert.match(PAGE, /loadFeedFromPhone\(\);/);
});

test("a hole already in is offered, not simply reopened", () => {
  // The Gross tab now takes the latest send, so a correction replaces rather
  // than doubles. It still is not one tap: the buttons stay locked until he
  // says yes to changing the hole, because the common way to arrive on a sent
  // hole is a mis-tap of the back arrow, not a correction.
  assert.match(PAGE, /var SHEET_LAST_SEND_WINS = true;/);
  assert.match(PAGE, /var locked=already&&!S\.unlocked;/);
  assert.match(PAGE, /chg\.textContent="Change hole "\+h;/);
  assert.match(PAGE, /S\.unlocked=true;drawScore\(\);/);
  assert.match(PAGE, /\$\("toReview"\)\.disabled=!!locked;/);
  // Opening a hole afresh always relocks it — an unlock is for one hole only.
  assert.match(PAGE, /S\.scores=\{\};S\.unlocked=false;/);
  // The refusing branch is kept against the day the Gross tab is rebuilt and
  // goes back to summing. One flag, and nothing else, chooses between them.
  assert.match(PAGE, /would ADD to what is there/);
});

test("the logo tries both spellings before giving up", () => {
  // Rob's file is TGIF_logo.png; the page asks for tgif_logo.png; GitHub Pages
  // is case-sensitive. Getting that wrong is a 404 nobody ever sees.
  assert.match(PAGE, /src="tgif_logo\.png"/);
  assert.match(PAGE, /this\.setAttribute\("src","TGIF_logo\.png"\); return;/);
  // And it cannot loop: the second failure hides it instead of asking again.
  assert.match(PAGE, /if\(this\.getAttribute\("src"\)!=="TGIF_logo\.png"\)/);
  assert.match(PAGE, /this\.style\.display="none";/);
});

test("the leaderboard is reachable from both screens a man sits on", () => {
  // The scoring screen and the card. Not the team screen — he is not sitting
  // there, he is passing through it once.
  const SCORE = PAGE.slice(PAGE.indexOf('id="screenScore"'), PAGE.indexOf('id="screenReview"'));
  const CARD  = PAGE.slice(PAGE.indexOf('id="screenCard"'), PAGE.indexOf("</section>", PAGE.indexOf('id="screenCard"')));
  assert.match(SCORE, /<a id="lbScore"[^>]*>Leaderboard<\/a>/);
  assert.match(CARD,  /<a id="lbCard"[^>]*>Leaderboard<\/a>/);
  // A new tab, so following it cannot take down a page that is still holding
  // a hole waiting for signal.
  for (const m of PAGE.matchAll(/<a id="lb(?:Score|Card)"([^>]*)>/g)) {
    assert.match(m[1], /target="_blank"/);
    assert.match(m[1], /rel="noopener noreferrer"/);
  }
  // Dressed as a button, and held to the same floors as one.
  assert.match(CSS, /a\.wide\{[^}]*font:800 22px/);
  assert.match(CSS, /button\.wide,a\.wide\{[^}]*min-height:60px/);
});

test("an unconfigured leaderboard is not drawn at all", () => {
  // A button that goes nowhere is tapped twice and then the page is not
  // trusted. Hidden is better than dead.
  assert.match(PAGE, /^var LEADERBOARD_URL = "[^"]*";$/m);
  assert.match(PAGE, /if\(LEADERBOARD_URL\)\{ a\.href=LEADERBOARD_URL; a\.classList\.remove\("hide"\); \}/);
  assert.match(PAGE, /else a\.classList\.add\("hide"\);/);
  assert.match(PAGE, /drawLeaderboardLinks\(\);/);
});

test("the scorer feed is wired in", () => {
  const m = PAGE.match(/^var FEED_CSV = "([^"]*)";$/m);
  assert.ok(m && m[1], "FEED_CSV is empty — the page would have no teams to offer");
  assert.match(m![1], /\/pub\?.*output=csv/, "not a published-to-web CSV address");
});

/* ---------- eyesight ---------- */

const CSS = PAGE.slice(PAGE.indexOf("<style>"), PAGE.indexOf("</style>"));

test("nothing on the page is under 18 pixels", () => {
  const sizes = [...CSS.matchAll(/font-size:\s*(\d+)px/g)].map(m => Number(m[1]));
  assert.ok(sizes.length > 10, "no font sizes found — the check is not looking at anything");
  const small = sizes.filter(n => n < 18);
  assert.deepEqual(small, [], "type under 18px: " + small.join(", "));
  // The shorthand `font:` lines carry a size too, and are just as easy to shrink.
  const short = [...CSS.matchAll(/font:\s*\d+\s+(\d+)px/g)].map(m => Number(m[1]));
  assert.deepEqual(short.filter(n => n < 18), []);
});

test("no tap target is under 44 pixels", () => {
  const mins = [...CSS.matchAll(/min-(?:height|width):\s*(\d+)px/g)].map(m => Number(m[1]));
  assert.ok(mins.length > 4);
  const small = mins.filter(n => n < 44);
  assert.deepEqual(small, [], "targets under 44px: " + small.join(", "));
  assert.match(CSS, /button\{[^}]*min-height:48px/);
});

test("nothing scrolls sideways at 375", () => {
  assert.match(CSS, /html,body\{[^}]*overflow-x:hidden/);
  // The card is the one thing wide enough to be tempted. It is fixed-layout
  // and full width, so it fits the phone rather than running off it.
  assert.match(CSS, /table\{[^}]*width:100%[^}]*table-layout:fixed/);
  // Nothing is pinned wider than the narrowest phone we build for.
  const widths = [...CSS.matchAll(/(?<!min-|max-)width:\s*(\d+)px/g)].map(m => Number(m[1]));
  assert.deepEqual(widths.filter(n => n > 351), [],
    "a fixed width wider than a 375px phone's usable 351px");
});

test("no Google branding, no sign-in, no email box, no codes", () => {
  const BODY = PAGE.slice(PAGE.indexOf("<body"));
  assert.equal(/Google/i.test(BODY.replace(/<script[\s\S]*<\/script>/, "")), false);
  assert.equal(/type="email"|sign in|password|<input/i.test(BODY), false);
  assert.match(PAGE, /src="tgif_logo\.png"/);
});

test("the page loads nothing — it arrives whole or not at all", () => {
  // A phone holding new HTML against an old script fails silently. The app was
  // bitten by that twice in one afternoon; this page cannot be, because there
  // is nothing separate for a cache to hold.
  assert.equal(/<script[^>]+src=/.test(PAGE), false);
  assert.equal(/<link[^>]+stylesheet/.test(PAGE), false);
});

test("picks.html is untouched by any of this", () => {
  const PICKS = readFileSync(new URL("../picks.html", import.meta.url), "utf8");
  assert.match(PICKS, /1FAIpQLSdbtFLO94Gq1RYC2-YJm-pDK1OMuBy8kzdkvY7MvfmOh8Fnuw/);
  assert.equal(PICKS.indexOf("1FAIpQLSemQD14"), -1);
});
