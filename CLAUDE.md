# CLAUDE.md

## When it is safe to merge to `main`

The pages the men tap (`picks.html`, `score.html`) are served straight off
`main`. A merge at the wrong time changes a page in a man's hand.

- **Times are Florida time (`America/New_York`).** The build machine runs on
  UTC, which is 4–5 hours ahead: Friday night in Florida is already Saturday
  there. Check with `TZ=America/New_York date` before naming a day.
- **The round is FRIDAY MORNING.** There is no Saturday round.
- **The men make picks from Monday through Thursday night**, on `picks.html`.
- **SAFE TO MERGE: Friday afternoon through Monday.**
- **NEVER MERGE: Tuesday through Friday morning.**

This is the rule. Earlier briefs said "not Thursday or Friday" and then
"Friday through Tuesday"; both were wrong.

When a PR has to wait, put the hold in its title as a plain date range in
Florida time, e.g. `[HOLD — merge Fri 23 Oct afternoon – Mon 26 Oct]`.
