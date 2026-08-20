"use strict";
/**
 * Beat the Crowd · Clubhouse — the scoring engine, single source of truth.
 *
 * This plain .js file is the ONE implementation. It is loaded two ways with no
 * build step:
 *   · the browser loads it with a classic <script src="engine.js"> (which works
 *     from a double-clicked file:// page, where ES modules would be blocked);
 *   · the TypeScript in src/ imports it for its side effect and re-exports the
 *     API with types, so the tests run this exact code.
 *
 * It defines no ES exports and touches no `module`, so it is valid as both a
 * classic browser script and an ESM side-effect import in Node. Everything it
 * offers is hung on globalThis.ClubhouseEngine.
 *
 * Recalibrating a threshold is a one-line edit to DEFAULT_CONTESTS below and it
 * reaches the leaderboard and the tests at once — nothing to keep in sync.
 */
(function () {
  const HOLES = 18;
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const signed = (n) => (n >= 0 ? "+" + n : "" + n);
  /**
   * Round to a tenth — every value in the game is a multiple of 0.1. Rounds on
   * the magnitude so a half lands the same way either side of zero: Math.round
   * alone takes -4.5 to -4 but 4.5 to 5, which would make a penalty and a credit
   * of the same size round differently. Never returns a negative zero.
   */
  const toTenth = (v) => (v === 0 ? 0 : (v < 0 ? -1 : 1) * Math.round(Math.abs(v) * 10) / 10);

  /* ---- Course config: Aberdeen, nine tees, two stroke indexes ----
     Par is 72 from every tee and the holes don't move, so par and the Agony
     Alley stretch are shared. Rating and slope change with tee AND gender, and
     the women play a different stroke index — which changes which holes receive
     strokes, and so changes every contest, not just the net total. */
  const ABERDEEN_PAR = [4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 4, 4, 3, 4, 4, 5, 3, 5];
  // Golf Genius's allocation, which is what actually computes the net posted
  // against these rounds. The printed card disagrees on ten holes; measured over
  // the club's cards the contests are unmoved — same clear rates, correlations
  // within 0.02 — but every net is settled on these, so these are the ones.
  const ABERDEEN_SI_MEN = [9, 5, 17, 1, 3, 7, 13, 15, 11, 6, 10, 8, 16, 14, 4, 12, 18, 2];
  const ABERDEEN_SI_WOMEN = [9, 11, 17, 1, 3, 7, 5, 15, 13, 4, 12, 16, 18, 8, 6, 10, 14, 2];

  /** Tee id → course rating and slope, per gender. */
  const ABERDEEN_TEES = {
    "I":      { M: { courseRating: 72.1, slope: 139 }, F: { courseRating: 78.5, slope: 149 } },
    "I/II":   { M: { courseRating: 70.9, slope: 136 }, F: { courseRating: 77.2, slope: 146 } },
    "II":     { M: { courseRating: 69.7, slope: 134 }, F: { courseRating: 75.5, slope: 143 } },
    "II/III": { M: { courseRating: 68.6, slope: 128 }, F: { courseRating: 73.9, slope: 140 } },
    "III":    { M: { courseRating: 67.9, slope: 124 }, F: { courseRating: 73.0, slope: 138 } },
    "III/IV": { M: { courseRating: 66.9, slope: 120 }, F: { courseRating: 71.6, slope: 134 } },
    "IV":     { M: { courseRating: 65.3, slope: 117 }, F: { courseRating: 69.7, slope: 132 } },
    "IV/V":   { M: { courseRating: 64.3, slope: 114 }, F: { courseRating: 68.9, slope: 126 } },
    "V":      { M: { courseRating: 63.5, slope: 112 }, F: { courseRating: 67.5, slope: 121 } },
  };
  /** Tee ids from the back of the course forward — display order for a picker. */
  const TEE_IDS = ["I", "I/II", "II", "II/III", "III", "III/IV", "IV", "IV/V", "V"];

  const GENDERS = ["M", "F"];

  /** Build the course a given player actually plays: their tee, their index. */
  function courseForTee(teeId, gender) {
    const g = gender === "F" ? "F" : "M";
    const tee = ABERDEEN_TEES[teeId];
    if (!tee) throw new Error("Unknown tee: " + teeId);
    return {
      name: "Aberdeen Golf & Country Club, Tee " + teeId,
      tee: teeId, gender: g,
      par: ABERDEEN_PAR,
      strokeIndex: g === "F" ? ABERDEEN_SI_WOMEN : ABERDEEN_SI_MEN,
      slope: tee[g].slope,
      courseRating: tee[g].courseRating,
      agonyHoles: [4, 5, 6],
      // Easy Street's three holes — the stretch the card is supposed to give
      // back. Beside the course for the same reason as Agony Alley: it is a
      // property of these eighteen holes, not of the contest.
      easyStreetHoles: [11, 12, 13],
      // Holes that may not be nominated for Watch the Birdie, whatever their
      // par. Kept beside the course rather than in the contest because it is
      // the COURSE that says which holes are already spoken for.
      //
      // THE EIGHTEEN NOW PARTITION CLEANLY. Agony Alley takes 4, 5, 6 (par 13),
      // Easy Street takes 11, 12, 13 (par 11), and the remaining twelve (par
      // 48) are Watch the Birdie's candidates. No hole is used twice and none
      // is unused; 13 + 11 + 48 = 72.
      //
      // Holes 4 and 13 used to stay legal despite belonging to another contest,
      // because barring them would have left a slot with only one hole in it —
      // not a choice. Floating the par 3s and par 5s across the whole course
      // removes that constraint: three par 3s (3, 8, 17) and three par 5s
      // (7, 16, 18) remain, so every slot keeps a genuine three-way choice and
      // both old overlaps go.
      barredPicks: [4, 5, 6, 11, 12, 13],
    };
  }

  /** The reference course of sections 9 and 11: men's Tee IV. */
  const ABERDEEN_TEE_IV = courseForTee("IV", "M");

  /**
   * Resolve the course to score a card against. A field can be spread over
   * several tees and both stroke indexes, so `course` may be:
   *   · omitted    — take the card's own `tee`/`gender`, else men's Tee IV
   *   · a config   — score everyone against that one course (the old behaviour)
   *   · a function — called with the card, for any other arrangement
   */
  function courseFor(card, course) {
    if (typeof course === "function") return course(card);
    if (course) return course;
    if (card && card.tee) return courseForTee(card.tee, card.gender);
    return ABERDEEN_TEE_IV;
  }

  /* ---- Contest thresholds (December calibration; section 12 under review) ----
     Graded first-match: Agony/Damage/Long/Shorty use `<=`, Bounce uses `>=`.
     Watch the Birdie is not graded — each pick pays its own value. */
  const DEFAULT_CONTESTS = {
    /**
     * Watch the Birdie — six holes nominated before the round, settled one by
     * one. A net eagle pays 1.5, a net birdie 0.5, and a hole pays one of them,
     * never both.
     *
     * `blank` is new and is the contest's only penalty side: a man who makes no
     * net birdie or better on ANY of his six pays half a stroke. Without it the
     * contest could only ever help, which made nominating holes free.
     *
     * THE DOUBLING ON 4 AND 18 IS GONE. It was printed on the card and changed
     * nobody's behaviour — 8 of 10 still took hole 7 and 9 of 10 still took 16
     * — so it was paying extra for choices men were making anyway. Hole 4 is
     * not a candidate at all now; it belongs to Agony Alley.
     */
    watchTheBirdie: { birdie: -0.5, eagle: -1.5, blank: 0.5 },
    /**
     * Six Pack — the six candidate holes a man did NOT nominate.
     *
     * The slot structure forces their shape: two par 4s of six are picked, one
     * par 3 of three and one par 5 of three, so what is left is always four par
     * 4s, one par 3 and one par 5. PAR 24, for every player, every round,
     * whatever he chose. Nothing needs configuring except the par itself.
     *
     * Scored as raw net strokes over or under that 24. No ladder, no threshold,
     * no multiplier — it is deliberately the ONE contest scored as plain
     * net-to-par, because it is the base the other six move a man away from. If
     * they were all scored this way the total would just be his net score again.
     *
     * Measured over 135 rounds: mean +1.1, range -4 to +8, r = +0.05 with index.
     */
    sixPack: { par: 24 },
    /**
     * Agony Alley — the net total on 4, 5, 6, whose par is 13. Structure
     * unchanged from the net base; the values are rescaled to zero.
     */
    agonyAlley: [
      { threshold: 12, strokes: -2 }, { threshold: 13, strokes: -1 },
      { threshold: 15, strokes: 0 }, { threshold: 16, strokes: 1 },
      { threshold: 99, strokes: 2 },
    ],
    /**
     * Easy Street — holes 11, 12, 13 at NET par or better, counted.
     *
     * THIS REVERSES THE DECISION OF 9 AUGUST, which scored it on gross. Gross
     * failed badly and in the direction that matters: on 14 August five of
     * seven finishers made ZERO gross pars on these holes and nobody made two,
     * so the contest penalised 71% of the field and rewarded no one. Across the
     * archive gross pars run r = -0.36 with index WITHIN a single tee — it was
     * measuring handicap, not play. Net pars run r = +0.08.
     *
     * The threshold moves up a rung because net pars are common: all three on
     * 34% of rounds, two on 47%.
     */
    easyStreet: [
      { threshold: 0, strokes: 2 }, { threshold: 1, strokes: 1 },
      { threshold: 2, strokes: 0 }, { threshold: 99, strokes: -1 },
    ],
    /**
     * Triple Threat — a blow-up hole costs 0.5, and a BOUNCE BACK off it, a net
     * par or better on the very next hole, pays 1.0.
     *
     * A BLOW-UP IS NOW A NET DOUBLE BOGEY, not a gross triple. The net double
     * is the worst the cap allows, so it is the true ceiling of a bad hole.
     * Gross triples were a handicap measurement wearing a contest's clothes:
     * within a single tee they run r = +0.43 with index. Net doubles run +0.01.
     *
     * The name stays. For a man with a stroke on the hole a net double IS a
     * gross triple — the same figure on the card — so it stays true for most
     * players on most holes.
     *
     * A picked-up hole is filled in at par + 4 and so is a net double by
     * definition; that is correct here, it was a blow-up.
     */
    tripleThreat: { perTriple: 0.5 },
    /**
     * Bounce Back — a net par or better on the hole immediately after a blow-up.
     *
     * Its own contest again, with its own switch, after a spell as the second
     * half of Triple Threat. The scoring link is unchanged and always was the
     * point of it: it fires on the NEXT hole and nowhere else.
     */
    bounceBack: { perBounceBack: -1.0 },
    /**
     * Hit List — before the round each man privately names one opponent from
     * the eight players nearest his own index and backs himself to post the
     * better 18-hole net score.
     *
     * PRICED BY THE OPPONENT'S BAND, because head-to-head net is not a coin
     * flip once a man chooses his opponent. Across all in-field pairings it is
     * 46.6% win / 46.6% loss / 6.7% tie — but backing yourself against a HIGHER
     * index wins 54% and against a LOWER index only 39%. Flat pricing would
     * make picking the weakest man on the list the only sane move.
     *
     * Priced as below, picking the better player returns -0.20 on average and
     * picking the weaker -0.09. Backing yourself against the good player is the
     * better bet, but only just: a real choice rather than an obvious one.
     *
     * "Equal" is the two indexes within 1.0 of each other. Lower index = the
     * better player.
     */
    hitList: {
      equalBand: 1.0,
      /** How many names a man is offered. A short field offers everybody. */
      offers: 8,
      lower:  { win: -1.1, tie: -0.2, loss: 0.3 },
      equal:  { win: -0.9, tie: 0.1, loss: 0.3 },
      higher: { win: -0.7, tie: 0.1, loss: 0.5 },
    },
    /**
     * Damage Control, Go Long and Get Shorty are SWITCHED OFF. Null is the
     * signal Skins uses: not scored, not shown, not exported. Triple Threat
     * absorbed Damage Control; Easy Street replaced the other two.
     */
    damageControl: null,
    goLong: null,
    getShorty: null,
    /**
     * NO CEILING, and on a zero base there is less for one to do: a man's final
     * IS his contest total, so a cap would be a cap on the score itself.
     * Left here so its absence stays a stated decision.
     */
    maxContestStrokes: null,
    /**
     * Skins — the format is decided by the size of the field, not by a switch:
     * under 8 there are none, 8 to 15 is Cart Skins, 16 or more is Team Skins.
     *
     * A GROUP'S SCORE ON A HOLE IS ITS BEST TWO NET BALLS, not its average.
     * Averaging punished bigger groups badly. Measured over 33 groups, a pair
     * won 1.62x a fair share, a threesome 1.07x and a foursome 0.85x — a
     * threesome took 25% more than a foursome, because skins go to the lowest
     * score and averaging fewer balls produces more extreme ones. Best two cuts
     * the spread to 1.12x: every group contributes exactly two scores whatever
     * its size. A man out on his own counts his ball twice, which takes him
     * from 0.22x a fair share to 1.06x.
     *
     * NO CARRYOVER. A tied hole is simply not won. A POT of `pot` strokes is
     * divided among however many skins were won that round, so a lean 7 makes
     * one worth 0.57. Every player in a winning group takes the full per-skin
     * amount.
     *
     * WITH A FLOOR: a skin is never worth less than `minSkin`. One skin takes
     * the whole 4.0, four are worth 1.0 each, and at ten the division reaches
     * the floor and stops there — eleven skins are still 0.4 each, and so are
     * eighteen. Above ten the pot is therefore NOT fixed: eighteen skins pay
     * out 7.2 between them rather than 4.0. That is deliberate. A hole won is a
     * hole won, and on a busy day the men should not each find their skins
     * quietly worth less than the round before.
     *
     * Jay's league already plays low net best 2 balls, so the format is familiar.
     */
    skins: { pot: -4, minSkin: -0.4, minPlayers: 8, teamFrom: 16 },
  };

  /* ---- Reading a handicap index that someone typed in ----
     Never hand a typed index to parseFloat: parseFloat("24,4") is 24, which
     quietly drops the tenth and can cost a man a stroke. Nor to a number input,
     which throws a comma away and reports an empty field. Parsed here instead,
     to one rule, and always written back with a period whatever the locale. */
  const INDEX_MIN = -10, INDEX_MAX = 54;

  /**
   * Returns { ok, value, error }. A blank field is `ok` with a null value —
   * that is "not filled in yet", not "wrong". A comma is accepted as the
   * decimal separator and normalised, because a phone keypad in some locales
   * offers no period; anything else is refused rather than guessed at.
   */
  function parseHandicapIndex(text) {
    const t = String(text == null ? "" : text).trim();
    if (t === "") return { ok: true, value: null, error: null };

    // A leading + is a golf plus-handicap, which means the OPPOSITE sign to the
    // one the arithmetic would give it. Refuse rather than get it backwards.
    if (t.charAt(0) === "+") {
      return { ok: false, value: null,
        error: "For a plus handicap write it as a minus, like −2.4." };
    }
    if (!/^-?\d{1,2}([.,]\d{1,2})?$/.test(t)) {
      return { ok: false, value: null, error: "Write the index as a number, like 24.4." };
    }
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n)) {
      return { ok: false, value: null, error: "Write the index as a number, like 24.4." };
    }
    if (n < INDEX_MIN || n > INDEX_MAX) {
      // A real minus sign, as everywhere else a negative number is shown.
      return { ok: false, value: null,
        error: "A handicap index runs from " + String(INDEX_MIN).replace("-", "−") +
               " to " + INDEX_MAX + "." };
    }
    return { ok: true, value: n, error: null };
  }

  /** A handicap index as text, always period-decimal. Blank for no index. */
  function formatHandicapIndex(value) {
    // Number#toString is locale-independent — a period here and everywhere.
    return value == null || !Number.isFinite(value) ? "" : String(value);
  }

  /* ---- Handicap and net-score maths ----
     Club events play off an allowance — usually 85%, sometimes another figure.
     The course handicap is worked out in full and THEN cut to the allowance, so
     there are two roundings and they are not interchangeable. It is not a small
     adjustment: at 85% a 38 index off Tee IV goes from 33 shots to 28, and an 8
     index off Tee I from 10 to 9. It changes who wins. */
  const FULL_ALLOWANCE = 100;

  /** Round to a whole stroke, the same way either side of zero (plus handicaps). */
  const roundWhole = (v) => (v < 0 ? -1 : 1) * Math.round(Math.abs(v));

  /**
   * The course handicap a player actually plays off. `allowancePercent` is a
   * percentage — 85 means 85%, and 100 (the default) means the full handicap.
   */
  function courseHandicap(handicapIndex, course, allowancePercent) {
    const par = sum(course.par);
    const full = Math.round((handicapIndex * course.slope) / 113 + (course.courseRating - par));
    const pct = allowancePercent == null ? FULL_ALLOWANCE : allowancePercent;
    return pct === FULL_ALLOWANCE ? full : roundWhole((full * pct) / FULL_ALLOWANCE);
  }

  /** The same figure before any allowance is taken off it. */
  function fullCourseHandicap(handicapIndex, course) {
    return courseHandicap(handicapIndex, course, FULL_ALLOWANCE);
  }

  function resolveCourseHandicap(card, course) {
    // A course handicap that came off a Golf Genius card already has the
    // event's allowance in it. Applying ours as well would cut it twice.
    if (card.courseHandicap != null) return card.courseHandicap;
    if (card.handicapIndex != null) return courseHandicap(card.handicapIndex, course, card.allowancePercent);
    throw new Error(card.name + ": needs a handicap index or course handicap");
  }
  function strokesOnHole(strokeIndex, courseHcp) {
    let n = 0;
    if (strokeIndex <= courseHcp) n++;
    if (strokeIndex <= courseHcp - 18) n++;
    if (strokeIndex <= courseHcp - 36) n++;
    return n;
  }
  /**
   * Picking up. Golf Genius prints an X where a man lifted his ball, and any
   * mark that isn't a number means the same thing. The hole still counts as
   * played: a man who X'd three holes went round eighteen and can win. That is
   * a different thing entirely from walking in after twelve, which is a card
   * that cannot be placed.
   *
   * The NET is set to net double directly rather than reached through an
   * imputed gross. Going via gross fails at the top of the handicap range: a 38
   * index off the back tee is a course handicap of 47, which is three shots on
   * half the card, and par + 4 less three shots comes in UNDER net double and
   * credits a bogey for picking up. Setting the net says what is meant, and
   * says it the same way at every handicap.
   *
   * A gross figure is still imputed at par + 4, but only so the round has a
   * gross total to show. It is never what the hole scores.
   */
  const NET_DOUBLE_OVER_PAR = 2;
  const PICKED_UP_OVER_PAR = 4;
  const isPickedUp = (v) => v != null && typeof v !== "number";
  const grossOnHole = (v, par) =>
    v == null ? null : (isPickedUp(v) ? par + PICKED_UP_OVER_PAR : v);

  /** Net for one hole from the raw card value, picked-up holes included. */
  function netForHole(value, par, strokeIndex, courseHcp) {
    if (value == null) return null;
    if (isPickedUp(value)) return par + NET_DOUBLE_OVER_PAR;
    return netOnHole(value, par, strokeIndex, courseHcp);
  }

  function netOnHole(gross, par, strokeIndex, courseHcp) {
    if (gross == null) return null;
    return Math.min(gross - strokesOnHole(strokeIndex, courseHcp), par + 2);
  }
  function cappedNetByHole(card, course) {
    course = courseFor(card, course);
    const ch = resolveCourseHandicap(card, course);
    return course.par.map((par, i) =>
      netForHole(card.gross[i], par, course.strokeIndex[i], ch));
  }

  /**
   * Rebuild GROSS hole scores from NET ones. The Golf Genius low-net export has
   * already applied the strokes (brief section 10), but the engine scores from
   * gross — so put the strokes back and let it take them off again. That round
   * trip leaves the net score untouched; it just gives the card the gross
   * figures the rest of the app shows. Use the handicap Golf Genius itself
   * used, which is the one printed after the player's name.
   */
  function grossFromNet(netHoles, course, courseHcp) {
    return netHoles.map((n, i) =>
      n == null ? null : n + strokesOnHole(course.strokeIndex[i], courseHcp));
  }

  function gradeAtMost(value, ladder) {
    for (const step of ladder) if (value <= step.threshold) return step.strokes;
    return 0;
  }
  function gradeAtLeast(value, ladder) {
    for (const step of ladder) if (value >= step.threshold) return step.strokes;
    return 0;
  }

  /**
   * What one nominated hole pays, given how far under par it was played. A hole
   * pays the BEST single result on it — a net eagle pays the eagle rate and not
   * the birdie rate as well.
   */
  function pickValue(hole, config, over) {
    const rates = (config.byHole && config.byHole[hole]) || config;
    if (over <= -2) return rates.eagle;
    if (over === -1) return rates.birdie;
    return 0;
  }

  /**
   * The six slots a player nominates for Watch the Birdie: a par 3, a par 4 and
   * a par 5 on each nine. Always in this order — the paste reads six bare
   * numbers and has nothing else to go on.
   */
  const PICK_SLOTS = [
    { key: "p4f", par: 4, nine: "front", label: "front par 4" },
    { key: "p4b", par: 4, nine: "back",  label: "back par 4" },
    // `nine: null` means anywhere on the course. Par 3s and par 5s float: there
    // are only three of each left once Agony Alley and Easy Street take their
    // holes, and splitting three across two nines would leave a slot with one
    // hole in it. Par 4s stay split because six of them remain, three a side.
    { key: "p3a", par: 3, nine: null, label: "first par 3" },
    { key: "p3b", par: 3, nine: null, label: "second par 3" },
    { key: "p5a", par: 5, nine: null, label: "first par 5" },
    { key: "p5b", par: 5, nine: null, label: "second par 5" },
  ];

  /** The slot keys as they were before the par 3s and par 5s floated. */
  const LEGACY_SLOT_KEYS = { f4: "p4f", b4: "p4b", f3: "p3a", b3: "p3b", f5: "p5a", b5: "p5b" };

  /**
   * Which holes each slot allows. Derived from the course's par and its barred
   * list, never hardcoded — at Aberdeen that gives front 3/8, 1/2/9, 4/7 and
   * back 13/17, 10/14/15, 16/18.
   *
   * THE LISTS NOW OVERLAP, and that is a change of kind rather than of degree.
   * `p3a` and `p3b` are handed the identical three holes, as are `p5a` and
   * `p5b`. It used to be true that every hole fell in at most one slot, which
   * is why nominating a hole twice was ALSO illegal for one of the two slots
   * and either check would have caught it. That is no longer so: hole 8 is
   * perfectly legal as both par 3s, and only the duplicate check stops a man
   * nominating it twice and being paid twice for one birdie. The duplicate pass
   * in `readPicks` runs first and is now the ONLY thing standing there.
   */
  function birdiePickHoles(course, contests) {
    /* THE BARRED LIST IS A GAME RULE WEARING COURSE CLOTHING. It sits on the
       course because it is the course that says which holes are spoken for —
       but which contests own which holes is exactly the sort of thing the
       organiser now adjusts, so a contest value overrides it when there is one.
       Par and the stroke index stay on the course and stay unreachable: those
       describe the ground, and changing one would silently rewrite every net
       score ever stored. */
    const override = contests && contests.watchTheBirdie && contests.watchTheBirdie.barred;
    const barred = override || course.barredPicks || [];
    const out = {};
    for (const slot of PICK_SLOTS) {
      out[slot.key] = [];
      for (let i = 0; i < HOLES; i++) {
        const hole = i + 1;
        if (course.par[i] !== slot.par) continue;
        // A slot with no nine of its own takes the hole wherever it lies.
        if (slot.nine && (i < 9 ? "front" : "back") !== slot.nine) continue;
        if (barred.includes(hole)) continue;
        out[slot.key].push(hole);
      }
    }
    return out;
  }

  /**
   * Every hole Watch the Birdie may be played on — the union of the six slots,
   * which at Aberdeen is the twelve left once Agony Alley and Easy Street have
   * taken theirs. Six are nominated and the other six are the Six Pack.
   */
  function birdiePickCandidates(course, contests) {
    const legal = birdiePickHoles(course, contests);
    const seen = new Set();
    for (const slot of PICK_SLOTS) for (const h of legal[slot.key]) seen.add(h);
    return Array.from(seen).sort((a, b) => a - b);
  }

  /**
   * Six legal holes drawn at random, one for every slot.
   *
   * For the man who never sent his picks in. Drawn from the SAME lists the form
   * offers, so a drawn set is indistinguishable from a chosen one by the rules —
   * every hole legal for its slot, the bar list respected, no hole twice.
   *
   * `rng` returns a number in [0,1) and defaults to Math.random. It is an
   * argument so the draw can be tested: with a fixed rng the result is fixed.
   *
   * A DRAWN SET IS NOT A CHOSEN ONE and the board says so. This does not pretend
   * a man made a choice he never made — it stops an empty contest looking like a
   * bad round, which is a different thing.
   */
  function randomPicks(course, rng, contests) {
    const roll = rng || Math.random;
    const legal = birdiePickHoles(course, contests);
    const picks = {};
    // Drawn WITHOUT REPLACEMENT. The two par 3 slots are offered the identical
    // three holes and so are the two par 5s, so drawing each slot on its own
    // put hole 8 in both par 3 slots about a third of the time — a set no man
    // could have chosen, which `readPicks` would then refuse as a duplicate.
    const taken = new Set();
    for (const slot of PICK_SLOTS) {
      const holes = legal[slot.key].filter((h) => !taken.has(h));
      if (holes.length === 0) { picks[slot.key] = null; continue; }
      const hole = holes[Math.floor(roll() * holes.length)];
      picks[slot.key] = hole;
      taken.add(hole);
    }
    return picks;
  }

  /**
   * Read whatever shape a card's picks arrive in.
   *
   * The six named slots are what the app stores now. `{ front, back }` is the
   * two-pick form that came before, kept readable so a round already on a phone
   * — or in an event code already messaged to someone — still opens. Those two
   * were always par 4s, so they map to the par 4 slots.
   *
   * A legacy pick on a hole since barred is DROPPED rather than refused. It was
   * chosen under the old rules and there is nothing to guess at; refusing would
   * take a played round off the phone, which is far worse than one slot of a
   * contest going unpaid. A pick given by NAME is a deliberate statement and is
   * validated strictly instead — see `readPicks`.
   */
  function migratePicks(picks) {
    if (picks == null) return null;
    if (PICK_SLOTS.some((s) => picks[s.key] != null)) return picks;

    // The six-key form that came before the par 3s and par 5s floated. Its keys
    // map straight across; the holes themselves may since have been barred (4
    // and 13 both were), and those are dropped by the `legacy` rule below
    // rather than refused, exactly as a two-pick set's are.
    if (Object.keys(LEGACY_SLOT_KEYS).some((k) => picks[k] != null)) {
      const out = { legacy: true };
      for (const [was, now] of Object.entries(LEGACY_SLOT_KEYS)) {
        out[now] = picks[was] == null ? null : picks[was];
      }
      return out;
    }

    if (picks.front == null && picks.back == null) return null;
    return { p4f: picks.front == null ? null : picks.front,
             p4b: picks.back == null ? null : picks.back, legacy: true };
  }

  /**
   * The six picks as holes, refusing anything outside the table. `legacy` marks
   * picks read from the old two-pick form, whose out-of-table holes are dropped
   * rather than thrown on.
   */
  function readPicks(picks, course, who, opts) {
    /* `drop` is for SCORING, where refusing is the wrong answer.
       A man picks hole 8, the organiser later bars it, and his round must not
       stop opening — the whole board threw an error on exactly that, which is
       the loudest possible way to lose a round. Scoring drops the pick and pays
       him nothing for that slot, which is true and survivable.
       Typed entry keeps the strict path: a man writing 8 on a paste today has
       made a mistake and should be told so, not quietly given five picks. */
    const drop = !!(opts && opts.drop);
    const legal = birdiePickHoles(course, opts && opts.contests);
    const out = {};

    // Duplicates first. No hole belongs to two slots, so a hole nominated twice
    // is ALSO illegal for one of them — and "hole 8 is not a legal front par 4"
    // is a baffling thing to be told about a line that plainly says 8 twice.
    // Legacy picks skip this: front and back were on different nines and could
    // never collide.
    if (!picks.legacy) {
      const seen = new Map();
      for (const slot of PICK_SLOTS) {
        const hole = picks[slot.key];
        if (hole == null) continue;
        if (seen.has(hole)) {
          if (drop) continue;
          throw new Error(who + ": hole " + hole + " is nominated twice, as " +
            seen.get(hole) + " and " + slot.label);
        }
        seen.set(hole, slot.label);
      }
    }

    const used = new Set();
    for (const slot of PICK_SLOTS) {
      const hole = picks[slot.key];
      if (hole == null) { out[slot.key] = null; continue; }
      // Under `drop` the duplicate pass above let it through; it must still not
      // be paid on two slots.
      if (drop && used.has(hole)) { out[slot.key] = null; continue; }
      if (!legal[slot.key].includes(hole)) {
        if (picks.legacy || drop) { out[slot.key] = null; continue; }
        throw new Error(who + ": hole " + hole + " is not a legal " + slot.label +
          " — " + legal[slot.key].join(", "));
      }
      out[slot.key] = hole;
      used.add(hole);
    }
    return out;
  }

  /* ---- An event's own rules ----
     THE SETTINGS LIVE IN THE EVENT, not in browser storage. That was the
     sticking point: browser storage means the laptop and the phone disagree and
     there is no server to reconcile them. In the event it is free — the event
     code already carries a round between devices, so the rules go with it, and
     a round scored in March still scores the same way in August because it
     carries the rules it was played under.

     What is stored is a DIFF, not a copy. A full config is 735 characters of
     JSON and would cost 980 in an event code; one changed contest costs 72.
     A round on the defaults stores nothing at all. */

  /** Is this a plain value to be replaced, rather than merged into? */
  const isLeaf = (v) => v == null || typeof v !== "object" || Array.isArray(v);

  /**
   * The defaults with an event's changes laid over them.
   *
   * Null in the diff means SWITCHED OFF and is kept as null — it is the signal
   * the whole engine already uses for a contest that is not in the game.
   */
  function mergeContests(base, diff) {
    if (!diff) return base;
    const out = Object.assign({}, base);
    for (const key of Object.keys(diff)) {
      const v = diff[key];
      if (isLeaf(v) || isLeaf(base[key])) out[key] = v;
      else out[key] = mergeContests(base[key], v);
    }
    return out;
  }

  /**
   * What `full` changes about `base`, and nothing it does not. Returns null when
   * they agree — so "is this round on the defaults?" is a null check, on every
   * surface that has to mark it.
   */
  function diffContests(base, full) {
    if (!full) return null;
    const out = {};
    for (const key of Object.keys(full)) {
      const a = base[key], b = full[key];
      if (isLeaf(a) || isLeaf(b)) {
        if (JSON.stringify(a) !== JSON.stringify(b)) out[key] = b;
      } else {
        const inner = diffContests(a, b);
        if (inner) out[key] = inner;
      }
    }
    return Object.keys(out).length ? out : null;
  }

  /**
   * Check a set of rules before it is saved. Returns a list of plain sentences,
   * empty when there is nothing wrong.
   *
   * Refusing is the whole point: a bad ladder or a bad barred list does not
   * fail loudly at save time, it fails quietly at scoring time, three hours
   * later, in front of the men.
   */
  function checkContests(full, course) {
    const problems = [];
    const c = course || ABERDEEN_TEE_IV;

    /* Barred holes. A slot with one legal hole is not a choice, it is a
       formality, and a slot with none cannot be filled at all. */
    const w = full.watchTheBirdie;
    if (w && w.barred) {
      for (const h of w.barred) {
        if (!(Number.isInteger(h) && h >= 1 && h <= HOLES)) {
          problems.push("Hole " + h + " is not a hole — they run 1 to 18.");
        }
      }
      if (!problems.length) {
        const legal = birdiePickHoles(c, full);
        for (const slot of PICK_SLOTS) {
          const n = legal[slot.key].length;
          if (n < 2) {
            problems.push("The " + slot.label + " would have " +
              (n === 0 ? "no holes" : "only hole " + legal[slot.key][0]) +
              " left to choose from. Every slot needs at least two.");
          }
        }
      }
    }

    /* A ladder is graded first-match on `<=`, so its thresholds must climb. Out
       of order, a rung below an earlier one can never be reached and the values
       a man was promised are silently unreachable. */
    for (const [key, label] of [["agonyAlley", "Agony Alley"], ["easyStreet", "Easy Street"],
                                ["damageControl", "Damage Control"]]) {
      const ladder = full[key];
      if (!Array.isArray(ladder)) continue;
      if (ladder.length === 0) { problems.push(label + " has no rungs at all."); continue; }
      for (let i = 1; i < ladder.length; i++) {
        if (!(ladder[i].threshold > ladder[i - 1].threshold)) {
          problems.push(label + " runs out of order: " + ladder[i - 1].threshold +
            " is followed by " + ladder[i].threshold + ". Each rung must be higher than the one above it.");
          break;
        }
      }
      /* EASY STREET COUNTS THREE HOLES, so only 0, 1 and 2 are real counts —
         the last rung covers "all three". A middle rung set to 3 or more can
         never be beaten, so the final rung becomes unreachable and the value a
         man was promised for sweeping the stretch is silently never paid. It
         reads plausibly on screen, which is what makes it worth refusing. */
      if (key === "easyStreet") {
        const holes = (course && course.easyStreetHoles ? course.easyStreetHoles.length : 3);
        for (let i = 0; i < ladder.length - 1; i++) {
          if (ladder[i].threshold >= holes) {
            problems.push("Easy Street counts only " + holes + " holes, so " +
              ladder[i].threshold + " can never be beaten — the line below it would " +
              "never be reached. Use " + (holes - 1) + " or less.");
            break;
          }
        }
      }

      for (const rung of ladder) {
        if (typeof rung.strokes !== "number" || !Number.isFinite(rung.strokes)) {
          problems.push(label + " has a rung with no value on it.");
          break;
        }
      }
    }

    /* Skins. A floor above the pot means one skin is worth less than two, which
       is the opposite of everything else here. */
    const sk = full.skins;
    if (sk) {
      if (!(sk.minPlayers >= 2)) problems.push("Skins needs at least two players to run.");
      if (!(sk.teamFrom > sk.minPlayers)) {
        problems.push("Team skins must start above the field size cart skins starts at — " +
          sk.teamFrom + " is not above " + sk.minPlayers + ".");
      }
      if (sk.minSkin != null && Math.abs(sk.minSkin) > Math.abs(sk.pot)) {
        problems.push("A skin cannot be worth more on its own (" + Math.abs(sk.minSkin) +
          ") than the whole pot (" + Math.abs(sk.pot) + ").");
      }
    }

    /* Hit List. A band below zero would put nobody in it. */
    if (full.hitList && !(full.hitList.equalBand >= 0)) {
      problems.push("The equal-handicap band cannot be negative.");
    }
    return problems;
  }

  /* ---- Score one card ---- */
  function scorePlayer(card, course, contests) {
    course = courseFor(card, course);
    contests = contests || DEFAULT_CONTESTS;
    const ch = resolveCourseHandicap(card, course);

    // A picked-up hole becomes par + 4 here and is a played hole from now on.
    const grossByHole = course.par.map((par, i) => grossOnHole(card.gross[i], par));
    const pickedUpHoles = [];
    card.gross.forEach((v, i) => { if (isPickedUp(v)) pickedUpHoles.push(i + 1); });

    const net = course.par.map((par, i) =>
      netForHole(card.gross[i], par, course.strokeIndex[i], ch));
    const played = (i) => net[i] != null;
    const over = (i) => net[i] - course.par[i];

    const holesPlayed = net.filter((n) => n != null).length;
    const gross = grossByHole.some((g) => g != null) ? sum(grossByHole.filter((g) => g != null)) : null;
    const netTotal = holesPlayed > 0 ? sum(net.filter((n) => n != null)) : null;

    let netUncapped = null;
    if (holesPlayed > 0) {
      netUncapped = 0;
      for (let i = 0; i < HOLES; i++) {
        if (grossByHole[i] != null) netUncapped += grossByHole[i] - strokesOnHole(course.strokeIndex[i], ch);
      }
    }

    // 1 · Watch the Birdie — six holes nominated before the round, a par 3, a
    // par 4 and a par 5 on each nine. Each is settled on its own: a net birdie
    // pays 0.5, a net eagle 1.0, and the hole pays one of them, never both.
    //
    // A hole he picked up on has already become net double above, so it is a
    // played hole that cannot possibly be a birdie — it pays nothing rather
    // than leaving a gap. A hole never played pays nothing either, and neither
    // takes the contest off the card.
    let watchTheBirdie, sixPack;
    const picks = migratePicks(card.picks);
    const read = picks == null ? null : readPicks(picks, course, card.name, { drop: true, contests });
    const chosen = read == null ? []
      : PICK_SLOTS.map((s) => read[s.key]).filter((h) => h != null);

    if (chosen.length === 0) {
      watchTheBirdie = { strokes: 0, detail: "no picks made", live: false };
    } else {
      let birdieStrokes = 0, paid = 0;
      for (const h of chosen) {
        if (!played(h - 1)) continue;
        const value = pickValue(h, contests.watchTheBirdie, over(h - 1));
        if (value !== 0) { birdieStrokes += value; paid++; }
      }
      // The penalty side, and the contest's only one: nothing on any of the six
      // costs half a stroke. Charged only once every pick has been PLAYED —
      // a man cannot be charged for failing to birdie a hole he never stood on.
      const allPlayed = chosen.every((h) => played(h - 1));
      const blank = contests.watchTheBirdie.blank || 0;
      if (paid === 0 && allPlayed && blank !== 0) birdieStrokes += blank;
      watchTheBirdie = {
        strokes: toTenth(birdieStrokes),
        detail: paid === 0
          ? (allPlayed ? "no net birdies" : "nothing yet")
          // Counted, not assumed to be six. A pick on a hole barred after he
          // chose it is dropped, so a man can arrive here with five.
          : paid + " of " + chosen.length + " pick" + (chosen.length === 1 ? "" : "s"),
        live: true,
      };
    }

    // 2 · Six Pack — the six candidates he did NOT nominate.
    //
    // The slot structure forces their shape, so this is always four par 4s, one
    // par 3 and one par 5: par 24, for every man, every round. Scored as raw
    // net strokes over or under that 24 — no ladder, no threshold. It is the
    // base the other contests move him away from.
    //
    // Needs the picks, because without them there is no "did not choose". And
    // needs all six played, because a missing hole would silently flatter the
    // total by the whole of its par.
    const candidates = birdiePickCandidates(course, contests);
    const leftovers = candidates.filter((h) => chosen.indexOf(h) === -1);
    if (contests.sixPack == null) {
      sixPack = null;
    } else if (chosen.length !== PICK_SLOTS.length || leftovers.length !== PICK_SLOTS.length) {
      sixPack = { strokes: 0, live: false,
        detail: chosen.length === 0 ? "no picks made" : "needs all six picks" };
    } else if (!leftovers.every((h) => played(h - 1))) {
      sixPack = { strokes: 0, detail: "needs all six played", live: false };
    } else {
      const total = sum(leftovers.map((h) => net[h - 1]));
      const par = contests.sixPack.par;
      sixPack = { strokes: toTenth(total - par),
        detail: "net " + total + " on the six left, par " + par, live: true };
    }

    // 3 · Agony Alley — the net total on the stretch. Structure unchanged.
    const agonyIdx = course.agonyHoles.map((h) => h - 1);
    let agonyAlley;
    if (!agonyIdx.every(played)) {
      agonyAlley = { strokes: 0, detail: "needs holes " + course.agonyHoles[0] + "–" + course.agonyHoles[course.agonyHoles.length - 1], live: false };
    } else {
      const total = sum(agonyIdx.map((i) => net[i]));
      agonyAlley = { strokes: gradeAtMost(total, contests.agonyAlley), detail: "net " + total + " across the stretch", live: true };
    }

    // Damage Control — switched off, Triple Threat replaced it. The counter
    // stays for the day it comes back.
    let damageControl = null;
    if (contests.damageControl != null) {
      const netDoubles = range(HOLES).filter((i) => played(i) && over(i) >= 2).length;
      damageControl = { strokes: gradeAtMost(netDoubles, contests.damageControl),
        detail: netDoubles + " net double" + (netDoubles === 1 ? "" : "s"), live: true };
    }

    // 4 · Easy Street — holes 11, 12, 13 at NET par or better, counted.
    //
    // NET, not gross. Scored on gross this contest measured handicap rather
    // than play: on 14 August five of seven finishers made no gross par at all
    // on these three, so it penalised 71% of the field and rewarded nobody.
    //
    // All three must be played. The contest can PENALISE, and a man cannot be
    // charged for failing to par holes he never stood on — the same reason
    // Agony Alley waits for its stretch.
    const easyIdx = (course.easyStreetHoles || []).map((h) => h - 1);
    let easyStreet;
    if (contests.easyStreet == null) {
      easyStreet = null;
    } else if (easyIdx.length === 0 || !easyIdx.every(played)) {
      easyStreet = { strokes: 0, live: false,
        detail: "needs holes " + course.easyStreetHoles[0] + "–" + course.easyStreetHoles[course.easyStreetHoles.length - 1] };
    } else {
      // A hole counts ONCE however far under par it went: a net birdie is a net
      // par for this purpose, so a birdie and a par together are two, not three.
      const made = easyIdx.filter((i) => over(i) <= 0).length;
      easyStreet = { strokes: gradeAtMost(made, contests.easyStreet),
        detail: made === 0 ? "no net pars on the three" : made + " of 3 at net par or better",
        live: true };
    }

    // 5 · Triple Threat — a blow-up costs.
    // 6 · Bounce Back — answering one on the very next hole pays.
    //
    // TWO CONTESTS, ONE SET OF FACTS. They are separate on the card, in the
    // export, in the shared view and on the Settings screen, each with its own
    // value and its own switch — but they read the same two things about the
    // round, and Bounce Back still only ever fires on the hole STRAIGHT AFTER a
    // blow-up. Nothing about that link changed when they were pulled apart.
    //
    // Either may be switched off without the other. A blow-up is a fact about
    // the card rather than about whether it is being charged for, so Bounce
    // Back pays a recovery even in a round where Triple Threat is not in the
    // game — which is the only reading that lets the switches be independent.
    //
    // A BLOW-UP IS A NET DOUBLE BOGEY, the worst the cap allows. It was a gross
    // triple, which within one tee ran r = +0.43 with handicap index — it was
    // measuring the handicap, not the round. Net doubles run +0.01.
    //
    // A picked-up hole IS counted. It is filled in at par + 4, which caps to a
    // net double, and a hole a man picked up on was a blow-up by any reading.
    let blowUps = 0, bounces = 0;
    for (let i = 0; i < HOLES; i++) {
      if (!played(i) || over(i) < 2) continue;
      blowUps++;
      // The 18th has no next hole, so a blow-up there can only cost. Two net
      // doubles running leave the first unanswered, which is the intent.
      if (i + 1 < HOLES && played(i + 1) && over(i + 1) <= 0) bounces++;
    }

    let tripleThreat = null;
    if (contests.tripleThreat != null) {
      tripleThreat = {
        strokes: toTenth(blowUps * contests.tripleThreat.perTriple),
        detail: blowUps === 0 ? "no net doubles"
          : blowUps + " net double" + (blowUps === 1 ? "" : "s"),
        live: true,
      };
    }

    let bounceBack = null;
    if (contests.bounceBack != null) {
      bounceBack = {
        strokes: toTenth(bounces * contests.bounceBack.perBounceBack),
        detail: bounces === 0 ? "no bounce-backs"
          : bounces + " off a net double" + (bounces === 1 ? "" : "s"),
        live: true,
      };
    }

    // Go Long and Get Shorty — switched off, Easy Street replaces them. The
    // grader stays for the day they come back.
    const goLong = scorePar(range(HOLES).filter((i) => course.par[i] === 5), contests.goLong, "par 5s");
    const getShorty = scorePar(range(HOLES).filter((i) => course.par[i] === 3), contests.getShorty, "par 3s");
    function scorePar(idxs, ladder, label) {
      if (ladder == null) return null;
      if (idxs.filter(played).length < 4) return { strokes: 0, detail: "needs the " + label, live: false };
      const total = sum(idxs.map(over));
      return { strokes: gradeAtMost(total, ladder), detail: signed(total) + " vs par on the " + label, live: true };
    }

    // Hit List is NOT scored here. It needs the opponent's card, and this
    // function sees one card in isolation — so it is settled field-wide in
    // `computeLeaderboard`, exactly where Skins is.

    // A contest switched off in the config is not in the result at all — not a
    // zero, which would read as "he scored nothing on it". The CSV writes a
    // blank cell for a missing key and the detail screen leaves the line out.
    const allContests = {};
    for (const [key, value] of [["watchTheBirdie", watchTheBirdie], ["sixPack", sixPack],
                                ["agonyAlley", agonyAlley],
                                ["damageControl", damageControl], ["easyStreet", easyStreet],
                                ["tripleThreat", tripleThreat], ["goLong", goLong],
                                ["getShorty", getShorty], ["bounceBack", bounceBack]]) {
      if (value != null) allContests[key] = value;
    }

    // Nothing pays on an empty card. Every "count" contest reads zero holes as
    // zero of whatever it counts — no net doubles, no bounce-backs — which would
    // grade as the best possible round and pay a man who never teed off.
    if (holesPlayed === 0) {
      for (const key of Object.keys(allContests)) {
        allContests[key] = { strokes: 0, detail: "no card", live: false };
      }
    }

    // Rounded to a tenth on the way out, and again after the net is added.
    // Every contest pays a tenth, but tenths do not add exactly in binary: 0.3
    // and −0.6 from Triple Threat sum to −0.30000000000000004, which reaches
    // the CSV as that and reads as a broken number on a scoreboard. Values that
    // were all halves used to add exactly, so nothing needed this until now.
    const earnedUncapped = toTenth(sum(Object.values(allContests).map((c) => c.strokes)));
    let earned = earnedUncapped;
    // Null or absent means no ceiling at all.
    if (contests.maxContestStrokes != null && -earned > contests.maxContestStrokes) {
      earned = -contests.maxContestStrokes;
    }

    /**
     * THE BASE IS ZERO. Every man starts at 0 and the contests move him from
     * there; the net total no longer carries into the final. The measure is
     * strokes under and over par, and a board reads −4, −2, +1, +3.
     *
     * NULL UNLESS THE ROUND IS COMPLETE, and that gate is doing more work than
     * it looks. On a net base an unfinished card scored a low total and needed
     * holding back for that reason. On a zero base it scores near NOTHING —
     * contests simply never fire — and a man who never teed off would come out
     * at exactly 0, which on this scale beats a median round of −0.5. He would
     * lead the field by walking in. Eighteen holes or no final at all.
     */
    const final = holesPlayed === HOLES ? earned : null;

    return {
      name: card.name, courseHandicap: ch,
      // What the contests came to before maxContestStrokes was applied. Equal to
      // strokesEarned unless the cap bit — and when it did, the contest lines on
      // screen add up to more than the total, which needs saying rather than
      // leaving for a man to spot and mistrust.
      strokesEarnedUncapped: earnedUncapped,
      // The figure before the allowance, when there was one to cut. Null when the
      // handicap came off a Golf Genius card, which already has it applied.
      courseHandicapFull: card.courseHandicap != null || card.handicapIndex == null
        ? null : fullCourseHandicap(card.handicapIndex, course),
      allowancePercent: card.allowancePercent == null ? 100 : card.allowancePercent,
      gross, net: netTotal, netUncapped,
      // Capped net per hole — what a match of cards is settled on.
      netByHole: net,
      /** Gross per hole with picked-up holes filled in at par + 4. */
      grossByHole,
      /** Hole numbers he picked up on — shown as X, never as the filled figure. */
      pickedUpHoles,
      holesPlayed, contests: allContests, strokesEarned: earned, final,
    };
  }

  /* ---- Breaking a tie: golf's own match of cards ----
     Every contest except Skins pays in halves, so equal finals are the norm
     rather than the exception. The club's own rule settles them: the better
     back nine, then the last six, the last three, and finally the 18th. */
  const CARD_MATCH = [
    { from: 10, to: 18, label: "the back nine" },
    { from: 13, to: 18, label: "13–18" },
    { from: 16, to: 18, label: "16–18" },
    { from: 18, to: 18, label: "the 18th" },
  ];

  /** Capped net over holes `from`..`to` (1-based), or null if any is unplayed. */
  function segmentNet(result, from, to) {
    let total = 0;
    for (let h = from; h <= to; h++) {
      const n = result.netByHole[h - 1];
      if (n == null) return null;
      total += n;
    }
    return total;
  }

  /**
   * Compare two equal finals by match of cards. Returns { order, label } where
   * order is -1 if `a` takes the place, 1 if `b` does, 0 if they still share it.
   *
   * A man who did not finish cannot win a card match — there is no card to
   * match — so he is placed below anyone who did, and two unfinished cards
   * simply share.
   */
  function matchOfCards(a, b) {
    const aDone = a.holesPlayed === HOLES, bDone = b.holesPlayed === HOLES;
    if (aDone !== bDone) return { order: aDone ? -1 : 1, label: "a finished card" };
    if (!aDone) return { order: 0, label: null };

    for (const seg of CARD_MATCH) {
      const x = segmentNet(a, seg.from, seg.to);
      const y = segmentNet(b, seg.from, seg.to);
      if (x == null || y == null) continue;
      if (x !== y) return { order: x < y ? -1 : 1, label: seg.label };
    }
    return { order: 0, label: null };
  }

  /* ---- Skins ----
     A cart's score on a hole is the AVERAGE of its players' net scores, not the
     total: averaging is self-correcting, so a one-man cart competes fairly and
     needs no blind partner. Lowest average wins the hole; a tie carries the pot
     into the next; anything still carrying after the 18th simply vanishes. */
  function skinsByGroup(entries, course) {
    const members = new Map();
    const order = [];
    for (const entry of entries) {
      const id = String(entry.group);
      if (!members.has(id)) { members.set(id, []); order.push(id); }
      members.get(id).push(cappedNetByHole(entry.card, course));
    }

    const skins = new Map(order.map((id) => [id, 0]));
    const holes = [];

    for (let h = 0; h < HOLES; h++) {
      const scores = new Map();
      for (const id of order) {
        const played = members.get(id).map((nets) => nets[h]).filter((n) => n != null);
        if (played.length === 0) continue;
        scores.set(id, bestTwo(played));
      }
      let wonBy = null;
      if (scores.size > 0) {
        let best = Infinity;
        scores.forEach((v) => { if (v < best) best = v; });
        const winners = [];
        scores.forEach((v, id) => { if (v === best) winners.push(id); });
        if (winners.length === 1) {
          wonBy = winners[0];
          skins.set(wonBy, skins.get(wonBy) + 1);
        }
        // NO CARRYOVER. A tied hole is simply not won and nothing rolls on.
      }
      holes.push({ hole: h + 1, scores, wonBy });
    }
    return { skins, holes, carried: 0 };
  }

  /**
   * A group's score on a hole: its BEST TWO net balls, added.
   *
   * Not the average, which was badly unfair to bigger groups. Measured over 33
   * real groups, a pair won 1.62x a fair share, a threesome 1.07x and a
   * foursome 0.85x — a threesome took a quarter more than a foursome, because
   * skins go to the lowest score and averaging fewer balls produces more
   * extreme ones. Best two cuts the spread to 1.12x: every group contributes
   * exactly two scores whatever its size.
   *
   * A MAN ON HIS OWN COUNTS HIS BALL TWICE. Left with one ball against everyone
   * else's two he took 0.22x a fair share — he was not playing the same contest.
   * Counting it twice gives 1.06x.
   */
  function bestTwo(played) {
    if (played.length === 0) return null;
    if (played.length === 1) return played[0] * 2;
    const sorted = played.slice().sort((a, b) => a - b);
    return sorted[0] + sorted[1];
  }

  /** Cart Skins: group by cart. Same engine as teams — only membership differs. */
  function cartSkins(entries, course) {
    return skinsByGroup(entries.map((e) => ({ card: e.card, group: e.cart })), course);
  }
  /** Team Skins: identical engine, grouped by team instead of cart. */
  function teamSkins(entries, course) {
    return skinsByGroup(entries.map((e) => ({ card: e.card, group: e.team })), course);
  }

  /**
   * Which format a field of this size plays, or null for none at all.
   *
   * Under 8 there is not enough of a field to divide; 8 to 15 is Cart Skins;
   * 16 or more is Team Skins, which is what Jay's Saturday field actually is.
   */
  function skinsFormat(playerCount, config) {
    if (!config) return null;
    if (playerCount < (config.minPlayers == null ? 8 : config.minPlayers)) return null;
    return playerCount >= (config.teamFrom == null ? 16 : config.teamFrom) ? "team" : "cart";
  }

  /**
   * What ONE skin is worth: a FIXED POT divided among however many skins were
   * actually won that round.
   *
   * So the whole contest is worth the same every week whatever falls — a
   * typical 11 skins makes one worth about 0.36, a lean 7 makes it 0.57 — and
   * it can no longer outgrow the other six in a big field, which is what the
   * old per-skin value with a cap on top was there to stop.
   *
   * Rounded to a hundredth, because this is the figure printed on the Skins tab
   * and a man checking five skins against it must get the number the board paid.
   *
   * Every player in a winning group takes the FULL per-skin amount; it is not
   * divided among them.
   */
  function skinValue(config, skinsWon) {
    if (!config) return 0;
    if (!(skinsWon > 0)) return 0;
    const share = config.pot / skinsWon;
    // The floor bites on the MAGNITUDE — both are negative, and a skin worth
    // "less" is one nearer zero.
    const floor = config.minSkin;
    const value = (floor != null && Math.abs(share) < Math.abs(floor)) ? floor : share;
    return Math.round(value * 100) / 100;
  }


  /** What a count of skins is worth, in tenths like every other value. */
  function skinStrokes(count, config, skinsWon) {
    return toTenth(count * skinValue(config, skinsWon));
  }

  /** Score a field, sorted by final (lowest first). Ties are left as ties. */
  function scoreField(cards, course, contests) {
    return cards.map((c) => scorePlayer(c, course, contests)).sort((a, b) => (a.final == null ? Infinity : a.final) - (b.final == null ? Infinity : b.final));
  }

  /**
   * Leaderboard: the scored field, with Skins folded in, ordered, and placed.
   *
   * Skins can only be settled across the whole field, so it is added here
   * rather than in scorePlayer. Equal finals are then separated by match of
   * cards, and only genuinely level cards share a place.
   */
  function computeLeaderboard(players, course, contests) {
    const cards = players || SAMPLE_ROUND;
    contests = contests || DEFAULT_CONTESTS;
    // `course` passes through untouched so a mixed-tee field resolves per card.
    const results = cards.map((c) => scorePlayer(c, course, contests));
    results.forEach((r, i) => { r.flight = flightOf(cards[i]); });

    /**
     * SKINS AND THE HIT LIST ARE PLAYED ACROSS THE WHOLE FIELD. Flights do not
     * divide them.
     *
     * The club's Saturday league runs its own flighted skins game. That is a
     * DIFFERENT CONTEST from this one and Clubhouse has no business reading its
     * flights: settling Clubhouse Skins inside a flight quietly turned a
     * sixteen-man group event into two eight-man ones, and a twelve-man event
     * split three ways played no skins at all.
     *
     * So the field size that picks the format is the FIELD's — under 8 none,
     * 8 to 15 carts, 16 and up teams. And a man may name anyone in the round on
     * his Hit List, which is what the picking screen already offers him: it
     * ranges over every index in the field, and an engine that then refused a
     * cross-flight opponent would be disagreeing with the screen that suggested
     * him.
     *
     * Flights still divide the PLACINGS, and the card match that separates a
     * tie, which is all they were ever for here. They may come back for club
     * events; the code stays.
     */
    applyHitList(cards, results, contests);
    applySkins(cards, results, course, contests);

    const byFlight = new Map();
    cards.forEach((card, i) => {
      const f = flightOf(card);
      if (!byFlight.has(f)) byFlight.set(f, { cards: [], results: [] });
      byFlight.get(f).cards.push(card);
      byFlight.get(f).results.push(results[i]);
    });

    const placed = [];
    for (const flight of sortFlights([...byFlight.keys()])) {
      const group = byFlight.get(flight);
      placeField(group.results);
      placed.push.apply(placed, group.results);
    }
    return placed;
  }

  /** Sort one flight into finishing order and give out its places. */
  function placeField(results) {
    /**
     * EIGHTEEN HOLES OR YOU ARE NOT SCORED. A short card takes no final, no
     * position, no skins and no place on anyone's Hit List; it is listed as not
     * scored with a reason and nothing else.
     *
     * The old reasoning here was that twelve holes of net always total less
     * than eighteen, so an unfinished card would flatter itself on the final.
     * That argument died with the net base — on a zero base a short card scores
     * near nothing rather than something too good. The rule survives it for a
     * plainer reason: half a round is not a round.
     */
    const tier = (r) => (r.holesPlayed === HOLES ? 0 : r.holesPlayed > 0 ? 1 : 2);

    results.sort((a, b) => {
      const ta = tier(a), tb = tier(b);
      if (ta !== tb) return ta - tb;
      if (ta > 0) return b.holesPlayed - a.holesPlayed;   // furthest round first
      const fa = a.final == null ? Infinity : a.final;
      const fb = b.final == null ? Infinity : b.final;
      if (fa !== fb) return fa - fb;
      return matchOfCards(a, b).order;
    });

    // Place them. A man shares the place above only if the cards are level too.
    let lastRank = 0;
    results.forEach((r, i) => {
      r.eligible = r.holesPlayed === HOLES;
      if (!r.eligible) { r.rank = null; return; }   // no card, no position
      const prev = i > 0 ? results[i - 1] : null;
      if (!prev || prev.final !== r.final) {
        lastRank = i + 1;
        r.rank = lastRank;
        return;
      }
      const m = matchOfCards(prev, r);
      if (m.order === 0) {
        r.rank = lastRank;                       // genuinely level: share it
        prev.cardMatch = { shared: true, wonBy: null };
        r.cardMatch = { shared: true, wonBy: null };
      } else {
        lastRank = i + 1;
        r.rank = lastRank;
        // The man above took the place, and this is what took it.
        if (!prev.cardMatch || !prev.cardMatch.shared) {
          prev.cardMatch = { shared: false, wonBy: m.label };
        }
      }
    });
    return results;
  }

  /** A player's flight. Blank, or absent, means the one undivided field. */
  function flightOf(card) {
    return card && card.flight != null ? String(card.flight).trim() : "";
  }

  /**
   * Flight names in the order they should be read: the undivided field first,
   * then naturally, so "Flight 2" sorts before "Flight 10" rather than after it.
   */
  function sortFlights(names) {
    return names.slice().sort((a, b) => {
      if (a === b) return 0;
      if (a === "") return -1;
      if (b === "") return 1;
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
    });
  }

  /** The leaderboard split into flights, in reading order. */
  function computeFlights(players, course, contests) {
    const all = computeLeaderboard(players, course, contests);
    const byFlight = new Map();
    for (const r of all) {
      if (!byFlight.has(r.flight)) byFlight.set(r.flight, []);
      byFlight.get(r.flight).push(r);
    }
    return sortFlights([...byFlight.keys()])
      .map((flight) => ({ flight, results: byFlight.get(flight) }));
  }

  /** Every flight in use across a field, in reading order. */
  function flightsInUse(cards) {
    const seen = new Set();
    (cards || []).forEach((c) => seen.add(flightOf(c)));
    return sortFlights([...seen]);
  }

  /**
   * Score Skins by cart across the field and fold it into each final.
   * A player with no cart number simply doesn't compete for skins — he scores
   * zero from it rather than breaking the round for everyone else.
   */
  function applySkins(cards, results, course, contests) {
    const config = contests.skins;
    if (!config) return null;

    // EIGHTEEN HOLES OR YOU ARE NOT IN IT. A man who did not finish plays no
    // part in his group's best two, because a card that stops at the twelfth
    // would otherwise win holes 1-12 for his group and then abandon it.
    const complete = (i) => results[i].holesPlayed === HOLES;

    // THE FORMAT IS SET BY THE FIELD THAT TEED OFF, not by who came back.
    // Counted on finishers, one man walking in off an eight-man field took the
    // count to seven and cancelled skins for everybody — a contest decided
    // retrospectively by somebody else's bad back. The club knows whether it is
    // playing carts or teams before anyone hits a ball, and so does this.
    const format = skinsFormat(cards.length, config);

    const groupOf = (c) => (format === "team" ? c.team : c.cart);
    const has = (c) => groupOf(c) != null && String(groupOf(c)).trim() !== "";

    const say = (detail) => {
      cards.forEach((card, i) => {
        results[i].contests.skins = { strokes: 0, detail: detail(card, i), live: false };
      });
      return null;
    };

    if (format == null) {
      const n = cards.filter((c, i) => complete(i)).length;
      return say(() => "no skins under " + (config.minPlayers == null ? 8 : config.minPlayers) +
                       " players (" + n + " finished)");
    }

    const entered = [];
    cards.forEach((c, i) => { if (has(c) && complete(i)) entered.push({ card: c, group: groupOf(c) }); });
    if (entered.length === 0) {
      return say(() => (format === "team" ? "no teams entered" : "no carts entered"));
    }

    // One group is nobody to play against: uncontested it wins every hole by
    // default and takes all eighteen for going round on its own.
    const distinct = new Set(entered.map((e) => String(e.group)));
    if (distinct.size < 2) {
      return say((card, i) => !complete(i) ? "no full round"
        : !has(card) ? (format === "team" ? "no team" : "no group")
        : "only one " + (format === "team" ? "team" : "group") + " out");
    }

    const table = skinsByGroup(entered, course);
    // The pot is fixed and divided by how many skins were actually WON, so the
    // contest is worth the same every week whatever falls.
    let won = 0;
    table.skins.forEach((n) => { won += n; });
    table.format = format;
    table.groupCount = distinct.size;
    table.skinsWon = won;
    table.skinValue = skinValue(config, won);

    cards.forEach((card, i) => {
      const r = results[i];
      if (!complete(i)) {
        r.contests.skins = { strokes: 0, detail: "no full round", live: false };
        return;
      }
      if (!has(card)) {
        r.contests.skins = { strokes: 0, live: false,
          detail: format === "team" ? "no team" : "no group" };
        return;
      }
      const count = table.skins.get(String(groupOf(card))) || 0;
      const strokes = skinStrokes(count, config, won);
      r.contests.skins = {
        strokes, live: true,
        detail: count + " skin" + (count === 1 ? "" : "s") + " for " +
                // "team Team 2" reads badly, and a man who called his team
                // "Team 2" on Setup is not doing anything wrong.
                (new RegExp("^" + (format === "team" ? "team" : "group") + "\\b", "i")
                   .test(String(groupOf(card)).trim())
                  ? String(groupOf(card)).trim()
                  : (format === "team" ? "team " : "group ") + groupOf(card)),
      };
      r.skins = count;
      r.strokesEarned = toTenth(r.strokesEarned + strokes);
      // Zero base: the final IS the contest total.
      r.final = r.strokesEarned;
    });
    return table;
  }

  /**
   * The `want` players nearest a man's own index — half below and half above
   * where the field allows it, and the nearest either way where it does not.
   *
   * A SHORT FIELD GETS EVERYBODY. Eight men means seven others, and seven is
   * what he is offered: the list is capped at `want`, never padded to it, and
   * never truncated to the four-a-side it aims for. The man at the very top of
   * the field and the man at the very bottom get a full list too, taken
   * entirely from the one side that has anyone on it.
   *
   * `others` is [{ index }, ...] with the man himself already removed. Returned
   * in INDEX ORDER, best player first, so the choice reads as a ladder.
   */
  function nearestByIndex(mine, others, want) {
    const n = want == null ? 8 : want;
    if (mine == null) return [];
    const usable = others.filter((o) => o && o.index != null);
    const below = usable.filter((o) => o.index < mine).sort((a, b) => b.index - a.index);
    const above = usable.filter((o) => o.index >= mine).sort((a, b) => a.index - b.index);
    const half = Math.floor(n / 2);
    const take = [];
    while (take.length < n && (below.length || above.length)) {
      const wantBelow = take.filter((o) => o.index < mine).length < half && below.length;
      const wantAbove = take.filter((o) => o.index >= mine).length < half && above.length;
      if (wantBelow) take.push(below.shift());
      else if (wantAbove) take.push(above.shift());
      else if (below.length) take.push(below.shift());
      else take.push(above.shift());
    }
    return take.sort((a, b) => a.index - b.index);
  }

  /** Kept under its old name — the app and the tests both call it. */
  function applyCartSkins(cards, results, course, contests) {
    return applySkins(cards, results, course, contests);
  }

  /**
   * Hit List — settled field-wide, because it needs the opponent's card and
   * `scorePlayer` only ever sees one.
   *
   * Each man named one opponent before the round and backed himself to post the
   * better 18-hole net. Priced by the opponent's BAND, because the choice is
   * not a coin flip: backing yourself against a higher index wins 54% of the
   * time and against a lower index only 39%, so a flat price would make picking
   * the weakest man on the list the only sane move.
   *
   * VOID AT ZERO if either card is short. Settled on capped net, the same
   * figure the board is built on.
   */
  function applyHitList(cards, results, contests) {
    const config = contests.hitList;
    if (!config) return;

    const byName = new Map();
    cards.forEach((c, i) => { if (c.name != null) byName.set(String(c.name), i); });

    cards.forEach((card, i) => {
      const r = results[i];
      const target = card.hitList == null ? "" : String(card.hitList).trim();
      if (target === "") {
        r.contests.hitList = { strokes: 0, detail: "nobody named", live: false };
        return;
      }
      const j = byName.has(target) ? byName.get(target) : -1;
      if (j === -1 || j === i) {
        r.contests.hitList = { strokes: 0, live: false,
          detail: j === i ? "named himself" : "“" + target + "” is not in this round" };
        return;
      }
      const mine = results[i], theirs = results[j];
      if (mine.holesPlayed !== HOLES || theirs.holesPlayed !== HOLES) {
        r.contests.hitList = { strokes: 0, live: false,
          detail: mine.holesPlayed !== HOLES ? "no full round"
                : target + " has no full round — void" };
        return;
      }

      // Lower index is the better player. With no index to compare, the two are
      // treated as equals rather than guessed at.
      const a = card.handicapIndex, b = cards[j].handicapIndex;
      const band = (a == null || b == null) ? "equal"
        : Math.abs(a - b) <= (config.equalBand == null ? 1.0 : config.equalBand) ? "equal"
        : b < a ? "lower" : "higher";
      const rates = config[band] || config.equal;

      const result = mine.net < theirs.net ? "win" : mine.net > theirs.net ? "loss" : "tie";
      const said = { lower: "a lower handicap", equal: "an equal handicap", higher: "a higher handicap" };
      r.contests.hitList = {
        strokes: toTenth(rates[result]), live: true,
        detail: (result === "win" ? "beat " : result === "loss" ? "lost to " : "tied ") +
                target + " · " + said[band],
      };
      r.strokesEarned = toTenth(r.strokesEarned + rates[result]);
      if (r.holesPlayed === HOLES) r.final = r.strokesEarned;
    });
  }

  /* ---- Section 11 round: the leaderboard's initial data (31 July) ---- */
  const SAMPLE_ROUND = [
    { name: "Alex",  courseHandicap: 18, handicapIndex: 18.0, cart: "1", hitList: "Boyd",
      picks: { p4f: 2, p4b: 14, p3a: 3, p3b: 8, p5a: 7, p5b: 16 }, gross: [5,5,3,6,5,5,6,3,5,7,5,5,4,4,6,6,3,7] },
    { name: "Boyd",  courseHandicap: 21, handicapIndex: 21.0, cart: "1", hitList: "Alex",
      picks: { p4f: 1, p4b: 10, p3a: 3, p3b: 17, p5a: 7, p5b: 18 }, gross: [6,5,4,7,6,5,7,4,5,6,6,5,4,5,7,4,4,6] },
    { name: "Chip",  courseHandicap: 15, handicapIndex: 15.0, cart: "2", hitList: "Dex",
      picks: { p4f: 9, p4b: 15, p3a: 8, p3b: 17, p5a: 16, p5b: 18 }, gross: [6,5,4,8,6,5,5,4,5,5,6,3,5,6,6,5,4,6] },
    { name: "Dex",   courseHandicap: 23, handicapIndex: 23.0, cart: "2", hitList: "Chip",
      picks: { p4f: 1, p4b: 10, p3a: 3, p3b: 8, p5a: 7, p5b: 16 }, gross: [5,5,4,6,6,6,7,3,5,4,4,6,3,6,6,6,6,5] },
    { name: "Emmet", courseHandicap: 14, handicapIndex: 14.0, cart: "3", hitList: "Finn",
      picks: { p4f: 2, p4b: 14, p3a: 3, p3b: 17, p5a: 7, p5b: 16 }, gross: [6,5,3,7,7,6,5,3,5,4,5,5,3,5,6,7,3,6] },
    { name: "Finn",  courseHandicap: 26, handicapIndex: 26.0, cart: "3", hitList: "Emmet",
      picks: { p4f: 9, p4b: 15, p3a: 3, p3b: 8, p5a: 7, p5b: 16 }, gross: [5,6,6,7,5,4,7,4,7,6,7,5,3,5,5,6,4,7] },
    { name: "Grady", courseHandicap: 34, handicapIndex: 34.0, cart: "4", hitList: "Hoyt",
      picks: { p4f: 1, p4b: 10, p3a: 3, p3b: 8, p5a: 7, p5b: 16 }, gross: [7,6,4,9,7,7,7,5,5,6,7,7,3,8,6,7,3,9] },
    { name: "Hoyt",  courseHandicap: 20, handicapIndex: 20.0, cart: "4", hitList: "Grady",
      picks: { p4f: 2, p4b: 14, p3a: 8, p3b: 17, p5a: 7, p5b: 18 }, gross: [7,5,4,8,8,4,8,4,6,5,6,7,4,7,5,5,4,6] },
  ];

  const api = {
    ABERDEEN_TEE_IV, ABERDEEN_TEES, TEE_IDS, GENDERS, DEFAULT_CONTESTS, SAMPLE_ROUND,
    courseForTee, courseFor, grossFromNet,
    parseHandicapIndex, formatHandicapIndex,
    PICKED_UP_OVER_PAR, NET_DOUBLE_OVER_PAR, isPickedUp, grossOnHole, netForHole,
    skinsByGroup, cartSkins, teamSkins, skinStrokes, skinValue, skinsFormat, bestTwo,
    applySkins, applyHitList, nearestByIndex, matchOfCards, CARD_MATCH,
    courseHandicap, fullCourseHandicap, FULL_ALLOWANCE,
    resolveCourseHandicap, strokesOnHole, netOnHole, cappedNetByHole,
    birdiePickHoles, birdiePickCandidates, PICK_SLOTS, LEGACY_SLOT_KEYS,
    migratePicks, readPicks, randomPicks,
    mergeContests, diffContests, checkContests,
    scorePlayer, scoreField, computeLeaderboard,
    computeFlights, flightOf, flightsInUse, sortFlights,
  };
  globalThis.ClubhouseEngine = api;
})();
