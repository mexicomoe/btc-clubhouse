# BEAT THE CROWD · CLUBHOUSE — SCRAMBLE FORMAT

**Design document. Not built. Dated 2026-08-04.**

---

## 0. Status

This is a **design, not a build brief.** Nothing here should be implemented yet, for one reason: **there is no scramble data.** Every threshold below is a guess, and guesses set the difficulty of a game people will play for prizes.

Before any of this is built, we need **one real scramble card** — hole-by-hole team scores from a charity event, ideally three or four teams. From that, everything else follows.

The club-round thresholds are useless here. A scramble team shoots around 8 under; the Aberdeen data runs 25 over. Not a different calibration — a different sport.

---

## 1. Why the club version doesn't transfer

A scramble has **one ball, one card, one number per hole.** No individual scores at all.

That kills five of the seven club contests:

| Club contest | Under a scramble |
|---|---|
| Agony Alley | **Survives** — team score across the stretch |
| Go Long | **Survives** — team on the par 5s |
| Get Shorty | **Survives** — team on the par 3s |
| Skins | **Survives** — already team against team |
| Damage Control | **Dead.** Scramble teams rarely bogey; nothing to control. |
| Bounce Back | **Dead.** Needs a bogey to recover from. |
| Watch the Birdie | **Trivial.** A scramble team birdies half the par 4s. |

---

## 2. The one thing a scramble does generate

**Whose drive was used.**

Most charity scrambles already require a minimum number of drives from each player — usually three or four out of eighteen. So somebody is already tracking it, on paper, and *"we used Dave's drive on 7"* is already something people say at the table.

It is also the format's sorest point. In a scramble the weakest player often contributes nothing all day and knows it. Any contest built on drive usage turns that from an embarrassment into a scoring stream.

**Golf Genius does not record it.** That is the central practical problem with this whole design — see §5.

---

## 3. The six contests

### 1 · Everybody In
*Every player's drive used at least three times.*

The team is scored on its **least-used player**. Spread the drives around or score nothing.

| Least-used player's drives | Strokes off |
|---|---|
| 4 or more | −2.0 |
| 3 | −1.0 |
| 2 | −0.5 |
| 1 or 0 | 0 |

**Thresholds are a guess.** With four players over eighteen holes the average is 4.5 drives each, so a floor of four is demanding — it means genuinely even usage. Needs real data.

**Three-player teams:** average 6 each; the ladder should probably shift up by one. Untested.

### 2 · Fly Eagles Fly
*Eagle or better as a team.*

Replaces Watch the Birdie, which is trivial for a scramble team.

**Value not set — deliberately.** How often a scramble team eagles is unknown, and it drives everything. If it happens two or three times a round it is a small reward; if once a round it is a headline. Needs one real card before a number goes here.

Likely landing places: **−1.0 an eagle** if common, **−2.0** if rare, possibly a day cap.

### 3 · Agony Alley
*Team score across the course's hardest stretch — holes 4, 5 and 6 at Aberdeen, par 13.*

Keeps the club version's shape, including being **the only contest that can add strokes.** Thresholds move a long way: a scramble team should be near par or under across three holes, not four over.

Placeholder ladder, unvalidated: `10 or better −2.5 · 11 −1.5 · 12 −0.5 · 13 zero · 14 +1.0 · 15 or worse +1.5`

### 4 · Go Long
*Team score against par on the four par 5s.*

Scramble teams eat par 5s. Expect a bar around −4 or better rather than the club's −1.

### 5 · Get Shorty
*Team score against par on the four par 3s.*

Par 3s are the leveller in a scramble — four chances at the pin, no advantage from a big drive. Likely the most contested of the four hole-based streams.

### 6 · Skins
*Team against team, hole by hole. Unchanged from the club version, and simpler here* — the team already has one score, so there is nothing to average.

Ties carry over. Skins still carrying at the 18th vanish. Scaling cap as built: `cap = (18 ÷ teams) × 0.2`.

---

## 4. What is different about scoring

**The team is the player.** One card, one set of contests, one final score. No net-per-player, no stroke index per man, no individual anything.

**Handicaps.** Scrambles usually apply a team handicap — commonly a percentage of the combined course handicaps, or a fixed allowance per event. **Whatever the event uses, use the same figure.** Do not invent one; the organiser has already decided it and the players already believe it.

**The starting score is the team's net.** Same principle as the club version: net anchors, contests reduce, lowest wins.

**The net double bogey cap is probably wrong here.** It exists to stop one disaster deciding a contest. A scramble team makes almost none. Likely harmless either way, but it should be checked rather than carried over by habit.

---

## 5. The problem that has to be solved first

**Nobody is recording which drive was used, in any system.**

Golf Genius doesn't track it. So Everybody In requires either:

- **A paper card** the team marks and hands in, typed up afterwards — fine for 20 teams, tedious for 40, and it is one more thing to lose
- **A screen in the app** where a team taps whose drive it was, hole by hole — reliable, but it is the score-entry screen we deliberately never built, and it puts a phone in a player's hand during the round

**And the honour-system flaw.** The team marks its own card. A team needing one more of Dave's drives can simply write one down; nobody is watching. Most scrambles already run minimum-drive rules this way and it mostly works — but it is the same class of flaw as Call Your Number, where the rule creates a reason to lie. Among friends, fine. At a charity event with prizes on the table, worth thinking about before it is built.

**Options if it proves unworkable:** drop Everybody In and run five contests, or replace it with something derived from the scorecard alone.

---

## 6. What was considered and dropped

**The Carry** — most drives used by one player, his name on the board. Dropped on taste. It was the only contest that named an individual rather than the team, which was its appeal and possibly its problem.

---

## 7. Open questions

1. **What does Fly Eagles Fly pay?** Unknown until we know how often a scramble team eagles.
2. **How are drives recorded?** The blocker for Everybody In.
3. **Three-player teams** — do the Everybody In thresholds shift, and by how much?
4. **Team handicap** — confirm the event's own allowance rather than inventing one.
5. **Does the net double bogey cap belong here at all?**
6. **Every threshold in §3** is a placeholder.

---

## 8. What would unblock this

**One real scramble scorecard.** Hole-by-hole team scores from a charity event at Aberdeen or anywhere else, three or four teams, with the team handicaps used.

From that: every ladder above gets set the way the club ones were — each bar landing where roughly one team in five or six clears it.

Without it, this stays a design.
