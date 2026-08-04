# BEAT THE CROWD · CLUBHOUSE — BUILD BRIEF

**For Claude Code. Version 1, 2026-07-30.**

---

## 0. Read this first

This is **not** the spectator game. Beat the Crowd has two products sharing one scoring engine:

| | **Tournament** | **Clubhouse** ← *this brief* |
|---|---|---|
| Who plays | Spectators at a PGA Tour event | The golfers themselves |
| What they do | Predict what tour pros will do | Play golf; scores are read from their card |
| Data source | Live tournament feed | Golf Genius, pasted or imported |

**Nobody "plays" the Clubhouse game, and the app does not collect scores.** Golfers play golf. Scores are entered in **Golf Genius**, which the club already uses and which every player already knows. The app reads those scores in and shows what the contests did with them.

**So this is a viewer, not a scorer.** Do not build hole-by-hole score entry — it would duplicate a system that already works and that nobody wants to use twice. The phone is a leaderboard.

The one exception is **Watch the Birdie**, whose two hole picks are collected once before the round.

---

## 1. What it must be

A single-page web app, installable to a phone home screen, that **works with no signal**. Golf courses have dead spots and the app must never stall mid-round.

**The audience is 70 and 80 year olds outdoors in Florida sunshine.** That is a hard design constraint, not a nicety:

- Minimum 18px body text, 24px+ for scores
- Tap targets no smaller than 48×48px
- Very high contrast; assume direct sun on a dim screen
- No thin greys, no hairline type, no hover-dependent behaviour
- One thing per screen — the scorer is standing on a cart path

**Not required for v1:** accounts, payments, a server, live sync between devices, Golf Genius integration.

---

## 2. Scoring — complete and exact

### Setup per event
Course par by hole, stroke index by hole, slope, course rating. Per player: name, handicap index, cart number, and their two Watch the Birdie hole picks.

**Course handicap** = `ROUND(index × slope ÷ 113 + (rating − par), 0)`
*Verified against Golf Genius on 8 real players: exact match on all 8.*

**Handicap strokes on a hole** = `1 if SI ≤ CH` plus `1 more if SI ≤ CH − 18` plus `1 more if SI ≤ CH − 36`

**Net score on a hole** = gross − strokes received, **capped at par + 2**.

**The cap is net double bogey.** No hole can ever score worse than two over par net — the same cap Golf Genius applies when it posts a score. Apply it before anything else is computed. It stops a single 11 deciding a contest for the whole field, and it means "net doubles or worse" and "net doubles" are the same thing.

**Do not cap the gross total.** Keep both figures: capped net for scoring, true net for reconciling against Golf Genius.

### The final score

> **FINAL = capped net score for the round − strokes earned in the contests**

No arbitrary base number. Their net score is the anchor and contests reduce it. **Lowest wins.**

**No floor by default.** The Tournament product protects a hard floor of 59; Clubhouse does not, because net scoring already keeps everyone near par. Make it a console setting — blank means no floor — so it can be switched on if a freak round ever prints something absurd. Maximum contest strokes is 11.0, so a net 65 could in theory print a 54.

**Every contest is scored on ONE player's card.** Team size, team format and blinds are irrelevant to Clubhouse — the group can be playing best-two-net, best-three-on-easy-holes or nothing at all and it makes no difference. Cart Skins is the only team element in the product. Do not build team aggregation.

### The six contests

All thresholds must live in a config object, not in code. They are calibrated from a small sample and *will* change.

**Every value in the game is a multiple of 0.1.** No hundredths — they look wrong on a golf scoreboard. If a proposed threshold produces 0.75, round it to a tenth rather than allowing the third decimal in.

**1 · Watch the Birdie** — two par 4s nominated before the round, one on each nine.
`−1.0 per nominated hole birdied` — a net birdie or better. Both picks pay, so up to −2.0.

Paid **per pick**, not by counting them, so a hard hole can later be made worth more than an easy one without touching code. The legal picks are derived from the course's par, never hardcoded — at Aberdeen that is front **1, 2, 5, 6, 9** and back **10, 11, 12, 14, 15**. Reject a pick that is not a par 4 on the right nine. An unplayed nominated hole scores 0. Works on a partial round.

*Replaced Call Your Number, which rewarded hitting a predicted number rather than playing well — a man could profit from a bad score.*

**2 · Agony Alley** — net total across the course's hardest stretch (holes 4-5-6 at Aberdeen, par 13).
`≤12 → −2.5 · 13 → −1.5 · 14 → −0.5 · 15 → 0 · 16 → +1.0 · 17+ → +1.5`
**The only contest that can add strokes.** Stretch holes are per-course config. Requires all stretch holes played.

**3 · Damage Control** — count of net doubles or worse.
`0 → −2.0 · 1 → −1.0 · 2 → −0.5 · 3+ → 0`
The fairest contest in the set — correlation with handicap is +0.05. Works on a partial round.

**4 · Go Long** — net vs par across the par 5s.
`≤−1 → −1.5 · 0 → −1.0 · +1 → −0.5 · +2 or worse → 0`

**5 · Get Shorty** — net vs par across the par 3s.
`≤−2 → −1.5 · −1 → −1.0 · 0 → −0.5 · +1 or worse → 0`

**6 · Bounce Back** — a net double answered by a net par or better on the very next hole.
`3+ → −1.5 · 2 → −1.0 · 1 → −0.5 · 0 → 0`
Consecutive holes only. Both must be played.

**7 · Skins** — see the skins section. `−0.2 a skin, capped at −1.5`.

### Skins — by cart or by team

**One engine, two groupings. A setting decides which.**

| Grouping | Members | When |
|---|---|---|
| **Team** | 3 or 4 players | **The common case.** The club plays team matches whenever there are 3+ teams. |
| **Cart** | 2 players, sometimes 1 | Less often. Build it, but it is not the default. |

The logic is identical either way — only the membership changes. Do not write two implementations.

**A cart's score on a hole is the AVERAGE of its players' net scores, not the total.** This matters: totals break completely with uneven groups — in testing, a three-man team beat four-man teams on all 18 holes. Averaging is self-correcting.

Lowest cart average wins the hole. **Tied holes carry over** — the next hole is worth two skins, then three, and so on. Ignore any player who didn't play that hole.

**An odd man rides alone. Do not build a blind partner for him.** Tested over 3,000 simulated rounds: riding alone wins 1.13× what a two-man cart wins — near enough fair. Every blind tested made it *worse*, because a constant partner strips out the variance that wins skins. A flat net-bogey blind was catastrophic at 0.14×.

**A three-man team needs no blind either.** Averaging already handles it. The club uses a blind in its own best-two-ball match; that is a different game and nothing to do with this.

**Skins needs an ON/OFF switch in the console.** Some rounds the groups won't divide sensibly and the organiser will want to skip it.

**Skins now scores into FINAL.** Previously it sat outside the total, which made it a sideshow. **−0.2 a skin, capped at −1.5.**

---

## 3. Edge cases that will actually happen

| Case | Behaviour |
|---|---|
| Player quits after 12 holes | Everything still scores. A contest that can't be judged returns 0 and says why — Agony Alley needs its stretch holes, Go Long and Get Shorty need their par 5s and par 3s, and an unplayed Watch the Birdie pick simply doesn't pay. |
| Nine-hole event | Same. Show which contests are live. |
| One-man cart | Averaging handles it. No blind, no special case — measured at 1.13× fair. |
| A hole scored worse than net double | Capped to net double before anything else runs. |
| Odd number of players | Organiser assigns cart numbers; a cart of one is legal. |
| A hole not yet played | Blank, never zero. Zero is a score. |
| A player picks up | Golf Genius prints `X`. Scored par + 4 gross, so the cap takes it to net double. The hole still counts as played, so an X'd card is a full round and can win. Shown as X, never as the filled figure. |
| Score typed wrong | Every entry must be editable at any time, and everything recomputes. |
| Two players tie | Show the tie. Do not invent a tiebreak in v1. |

---

## 4. Screens

**Setup** — course, then players: name, handicap index, cart number, and the two Watch the Birdie picks. Offer only the legal par 4s for each nine so an invalid pick cannot be entered. Course handicap displays as it's computed. Editable at any point. Done once before the round.

**Import scores** — a paste box. See section 10 for the exact format. Show what was parsed before committing anything, so a bad paste is caught immediately. Re-pasting replaces the round; it never merges.

Partial rounds must import cleanly — blanks mean not played, and blank is never zero.

**Leaderboard — this is the product.** Final score, sorted, biggest type on the screen. Tap a player for his contest breakdown. Readable at arm's length in direct sun by someone wearing reading glasses.

**Cart Skins** — skins by cart, carryovers visible. A hole worth four skins should look like it.

---

## 5. Data and storage

Local storage on the device. One event at a time in v1. An export button (JSON or CSV) so a round can be sent on — that export is also how calibration data gets collected, so include gross scores, handicaps, stroke index and course details.

No server, no accounts, no sync. Those come later if the product proves out.

---

## 6. What already exists

- **A TypeScript scoring engine**, 44 tests passing, built for the Tournament product. Shares the concepts: hole-by-hole scoring, category bars, a graded stretch ladder. Some is reusable; the club net-scoring logic is new.
- **A scoring spreadsheet** (`BtC_Clubhouse_Scoring.xlsx`) implementing every rule above and verified against real scores. **Treat it as the reference implementation.** If the app and the spreadsheet disagree, the spreadsheet is right until proven otherwise.
- **Calibration data**: one round, Aberdeen, Tee IV, 16 players, indexes 20.8–38.1, 19 December 2026.

---

## 7. What is not decided

- **Thresholds are provisional.** One round, one tee, no single-digit handicaps, no women. They will move. Keep them in config and make them easy to change.
- **Whether six contests is too many.** The likely launch set is three — Agony Alley, Damage Control, Watch the Birdie. Build all six; make it trivial to switch them off.
- **Flights.** The club plays in flights and off different tees. Not yet designed.
- **Scrambles.** Charity events are usually scrambles with no individual hole scores. Team-level scoring is sketched, not specified. This is the one place team aggregation would ever be needed.

---

## 8. Build order

1. Config, course setup, handicap and net-score maths — **test against the spreadsheet before anything else**
2. Score entry screen
3. Leaderboard with the six contests
4. Cart skins
5. Export
6. Offline and installability

**First milestone:** load the 19 December Aberdeen round and produce results matching the spreadsheet exactly — including the one player whose net is capped from 77 to 76. Nothing else counts until that passes.

## 9. The reference numbers

The eight lowest-index players from 19 December, scored by the spreadsheet. Any build must reproduce these.

**The course, which you cannot derive from any data file — Aberdeen Golf & Country Club, Tee IV:**

```
par by hole    4 4 3 5 4 4 5 3 4 4 4 4 3 4 4 5 3 5     (total 72)
stroke index    9  5 17 1 3 7 13 15 11  6 10  8 16 14  4 12 18  2   (Golf Genius, men)
slope 117 · course rating 65.3 · Agony Alley = holes 4, 5, 6
```

**The stroke index is essential and appears in no export.** Net *totals* come out right whatever index you assume — a 19-handicap gets 19 strokes wherever they fall — but every contest depends on *which* holes receive them. **Matching net totals with mismatched contests means the stroke index is wrong.** That is the single most likely failure in this build.

**Use Golf Genius's allocation, not the printed card.** The two disagree on ten holes, and Golf Genius's is the one that computes the net actually posted against these rounds. The switch was measured across the club's cards: the contests are unmoved — same clear rates, correlations within 0.02 — and of the sixteen reference finals only one moves at all (Finn, section 11). The women play a different allocation again:

```
men      9  5 17  1  3  7 13 15 11   6 10  8 16 14  4 12 18  2
women    9 11 17  1  3  7  5 15 13   4 12 16 18  8  6 10 14  2
```

**Source data:** `Hole by Hole Excel Export -- Spreadsheet Composer.xlsx`. Hole columns are **gross**. Do not use the TGIF file for these eight — it is a different round, different players, and its hole columns are net.

| Player | Index | Course hcp | Gross | **Picks** | Net (capped) | Strokes off | FINAL |
|---|---|---|---|---|---|---|---|
| Abe Whitfield | 25.2 | 19 | 92 | 1 / 10 | 73 | 6.00 | **67.00** |
| Ben Castellan | 24.8 | 19 | 93 | 2 / 11 | 74 | 6.50 | **67.50** |
| Dan Pemberton | 26.4 | 21 | 95 | 6 / 14 | 74 | 3.50 | **70.50** |
| Eli Marsden | 23.6 | 18 | 92 | 9 / 15 | 74 | 3.50 | **70.50** |
| Cy Ashford | 24.0 | 18 | 93 | 5 / 12 | 75 | 4.00 | **71.00** |
| Gus Thornbury | 25.4 | 20 | 97 | 1 / 10 | 76 | 4.50 | **71.50** |
| Hal Brightwater | 25.1 | 19 | 95 | 2 / 11 | 76 | 3.00 | **73.00** |
| Ike Calloway | 20.8 | 15 | 94 | 5 / 12 | 79 | 3.00 | **76.00** |

**The picks are an input, not something you can compute** — and the ones above are invented. See the warning in section 11: the club recorded no Watch the Birdie picks for this round, so these are demo values and every FINAL in the table depends on them. Watch the Birdie paid: Ben −1.0 · Dan −1.0 · Eli −1.0 · Ike −1.0, and nothing to the other four.

**Cart assignments for the skins check:** 1, 1, 2, 2, 3, 3, 4, 4 in the order Ike, Eli, Cy, Ben, Hal, Abe, Gus, Dan.

Gus Thornbury is the test case for the cap: his uncapped net is 77.
Hal Brightwater is the test case for the penalty: **+1.0** on Agony Alley.
Ike Calloway has the lowest handicap in the group and finishes last — that is the game working, not a bug.

Cart Skins with carts 1-1-2-2-3-3-4-4 in that order: **4, 5, 2, 7** — eighteen skins, all accounted for.


---

## 10. The Golf Genius export — the real format

The organiser downloads the event leaderboard from Golf Genius. It arrives as a **legacy `.xls`** (OLE2, not modern xlsx — `SheetJS` reads both; `openpyxl` does not). It contains several sheets; the one to read is the low-net leaderboard, named something like **"Holes season - low net"**.

**Layout, verified against a real 18-player export:**

| Column | Contains |
|---|---|
| 0 | `Player Name (course handicap)` — e.g. `Sid Ferndale (18)` |
| 1–9 | Holes 1–9 |
| 10 | Out |
| 11–19 | Holes 10–18 |
| 20 | In |
| 21 | **Total — this is the GROSS total** |
| 22 | Net |

### The thing that will catch you out

**The hole-by-hole numbers are NET scores, not gross.** Out, In and Net are all net; only the Total column is gross.

Verified: Sid Ferndale's 18 holes sum to 72, which matches the Net column. His Total column reads 90, and 90 − 18 (his handicap) = 72.

**What this means for the build:**

- **No stroke index is needed.** Golf Genius has already applied the strokes. Do not recompute them and do not subtract twice.
- **Par by hole is still needed** — every contest measures net against par, and the net double bogey cap is par + 2.
- **Gross comes from the Total column**, and it is the figure to reconcile against Golf Genius.
- **The export carries no Watch the Birdie picks.** They are a setup input and must be married to the imported card by player name.
- A net 1 on a par 3 is a net 1, **not a hole in one.**

### Preferred input

**Paste, not file upload.** The organiser selects the player rows in the open spreadsheet and copies — that puts tab-separated text on the clipboard, which is trivial to parse and needs no `.xls` reader in the browser. Accept a file drop as a convenience later; do not build it first.

### Parsing rules

- Split the handicap out of the name with a trailing-parenthesis match; keep the name for display and the number for reference only.
- Ignore the Out, In and Net columns; recompute everything from the 18 hole values so a bad export is caught rather than trusted.
- **A blank cell means the hole was not played. An `X` does not.** Golf Genius prints X where a man picked up; that hole **was** played and scores **par + 4 gross**, which the net double bogey cap takes to net double — what picking up means. Any mark that isn't a number reads the same way.
- **A picked-up hole counts towards the eighteen.** A man who X'd three holes went round and can win; walking in after twelve is a different thing and is not eligible. Getting this wrong quietly disqualifies him.
- Show an X as an X, never as the par + 4 that was filled in, or somebody will read it as a score he made.
- A card with an X on it cannot be summed against Out/In/Total, so gross and net cannot be told apart by arithmetic — the organiser is asked which the columns are rather than the paste being called broken.
- Sheet 1 of the same file holds Golf Genius's own skins result — a free cross-check on the Cart Skins maths.


---

## 11. A second test round — 31 July, real scores

Eight cards from the club, handicaps 14 to 34 — a far wider spread than section 9. **Use this as a second test.** An engine that reproduces both has been proven on independent data.

Same course (Aberdeen, Tee IV). Hole-by-hole **gross**:

```
Hole      1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18
Par       4  4  3  5  4  4  5  3  4  4  4  4  3  4  4  5  3  5
Alex       5  5  3  6  5  5  6  3  5  7  5  5  4  4  6  6  3  7
Boyd      6  5  4  7  6  5  7  4  5  6  6  5  4  5  7  4  4  6
Chip     6  5  4  8  6  5  5  4  5  5  6  3  5  6  6  5  4  6
Dex      5  5  4  6  6  6  7  3  5  4  4  6  3  6  6  6  6  5
Emmet      6  5  3  7  7  6  5  3  5  4  5  5  3  5  6  7  3  6
Finn      5  6  6  7  5  4  7  4  7  6  7  5  3  5  5  6  4  7
Grady     7  6  4  9  7  7  7  5  5  6  7  7  3  8  6  7  3  9
Hoyt      7  5  4  8  8  4  8  4  6  5  6  7  4  7  5  5  4  6
```

| Player | Course hcp | Gross | Picks | Net (capped) | Strokes off | FINAL |
|---|---|---|---|---|---|---|
| Dex | 23 | 93 | 6 / 14 | 70 | 5.00 | **65.00** |
| Alex | 18 | 90 | 1 / 10 | 72 | 5.00 | **67.00** |
| Finn | 26 | 99 | 1 / 10 | 73 | 4.50 | **68.50** |
| Boyd | 21 | 96 | 2 / 11 | 75 | 5.00 | **70.00** |
| Emmet | 14 | 91 | 9 / 15 | 77 | 0.50 | **76.50** |
| Chip | 15 | 94 | 5 / 12 | 79 | 1.50 | **77.50** |
| Grady | 34 | 113 | 2 / 11 | 79 | 0.50 | **78.50** |
| Hoyt | 20 | 103 | 5 / 12 | 82 | 2.50 | **79.50** |

> ⚠️ **The Watch the Birdie picks above are invented, and every FINAL in this table depends on them.**
>
> The contest postdates both reference rounds, so the club recorded no picks for either. These were assigned mechanically — rotating through the legal par 4s (front 1, 2, 5, 6, 9 · back 10, 11, 12, 14, 15) in finishing order — and were **not** chosen to produce any particular result. Only one pick paid in this round: Chip's hole 12, a net eagle, for −1.0.
>
> Change a single pick and the finals move, and so can the order. **Get the real picks before treating any number here as a reference.** The same warning applies to the section 9 table.

**Cart skins** with carts 1,1,2,2,3,3,4,4 in the order Alex, Boyd, Chip, Dex, Emmet, Finn, Grady, Hoyt: **6, 9, 1, 2** — eighteen, all accounted for.

### Why this round is a better test than section 9

- **Handicaps 14 to 34.** Section 9 spans only 15 to 21.
- **Three players take an Agony Alley penalty** — Chip +1.0, Emmet +1.5, Grady +1.5. Section 9 has one.
- **Finn scored 10 on Agony Alley**, three under par, hitting the top rung. Nothing in section 9 does.
- **Grady's 113 and Chip's 94 come out level on net, both 79.** Nineteen shots of gross difference vanish into the handicap and the contests decide the order. That net parity is the property worth pinning; which of the two finishes ahead depends on the Birdie picks, and under the invented picks above it is Chip. Under the old Call Your Number it was Grady.

Note these values use the ladders as they stand today, including the retuned **Bounce Back** (`3+ → −1.5 · 2 → −1.0 · 1 → −0.5 · 0 → 0`), which removed the last 0.75 from the game. **Others remain under review** — see section 12 — so re-run this table whenever a threshold changes rather than trusting the numbers above.

---

## 12. Under review — do not change yet

Forty-two player-rounds from two groups at one course. Enough to have found these, not enough to fix them. **Keep every threshold in config so a recalibration is a data edit, not a code change.**

| Contest | Issue | Likely change |
|---|---|---|
| **Watch the Birdie** | New, and uncalibrated — no round has been played with real picks. Only 5 of the 16 reference cards would have been paid anything, so −1.0 a pick may be too stingy, or the picks too hard. | Collect real picks for one round before touching the value. |
| **Damage Control** | Zero net doubles fires 19% (about right) but everything from 3 up collapses to nothing, and 24% of rounds land there. | Spread to `0 → −2.0 · 1 → −1.5 · 2 → −1.0 · 3 → −0.5 · 4+ → 0` |
| **Agony Alley** | Players believe 12 and 13 are unreachable. **They are wrong** — 12% clear 12, 26% clear 13. | No change |
| **Go Long / Get Shorty** | Aberdeen rates all four par 5s among its five hardest holes and all four par 3s among its four easiest. Go Long is stroke-starved for high handicaps; Get Shorty is stroke-rich. | Course-specific. Watch, don't fix. |

**Missing from the data entirely:** single-digit handicaps, a second tee, and women's tees. All three are being sought.
