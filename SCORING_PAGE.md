# The scoring page — what Rob has to do

`score.html`. One link, saved to the home screen, never sent again. It posts
into **Clubhouse_Scorecard**, the form already linked to
**Clubhouse_Live_Scoring_FINAL**. Nothing about the scoring changes.

It does **not** touch `picks.html`, the app, or the spreadsheet's formulas.

---

## 1 · The form is already wired in. Nothing to send me.

The field names were read off the form's own HTML, so there is no pre-filled
link to fetch:

| Box | Field | What it takes |
|---|---|---|
| Team | `entry.571884128` | 1–6, required |
| Holes | `entry.605471460` | 1–18, required |
| Scores · Player A | `entry.828466984` | 1–9, **not** required |
| Scores · Player B | `entry.1307241763` | 1–9, **not** required |
| Scores · Player C | `entry.378353848` | 1–9, **not** required |
| Scores · Player D | `entry.1378388490` | 1–9, **not** required |

The four score rows not being required is what lets a BLIND, a threesome, and a
man who has left the round go in with an empty box. **Do not turn on "Require a
response in each row"** on the Scores grid — every send with an empty box would
be rejected, silently, and the page could not tell.

---

## 2 · One thing to do: publish the Scorer feed

Make a tab called **Scorer feed**, one row a seat, 25 rows including the header:

```
team,start,seat,name,h1,h2,…,h18
1,1,1,"Tanenbaum, Rob",5,4,,,…
1,1,2,"Schwartz, Harvey",6,5,,,…
1,1,3,"Horvitz, Stu",7,6,,,…
2,10,4,BLIND,,,,…
```

- `team` 1–6 · `start` 1 or 10 · `seat` 1–4 (Player A–D)
- `name` exactly as the Players tab holds it — `Surname, First`. The page turns
  it round for the screen. `BLIND` or blank means nobody in that seat.
- `h1`–`h18` the **gross** score already in, blank if none. Straight off the
  Gross tab.
- Publish all 24 seat rows every week, even the empty ones. Teams with no men
  in them are simply not offered.

Then: **File → Share → Publish to web → Scorer feed → Comma-separated values →
Publish.** Paste the address it gives you into line 1 of the config block at the
top of `score.html`:

```js
var FEED_CSV = "https://docs.google.com/spreadsheets/d/e/…/pub?gid=…&single=true&output=csv";
```

That address never changes, so this is a once-only job.

---

## 3 · The correction problem — read this one

Your brief says the sheet keeps the latest send for a team and hole. **It does
not.** Clubhouse_Live_Scoring_FINAL says so in its own words:

> Sending a hole twice adds the two together. The Rows tab flags any hole sent
> twice.

There is a whole CHECK tab whose only job is to catch it. So a "correction"
from the course would turn a 5 into a 10, quietly, in the money.

**So the page will not re-send a hole.** It still shows what a hole already
holds and still warns — it just refuses, and tells the captain to tell you,
which is what the workbook already tells him.

To turn corrections on, change the Gross tab to take the **last** matching row
for a team and hole instead of summing them, then set one line in
`score.html`:

```js
var SHEET_LAST_SEND_WINS = true;
```

Nothing else changes.

---

## 4 · What no signal really does

Honestly, because it matters:

- A send is **written to the phone first**, then tried. It is only called
  "sent" when the request actually reached Google and came back.
- With no signal it says **"saved on this phone — no signal"**, never "sent",
  and a standing amber bar names every hole still waiting.
- It goes on its own the moment signal returns, and survives a reload, a screen
  lock, and a dead battery.
- **It does not go while the page is closed.** iPhones have no background
  sync — no web page gets it. So: if the bar is showing, leave the page open
  until it clears. It clears by itself.
- Google's reply cannot be read from a web page (no CORS on Forms), so a send
  that *arrived* but that Google *rejected* would look like a success. That is
  why the boxes above must stay not-required, and why the feed is the real
  check — a hole shows solid black in the grid once the sheet has it.

---

## 5 · Also needed

`tgif_logo.png` in the repo root, black and white. Until it is there the header
simply has no logo; nothing breaks.

---

## Testing

- `npm test` — 27 tests on the page's decisions, inside the 717 already there.
- `npm i --no-save playwright && node test/browser/scoringPage.smoke.mjs /tmp/shots`
  — 45 checks driving the real page at 375 pixels: the double tap, the hole
  moving on, the empty boxes, the held send, no sideways scroll.
