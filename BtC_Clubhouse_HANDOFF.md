# BEAT THE CROWD · CLUBHOUSE — HANDOFF

**Dated 2026-08-09 · Robert Tanenbaum · Beat the Crowd LLC**
**Paste this into a new conversation to pick the project up.**

---

## 0. Read this first

**Beat the Crowd has two products.** They share design ideas and no code.

| | **Tournament** | **Clubhouse** ← *this document* |
|---|---|---|
| Who plays | Spectators at a PGA Tour event | The golfers themselves |
| What they do | Predict what tour pros will do | Play golf; contests are read off their card |
| Status | Demo built, pitch not made | **Working app, six live rounds played** |

Everything below is Clubhouse. The Tournament product is parked.

**The app is live** at `https://mexicomoe.github.io/btc-clubhouse/leaderboard.html`, built with Claude Code from `~/Desktop/BtC_Clubhouse`, 236 tests passing.

---

## 1. What the game is

**Your score starts as your net score for the round. Contests take strokes off it. Lowest wins.**

No arbitrary base — net scoring already puts every player near par, whatever his handicap. A man who shoots a poor net can still beat a better player by winning contests, which is the point.

**Every hole is capped at net double bogey** before anything is scored — the same cap Golf Genius applies.

### The seven contests, as they stand today

| Contest | What it measures | Pays |
|---|---|---|
| **Watch the Birdie** | You name one par 4 on the front and one on the back before the round. Net birdie there. | −1.0 a pick |
| **Agony Alley** | Net score across holes 4-5-6 at Aberdeen — the hardest stretch | −2.5 to **+1.5** |
| **Damage Control** | How few net doubles you made | −2.0 to 0 |
| **Go Long** | Net score on the par 5s | −1.5 to 0 |
| **Get Shorty** | Net score on the par 3s | −1.5 to 0 |
| **Bounce Back** | A net bogey answered by a net birdie on the very next hole | −1.5 to 0 |
| **Skins** | Your group against the other groups, hole by hole, on average net | 0.8 × groups ÷ 18 a skin, capped 2.5 |

**Agony Alley holds the only penalties in the game.**

**Every contest is individual** except Skins. Team size, team format and blinds are irrelevant — the group can be playing best-two-ball or nothing at all.

---

## 2. What has been decided, and why

These were argued through and settled. Don't reopen without new evidence.

**Call Your Number was cut.** It rewarded hitting a predicted score, so a man on the 18th tee could profit from playing badly. Any rule where a worse score pays better has the same fault.

**Bounce Back was rewritten.** It used to need a net *double* to recover from, so a bogey-free round couldn't score it at all — 10 of 63 rounds shut out, and it correlated **+0.69** with making disasters. Now: net bogey answered by net birdie. Nobody is shut out and the handicap correlation is **−0.09**.

**The skins cap was replaced by a scaling value.** A fixed cap did nothing at four groups and clipped a genuine winner. Measured finding: **the winning group takes about 6 skins whatever the field size** — more groups splits the eighteen finer but gives more chances to run hot, and the two cancel.

**Blinds are skipped** — Golf Genius marks them `(blind)` in the name.

**Golf Genius's stroke index is authoritative**, not the printed scorecard, because it computes the net scores everything reads.
Men: `9,5,17,1,3,7,13,15,11,6,10,8,16,14,4,12,18,2`
Women: `9,11,17,1,3,7,5,15,13,4,12,16,18,8,6,10,14,2`

**The handicap allowance is per event**, and when a Golf Genius paste supplies a course handicap it already has the allowance in it — never apply it twice.

**Everything is a multiple of 0.1.** No hundredths; they look wrong on a golf scoreboard.

---

## 3. The evidence base

**74 player-rounds at Aberdeen**, handicaps 3.6 to 34, four tees. Sources: two December group exports, two TGIF workbooks, and two live rounds run with the app.

**How the bars perform on the 59-card pool:**

| Contest | Clears | Handicap correlation |
|---|---|---|
| Bounce Back | 25% | +0.24 |
| Agony Alley | 24% | −0.18 |
| Damage Control | 15% | +0.08 |
| Get Shorty | 12% | −0.01 |
| **Go Long** | **5%** | +0.03 |
| **Watch the Birdie** | **78%** | — |

**Target is roughly one round in five.**

Four of five correlations are near zero across a 23-stroke handicap range. **Net scoring is doing its job and no per-handicap rules are needed** — that question was tested and closed.

### The most recent round, 9 August, 15 players, handicaps 3.6 to 28.3

Watch the Birdie fired 40% — far better than 78%, because the field was stronger. Agony Alley **penalised 8 of 15 and paid 4**; the median score was 16 against a ladder that has zero at 15. Rob's judgment, having played those holes: leave it, the difficulty is real and the name earns it.

**A 3.6 index finished 8th of 15. A 24.8 won.** No handicap band dominated.

---

## 4. What is decided but not built

**Drop Go Long and Get Shorty.** Players ignored them — they happen *to* you rather than being chosen — and both pay nothing 58% of the time. Watch the Birdie got attention because it is declared out loud.

**Expand Watch the Birdie to six picks:** one par 3, one par 4 and one par 5 on each nine. Values not set; needs recalibration.

**This is the sharpest product finding so far** and it came from watching people play, not from analysis: *the contests players engage with are the ones they choose.*

---

## 5. Open questions

**1. The scoring base.** Rob has a hunch about averaging net and gross. That is arithmetically a 50% handicap allowance — it adds half a handicap to everyone, 5.0 for the low band and 10.3 for the high. Tested on 9 August: the winner drops three places and the 3-handicap climbs six. **Parked pending more data.** If the concern is high handicaps winning too often, 85% or 90% is a nudge rather than a shove, and the app already has that setting.

**2. Agony Alley's ladder** sits a stroke low for a strong field. Watch whether the same men are penalised every week — if so it is a handicap adjustment rather than drama.

**3. Go Long at 5%** and **Watch the Birdie at 78%** both need recalibrating, but both may be superseded by the six-pick redesign.

**4. Whether anyone looks at their phone during a round.** Deliberately untested — both live rounds were run in secret. This decides how much player mode and the backend are worth.

---

## 6. Where the friction actually is

**This is the thing to fix, and it is not a scoring problem.**

Rob's Friday and Saturday rounds involve: Golf Genius on the phone during play, a `.xls` download afterwards, the app on a laptop, the app on a phone, and a spreadsheet. Yesterday that collapsed — he could not get Saturday's scores into the app and stopped, which was the right call.

**The rule that should hold:**

| | |
|---|---|
| **Golf Genius** | Live scoring during the round. Unchanged, members already use it. |
| **The app, on a laptop** | Setup before, paste scores after |
| **The app, on a phone** | Looking at results only |
| **The spreadsheet** | Retired once the app is trusted |

**The one thing that would remove most of the pain:** getting Golf Genius data out without the `.xls` dance. Rob is asking Golf Genius's own AI whether real-time export to a spreadsheet is possible. **That answer could reshape this whole section.**

Golf Genius does have a documented API v2 with a `scores` webhook that fires within a minute — confirmed by observation, since the club leaderboard updates that fast. It needs the feature enabled on the account and an API key. That is a phone call, not a build.

---

## 7. Where this is going

Three settings, one engine — not three apps.

**Group Play** — Rob's Friday group, Jay Levine's Saturday group, others later. 4 to 36 players. **This is what exists today.**

**Club Play** — the club's own competitions. Ladies Tuesday, 20–50 players; men Wednesday, 50–80. Flights by tee, both genders, formats that change weekly — scramble, shamble, Stableford, match play. Holiday tournaments run over 100 players, shotgun starts, mixed flights.

**Charity** — mostly scrambles. Designed, not built; see the team-formats document.

**Player View** — a read-only link so players make their own predictions and watch the board. Needs a backend, which is the largest unbuilt piece in the project.

### Formats that need supporting

Rob's group already plays **Best 2-ball**, **Cha-Cha** (1 best ball on holes 1-4-7-10-13-16, 2 on 2-5-8-11-14-17, 3 on 3-6-9-12-15-18) and **3-4-5** (3 best balls on par 3s, 2 on par 4s, 1 on par 5s).

**These are the club's own match formats, not Clubhouse.** Clubhouse contests are individual and run alongside — that separation is deliberate and should hold. If Clubhouse copied the match format it would just be the same game twice.

---

## 8. What exists

**Code** — `~/Desktop/BtC_Clubhouse`, on GitHub at `mexicomoe/btc-clubhouse`, live on GitHub Pages. Single HTML file plus plain-JS engine, no build step, works offline, 236 tests. One engine shared by the app and the tests, with a parity suite that fails if they ever diverge.

**Documents** — this handoff, `BUILD_BRIEF.md` in the repo, the team-formats design, the player-mode and backend design.

**Spreadsheets** — a Friday sheet, a Saturday sheet, and an archive workbook that takes the app's CSV export and computes calibration rates.

**Data** — the CSV exports, the Golf Genius workbooks, and the pooled analysis.

---

## 9. How to work on this

**Rob is a sports and product man, not a technical one.** Short answers. Plain language. Explain jargon the first time. He is 77 and reads on a phone in Florida sun — that constraint shapes the app and it should shape the writing.

**He is right more often than the analysis is.** Call Your Number rewarding a bad score, players ignoring Go Long, Bounce Back being unwinnable if you play well — every one of those came from him watching a round, and every one turned out to be a real design fault. **When he says something feels wrong, measure it rather than explaining why it is fine.**

**Claude Code does the building.** He pastes instructions across and pastes the summaries back. Instructions should be complete enough to hand over without editing.

**Anything asserted should be measured.** There are 74 real rounds; use them.

---

## 10. What to do next

**1. Simplify the workflow.** Section 6. Everything else is downstream of it, and it is where the project nearly stalled.

**2. The Watch the Birdie redesign.** Six picks, drop Go Long and Get Shorty. Decided, needs values.

**3. More data.** Jay Levine has been asked for past results. Expect little; keep collecting from live rounds regardless.

**4. Then: Stableford, player mode, the backend.** In that order, unless the phone question in section 5 answers itself.
