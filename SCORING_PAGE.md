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

## 2 · The Scorer feed — done

Reading from the **Scorer feed** tab, published to the web as CSV:

```
https://docs.google.com/spreadsheets/d/e/2PACX-1vQg-44HCczcIAcyn9_osr…/pub?gid=1997697752&single=true&output=csv
```

Checked against the workbook: 24 rows, header `team,start,seat,name,h1…h18`,
teams 1–6, seats 1–4, names as `Surname, First` (the page turns them round for
the screen). Teams 4–6 are empty and are simply not offered.

The address never changes, so this is done for good. Two standing rules:

- **Never rename the tab, and never re-publish under a new address.** If the
  address changes, the page goes blank on the team screen.
- Keep publishing all 24 seat rows, even the empty ones.

## 3 · Corrections are on

The Gross tab now takes the latest send, so a re-send **replaces**. The page
does corrections from the course:

- Open a hole that is already in and it says so — *"Hole 11 already sent: Rob
  5, Harvey 6, Stu 4"* — with the score buttons **locked**.
- A **Change hole 11** button unlocks them. Nothing moves until he taps it,
  because the usual way to land on a sent hole is a fat-fingered back arrow,
  not a correction.
- The unlock is for that one hole. Move off it and it locks again.

The `SHEET_LAST_SEND_WINS = false` behaviour — show, warn, refuse — is still in
the file. If the Gross tab is ever rebuilt and goes back to summing, flip that
one line back and the page protects you again.

Two side effects worth knowing, both good:

- A duplicate send is now **harmless**. Same hole, same numbers, sent twice,
  lands on the same result.
- **The CHECK tab's help text is now wrong.** It still reads *"A form entry
  adds to whatever is already there, so a hole sent twice would double up."*
  Nothing breaks, but it will mislead you in six months. Worth a one-line edit.

## 4 · What no signal really does

Honestly, because it matters:

- A send is **written to the phone first**, then tried. It is only called
  "sent" when the request actually reached Google and came back.
- With no signal it says **"saved on this phone — no signal"**, never "sent",
  and a standing amber bar names every hole still waiting.
- It goes on its own the moment signal returns, and survives a reload, a screen
  lock, and a dead battery.
- **It does not go while the page is closed.** iPhones have no Background
  Sync — no web page gets it, and the group is mostly iPhones. So: if the bar
  is showing, leave the page open until it clears. It clears by itself, and in
  practice a captain reopens the page every hole anyway, so a held hole lands
  within one hole of the signal returning — on Android and iPhone alike.
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

- `npm test` — 28 tests on the page's decisions, inside the 718 already there.
- `npm i --no-save playwright && node test/browser/scoringPage.smoke.mjs /tmp/shots`
  — 50 checks driving the real page at 375 pixels: the double tap, the hole
  moving on, the empty boxes, the correction, the held send, no sideways
  scroll.
