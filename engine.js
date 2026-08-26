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
      // Easy Street's three holes. The contest is switched off, but the stretch
      // is still a fact about this course and the ladder still reads it if it
      // is ever switched back on, so the holes stay where they always were.
      easyStreetHoles: [11, 12, 13],
      // Holes that may not be nominated for Watch the Birdie, whatever their
      // par. Kept beside the course rather than in the contest because it is
      // the COURSE that says which holes are already spoken for.
      //
      // ONLY AGONY ALLEY'S THREE ARE BARRED NOW. Easy Street is out of the
      // game, so 11, 12 and 13 come back to Watch the Birdie — which is what
      // makes the par 4 slot eight holes deep and hole 13 a legal par 3.
      //
      // 4 AND 5 ARE NOT REALLY A LOSS. Rob's reason for barring the stretch
      // rather than sharing it: no man at Aberdeen would nominate 4 or 5 in any
      // case, so offering them offers nothing. Twelve of the eighteen are now
      // in play — Agony Alley's three and the nine a man picks.
      barredPicks: [4, 5, 6],
    };
  }

  /** The reference course of sections 9 and 11: men's Tee IV. */
  const ABERDEEN_TEE_IV = courseForTee("IV", "M");

  /**
   * Resolve the course to score a card against. A field can be spread over
   * several tees and both stroke indexes, so `course` may be:
   *   · omitted    — take the card's own `tee`/`gender`, else men's Tee IV
   *   · a config   — score everyone against that one course (the old behavior)
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
     * Watch the Birdie — NINE holes nominated before the round, settled one by
     * one. A net eagle pays 1.5, a net birdie 0.5, and a hole pays one of them,
     * never both.
     *
     * `blank` is the contest's only penalty side: a man who makes no net birdie
     * or better on ANY of his nine pays half a stroke. Without it the contest
     * could only ever help, which made nominating holes free.
     *
     * THE VALUES DID NOT MOVE WHEN THE PICKS WENT FROM SIX TO NINE, and that
     * was tested rather than assumed. Birdie at −0.4 with a +0.8 blank repeats
     * the net score at +0.58; these values come in at +0.48, which keeps this
     * the most independent contest in the game. At nine picks it fires on 86%
     * of rounds against 74% at six.
     *
     * NOTHING IS PAID FOR A NET PAR. Also tested: paying 0.2 for one takes the
     * repetition of the net score from +0.51 to +0.73. Net pars are common —
     * four a round across nine picks — so counting them comes close to counting
     * how well a man played, which is the net score's job and not this one's.
     *
     * THE DOUBLING ON 4 AND 18 IS GONE. It was printed on the card and changed
     * nobody's behavior — 8 of 10 still took hole 7 and 9 of 10 still took 16
     * — so it was paying extra for choices men were making anyway. Hole 4 is
     * not a candidate at all now; it belongs to Agony Alley.
     */
    watchTheBirdie: { birdie: -0.5, eagle: -1.5, blank: 0.5 },
    /**
     * Six Pack — SWITCHED OFF, the same way Go Long and Get Shorty are off. The
     * code stays; the contest is not in the game.
     *
     * IT WAS REPEATING THE NET SCORE more than any other contest in the game:
     * +0.69 measured over 135 rounds, against +0.48 for Watch the Birdie. That
     * is what cutting to four is for — Friday's eight contests put seven men in
     * 90% the same order as the Stableford result, and dropping to four takes
     * the agreement with the net order from 89% to 80%.
     *
     * THE ARITHMETIC STILL HOLDS if it is ever switched back on, which is why
     * `SIX_PACK_PAR` below is still 24. Fifteen candidate holes less the nine a
     * man picks leaves one par 5, one par 3 and four par 4s — par 24, for every
     * player, every round, exactly as it was when twelve candidates left six.
     */
    sixPack: null,
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
     * Easy Street — SWITCHED OFF, the same way Six Pack is off. The ladder is
     * kept in `PARKED_CONTESTS` below, at the values it was last played on.
     *
     * It repeated the net score at +0.38 — the least of the four that were cut,
     * but its three holes are worth more back in Watch the Birdie than they
     * were as a contest of their own. Barring 11, 12 and 13 was what forced the
     * par 4 slots down to six holes; giving them back is what makes the par 4
     * slot eight deep and the par 3 slot four, and every slot a real choice.
     */
    easyStreet: null,
    /**
     * Triple Threat — OFF BY DEFAULT, BUT SWITCHABLE. It is not cut the way Six
     * Pack and Easy Street are cut: Rob wants it kept for testing later in the
     * year rather than deleted, so it keeps its section on the rules screen and
     * its values live in `PARKED_CONTESTS` below, ready for the switch.
     *
     * It repeated the net score at +0.67, second only to Six Pack.
     *
     * A blow-up hole costs 0.5, and a BOUNCE BACK off it — a net par or better
     * on the very next hole — pays 1.0.
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
    tripleThreat: null,
    /**
     * Bounce Back — a net par or better on the hole immediately after a blow-up.
     * OFF BY DEFAULT AND SWITCHABLE, on the same terms as Triple Threat.
     *
     * Its own contest, with its own switch, after a spell as the second half of
     * Triple Threat. The scoring link is unchanged and always was the point of
     * it: it fires on the NEXT hole and nowhere else.
     */
    bounceBack: null,
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
      /**
       * How many opponents a man is offered — three above and three below where
       * the field allows it. Eight to start with, six since: eight was most of
       * a ten-man field, which made it a list rather than a choice.
       *
       * A VALUE, not a constant, because it is the sort of thing that wants
       * changing after a few Saturdays and should never need a code change.
       */
      offer: 6,
      /**
       * Whether a man who never replies gets an opponent drawn for him. OFF, and
       * meant to stay off.
       *
       * Draw missing PICKS is a different matter: choosing holes affects nobody
       * else. Naming an opponent puts another man in it, and a drawn opponent
       * would collect the reward for a gamble the player never took. The Hit
       * List is the one contest a man has to enter — if it works when he ignores
       * it, he learns he never needs to reply.
       */
      drawMissing: false,
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
    /**
     * The minigame boards — how far down each contest's own table is shown.
     *
     * NOT A CONTEST, which is why it is not in CONTEST_ORDER and never appears
     * as a line on a card. It is here because this is where the rules of a
     * round live, and it travels with the event for the same reason every value
     * does: the board a man is shown in the bar should be the board the round
     * was played under.
     *
     * FIVE MEANS SOMETHING DIFFERENT AT EIGHT PLAYERS THAN AT EIGHTY, which is
     * the whole reason it is a value rather than a constant.
     *
     * The depth is a FLOOR, never a ceiling: every man level with the last man
     * shown is shown too, so a table can run to six or nine and say so. Cutting
     * a tie off at five looks broken, and ties are common — 2.5 men share the
     * top of Agony Alley on an average round, 2.8 in the Hit List and 4.3 in
     * Team Skins.
     */
    boards: { depth: 5 },
  };

  /**
   * The values a switched-off contest comes back on at.
   *
   * Switching one on restores it from DEFAULT_CONTESTS, and for a contest whose
   * default IS null that would restore nothing and leave the switch doing
   * nothing at all. These are the values each was last played on, kept exactly
   * as they were so that turning Triple Threat on in November scores the same
   * round it would have scored in August.
   *
   * Six Pack and Easy Street are in here too. They have no switch on the rules
   * screen — they are off the way Go Long and Get Shorty are off — but a round
   * that arrives carrying them in its own rules must still score, and the code
   * is left in place for the day either comes back.
   */
  const PARKED_CONTESTS = {
    sixPack: { par: 24 },
    easyStreet: [
      { threshold: 0, strokes: 2 }, { threshold: 1, strokes: 1 },
      { threshold: 2, strokes: 0 }, { threshold: 99, strokes: -1 },
    ],
    tripleThreat: { perTriple: 0.5 },
    bounceBack: { perBounceBack: -1.0 },
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
   * decimal separator and normalized, because a phone keypad in some locales
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
   * The NINE slots a player nominates for Watch the Birdie: two par 5s, three
   * par 3s and four par 4s. Always in this order — the paste reads nine bare
   * numbers and has nothing else to go on.
   *
   * TWO OF THREE, THREE OF FOUR, FOUR OF EIGHT. Every slot is a real choice,
   * which the shape before this was not: an earlier draft proposed three of
   * each, and at Aberdeen that forces the par 3 and par 5 slots outright and
   * leaves one genuine decision in the round. As it stands there are 840
   * possible sets.
   *
   * FRONT AND BACK NO LONGER MATTER TO ANY SLOT. `nine: null` throughout means
   * a hole is offered wherever it lies. The par 4s were split front and back
   * when six of them remained, three a side; with Easy Street's holes back
   * there are eight, and dividing them again would only take choices away.
   *
   * THE KEYS ARE HISTORICAL AND STAY THAT WAY. `p4f` and `p4b` were the front
   * and back par 4 and are now simply the first and second — the label moved,
   * the key did not. That is deliberate: a hole stored as `p4f` under the old
   * rules was a par 4 and is still a legal par 4, so every round already on a
   * phone and every event code already messaged to somebody reads correctly
   * here with no migration at all. The three new slots are appended.
   */
  const PICK_SLOTS = [
    { key: "p5a", par: 5, nine: null, label: "first par 5" },
    { key: "p5b", par: 5, nine: null, label: "second par 5" },
    { key: "p3a", par: 3, nine: null, label: "first par 3" },
    { key: "p3b", par: 3, nine: null, label: "second par 3" },
    { key: "p3c", par: 3, nine: null, label: "third par 3" },
    { key: "p4f", par: 4, nine: null, label: "first par 4" },
    { key: "p4b", par: 4, nine: null, label: "second par 4" },
    { key: "p4c", par: 4, nine: null, label: "third par 4" },
    { key: "p4d", par: 4, nine: null, label: "fourth par 4" },
  ];

  /** How many holes each par is nominated on — the 2-3-4 of the brief. */
  const PICKS_BY_PAR = { 5: 2, 3: 3, 4: 4 };

  /** The slot keys as they were before the par 3s and par 5s floated. */
  const LEGACY_SLOT_KEYS = { f4: "p4f", b4: "p4b", f3: "p3a", b3: "p3b", f5: "p5a", b5: "p5b" };

  /**
   * Which holes each slot allows. Derived from the course's par and its barred
   * list, never hardcoded — at Aberdeen that gives 7/16/18 to both par 5 slots,
   * 3/8/13/17 to all three par 3 slots and 1/2/9/10/11/12/14/15 to all four par
   * 4 slots. Two of three, three of four, four of eight.
   *
   * EVERY SLOT OF A PAR IS HANDED THE IDENTICAL LIST, so no hole falls in one
   * slot alone. It used to be true that every hole fell in at most one slot,
   * which is why nominating a hole twice was ALSO illegal for one of the two
   * slots and either check would have caught it. That has not been so since the
   * par 3s floated: hole 8 is perfectly legal as any of the three par 3s, and
   * only the duplicate check stops a man nominating it twice and being paid
   * twice for one birdie. The duplicate pass in `readPicks` runs first and is
   * the ONLY thing standing there.
   */
  function birdiePickHoles(course, contests) {
    /* THE BARRED LIST IS A GAME RULE WEARING COURSE CLOTHING. It sits on the
       course because it is the course that says which holes are spoken for —
       but which contests own which holes is exactly the sort of thing the
       organizer now adjusts, so a contest value overrides it when there is one.
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
   * Every hole Watch the Birdie may be played on — the union of the nine slots,
   * which at Aberdeen is the fifteen left once Agony Alley has taken its three.
   * Nine are nominated; the six left over are the Six Pack, which is switched
   * off but still adds to par 24 if it is ever switched back on.
   */
  function birdiePickCandidates(course, contests) {
    const legal = birdiePickHoles(course, contests);
    const seen = new Set();
    for (const slot of PICK_SLOTS) for (const h of legal[slot.key]) seen.add(h);
    return Array.from(seen).sort((a, b) => a - b);
  }

  /**
   * Nine legal holes drawn at random, one for every slot.
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
    // Drawn WITHOUT REPLACEMENT. Every slot of a par is offered the identical
    // list, so drawing each slot on its own put hole 8 in two par 3 slots about
    // a third of the time — a set no man could have chosen, which `readPicks`
    // would then refuse as a duplicate. With four par 4s drawn from eight
    // holes there is more of this to go wrong, not less.
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
   * The nine named slots are what the app stores now, and SIX OF THE NINE KEYS
   * ARE THE OLD ONES — a round stored under the six-pick rules is already in
   * the new shape and needs no migration at all. It simply arrives with the
   * three new slots empty, which scores as six picks and says so.
   *
   * `{ front, back }` is the two-pick form that came before, kept readable so a
   * round already on a phone — or in an event code already messaged to someone
   * — still opens. Those two were always par 4s, so they map to par 4 slots.
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
   * The nine picks as holes, refusing anything outside the table. `legacy` marks
   * picks read from the old two-pick form, whose out-of-table holes are dropped
   * rather than thrown on.
   */
  function readPicks(picks, course, who, opts) {
    /* `drop` is for SCORING, where refusing is the wrong answer.
       A man picks hole 8, the organizer later bars it, and his round must not
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

     What is stored is a DIFF, not a copy. A full config is 648 characters of
     JSON and would add 860 to an event code; one changed contest adds 40.
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

    /* Barred holes.
       CHECKED BY PAR, NOT BY SLOT, and that is the change nine picks forced.
       Every slot of a par is handed the identical list, so the question is
       never "has this slot got two holes" — it is whether the par has more
       holes than it has picks. Three par 3s drawn from three holes leaves every
       slot with three to choose from and the man with no choice at all: he
       nominates all of them or he is short. The old per-slot rule passed that
       without a word. */
    const w = full.watchTheBirdie;
    if (w && w.barred) {
      for (const h of w.barred) {
        if (!(Number.isInteger(h) && h >= 1 && h <= HOLES)) {
          problems.push("Hole " + h + " is not a hole — they run 1 to 18.");
        }
      }
      if (!problems.length) {
        const legal = birdiePickHoles(c, full);
        const said = { 3: "par 3", 4: "par 4", 5: "par 5" };
        const byPar = new Map();
        for (const slot of PICK_SLOTS) {
          if (!byPar.has(slot.par)) byPar.set(slot.par, { picks: 0, holes: legal[slot.key] });
          byPar.get(slot.par).picks++;
        }
        for (const [par, group] of byPar) {
          const n = group.holes.length, want = group.picks;
          const name = said[par] || ("par " + par);
          if (n < want) {
            problems.push("The " + name + "s would have " +
              (n === 0 ? "no holes" : n === 1 ? "only hole " + group.holes[0] : "only " + n + " holes") +
              " left, and " + want + " must be nominated. There would be nothing to fill them with.");
          } else if (n === want) {
            problems.push("The " + name + "s would have exactly " + n + " holes for " + want +
              " picks, so every man nominates the same ones. That is not a choice — leave at " +
              "least one more hole than there are picks.");
          }
        }
      }
    }

    /* How far down each minigame board runs. Zero shows nobody, and a negative
       depth is not a number of men. */
    if (full.boards && full.boards.depth != null) {
      const d = full.boards.depth;
      if (!Number.isInteger(d) || d < 1) {
        problems.push("A minigame board must show at least one man — " + d + " shows nobody.");
      }
    }

    /* HOW MANY OPPONENTS. Fewer than two is not a choice, and more than the
       field can supply simply offers everybody — which is fine, but a figure
       below two would leave a man with one name and call it a decision. */
    if (full.hitList && full.hitList.offer != null) {
      const n = full.hitList.offer;
      if (!Number.isInteger(n) || n < 2) {
        problems.push("The Hit List must offer at least two opponents — one name is not a choice.");
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

    // 1 · Watch the Birdie — nine holes nominated before the round, two par 5s,
    // three par 3s and four par 4s. Each is settled on its own: a net birdie
    // pays 0.5, a net eagle 1.5, and the hole pays one of them, never both.
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

    if (contests.watchTheBirdie == null) {
      // Switchable off like the rest. Same latent crash Agony Alley had: with
      // no config, pickValue reached into null on the first nominated hole.
      watchTheBirdie = null;
    } else if (chosen.length === 0) {
      watchTheBirdie = { strokes: 0, detail: "no picks made", live: false,
        birdies: 0, eagles: 0 };
    } else {
      /* BIRDIES AND EAGLES ARE COUNTED SEPARATELY, not just totted up into the
         strokes. The board's tiebreak is most net birdies and then the eagle,
         and the strokes alone cannot answer it: three birdies and one eagle
         both come to −1.5. `paid` — how many picks paid anything at all — is
         what the detail line says, and is not the same number. */
      let birdieStrokes = 0, paid = 0, birdies = 0, eagles = 0;
      for (const h of chosen) {
        if (!played(h - 1)) continue;
        const value = pickValue(h, contests.watchTheBirdie, over(h - 1));
        if (value !== 0) { birdieStrokes += value; paid++; }
        if (over(h - 1) <= -2) eagles++;
        else if (over(h - 1) === -1) birdies++;
      }
      // The penalty side, and the contest's only one: nothing on any of the
      // nine costs half a stroke. Charged only once every pick has been PLAYED
      // — a man cannot be charged for failing to birdie a hole he never stood
      // on. NOTHING IS PAID FOR A NET PAR; four a round is close to counting
      // how well he played, which is the net score's job and not this one's.
      const allPlayed = chosen.every((h) => played(h - 1));
      const blank = contests.watchTheBirdie.blank || 0;
      if (paid === 0 && allPlayed && blank !== 0) birdieStrokes += blank;
      watchTheBirdie = {
        strokes: toTenth(birdieStrokes),
        detail: paid === 0
          ? (allPlayed ? "no net birdies" : "nothing yet")
          // Counted, not assumed to be nine. A pick on a hole barred after he
          // chose it is dropped, so a man can arrive here with eight — and a
          // round stored under the old rules arrives with six.
          : paid + " of " + chosen.length + " pick" + (chosen.length === 1 ? "" : "s"),
        live: true, birdies, eagles,
      };
    }

    // 2 · Six Pack — the candidates he did NOT nominate. SWITCHED OFF; this
    // runs only for a round that carries it in its own rules.
    //
    // The slot structure forces their shape, so this is always four par 4s, one
    // par 3 and one par 5: par 24, for every man, every round. Fifteen
    // candidates less the nine he picks leaves six, exactly as twelve less six
    // did. Scored as raw net strokes over or under that 24 — no ladder, no
    // threshold.
    //
    // Needs EVERY pick, because without them there is no "did not choose", and
    // needs every leftover played, because a missing hole would silently
    // flatter the total by the whole of its par.
    //
    // THE COUNT IS DERIVED, NOT THE NUMBER OF SLOTS. It was `PICK_SLOTS.length`
    // on both sides, which was only ever true because six picks happened to
    // leave six holes. At nine picks the leftovers are six and the slots are
    // nine, and the old test could never pass again.
    const candidates = birdiePickCandidates(course, contests);
    const leftovers = candidates.filter((h) => chosen.indexOf(h) === -1);
    const leftoverCount = candidates.length - PICK_SLOTS.length;
    if (contests.sixPack == null) {
      sixPack = null;
    } else if (chosen.length !== PICK_SLOTS.length || leftovers.length !== leftoverCount) {
      sixPack = { strokes: 0, live: false,
        detail: chosen.length === 0 ? "no picks made"
              : "needs all " + PICK_SLOTS.length + " picks" };
    } else if (!leftovers.every((h) => played(h - 1))) {
      sixPack = { strokes: 0, live: false,
        detail: "needs all " + leftoverCount + " left played" };
    } else {
      const total = sum(leftovers.map((h) => net[h - 1]));
      const par = contests.sixPack.par;
      sixPack = { strokes: toTenth(total - par),
        detail: "net " + total + " on the " + leftoverCount + " left, par " + par, live: true };
    }

    // 3 · Agony Alley — the net total on the stretch. Values unchanged; it is
    // one of the four that stay.
    //
    // `netHoles` carries the stretch hole by hole, in the order the holes are
    // played, because the board's tiebreak is the best net on hole 4, then 5,
    // then 6. The figures are on `netByHole` as well, but a board that had to
    // reach into the card to settle its own tie would be reading the round
    // twice and could disagree with itself about which holes the stretch is.
    const agonyIdx = course.agonyHoles.map((h) => h - 1);
    let agonyAlley;
    if (contests.agonyAlley == null) {
      /* SWITCHABLE OFF LIKE EVERY OTHER CONTEST. It never had this guard,
         because it was never off — but the rules screen has always offered the
         switch, and turning it off threw "ladder is not iterable" out of the
         grader and took the whole board down with it. Found by the test below
         rather than by a man on a Saturday. */
      agonyAlley = null;
    } else if (!agonyIdx.every(played)) {
      agonyAlley = { strokes: 0, detail: "needs holes " + course.agonyHoles[0] + "–" + course.agonyHoles[course.agonyHoles.length - 1], live: false,
        holes: course.agonyHoles.slice(), netHoles: null };
    } else {
      const total = sum(agonyIdx.map((i) => net[i]));
      agonyAlley = { strokes: gradeAtMost(total, contests.agonyAlley), detail: "net " + total + " across the stretch", live: true,
        holes: course.agonyHoles.slice(), netHoles: agonyIdx.map((i) => net[i]) };
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
      /* The INDEX, not just the course handicap. The Hit List board is tied on
         "the higher handicap index wins", and the course handicap is not a
         stand-in for it: two men off different tees can share a course
         handicap and be a stroke and a half apart on index. Null when the
         handicap came in off a Golf Genius card with no index beside it. */
      handicapIndex: card.handicapIndex == null ? null : card.handicapIndex,
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
      return String(a).localeCompare(String(b), "en-US", { numeric: true, sensitivity: "base" });
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
  /**
   * SKINS, SETTLED ONCE. Everything any screen needs to know about how the
   * contest fell: the format, whether it ran at all and why not, who is in
   * which group, the hole-by-hole table, and what a skin was worth.
   *
   * THIS EXISTS BECAUSE THERE WERE TWO OF IT. The leaderboard settled Skins
   * here, across the whole field; the Skins tab settled it again in the page,
   * inside the current FLIGHT and without excluding men who never finished.
   * The two disagreed in ordinary rounds — ten men in two flights of five had
   * the board paying every man a skin while the tab said there were no skins at
   * all, because five is under the minimum. A screen that recomputes a rule is
   * a second opinion, and the man reading it cannot tell which one paid him.
   *
   * `results` is optional. Given, it is used for `holesPlayed`; without it the
   * cards are scored here, so a screen can ask this question on its own.
   */
  function skinsSettlement(cards, course, contests, results) {
    contests = contests || DEFAULT_CONTESTS;
    const config = contests.skins;
    const scored = results || cards.map((c) => scorePlayer(c, course, contests));

    // EIGHTEEN HOLES OR YOU ARE NOT IN IT. A man who did not finish plays no
    // part in his group's best two, because a card that stops at the twelfth
    // would otherwise win holes 1-12 for his group and then abandon it.
    const complete = (i) => scored[i].holesPlayed === HOLES;
    const finished = cards.filter((c, i) => complete(i)).length;

    if (!config) {
      return { on: false, reason: "off", format: null, config: null,
               fieldSize: cards.length, finished,
               groups: [], left: [], table: null, skinsWon: 0, skinValue: 0 };
    }

    // THE FORMAT IS SET BY THE FIELD THAT TEED OFF, not by who came back.
    // Counted on finishers, one man walking in off an eight-man field took the
    // count to seven and canceled skins for everybody — a contest decided
    // retrospectively by somebody else's bad back. The club knows whether it is
    // playing carts or teams before anyone hits a ball, and so does this.
    const format = skinsFormat(cards.length, config);
    const groupOf = (c) => (format === "team" ? c.team : c.cart);
    const has = (c) => groupOf(c) != null && String(groupOf(c)).trim() !== "";

    /* Who is NOT in it, and why — so a screen can say so rather than quietly
       showing a group one man short of the one the organizer set up. */
    const left = [];
    const entered = [];
    cards.forEach((c, i) => {
      if (!complete(i)) { left.push({ name: c.name, why: "no full round" }); return; }
      if (!has(c)) { left.push({ name: c.name, why: format === "team" ? "no team" : "no group" }); return; }
      entered.push({ card: c, group: groupOf(c) });
    });

    const base = { on: true, format, config, fieldSize: cards.length, finished, left,
                   groups: [], table: null, skinsWon: 0, skinValue: 0 };

    if (format == null) return Object.assign(base, { reason: "tooFew" });
    if (entered.length === 0) return Object.assign(base, { reason: "noneEntered" });

    // One group is nobody to play against: uncontested it wins every hole by
    // default and takes all eighteen for going round on its own.
    const distinct = new Set(entered.map((e) => String(e.group)));
    if (distinct.size < 2) {
      return Object.assign(base, { reason: "oneGroup",
        groups: [...distinct].map((id) => ({ id, count: 0, strokes: 0,
          members: entered.filter((e) => String(e.group) === id).map((e) => e.card.name) })) });
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

    const groups = [...distinct].sort((a, b) =>
      (table.skins.get(b) || 0) - (table.skins.get(a) || 0) ||
      (Number(a) || 0) - (Number(b) || 0) || String(a).localeCompare(String(b), "en-US")
    ).map((id) => ({
      id,
      count: table.skins.get(id) || 0,
      strokes: skinStrokes(table.skins.get(id) || 0, config, won),
      members: entered.filter((e) => String(e.group) === id).map((e) => e.card.name),
    }));

    return Object.assign(base, { reason: null, table, groups,
                                 skinsWon: won, skinValue: table.skinValue });
  }

  /** Write the settlement onto each man's card. The rule lives above. */
  function applySkins(cards, results, course, contests) {
    const config = contests.skins;
    if (!config) return null;

    const settled = skinsSettlement(cards, course, contests, results);
    const { format } = settled;
    const complete = (i) => results[i].holesPlayed === HOLES;
    const groupOf = (c) => (format === "team" ? c.team : c.cart);
    const has = (c) => groupOf(c) != null && String(groupOf(c)).trim() !== "";

    const say = (detail) => {
      cards.forEach((card, i) => {
        results[i].contests.skins = { strokes: 0, detail: detail(card, i), live: false };
      });
      return null;
    };

    if (settled.reason === "tooFew") {
      return say(() => "no skins under " + (config.minPlayers == null ? 8 : config.minPlayers) +
                       " players (" + settled.finished + " finished)");
    }
    if (settled.reason === "noneEntered") {
      return say(() => (format === "team" ? "no teams entered" : "no carts entered"));
    }
    if (settled.reason === "oneGroup") {
      return say((card, i) => !complete(i) ? "no full round"
        : !has(card) ? (format === "team" ? "no team" : "no group")
        : "only one " + (format === "team" ? "team" : "group") + " out");
    }

    const table = settled.table;
    const won = settled.skinsWon;

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
      /* THE DUEL TRAVELS AS DATA, not only as a sentence.
         `opponent`, `outcome` and `margin` are here for the Hit List results
         table, which names both men and the margin — "Wallach beat Teitelbaum
         by 4". Parsing that back out of `detail` would have been one regular
         expression away from naming the wrong man, and `detail` is written to
         be read rather than to be read FROM. A duel that never happened
         carries an outcome all the same, so the table can say why. */
      const duel = (fields) => Object.assign(
        { opponent: null, outcome: null, margin: null, band: null }, fields);

      const target = card.hitList == null ? "" : String(card.hitList).trim();
      if (target === "") {
        r.contests.hitList = duel({ strokes: 0, detail: "nobody named", live: false,
          outcome: "none" });
        return;
      }
      const j = byName.has(target) ? byName.get(target) : -1;
      if (j === -1 || j === i) {
        r.contests.hitList = duel({ strokes: 0, live: false, opponent: target,
          outcome: j === i ? "self" : "unknown",
          detail: j === i ? "named himself" : "“" + target + "” is not in this round" });
        return;
      }
      const mine = results[i], theirs = results[j];
      if (mine.holesPlayed !== HOLES || theirs.holesPlayed !== HOLES) {
        r.contests.hitList = duel({ strokes: 0, live: false, opponent: target,
          // WHOSE card is short decides what the table says. "Void" is the
          // named man's doing and reads as an excuse when it was the player
          // himself who walked in.
          outcome: mine.holesPlayed !== HOLES ? "unfinished" : "void",
          detail: mine.holesPlayed !== HOLES ? "no full round"
                : target + " has no full round — void" });
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
      r.contests.hitList = duel({
        strokes: toTenth(rates[result]), live: true,
        opponent: target, outcome: result, band: band,
        // ALWAYS POSITIVE, and zero on a tie. It is the size of the gap, and
        // which way it went is `outcome`'s to say — a signed margin would print
        // "lost to Teitelbaum by −1" on the one table this is for.
        margin: Math.abs(mine.net - theirs.net),
        detail: (result === "win" ? "beat " : result === "loss" ? "lost to " : "tied ") +
                target + " · " + said[band],
      });
      r.strokesEarned = toTenth(r.strokesEarned + rates[result]);
      if (r.holesPlayed === HOLES) r.final = r.strokesEarned;
    });
  }

  /* ---- Section 11 round: the leaderboard's initial data (31 July) ----
     The picks were re-cut to the 2-3-4 shape when the game went to nine. The
     cards themselves are untouched — the same eight rounds, scored under the
     four contests that are left. */
  const SAMPLE_ROUND = [
    { name: "Alex",  courseHandicap: 18, handicapIndex: 18.0, cart: "1", hitList: "Boyd",
      picks: { p5a: 7, p5b: 16, p3a: 3, p3b: 8, p3c: 13, p4f: 2, p4b: 14, p4c: 9, p4d: 11 }, gross: [5,5,3,6,5,5,6,3,5,7,5,5,4,4,6,6,3,7] },
    { name: "Boyd",  courseHandicap: 21, handicapIndex: 21.0, cart: "1", hitList: "Alex",
      picks: { p5a: 7, p5b: 18, p3a: 3, p3b: 17, p3c: 13, p4f: 1, p4b: 10, p4c: 12, p4d: 15 }, gross: [6,5,4,7,6,5,7,4,5,6,6,5,4,5,7,4,4,6] },
    { name: "Chip",  courseHandicap: 15, handicapIndex: 15.0, cart: "2", hitList: "Dex",
      picks: { p5a: 16, p5b: 18, p3a: 8, p3b: 17, p3c: 3, p4f: 9, p4b: 15, p4c: 2, p4d: 11 }, gross: [6,5,4,8,6,5,5,4,5,5,6,3,5,6,6,5,4,6] },
    { name: "Dex",   courseHandicap: 23, handicapIndex: 23.0, cart: "2", hitList: "Chip",
      picks: { p5a: 7, p5b: 16, p3a: 3, p3b: 8, p3c: 17, p4f: 1, p4b: 10, p4c: 12, p4d: 14 }, gross: [5,5,4,6,6,6,7,3,5,4,4,6,3,6,6,6,6,5] },
    { name: "Emmet", courseHandicap: 14, handicapIndex: 14.0, cart: "3", hitList: "Finn",
      picks: { p5a: 7, p5b: 16, p3a: 3, p3b: 17, p3c: 13, p4f: 2, p4b: 14, p4c: 10, p4d: 11 }, gross: [6,5,3,7,7,6,5,3,5,4,5,5,3,5,6,7,3,6] },
    { name: "Finn",  courseHandicap: 26, handicapIndex: 26.0, cart: "3", hitList: "Emmet",
      picks: { p5a: 7, p5b: 16, p3a: 3, p3b: 8, p3c: 13, p4f: 9, p4b: 15, p4c: 1, p4d: 12 }, gross: [5,6,6,7,5,4,7,4,7,6,7,5,3,5,5,6,4,7] },
    { name: "Grady", courseHandicap: 34, handicapIndex: 34.0, cart: "4", hitList: "Hoyt",
      picks: { p5a: 7, p5b: 16, p3a: 3, p3b: 8, p3c: 17, p4f: 1, p4b: 10, p4c: 11, p4d: 14 }, gross: [7,6,4,9,7,7,7,5,5,6,7,7,3,8,6,7,3,9] },
    { name: "Hoyt",  courseHandicap: 20, handicapIndex: 20.0, cart: "4", hitList: "Grady",
      picks: { p5a: 7, p5b: 18, p3a: 8, p3b: 17, p3c: 13, p4f: 2, p4b: 14, p4c: 9, p4d: 15 }, gross: [7,5,4,8,8,4,8,4,6,5,6,7,4,7,5,5,4,6] },
  ];

  /* ---- The minigame boards ----
     A table of its own for each contest, so a man who finished eleventh on the
     final can still have won something and be told so. The board is what four
     contests buy: with eight of them the screen had room for the final and
     nothing else, and the contests were only ever a number in a column.

     RANKED ON THE CONTEST, NOT ON THE FINAL, and tied on the contest's own
     terms. `placeField` cannot do this — it settles the whole round on a match
     of cards, which says nothing about who played hole 4 better.  */

  /** 1st, 2nd, 3rd — for a note a man reads rather than a number he decodes. */
  function ordinal(n) {
    const t = n % 100;
    if (t >= 11 && t <= 13) return n + "th";
    return n + (["th", "st", "nd", "rd"][n % 10] || "th");
  }

  /**
   * How each contest breaks a tie, in order, best first.
   *
   * Every `of` returns a number where LOWER IS BETTER, so the comparator is the
   * same subtraction all the way down and a new tiebreak is one line. A count
   * where more is better is therefore negated at the source.
   *
   * Team Skins has none, deliberately: it is already shown hole by hole on its
   * own tab, so who won which hole is on the screen and a tie there is a real
   * one rather than an unanswered question.
   */
  const BOARD_TIEBREAKS = {
    watchTheBirdie: [
      { label: "most net birdies", of: (r, c) => -(c.birdies || 0) },
      /* AT THE DEFAULT VALUES THIS ONE CANNOT FIRE. A birdie is −0.5 and an
         eagle −1.5, so two men level on strokes and level on birdies are level
         on eagles as well — there is nothing left for it to separate. It is
         here because it is the documented order and because the values are
         adjustable: the moment an eagle is worth something other than three
         birdies, the count has to decide. */
      { label: "the eagle", of: (r, c) => -(c.eagles || 0) },
    ],
    hitList: [
      /* THE HIGHER INDEX WINS, which is the opposite of a golfer's instinct and
         is meant to be: two men who both beat their man are separated by which
         of them had less business doing it. A man with no index recorded is
         treated as the lowest, because a missing figure must not win a tie. */
      { label: "the higher index", of: (r) => (r.handicapIndex == null ? Infinity : -r.handicapIndex) },
      { label: "the bigger margin", of: (r, c) => -(c.margin || 0) },
    ],
    skins: [],
  };

  /**
   * Agony Alley is tied on the best net score on the first hole of the stretch,
   * then the second, then the third — so its tiebreaks are built from the holes
   * the round was actually played on rather than written out here. The hole
   * numbers ride on the contest result for exactly this reason.
   */
  function boardTiebreaks(key, entries) {
    if (key !== "agonyAlley") return BOARD_TIEBREAKS[key] || [];
    const withHoles = entries.find((e) => e.c && e.c.holes && e.c.holes.length);
    const holes = withHoles ? withHoles.c.holes : [];
    return holes.map((h, i) => ({
      label: "hole " + h,
      of: (r, c) => (c.netHoles && c.netHoles[i] != null ? c.netHoles[i] : Infinity),
    }));
  }

  /**
   * One contest's board.
   *
   * `depth` is a FLOOR, never a ceiling. Every man level with the last man
   * shown is shown as well, so a five-deep table runs to eight when six share
   * third — cutting a tie off at five looks broken, and ties are the norm here
   * rather than the exception.
   *
   * Only men who ACTUALLY CONTESTED IT are on it: eighteen holes played, and
   * the contest live on their card. A man who named nobody is not last in the
   * Hit List, he is not in it.
   */
  function contestBoard(results, key, opts) {
    const depth = Math.max(1, (opts && opts.depth) || 5);
    const entries = (results || [])
      .filter((r) => r.eligible && r.contests && r.contests[key] && r.contests[key].live)
      .map((r) => ({ r, c: r.contests[key] }));

    const breaks = boardTiebreaks(key, entries);
    const level = (a, b) => a.c.strokes === b.c.strokes &&
      breaks.every((t) => t.of(a.r, a.c) === t.of(b.r, b.c));

    entries.sort((a, b) => {
      if (a.c.strokes !== b.c.strokes) return a.c.strokes - b.c.strokes;
      for (const t of breaks) {
        const d = t.of(a.r, a.c) - t.of(b.r, b.c);
        if (d) return d;
      }
      // Nothing left to separate them by. Alphabetical so the order is at least
      // the same every time the board is drawn.
      return String(a.r.name).localeCompare(String(b.r.name), "en-US");
    });

    let lastRank = 0;
    const all = entries.map((e, i) => {
      if (i === 0 || !level(entries[i - 1], e)) lastRank = i + 1;
      return { name: e.r.name, rank: lastRank, strokes: e.c.strokes,
               detail: e.c.detail, wonBy: null, contest: e.c };
    });

    /* WHAT SEPARATED THEM, named — and hung on the man who WON, the way the
       main board hangs its card match. Written the other way round it reads as
       an accusation: the man who came third had "hole 4" printed beside him for
       the hole he lost it on, which is precisely backwards. */
    for (let i = 1; i < entries.length; i++) {
      const a = entries[i - 1], b = entries[i];
      if (a.c.strokes !== b.c.strokes || all[i].rank === all[i - 1].rank) continue;
      const t = breaks.find((t2) => t2.of(a.r, a.c) !== t2.of(b.r, b.c));
      if (t) all[i - 1].wonBy = t.label;
    }

    if (all.length === 0) {
      return { key, depth, rows: [], entered: 0, tied: 0, tieNote: "" };
    }

    /* The cut. Everyone down to the depth, and then everyone sharing the place
       the last of them holds. */
    const cutoff = all[Math.min(depth, all.length) - 1].rank;
    const rows = all.filter((row) => row.rank <= cutoff);
    const tied = rows.filter((row) => row.rank === cutoff).length;

    return {
      key, depth, rows, entered: all.length,
      tied: tied > 1 ? tied : 0,
      // Said only when the table actually ran past its depth. A five-deep board
      // showing five men has nothing to explain.
      tieNote: rows.length > depth
        ? depth + " deep · " + tied + " tied for " + ordinal(cutoff) + ", all shown"
        : "",
    };
  }

  /**
   * Every duel in the round, with the margin.
   *
   * The most repeatable thing in the game — a sentence a man says in the bar —
   * and the reveal: nobody knows who named whom until it is published.
   *
   * TWO MEN WHO NAMED EACH OTHER MAKE TWO ROWS, not one. They are two separate
   * bets, priced separately by each man's band, and one of them can be void
   * while the other stands.
   *
   * BIGGEST MARGIN FIRST, because the table is read aloud and the heaviest
   * beating is the one worth leading with. Duels that never settled — a card
   * short at either end — come last, in their own group, with the reason.
   */
  function hitListDuels(results) {
    const rank = { win: 0, loss: 0, tie: 0 };
    const duels = (results || [])
      .filter((r) => r.contests && r.contests.hitList && r.contests.hitList.opponent != null)
      .map((r) => {
        const c = r.contests.hitList;
        return { name: r.name, opponent: c.opponent, outcome: c.outcome,
                 margin: c.margin, band: c.band, strokes: c.strokes,
                 settled: c.outcome in rank };
      });
    duels.sort((a, b) => {
      if (a.settled !== b.settled) return a.settled ? -1 : 1;
      if (a.settled && (b.margin || 0) !== (a.margin || 0)) return (b.margin || 0) - (a.margin || 0);
      return String(a.name).localeCompare(String(b.name), "en-US");
    });
    return duels;
  }

  const api = {
    ABERDEEN_TEE_IV, ABERDEEN_TEES, TEE_IDS, GENDERS, DEFAULT_CONTESTS, SAMPLE_ROUND,
    courseForTee, courseFor, grossFromNet,
    parseHandicapIndex, formatHandicapIndex,
    PICKED_UP_OVER_PAR, NET_DOUBLE_OVER_PAR, isPickedUp, grossOnHole, netForHole,
    skinsByGroup, cartSkins, teamSkins, skinStrokes, skinValue, skinsFormat, bestTwo,
    skinsSettlement, applySkins, applyHitList, nearestByIndex, matchOfCards, CARD_MATCH,
    courseHandicap, fullCourseHandicap, FULL_ALLOWANCE,
    resolveCourseHandicap, strokesOnHole, netOnHole, cappedNetByHole,
    birdiePickHoles, birdiePickCandidates, PICK_SLOTS, PICKS_BY_PAR, LEGACY_SLOT_KEYS,
    migratePicks, readPicks, randomPicks,
    mergeContests, diffContests, checkContests, PARKED_CONTESTS,
    contestBoard, hitListDuels, BOARD_TIEBREAKS, ordinal,
    scorePlayer, scoreField, computeLeaderboard,
    computeFlights, flightOf, flightsInUse, sortFlights,
  };
  globalThis.ClubhouseEngine = api;
})();
