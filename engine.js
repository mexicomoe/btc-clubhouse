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

  /* ---- Course config: Aberdeen, nine tees, two stroke indexes ----
     Par is 72 from every tee and the holes don't move, so par and the Agony
     Alley stretch are shared. Rating and slope change with tee AND gender, and
     the women play a different stroke index — which changes which holes receive
     strokes, and so changes every contest, not just the net total. */
  const ABERDEEN_PAR = [4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 4, 4, 3, 4, 4, 5, 3, 5];
  const ABERDEEN_SI_MEN = [13, 11, 17, 1, 3, 7, 5, 15, 9, 12, 6, 14, 16, 8, 10, 4, 18, 2];
  const ABERDEEN_SI_WOMEN = [7, 13, 15, 1, 3, 5, 9, 17, 11, 2, 12, 16, 18, 8, 4, 10, 14, 6];

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
      floor: null,
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
    // Paid per nominated hole, so both picks can pay. One value today; making a
    // hard hole worth more than an easy one is a change here, not in the code.
    watchTheBirdie: { perPick: -1.0 },
    agonyAlley: [
      { threshold: 12, strokes: -2.5 }, { threshold: 13, strokes: -1.5 },
      { threshold: 14, strokes: -0.5 }, { threshold: 15, strokes: 0 },
      { threshold: 16, strokes: 1.0 }, { threshold: 99, strokes: 1.5 },
    ],
    damageControl: [
      { threshold: 0, strokes: -2.0 }, { threshold: 1, strokes: -1.0 },
      { threshold: 2, strokes: -0.5 }, { threshold: 99, strokes: 0 },
    ],
    goLong: [
      { threshold: -1, strokes: -1.5 }, { threshold: 0, strokes: -1.0 },
      { threshold: 1, strokes: -0.5 }, { threshold: 99, strokes: 0 },
    ],
    getShorty: [
      { threshold: -2, strokes: -1.5 }, { threshold: -1, strokes: -1.0 },
      { threshold: 0, strokes: -0.5 }, { threshold: 99, strokes: 0 },
    ],
    bounceBack: [
      { threshold: 3, strokes: -1.5 }, { threshold: 2, strokes: -1.0 },
      { threshold: 1, strokes: -0.5 }, { threshold: 0, strokes: 0 },
    ],
    maxContestStrokes: 11.0,
  };

  /* ---- Handicap and net-score maths ---- */
  function courseHandicap(handicapIndex, course) {
    const par = sum(course.par);
    return Math.round((handicapIndex * course.slope) / 113 + (course.courseRating - par));
  }
  function resolveCourseHandicap(card, course) {
    if (card.courseHandicap != null) return card.courseHandicap;
    if (card.handicapIndex != null) return courseHandicap(card.handicapIndex, course);
    throw new Error(card.name + ": needs a handicap index or course handicap");
  }
  function strokesOnHole(strokeIndex, courseHcp) {
    let n = 0;
    if (strokeIndex <= courseHcp) n++;
    if (strokeIndex <= courseHcp - 18) n++;
    if (strokeIndex <= courseHcp - 36) n++;
    return n;
  }
  function netOnHole(gross, par, strokeIndex, courseHcp) {
    if (gross == null) return null;
    return Math.min(gross - strokesOnHole(strokeIndex, courseHcp), par + 2);
  }
  function cappedNetByHole(card, course) {
    course = courseFor(card, course);
    const ch = resolveCourseHandicap(card, course);
    return course.par.map((par, i) => netOnHole(card.gross[i], par, course.strokeIndex[i], ch));
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
   * What one nominated hole pays for a net birdie. Flat today; `byHole` is the
   * hook for making a hard hole worth more than an easy one, with `perPick` as
   * the fallback, and needs no change here to start working.
   */
  function pickValue(hole, config) {
    const byHole = config.byHole && config.byHole[hole];
    return byHole == null ? config.perPick : byHole;
  }

  /**
   * The par 4s a player may nominate for Watch the Birdie, one list per nine.
   * Derived from the course's par, never hardcoded — at Aberdeen this is
   * front 1, 2, 5, 6, 9 and back 10, 11, 12, 14, 15.
   */
  function birdiePickHoles(course) {
    const front = [], back = [];
    for (let i = 0; i < HOLES; i++) {
      if (course.par[i] !== 4) continue;
      (i < 9 ? front : back).push(i + 1);
    }
    return { front, back };
  }

  /* ---- Score one card ---- */
  function scorePlayer(card, course, contests) {
    course = courseFor(card, course);
    contests = contests || DEFAULT_CONTESTS;
    const ch = resolveCourseHandicap(card, course);

    const net = course.par.map((par, i) => netOnHole(card.gross[i], par, course.strokeIndex[i], ch));
    const played = (i) => net[i] != null;
    const over = (i) => net[i] - course.par[i];

    const holesPlayed = net.filter((n) => n != null).length;
    const gross = card.gross.some((g) => g != null) ? sum(card.gross.filter((g) => g != null)) : null;
    const netTotal = holesPlayed > 0 ? sum(net.filter((n) => n != null)) : null;

    let netUncapped = null;
    if (holesPlayed > 0) {
      netUncapped = 0;
      for (let i = 0; i < HOLES; i++) {
        if (card.gross[i] != null) netUncapped += card.gross[i] - strokesOnHole(course.strokeIndex[i], ch);
      }
    }

    // 1 · Watch the Birdie — two par 4s nominated before the round, one per nine.
    // A net birdie or better on a nominated hole pays; both picks can pay.
    let watchTheBirdie;
    const picks = card.picks;
    if (picks == null || picks.front == null || picks.back == null) {
      watchTheBirdie = { strokes: 0, detail: "no picks made", live: false };
    } else {
      const legal = birdiePickHoles(course);
      if (!legal.front.includes(picks.front)) {
        throw new Error(card.name + ": front-nine pick must be a par 4 — " + legal.front.join(", "));
      }
      if (!legal.back.includes(picks.back)) {
        throw new Error(card.name + ": back-nine pick must be a par 4 — " + legal.back.join(", "));
      }
      // Each pick is settled on its own — an unplayed nominated hole just
      // doesn't pay, and a per-hole value can differ from its partner's.
      let birdieStrokes = 0, paid = 0;
      for (const h of [picks.front, picks.back]) {
        if (played(h - 1) && over(h - 1) <= -1) {
          birdieStrokes += pickValue(h, contests.watchTheBirdie);
          paid++;
        }
      }
      watchTheBirdie = { strokes: birdieStrokes, detail: paid + " of 2 picks", live: true };
    }

    // 2 · Agony Alley (needs the stretch holes)
    const agonyIdx = course.agonyHoles.map((h) => h - 1);
    let agonyAlley;
    if (!agonyIdx.every(played)) {
      agonyAlley = { strokes: 0, detail: "needs holes " + course.agonyHoles[0] + "–" + course.agonyHoles[course.agonyHoles.length - 1], live: false };
    } else {
      const total = sum(agonyIdx.map((i) => net[i]));
      agonyAlley = { strokes: gradeAtMost(total, contests.agonyAlley), detail: "net " + total + " across the stretch", live: true };
    }

    // 3 · Damage Control (partial ok)
    const netDoubles = range(HOLES).filter((i) => played(i) && over(i) >= 2).length;
    const damageControl = { strokes: gradeAtMost(netDoubles, contests.damageControl), detail: netDoubles + " net double" + (netDoubles === 1 ? "" : "s"), live: true };

    // 4 · Go Long (par 5s) / 5 · Get Shorty (par 3s)
    const goLong = scorePar(range(HOLES).filter((i) => course.par[i] === 5), contests.goLong, "par 5s");
    const getShorty = scorePar(range(HOLES).filter((i) => course.par[i] === 3), contests.getShorty, "par 3s");
    function scorePar(idxs, ladder, label) {
      if (idxs.filter(played).length < 4) return { strokes: 0, detail: "needs the " + label, live: false };
      const total = sum(idxs.map(over));
      return { strokes: gradeAtMost(total, ladder), detail: signed(total) + " vs par on the " + label, live: true };
    }

    // 6 · Bounce Back
    let bounces = 0;
    for (let i = 0; i < HOLES - 1; i++) {
      if (played(i) && played(i + 1) && over(i) >= 2 && over(i + 1) <= 0) bounces++;
    }
    const bounceBack = { strokes: gradeAtLeast(bounces, contests.bounceBack), detail: bounces + " bounce-back" + (bounces === 1 ? "" : "s"), live: true };

    const allContests = { watchTheBirdie, agonyAlley, damageControl, goLong, getShorty, bounceBack };
    let earned = sum(Object.values(allContests).map((c) => c.strokes));
    if (-earned > contests.maxContestStrokes) earned = -contests.maxContestStrokes;

    let final = null;
    if (netTotal != null) {
      final = netTotal + earned;
      if (course.floor != null) final = Math.max(course.floor, final);
    }

    return {
      name: card.name, courseHandicap: ch, gross, net: netTotal, netUncapped,
      holesPlayed, contests: allContests, strokesEarned: earned, final,
    };
  }

  /** Score a field, sorted by final (lowest first). Ties are left as ties. */
  function scoreField(cards, course, contests) {
    return cards.map((c) => scorePlayer(c, course, contests)).sort((a, b) => (a.final == null ? Infinity : a.final) - (b.final == null ? Infinity : b.final));
  }

  /** Leaderboard: scored field with competition ranks (equal finals share a rank). */
  function computeLeaderboard(players, course, contests) {
    // `course` passes through untouched so a mixed-tee field resolves per card.
    const results = scoreField(players || SAMPLE_ROUND, course, contests || DEFAULT_CONTESTS);
    let lastFinal = null, lastRank = 0;
    results.forEach((r, i) => {
      if (r.final !== lastFinal) { lastRank = i + 1; lastFinal = r.final; }
      r.rank = lastRank;
    });
    return results;
  }

  /* ---- Section 11 round: the leaderboard's initial data (31 July) ---- */
  const SAMPLE_ROUND = [
    { name: "Alex",  courseHandicap: 18, picks: { front: 1, back: 10 }, gross: [5,5,3,6,5,5,6,3,5,7,5,5,4,4,6,6,3,7] },
    { name: "Boyd",  courseHandicap: 21, picks: { front: 2, back: 11 }, gross: [6,5,4,7,6,5,7,4,5,6,6,5,4,5,7,4,4,6] },
    { name: "Chip",  courseHandicap: 15, picks: { front: 5, back: 12 }, gross: [6,5,4,8,6,5,5,4,5,5,6,3,5,6,6,5,4,6] },
    { name: "Dex",   courseHandicap: 23, picks: { front: 6, back: 14 }, gross: [5,5,4,6,6,6,7,3,5,4,4,6,3,6,6,6,6,5] },
    { name: "Emmet", courseHandicap: 14, picks: { front: 9, back: 15 }, gross: [6,5,3,7,7,6,5,3,5,4,5,5,3,5,6,7,3,6] },
    { name: "Finn",  courseHandicap: 26, picks: { front: 1, back: 10 }, gross: [5,6,6,7,5,4,7,4,7,6,7,5,3,5,5,6,4,7] },
    { name: "Grady", courseHandicap: 34, picks: { front: 2, back: 11 }, gross: [7,6,4,9,7,7,7,5,5,6,7,7,3,8,6,7,3,9] },
    { name: "Hoyt",  courseHandicap: 20, picks: { front: 5, back: 12 }, gross: [7,5,4,8,8,4,8,4,6,5,6,7,4,7,5,5,4,6] },
  ];

  const api = {
    ABERDEEN_TEE_IV, ABERDEEN_TEES, TEE_IDS, GENDERS, DEFAULT_CONTESTS, SAMPLE_ROUND,
    courseForTee, courseFor, grossFromNet,
    courseHandicap, resolveCourseHandicap, strokesOnHole, netOnHole, cappedNetByHole,
    birdiePickHoles,
    scorePlayer, scoreField, computeLeaderboard,
  };
  globalThis.ClubhouseEngine = api;
})();
