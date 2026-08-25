# BEAT THE CROWD · CLUBHOUSE — BUILD BRIEF

**Version 3, 2026-08-22.** Supersedes version 1 (30 July) and the 15 August rebuild.

**This is now the specification of a built app, not a plan for one.** Everything below is what the code does. Where a decision was reversed, the old reasoning is kept and marked, because the reason a thing was tried is usually the reason it will be tried again.

**What changed in version 3 — the cut to four contests.** The head pro read the rules and said the game was too complicated, and the numbers agreed with him: on Friday 21 August eight contests put seven men in **90% the same order** as the Stableford result. Four contests take the agreement with the net order from **89% down to 80%**. Watch the Birdie went from six picks to **nine**, and each contest gained a board of its own. See sections 2 and 4.

---

## 0. Read this first

This is **not** the spectator game. Beat the Crowd has two products sharing one scoring engine:

| | **Tournament** | **Clubhouse** ← *this brief* |
|---|---|---|
| Who plays | Spectators at a PGA Tour event | The golfers themselves |
| What they do | Predict what tour pros will do | Play golf; scores are read from their card |
| Data source | Live tournament feed | Golf Genius, pasted or imported |

**Nobody "plays" the Clubhouse game, and the app does not collect scores.** Golfers play golf. Scores are entered in **Golf Genius**, which the club already uses and which every player already knows. The app reads those scores in and shows what the contests did with them.

**So this is a viewer, not a scorer.** There is no hole-by-hole score entry — it would duplicate a system that already works and that nobody wants to use twice. The phone is a leaderboard.

Two things ARE collected before the round, and only two: a man's **nine Watch the Birdie holes** and the **one opponent he names on his Hit List**. Both arrive by text message, or through the pick sheet, and both are read into the app by pasting.

---

## 1. What it must be

A single-page web app, installable to a phone home screen, that **works with no signal**. Golf courses have dead spots and the app must never stall mid-round.

**The audience is 70 and 80 year olds outdoors in Florida sunshine.** That is a hard design constraint, not a nicety:

- **Minimum 18px body text**, 24px+ for scores. Nothing renders below 18 anywhere, including inside the shared picture.
- **Tap targets no smaller than 44px.** In practice nothing in the app is under 56.
- Very high contrast; assume direct sun on a dim screen
- No thin greys, no hairline type, no hover-dependent behaviour
- **No sideways scrolling on any screen**
- One thing per screen — the scorer is standing on a cart path

**Not required:** accounts, payments, a server, live sync between devices, Golf Genius integration.

**There is no build step.** `engine.js` is the one implementation of the rules. The browser loads it with a classic `<script src>` so a double-clicked `file://` page works, where ES modules would be blocked; the TypeScript in `src/` imports it for its side effect and re-exports the API with types, so the tests run that exact code. **Never write a second copy of a rule.** `picks.html` kept its own hole table for a while and survived two rule changes only by being hand-edited twice; it now derives its boxes from the engine like everything else.

---

## 2. Scoring — complete and exact

### Setup per event

Per event: name, date, format, **handicap allowance**, and its own copy of the rules. Per player: name, handicap index, tee, sex, group (for skins), flight, **nine Watch the Birdie picks** and **one Hit List opponent**.

**Nine tees and two stroke indexes.** Par is 72 from every Aberdeen tee and the holes do not move, so par and the Agony Alley stretch are shared. Rating and slope change with tee **and** sex, and the women play a different stroke index — which changes which holes receive strokes, and so changes every contest, not just the net total. A field can be spread across all of them in one round.

**Course handicap** = `ROUND(index × slope ÷ 113 + (rating − par), 0)`
*Verified against Golf Genius on 8 real players: exact match on all 8.*

**Handicap allowance.** Club events play off a percentage of that figure — usually 85%, sometimes another. Work the course handicap out in full, then cut it:

> **PLAYS OFF = ROUND(course handicap × allowance)**

Two roundings, and the order is not interchangeable. It is not a small adjustment and it does not fall evenly: at 85% a 38 index off Tee IV goes from 33 shots to 28 while an 8 index off Tee I goes from 10 to 9. **It changes who wins.** Default 100%, set per event, and shown wherever the two figures differ — "CH 33 · plays off 28 at 85%".

**Never apply it twice.** A course handicap printed on a Golf Genius card already has the event's allowance inside it. Use that figure exactly as it stands; cutting it again would take a man from 33 to 28 to 24 and cost him four more shots without a word.

**Handicap strokes on a hole** = `1 if SI ≤ CH` plus `1 more if SI ≤ CH − 18` plus `1 more if SI ≤ CH − 36`

**Net score on a hole** = gross − strokes received, **capped at par + 2**.

**The cap is net double bogey.** No hole can ever score worse than two over par net — the same cap Golf Genius applies when it posts a score. Apply it before anything else is computed. It stops a single 11 deciding a contest for the whole field, and it means "net doubles or worse" and "net doubles" are the same thing.

**Do not cap the gross total.** Keep both figures: capped net for scoring, true net for reconciling against Golf Genius.

### The final score

> **THE BASE IS ZERO. Every man starts at 0 and the contests move him from there.**
>
> **FINAL = strokes earned in the contests.** The net total does not carry into it at all.

The measure is strokes under and over par, so a board reads **−5.2, −3.2, +1.1**, and a bare `4.0` would be read as a score rather than as four over. Lowest wins. Every value in the game is a multiple of **0.1** — no hundredths, they look wrong on a golf scoreboard.

*This replaced `FINAL = net − strokes earned` on 15 August. On a net base the contests were a rounding error against a number in the seventies, and two men four strokes apart on the round could not be told apart by anything they had actually won.*

**EIGHTEEN HOLES OR YOU ARE NOT SCORED.** A short card takes no final, no position, no skins and no place on anyone's Hit List; it is listed as not eligible with a reason. On a net base an unfinished card flattered itself because twelve holes of net total less than eighteen. On a zero base it scores near **nothing** — the contests simply never fire — so a man who never teed off would come out at exactly 0 and lead a field whose median round is −0.5. **He would win by walking in.** The rule survives the argument that produced it for a plainer reason: half a round is not a round.

**There is no ceiling.** `maxContestStrokes` is null — the same signal Skins uses. On a zero base a man's final **is** his contest total, so a cap would be a cap on the score itself. The knob is left in the config so its absence stays a stated decision rather than a missing feature.

**Ties are settled by the club's own match of cards**, and only genuinely level cards share a place: the back nine, then 13–18, then 16–18, then the 18th. The board says which — *"won on the back nine"*. Every contest pays in halves and tenths across a range of about six strokes, so equal finals are the norm rather than the exception.

**Every contest is scored on ONE player's card**, with two exceptions that need the field and are settled across it: the **Hit List** (it needs the opponent's card) and **Skins**. Team size, team format and blinds are otherwise irrelevant — the group can be playing best-two-net, best-three-on-easy-holes or nothing at all and it makes no difference.

### The four contests

All thresholds live in a config object, never in code. **They travel with the event**: the round stores a *diff* against the defaults, the diff rides inside the event code, and a round scored in March still scores the same way in August.

> **WHY FOUR AND NOT EIGHT.** Measured across 135 real rounds at Aberdeen, most of the eight were repeating the net score rather than adding to it:
>
> | | How much it repeats the net score |
> |---|---|
> | Six Pack | +0.69 |
> | Triple Threat | +0.67 |
> | Agony Alley | +0.62 |
> | Hit List | +0.57 |
> | Watch the Birdie | +0.39 |
> | Easy Street | +0.38 |
>
> Eight contests put seven men in 90% the same order as the Stableford result. Cutting to four takes the agreement with the net order from **89% to 80%**, and narrows the field's spread from 10.0 strokes to **6.3** — which is the cut doing what it was for. A game a club pro cannot follow in under a minute is not a game the club will play.

---

**1 · Watch the Birdie** — **nine** holes nominated before the round, settled one by one.

> `net birdie −0.5 · net eagle −1.5 · nothing on any of the nine +0.5`

A hole pays the **best single result on it**: a net eagle pays the eagle rate and does not also collect the birdie underneath it. **A net par pays nothing.**

**The blank is the contest's only penalty side.** Without it, nominating holes was free and could only ever help. It is charged only once every pick has been **played** — a man cannot be charged for failing to birdie a hole he never stood on.

**Nine picks in three slots: two par 5s of three, three par 3s of four, four par 4s of eight.** 840 possible sets, and every slot is a real choice.

| Slot | Legal at Aberdeen | Pick |
|---|---|---|
| Par 5 | 7, 16, 18 | **two of three** |
| Par 3 | 3, 8, 13, 17 | **three of four** |
| Par 4 | 1, 2, 9, 10, 11, 12, 14, 15 | **four of eight** |

**Front and back no longer matter to any slot.** The par 4s were split one a side when six of them remained; with Easy Street out of the game there are eight, and dividing them again would only take choices away.

**Only Agony Alley's three holes are barred.** Rob's reason for barring the stretch rather than sharing it: no man at Aberdeen would nominate 4 or 5 in any case, so offering them offers nothing. **Twelve of the eighteen are now in play** — Agony Alley's three and the nine a man picks.

The legal holes are derived from the course's par and its barred list, **never hardcoded**. The validation rule is by **par, not by slot**: every par must keep MORE holes than it has picks. Three par 3s drawn from three holes leaves every slot with three to choose from and the man with no choice at all — the old per-slot rule passed that without a word.

**THE VALUES DID NOT MOVE WHEN THE COUNT DID**, and that was tested rather than assumed. At these rates the contest repeats the net score at **+0.48**, the least of any of the four, and fires on **86% of rounds** against 74% at six picks. Birdie at −0.4 with a +0.8 blank comes in at +0.58.

**Nothing is paid for a net par**, also tested: paying 0.2 for one takes the repetition of the net score from +0.51 to **+0.73**. Net pars are common — four a round across nine picks — so counting them is close to counting how well a man played, which is the net score's job and not this one's.

*The doubling on holes 4 and 18 is gone. It was printed on the card and changed nobody's behaviour — 8 of 10 still took hole 7 and 9 of 10 still took 16 — so it was paying extra for choices men were making anyway.*

**Every slot of a par is handed the identical list**, so no hole falls in one slot alone. It used to be true that every hole fell in at most one slot, which is why nominating a hole twice was *also* illegal for one of them and either check caught it. **That is no longer so, and the duplicate pass is now the only thing** standing between a man and being paid twice for one birdie. It runs first, and its message says *"hole 8 is nominated twice"* rather than *"not a legal first par 3"* — which is a baffling thing to be told about a line that plainly says 8 twice.

**Picks arrive by text**, one man a line:

```
Ridgeway, Ken — 7, 16, 3, 8, 13, 1, 2, 9, 10
```

**Nine bare numbers, always in slot order: two par 5s, three par 3s, four par 4s.** Nothing in the line says which is which, so **the order is the whole of the format** and any other count of numbers is refused rather than guessed at. A block of those lines is pasted in together and read back before anything is applied. **A name is matched, never guessed** — and the first-name-plus-initial rule is accepted only when the line was written that way, or a misspelled surname would reduce to its first letter and write silently to the wrong man's card.

**Picks can be DRAWN for a man who never sent his in — a toggle, off by default.** Watch the Birdie is a contest of nerve: a man says in advance which holes he fancies, and a drawn set is not a choice. What drawing stops is an empty contest reading as a bad round on the board, which is a different thing and worth fixing.

The draw takes one legal hole per slot at random from the same lists the form offers, **without replacement**, so a drawn set is indistinguishable from a chosen one *by the rules*. It happens **once, when the scores go in**, and is written to the player — drawing afresh on every render would give a man different holes each time the board was looked at, which is not a game. A man who chose even one slot is left alone: a half-filled card is still a choice.

**The board always says which.** A drawn man's row reads *"picks drawn"* beside his net. The mark survives an edit to anything else — a corrected tee does not mean he chose his holes — and goes the moment a pick itself is changed, because then it is his.

> **NOTHING NEEDED MIGRATING WHEN SIX BECAME NINE.** Six of the nine slot keys ARE the old keys — `p4f` and `p4b` were the front and back par 4 and are now simply the first and second, so a hole stored under the old rules is still a legal par 4. Every round already on a phone and every event code already messaged to somebody reads correctly, arriving with three empty slots. A code written by the new app still reads on a phone that has not updated: the three new slots are **appended past the end** of the player row, so an old reader sees the six it knows about.
>
> *A round stored with the original two-pick form also still opens: front and back were both par 4s, so they become par 4 slots. A pick on a hole since barred is **dropped rather than refused** — it was chosen under the old rules and there is nothing to guess at, and refusing would take a played round off a man's phone. Hole 13 travels the other way: barred while Easy Street owned it, and legal again now.*

---

**2 · Agony Alley** — the net total across the course's hardest stretch, holes **4, 5, 6** at Aberdeen, par 13.

> `≤12 → −2.0 · 13 → −1.0 · 14–15 → 0 · 16 → +1.0 · 17+ → +2.0`

Requires all three holes played — the contest can penalise, and a man must not be charged for holes he never stood on. Stretch holes are per-course config. Structure unchanged since version 1; the values were rescaled when the base moved to zero.

*Players believe 12 and 13 are unreachable. They are wrong — 12% of rounds clear 12 and 26% clear 13.*

---

**3 · Hit List** — before the round each man privately names **one opponent** and backs himself to post the better 18-hole net score.

> | | he wins | they tie | he loses |
> |---|---|---|---|
> | Against a **lower** index (a better player) | −1.1 | −0.2 | +0.3 |
> | Against an **equal** index (within 1.0) | −0.9 | +0.1 | +0.3 |
> | Against a **higher** index | −0.7 | +0.1 | +0.5 |

**PRICED BY THE OPPONENT'S BAND**, because head-to-head net is not a coin flip once a man chooses his opponent. Across all in-field pairings it is 46.6% win / 46.6% loss / 6.7% tie — but backing yourself against a **higher** index wins 54% and against a **lower** index only 39%. Flat pricing would make picking the weakest man on the list the only sane move.

At the prices above, picking the better player returns **−0.20** on average and picking the weaker **−0.09**. Backing yourself against the good player is the better bet, but only just: a real choice rather than an obvious one.

**A man has to enter it.** `drawMissing` is false and is meant to stay false. Drawing missing *picks* is a different matter — choosing holes affects nobody else. Naming an opponent puts another man in it, and a drawn opponent would collect the reward for a gamble the player never took. **If it works when he ignores it, he learns he never needs to reply.**

**The opponents offered are the players nearest his own index** — the Setup screen offers eight, the texted invitation carries six. A short field offers everybody. A man with no index has nobody to be near, and a man who did not finish is off every list because the pick would be void anyway.

**It is settled across the whole field, not inside a flight.** A man may name anyone in the round, which is what the picking screen already offers him; an engine that then refused a cross-flight opponent would be disagreeing with the screen that suggested him. It voids if either card is short — and the board says **whose**, because "void" reads as an excuse when it was the player himself who walked in.

---

**4 · Skins** — **the format is decided by the size of the field, not by a switch.**

| Field | Format |
|---|---|
| under 8 | no skins at all |
| 8 to 15 | **Cart Skins** — grouped by cart |
| 16 or more | **Team Skins** — grouped by team |

One engine either way; only the membership changes. The app calls it a **group** throughout for that reason. Skins can still be switched off for a round, under the rules with every other contest.

> **A GROUP'S SCORE ON A HOLE IS ITS BEST TWO NET BALLS, added. Not the average.**
>
> Averaging punished bigger groups badly. Measured over 33 real groups, a pair won **1.62×** a fair share, a threesome 1.07× and a foursome **0.85×** — a threesome took 25% more than a foursome, because skins go to the lowest score and averaging fewer balls produces more extreme ones. Best two cuts the spread to **1.12×**: every group contributes exactly two scores whatever its size.
>
> **A man on his own counts his ball twice.** Left with one ball against everyone else's two he took 0.22× a fair share — he was not playing the same contest. Counting it twice gives 1.06×.

Lowest group score wins the hole. **A tied hole is not won by anybody and NOTHING CARRIES OVER.** Ignore any player who did not play that hole.

**A FIXED POT of 4.0, divided among however many skins were actually won**, so the whole contest is worth the same every week whatever falls — a typical 11 skins makes one worth about 0.36, a lean 7 makes it 0.57. It can no longer outgrow the other contests in a big field, which is what the old per-skin value with a cap on top was there to stop.

**With a floor: a skin is never worth less than 0.4.** One skin takes the whole 4.0, four are worth 1.0 each, and at ten the division reaches the floor and stops there — eleven skins are still 0.4 each, and so are eighteen. **Above ten the pot is therefore not fixed**: eighteen skins pay out 7.2 between them rather than 4.0. That is deliberate. A hole won is a hole won, and on a busy day the men should not each find their skins quietly worth less than the round before.

The per-skin figure is rounded to a **hundredth** before it multiplies up, because it is printed on the Skins tab and a man checking five skins against it must reach the number the board paid him. Totals are then in tenths like everything else. **Every player in a winning group takes the full per-skin amount**; it is not divided among them.

*Jay's league already plays low net best 2 balls, so the format is familiar.*

**One group out on its own wins nothing.** Skins is group against group, and a group with nobody to beat would take every hole by default.

### Kept in the code, not in the game

Null means **not scored, not shown, not exported** — absent from the card entirely, never a zero, which would read as *"he scored nothing on it"*.

| | Status | Value if switched on |
|---|---|---|
| **Six Pack** | **Cut.** No switch on the rules screen. | the leftover holes against par 24 |
| **Easy Street** | **Cut.** No switch on the rules screen. | `0 net pars → +2 · 1 → +1 · 2 → 0 · 3 → −1` |
| **Triple Threat** | **Off by default, with a switch.** Kept for testing later in the year. | +0.5 a net double bogey |
| **Bounce Back** | **Off by default, with a switch.** | −1.0 a net par or better on the hole straight after one |
| **Damage Control** | Retired. Triple Threat absorbed it. | — |
| **Go Long / Get Shorty** | Retired. Easy Street replaced them. | — |

**Six Pack's arithmetic survived the cut**, which is why its par is still 24: fifteen candidate holes less the nine a man nominates leaves one par 5, one par 3 and four par 4s, exactly as twelve less six did. It was the worst offender in the table above at +0.69, and it was structurally coupled to Watch the Birdie — it *was* the holes a man did not pick.

**Easy Street's three holes are worth more back in Watch the Birdie than they were as a contest.** Barring 11, 12 and 13 was what forced the par 4 slots down to six holes; giving them back is what makes the par 4 slot eight deep and the par 3 slot four, and every slot a real choice.

**A contest that is off by default has no values in `DEFAULT_CONTESTS` to restore.** They live in `PARKED_CONTESTS` — what the rules screen puts back when one is switched on, at exactly what it was last played on, so turning Triple Threat on in November scores the round it would have scored in August.

*Historical values, for whoever brings one back: Damage Control counted net doubles or worse (`0 → −2.0 · 1 → −1.0 · 2 → −0.5 · 3+ → 0`) and was the fairest contest in the set at r = +0.05 with handicap. Go Long ran net vs par across the par 5s and Get Shorty across the par 3s; both were pure credit — neither could ever penalise — and together ran r = −0.29 with index.*

---

## 3. Edge cases that will actually happen

| Case | Behaviour |
|---|---|
| Player quits after 12 holes | Everything still scores and is shown, but he takes **no final and no position** — eighteen holes or you are not eligible. A contest that cannot be judged returns 0 and says why. |
| A man picks up | Golf Genius prints `X`. Scores **net double**, set directly so it holds at every handicap. The hole still counts as played, so an X'd card is a full round and can win. Shown as X, never as the par + 4 filled in behind it. |
| A hole scored worse than net double | Capped to net double before anything else runs. |
| A hole not yet played | Blank, never zero. Zero is a score. |
| An unplayed Watch the Birdie pick | Pays nothing, and **stops the blank penalty being charged** until every pick has been played. |
| Odd number of players | A group of one is legal and counts its ball twice. |
| Under 8 players | No skins. The tab says so rather than showing an empty table. |
| One group out on its own | No skins — there is nobody to play against. |
| A man names nobody on his Hit List | Scores nothing, and is **not on the Hit List board at all** — he is not last in it, he is not in it. |
| A man names somebody who did not finish | Void, and the table says it was the *other* man's card that was short. |
| Two players tie | The card match settles it: back nine, 13–18, 16–18, the 18th. Genuinely level cards **share the place** and the board says so. |
| A pick on a hole barred after he chose it | Dropped, not refused. The card says *"6 of 9 picks"* rather than claiming nine. |
| Score typed wrong | Every entry is editable at any time and everything recomputes from the scores already stored. No card is ever re-entered. |

---

## 4. Screens

**Leaders — this is the product.** Final score, sorted, biggest type on the screen. Tap a player for his contest breakdown.

Below the leaderboard, **a board of its own for each contest in play**, and then every Hit List duel in the round.

> **THIS IS WHAT CUTTING TO FOUR BUYS.** With eight contests the screen had room for the final and nothing else, and a contest was a number in a column on a detail screen nobody opened. With four there is room to say who won each one — so a man who finished eleventh overall can still have taken Agony Alley, and hear about it in the bar rather than never.

**Each board is ranked on the contest, not on the final**, and tied on the contest's own terms. `placeField` settles the round on a match of cards, which says nothing about who played hole 4 better.

| Board | Tiebreak, in order |
|---|---|
| Watch the Birdie | most net birdies, then the eagle |
| Agony Alley | best net on hole 4, then hole 5, then hole 6 |
| Hit List | the **higher** handicap index wins, then the bigger margin |
| Team Skins | none — it is already shown hole by hole on its own tab |

The board names what separated them — *"won on hole 4"* — and hangs it on the man who **won**. Written the other way round it reads as an accusation.

*The Hit List's higher-index rule is the opposite of a golfer's instinct and is meant to be: two men who both beat their man are separated by which of them had less business doing it. A man with no index recorded is treated as the lowest, because a missing figure must not win a tie.*

*At the current values "then the eagle" can never fire — a birdie is −0.5 and an eagle −1.5, so two men level on strokes and level on birdies are level on eagles too. It is in the documented order because the values are adjustable.*

**THE DEPTH IS A FLOOR, NEVER A CEILING.** Five by default, adjustable on the rules screen because **five means something different at eight players than at eighty**. Every man level with the last one shown is shown as well, and the board says so — *"5 deep · 6 tied for 3rd, all shown"*. Cutting a tie off at five looks broken, and ties are the norm: on an average round **2.5 men share the top of Agony Alley, 2.8 the Hit List and 4.3 Team Skins**.

**The boards see the whole field**, before any flight filter. Flights divide the placings and the card match and nothing else — the contests are graded against fixed thresholds and Skins and the Hit List are settled field-wide.

**The Hit List results table is separate from its top five, and is the whole table rather than a cut of it.**

```
Wallach beat Teitelbaum by 4
Finkelstein beat Smith by 2
Rob lost to Teitelbaum by 1
```

**This is the most repeatable thing in the game** — a sentence a man says in the bar — and it is **the reveal**: nobody knows who named whom until it is published. Biggest margin first, because it is read aloud and the heaviest beating is the one worth leading with. **Two men who named each other make two lines**; they are two separate bets, priced separately by each man's band, and one can be void while the other stands. Duels that never came off are still listed, with the reason.

**Setup** — organised by how often a thing is touched, not by how it was built.

*Always out:* **how many players, and whether the cards have come in** — then the player list, **+ Add player**, **Paste a list of players**, **Open the pick sheet**, **Paste birdie picks** and **Set the Hit List**.

*Folded away,* shut on arrival and remembering whatever was left open (a property of the device, not of the event, so it never travels in an event code):

- **Event settings** — which event, name, date, format, handicap allowance
- **The rules** — every contest value this round is played under
- **The roster** — the men who play, round after round
- **Send the invitations** — one message a man
- **Move this event** — export a CSV, copy, paste, open a `.btc` file, delete
- **About** — the build line and enough to answer "is it me or is it the phone?" over a telephone

Each shut heading carries a line saying what is inside, so the allowance and the skins switch — both of which move every man's score — can be read without opening anything.

*A player row shows name, handicap index and tee, and nothing else.* Group, flight, picks, GHIN and sex live in the player's own form, one tap away. At twenty-four rows every extra word costs a line.

**Colour helps the eye find things and is never the signal.** A row with something missing is tinted amber with an amber bar — *and says the word "missing" followed by what is missing*. A man who cannot tell the tint from white in Florida sun loses nothing.

**The rules** — every contest value, with the default beside anything that has moved. **It says why the cut contests are off**, or in November somebody will wonder. A round not on the defaults is marked on the board, in the shared link and in the export, naming what was changed.

**Import** — a paste box. See section 10. Show what was parsed before committing anything. Re-pasting replaces the round; it never merges.

**Skins** — totals by group, then hole by hole. A hole nobody won says so.

**The pick sheet** (`picks.html`) — three boxes, nine taps, a name, and one button that opens Messages with the line already written. It is the only page a player ever sees. Its boxes are **built from the engine's slot table**, never typed out.

---

## 5. Data and storage

Local storage on the device, **several events at once** — the club plays Friday and Saturday. Each keeps its own players, scores, flights and **its own rules**.

> **THE SETTINGS LIVE IN THE EVENT, NOT IN BROWSER STORAGE.** That was the sticking point: browser storage means the laptop and the phone disagree and there is no server to reconcile them. In the event it is free — the event code already carries a round between devices, so the rules go with it, and a round scored in March still scores the same way in August because it carries the rules it was played under.
>
> **What is stored is a DIFF, not a copy.** A full config is 648 characters of JSON and would add **860** to an event code; one changed contest adds **40**. A round on the defaults stores nothing at all.

**Moving an event between devices** is a `BTCCLUB1:` code — one unbroken line, pasteable into a message. Player rows are **positional and nothing in them ever moves**: every field added since has been appended past the end, so a code written by this app still reads on a phone that has not updated, and a code written by an older one still reads here. Eight players is about 1,200 characters, twenty-four about 3,500.

### Sharing a finished round

Until this existed, the result of a round was the organiser reading numbers aloud in the bar. **Share offers two things, because neither one does the whole job.**

> ⚠️ **THE LINK DOES NOT SURVIVE iOS MESSAGES, AND CANNOT BE MADE TO.**
>
> Measured on the club's own phone with a ladder of valid links at known lengths: **154, 159, 190 and 219 characters arrived first time. 250 and 299 each failed once and arrived only on a second attempt. 350 failed twice.** The break sits between 299 and 350 and the band from 250 up is *flaky*.
>
> A ten-man round cannot get under 250 while still carrying the contest breakdown. Three things were tried and none was the cause: the marker's colon, percent-encoding of the fragment, and the `#` itself. **It is length.**

**1 · Send the board as a picture.** The leaderboard drawn onto a canvas and handed to the share sheet as a PNG. **An image has no length limit in any messenger**, so this is the one that always arrives, and it is what a man texts. **It carries the minigame boards and every duel as well** — those go in the picture rather than being left to a link the men may never open.

**2 · Copy the link, for e-mail.** It carries the per-player breakdown a picture cannot. E-mail has never had the problem.

The picture is laid out in `boardimage.js` as a list of drawing operations that touch no canvas, so the whole arrangement is testable without a browser. Its palette and type sizes are lifted from `clubhouse.css` — a canvas has no cascade, so they are repeated, and a test holds the two copies together. Nothing is drawn below the **18-point floor**: a long name shrinks to the floor, then loses its surname to an initial, then is clipped rather than allowed to run into the final beside it.

**Results, not a round.** The event code carries SETUP and the far end scores it again. That is wrong for a shared link three times over: it needs the engine on a page that must never reach it; it would rescore against the *reader's* settings, so a link would change its numbers whenever a threshold moved; and it costs the eighteen holes nobody reads on a phone. So the finished figures travel — **already settled, including the placing and the phrase that broke any tie** — because the far end has no cards to run a card match on and must not guess at one.

**The contest list in a shared link is addressed by INDEX, so it may only ever be APPENDED to.** Reordering it would silently re-label every contest on every link already sent. The cut contests keep their slots; a new link simply never references them.

**`results.html` is read-only by construction, not by a flag.** It loads `display.js` and `results.js` and nothing else — no engine, no importer, no exporter, no storage. There is nothing on the page to score with and no route into setup, whatever anyone does to the address. It shares `clubhouse.css` and `display.js` with the app so the two cannot drift apart and look like different products.

> ⚠️ **A shared link is OBFUSCATED, NOT ENCRYPTED.** Anyone who pastes it into a decoder has the names and scores back in seconds. **Treat a shared link as public.** That is the right trade: it is a golf leaderboard, the same names and scores are already on the club's Golf Genius portal, and a password to type would defeat the one thing the link is for.

> ⚠️ **THE ROUND RIDES IN A QUERY STRING, NOT A FRAGMENT — and that was forced.**
>
> It began in the fragment, where nothing is sent to a server. A link sent by e-mail worked; the same link sent by text did not. The marker `BTCR1:` has the exact shape of a **URI scheme**, which lets a link detector end the `https` URL at the `#`; it became `BTCR1_`, which nothing percent-encodes. **It was not enough. iOS Messages ends the link at the hash, whatever follows it.**
>
> **The cost was accepted deliberately.** A query string IS sent to the server, so every shared round appears in GitHub Pages' request logs. That is the price of the link working at all, and the second reason to treat a shared link as public.

The payload must stay one unbroken run of `[A-Za-z0-9_-]`. **Do not put a colon, a slash, a dot, a hash or an ampersand in a link that has to survive a messenger.** It is base64**url** for that reason. The ceiling is **2,000 characters** for the whole URL — not a browser limit, but the point at which a messaging app stops agreeing where a link ends. **Above it the button says so and refuses**, naming the length and the limit; a truncated link is worse than no link, because it looks like it worked.

**No compression, deliberately.** Deflate would roughly halve the figures, but `CompressionStream` is needed at *both* ends and a man on an older phone would tap the link and get nothing.

**A wrong or truncated link fails with a sentence**, never an empty leaderboard — which a man would read as "nobody scored" and repeat in the bar.

### The roster and the invitations

The roster outlives a round: the men who play, week after week, with their index, tee, GHIN and mobile number. A round is built by picking from it rather than typing sixteen men in again.

**One invitation a man**, carrying his own name and his own six Hit List opponents and nothing else — because a man's opponents are the six nearest *his* index, and a page with no idea who is playing cannot work that out. The screen tracks who has been sent one, and says **"his six have CHANGED — send again"** when the field moves under him.

**It is a snapshot.** The field is baked in when the link is made. Men who join or drop out afterwards are not in it, so the page carries the date it was made and says so.

---

## 6. What exists

| File | What it is |
|---|---|
| `engine.js` | **The one implementation of every rule.** Course config, handicaps, all contests, skins, the Hit List, the card match, the minigame boards. |
| `importer.js` | The Golf Genius paste parser, the roster paste, the birdie-picks paste |
| `exporter.js` | The CSV, the event code, the export signature |
| `results.js` | The shared-link payload |
| `fieldlink.js` | The field and the one-man invitation, packed into a link |
| `boardimage.js` | The leaderboard as a picture |
| `display.js` | Formatting and text measurement shared by the app and the shared view. **Knows how to score nothing.** |
| `leaderboard.html` | The app |
| `picks.html` | The pick sheet a player sees |
| `results.html` | The read-only shared view |
| `src/*.ts` | Typed re-exports of the above, so the tests run the exact code the browser loads |
| `test/*.test.ts` | **589 tests.** `npm test` |

**A scoring spreadsheet** (`BtC_Clubhouse_Scoring.xlsx`) implements the version-1 rules and was the reference implementation up to the 15 August rebuild. **It is now historical** — it does not know the zero base, nine picks, the Hit List or the pot. The engine and its tests are the reference now.

---

## 7. What is not decided

- **Whether four is the right four.** Agony Alley repeats the net score at +0.62 and the Hit List at +0.57 — higher than Watch the Birdie's +0.48. Four was chosen for what a club pro can follow, not for the correlation table alone. Watch what happens over a few Saturdays.
- **Whether Triple Threat and Bounce Back come back.** They are parked, not deleted, and switching one on is one tap. Test them late in the year against a season of cards rather than 135 rounds.
- **The Hit List has two knobs and one screen.** `offers` (how many the Setup screen lists) is editable; `offer` (how many ride in a texted invitation) is not. They can disagree, and nothing says so.
- **Scrambles.** Charity events are usually scrambles with no individual hole scores. Sketched in `Scramble_Design.md`, not specified. The one place team aggregation would ever be needed.
- **Single-digit handicaps and women's tees** are still thin in the data. Both are supported in full; neither is well calibrated.

---

## 8. Working on it

There is no build step and no bundler. `npm test` runs everything.

**The one rule: `engine.js` is the single source.** A page derives from it — `E.PICK_SLOTS`, `E.birdiePickHoles`, `E.DEFAULT_CONTESTS` — and never restates a value. Recalibrating a threshold is a one-line edit that reaches the leaderboard, the export, the shared link and the tests at once.

**To preview:** serve the directory (`python3 -m http.server`) and open `leaderboard.html`. It also works from a double-clicked file, which is why the engine is a classic script rather than a module.

**Two whole classes of bug do not show up in the tests**, and both have bitten: a contest switched **off** on a screen that then reaches into its null config, and a value box whose "the default was…" reference is null. **Drive the actual app after changing the rules screen.**

---

## 9. The reference numbers

The eight lowest-index players from **19 December**, Aberdeen, Tee IV. Any build must reproduce these.

**The course, which you cannot derive from any data file:**

```
par by hole    4 4 3 5 4 4 5 3 4 4 4 4 3 4 4 5 3 5     (total 72)
stroke index   9  5 17  1  3  7 13 15 11  6 10  8 16 14  4 12 18  2   (Golf Genius, men)
slope 117 · course rating 65.3 · Agony Alley = holes 4, 5, 6
```

**The stroke index is essential and appears in no export.** Net *totals* come out right whatever index you assume — a 19-handicap gets 19 strokes wherever they fall — but every contest depends on *which* holes receive them. **Matching net totals with mismatched contests means the stroke index is wrong.** That is the single most likely failure in this build.

**Use Golf Genius's allocation, not the printed card.** The two disagree on ten holes, and Golf Genius's is the one that computes the net actually posted. The switch was measured across the club's cards: the contests are unmoved — same clear rates, correlations within 0.02. The women play a different allocation again:

```
men      9  5 17  1  3  7 13 15 11   6 10  8 16 14  4 12 18  2
women    9 11 17  1  3  7  5 15 13   4 12 16 18  8  6 10 14  2
```

**Source data:** `Hole by Hole Excel Export -- Spreadsheet Composer.xlsx`. Hole columns are **gross**. Do not use the TGIF file for these eight — it is a different round, different players, and its hole columns are net.

**A single card settles on exactly two contests** — the Hit List and Skins need a field, so neither appears here. **Both halves are pinned beside the final**, which is a stronger test than the old one: a card whose final came out right by two errors cancelling would now have to get both halves right as well.

| Player | Index | CH | Gross | Net | Watch the Birdie | Agony Alley | **FINAL** |
|---|---|---|---|---|---|---|---|
| Abe Whitfield | 25.2 | 19 | 92 | 73 | −0.5 | −1.0 | **−1.5** |
| Ben Castellan | 24.8 | 19 | 93 | 74 | −1.0 | −2.0 | **−3.0** |
| Cy Ashford | 24.0 | 18 | 93 | 75 | −1.0 | 0.0 | **−1.0** |
| Dan Pemberton | 26.4 | 21 | 95 | 74 | −2.5 | 0.0 | **−2.5** |
| Eli Marsden | 23.6 | 18 | 92 | 74 | −2.5 | 0.0 | **−2.5** |
| Gus Thornbury | 25.4 | 20 | 97 | 76 | −1.0 | −1.0 | **−2.0** |
| Hal Brightwater | 25.1 | 19 | 95 | 76 | −0.5 | +1.0 | **+0.5** |
| Ike Calloway | 20.8 | 15 | 94 | 79 | +0.5 | 0.0 | **+0.5** |

> ⚠️ **The picks are an input, not something you can compute, and the ones used here are invented.** The contest postdates this round, so the club recorded none. They were assigned **mechanically** — each of the nine slots walking its own legal holes in finishing order — and were not chosen to produce any result. Change a single pick and the finals move. See `test/scoring.test.ts`.

**The gross, the handicaps and the net are untouched by any rule change** and are still the real December figures. That is the point of pinning them: they were the same before the cut and are the same after it.

- **Gus Thornbury is the cap test:** his uncapped net is 77, capped to 76.
- **Ike Calloway has the lowest handicap in the group and finishes last.** That is the game working, not a bug.
- **Ike is also the blank test:** no net birdie on any of his nine, so +0.5.

**Cart assignments for the skins check:** 1, 1, 2, 2, 3, 3, 4, 4 in the order Ike, Eli, Cy, Ben, Hal, Abe, Gus, Dan.

---

## 10. The Golf Genius export — the real format

The organiser downloads the event leaderboard from Golf Genius. It arrives as a **legacy `.xls`** (OLE2, not modern xlsx — SheetJS reads both; openpyxl does not). Read the low-net leaderboard sheet, named something like **"Holes season - low net"**.

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

- **No stroke index is needed** for a net paste. Golf Genius has already applied the strokes. Do not recompute them and do not subtract twice.
- **Par by hole is still needed** — every contest measures net against par, and the cap is par + 2.
- **Gross comes from the Total column**, and it is the figure to reconcile against Golf Genius.
- **The export carries no picks and no Hit List.** Both are setup inputs, married to the imported card by player name.
- A net 1 on a par 3 is a net 1, **not a hole in one.**

### Preferred input

**Paste, not file upload.** The organiser selects the player rows in the open spreadsheet and copies — that puts tab-separated text on the clipboard, which is trivial to parse and needs no `.xls` reader in the browser.

### Parsing rules

- Split the handicap out of the name with a trailing-parenthesis match; keep the name for display and the number for reference.
- Ignore the Out, In and Net columns; recompute everything from the 18 hole values so a bad export is caught rather than trusted.
- **A blank cell means the hole was not played. An `X` does not.** Golf Genius prints X where a man picked up; that hole **was** played and scores **net double**. Set the net directly, do not reach it through an imputed gross: a 38 index off Tee I is a course handicap of 47, which is three shots on half the card, and par + 4 less three shots comes in *under* net double and credits a bogey for picking up. A gross of par + 4 is still filled in, but only so the round has a gross total to show.
- **A picked-up hole counts towards the eighteen.** A man who X'd three holes went round and can win; walking in after twelve is a different thing and is not eligible. Getting this wrong quietly disqualifies him.
- Show an X as an X, never as the par + 4 filled in behind it.
- A card with an X on it cannot be summed against Out/In/Total, so gross and net cannot be told apart by arithmetic — **the organiser is asked which the columns are** rather than the paste being called broken.
- Sheet 1 of the same file holds Golf Genius's own skins result — a free cross-check.

---

## 11. A second test round — 31 July, real scores

Eight cards from the club, handicaps 14 to 34 — a far wider spread than section 9. **An engine that reproduces both has been proven on independent data.** This is also the round the app opens on before anything has been entered.

Same course (Aberdeen, Tee IV). Hole-by-hole **gross**:

```
Hole      1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18
Par       4  4  3  5  4  4  5  3  4  4  4  4  3  4  4  5  3  5
Alex      5  5  3  6  5  5  6  3  5  7  5  5  4  4  6  6  3  7
Boyd      6  5  4  7  6  5  7  4  5  6  6  5  4  5  7  4  4  6
Chip      6  5  4  8  6  5  5  4  5  5  6  3  5  6  6  5  4  6
Dex       5  5  4  6  6  6  7  3  5  4  4  6  3  6  6  6  6  5
Emmet     6  5  3  7  7  6  5  3  5  4  5  5  3  5  6  7  3  6
Finn      5  6  6  7  5  4  7  4  7  6  7  5  3  5  5  6  4  7
Grady     7  6  4  9  7  7  7  5  5  6  7  7  3  8  6  7  3  9
Hoyt      7  5  4  8  8  4  8  4  6  5  6  7  4  7  5  5  4  6
```

**As one card at a time** (`test/round2.test.ts`) — Watch the Birdie and Agony Alley only:

| Player | CH | Gross | Net | Watch the Birdie | Agony Alley | **FINAL** |
|---|---|---|---|---|---|---|
| Dex | 23 | 93 | 70 | −2.0 | −1.0 | **−3.0** |
| Alex | 18 | 90 | 72 | −1.0 | −1.0 | **−2.0** |
| Finn | 26 | 99 | 73 | −1.0 | −2.0 | **−3.0** |
| Boyd | 21 | 96 | 75 | −0.5 | −1.0 | **−1.5** |
| Emmet | 14 | 91 | 77 | −0.5 | +2.0 | **+1.5** |
| Chip | 15 | 94 | 79 | −2.0 | +1.0 | **−1.0** |
| Grady | 34 | 113 | 79 | −2.0 | +2.0 | **0.0** |
| Hoyt | 20 | 103 | 82 | −1.0 | 0.0 | **−1.0** |

**As a field**, with carts 1,1,2,2,3,3,4,4 in the order Alex, Boyd, Chip, Dex, Emmet, Finn, Grady, Hoyt, and each man naming his cart partner on his Hit List — this is the board the app opens on (`test/engineParity.test.ts`):

| | Player | CH | Net | WTB | Agony | Hit List | Skins | **FINAL** |
|---|---|---|---|---|---|---|---|---|
| 1 | Alex | 18 | 72 | −1.5 | −1.0 | −0.7 | −2.0 | **−5.2** |
| 2 | Finn | 26 | 73 | −1.5 | −2.0 | −1.1 | −0.4 | **−5.0** |
| 3 | Dex | 23 | 70 | −1.0 | −1.0 | −1.1 | −1.2 | **−4.3** |
| 4 | Boyd | 21 | 75 | −0.5 | −1.0 | +0.3 | −2.0 | **−3.2** |
| 5 | Hoyt | 20 | 82 | −0.5 | 0.0 | +0.5 | −0.4 | **−0.4** |
| 6 | Chip | 15 | 79 | −0.5 | +1.0 | +0.5 | −1.2 | **−0.2** |
| 7 | Grady | 34 | 79 | −0.5 | +2.0 | −1.1 | −0.4 | **0.0** |
| 8 | Emmet | 14 | 77 | −1.0 | +2.0 | +0.5 | −0.4 | **+1.1** |

*The two tables use different picks — the per-card one walks the slots mechanically, the field one uses the seed round's stored picks — so the finals differ. Both are pinned.*

> ⚠️ **The Watch the Birdie picks are invented, and every FINAL depends on them.** The contest postdates both reference rounds. **Get the real picks before treating any number here as a reference.**

**Skins** (best two net balls, carts of two): **5, 3, 1, 1** — ten skins won, eight holes tied and not won by anybody. *Under the old group-average rule these four carts produced 6, 9, 1, 2 and won all eighteen holes between them.*

### Why this round is a better test than section 9

- **Handicaps 14 to 34.** Section 9 spans only 15 to 21.
- **Three players take an Agony Alley penalty.** Section 9 has one.
- **Finn hits the top rung** of Agony Alley. Nothing in section 9 does.
- **Grady's 113 and Chip's 94 come out level on net, both 79.** Nineteen shots of gross difference vanish into the handicap and the contests decide the order. **That net parity is the property worth pinning**; which of the two finishes ahead depends on the picks.
- **The spread narrowed from 10.0 strokes to 6.3 when the game was cut to four** — the same eight cards, unchanged. That is the cut doing exactly what it was for.

> ⚠️ **AN EVENT SAVED BEFORE 22 AUGUST RE-OPENS SCORED UNDER THE FOUR.** A round stores only a *diff* against the defaults, so a round played on the old defaults has nothing stored, and its Six Pack and Easy Street lines are simply gone when it is opened again. Consistent with the fresh-workbook decision, but it means past rounds on the phone will not match the numbers written down at the time. **To score an old round the old way, switch the contests back on for that event under The rules** — the parked values are unchanged from when they were played.

---

## 12. Under review — do not change yet

**Keep every threshold in config so a recalibration is a data edit, not a code change.**

| Contest | Issue | Likely change |
|---|---|---|
| **Watch the Birdie** | Nine picks and 840 sets are new. Fires on 86% of rounds, which is high — the blank may now be doing less work than it was designed for. | Watch one Saturday before touching a value. |
| **Agony Alley** | Repeats the net score at +0.62, higher than Watch the Birdie. It survived the cut on the strength of being the contest men talk about, not on the table. | Watch. If it needs cutting, the stretch is the thing to move, not the ladder. |
| **Hit List** | +0.57, and it is the one contest a man must enter. Take-up is the number to watch, not the correlation. | Nothing until a few rounds have run with real names. |
| **Skins** | The floor makes the pot elastic above ten skins. Deliberate, but it means a busy day pays out nearly twice a lean one. | Watch what a full Saturday field actually produces. |
| **The board depth** | Five is a guess at a field of eight to sixteen. | It is a setting. Move it on the day rather than in the code. |

**Missing from the data entirely:** a proper sample of single-digit handicaps, a second tee played in anger, and women's tees. All three are supported and none is calibrated.
