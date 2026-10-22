# CLAUDE.md

## When it is safe to merge to `main`

The pages the men tap (`picks.html`, `score.html`) are served straight off
`main`. A merge at the wrong time changes a page in a man's hand.

- **Times are Florida time (`America/New_York`).** The build machine runs on
  UTC, which is 4–5 hours ahead: Friday night in Florida is already Saturday
  there. Check with `TZ=America/New_York date` before naming a day.
- **The round is FRIDAY MORNING.** There is no Saturday round.
- **The men make picks Tuesday through Thursday night**, on `picks.html`.
  Not Monday: Rob types the week's field into the **Players** tab on Monday
  after booking tee times. The **Index feed** tab follows it by formula, and
  `picks.html` reads the published Index feed CSV — so a man picking on
  Monday would see last week's field.
- **The published feed lags an edit by about five minutes.** A change on
  Players is not on the phone instantly.
- **SAFE TO MERGE: Friday afternoon through Monday.**
- **NEVER MERGE: Tuesday through Friday morning.**

This is the rule. Earlier briefs said "not Thursday or Friday", then
"Friday through Tuesday", then "picks from Monday"; all were wrong.

When a PR has to wait, put the hold in its title as a plain date range in
Florida time, e.g. `[HOLD — merge Fri 23 Oct afternoon – Mon 26 Oct]`.

## Board order on the Leaderboard

Board display order is set in `score.html` by `BOARD_ORDER`, never by moving
rows in the sheet. Four of the sheet's boards count their own rows with
hard-coded numbers (`ROW()-49`, `ROW()-61`, `ROW()-91`, `ROW()-121`), so
inserting or moving rows silently fills boards with the wrong players.
Reorder in the page. An earlier brief said the opposite; it was wrong.

## leaderboard.html is not retired yet

PR #1 made the permanent picks link live on Fri Oct 16 at 7:14 PM Florida
time - AFTER that morning's round. So no round has yet been played on the new
picks page. The first is Friday Oct 23. Leave `leaderboard.html` in the repo
until after that round has run and Rob confirms it worked. Its cached roster
is stale and must never be trusted for anything.

## Parked until after Friday 23 Oct

- **Make the green tray line conditional.** The line at the bottom of
  `picks.html` ("Tap your name in the list first.", set in `refresh()`)
  should change with what the man is looking at. That is a change in what the
  page does, not just its wording, so it waits until after Friday's round.
  Parked by Rob on Tue 20 Oct.

## Saturday 24 Oct list (set by Rob on Thu 22 Oct)

Branch `claude/optimistic-tesla-is4mms` holds the header, headline, "scores",
Rob-only and Hit List counter changes. It was NOT merged Thursday: 14 of 16
men had already filed, so the freeze override no longer helped anyone.
Nothing merges to `main` before Saturday. In priority order:

1. Merge the branch.
2. Shrink the fixed tray: one "Text to Rob Tanenbaum only." line under both
   buttons, and the Android line hidden on iPhones.
3. "Played 18" gate on the CLUBHOUSE board, modeled on the GHIN board's
   `Gross!$T$4>=18`. Without it a man who leaves after nine shows Thru 9 with
   a nine-hole net and tops the board (Fri 23 Oct: Rob handled one by
   announcement). The HIT LIST board needs the same gate: a nine-hole net
   beats any 18-hole net, so whoever named him loses and he wins his own.
   Gate inside the formulas; never insert rows (see Board order above).
4. Two hole buttons per row (4 rows, not 8), and the six Hit List opponents
   three rows of two. The CSS comment above `.holes` says why holes were one
   to a row ("but bogey costs you" does not fit); the 11 and 12 buttons need
   their text stacked under the hole number to fit half width.
5. Put the message preview back as a line under the counter, not instead of
   it.
6. Self-reload for stale pages: fetch `version.js` with `no-store` and reload
   when its build differs from the page's. GitHub Pages cannot send no-store
   on the HTML itself (it serves `max-age=600`).

Known risk, `score.html` "Left the round": it is saved on the one phone that
pressed it, for that day only (`keep()`). If the team changes scoring phones
afterward, the new phone does not know. Its send check stops on "[name] has
no score yet", so it is loud, not silent; the danger is a captain typing a
score to get past it instead of pressing Left the round again. On the sheet
side a blank box gives the team par (Seats formula), so blanks are safe.
Captain's instruction: press it on the TENTH HOLE YOUR TEAM PLAYS, not the
hole numbered 10.

Note: items 4 and 5 pull against each other. Item 4 shortens the scroll but
does not shrink the fixed tray, which already covers about a third of a
400x800 screen; item 5 makes the tray taller. Item 2 is the fix for that.
