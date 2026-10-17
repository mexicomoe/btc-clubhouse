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
