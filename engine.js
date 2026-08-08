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
    // Skins scores into FINAL. It sits outside maxContestStrokes, which governs
    // the six individual contests. Set to null to switch it off.
    //
    // A "group" is whatever the round is played in — carts of two some weeks,
    // teams of four others. The field is one and the same either way.
    //
    // A skin is worth `fairShare × groups / 18`, rounded to a hundredth. That
    // is the value at which an EVEN SHARE of the eighteen on offer — 18/groups
    // skins — is worth `fairShare` whatever the size of the field: two groups
    // −0.09 a skin, four −0.18, six −0.27, twelve −0.53.
    //
    // The winner is not on an even share, though, and that is the thing to
    // watch. The best group's haul barely moves with the field — six or seven
    // skins over four groups, six or seven over twelve — because more groups
    // both split the eighteen finer AND give more chances for one group to run
    // hot, and the two effects cancel. So the winner's PAY rises with the field
    // even though a fair share's does not, which is what maxSkinStrokes is for:
    // no one contest may outweigh Agony Alley's 2.5, however large the field.
    skins: { fairShare: -0.8, maxSkinStrokes: -2.5 },
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

    // 6 · Bounce Back — a net bogey or worse, answered by a net birdie or
    // better on the very next hole.
    //
    // It used to need a net DOUBLE to recover from, which made the contest
    // punish good play: a bogey-free round could not score it at all. Ten of
    // sixty-three real rounds were shut out and the correlation with making net
    // doubles was +0.69 — the better you played, the fewer chances you were
    // given, which is the opposite of what Damage Control rewards. On the same
    // sixty-three rounds the rule below shuts nobody out, 30% clear two or
    // more, and the handicap correlation falls to −0.09.
    let bounces = 0;
    for (let i = 0; i < HOLES - 1; i++) {
      if (played(i) && played(i + 1) && over(i) >= 1 && over(i + 1) <= -1) bounces++;
    }
    const bounceBack = { strokes: gradeAtLeast(bounces, contests.bounceBack), detail: bounces + " bounce-back" + (bounces === 1 ? "" : "s"), live: true };

    const allContests = { watchTheBirdie, agonyAlley, damageControl, goLong, getShorty, bounceBack };

    // Nothing pays on an empty card. Every "count" contest reads zero holes as
    // zero of whatever it counts — no net doubles, no bounce-backs — which would
    // grade as the best possible round and pay a man who never teed off.
    if (holesPlayed === 0) {
      for (const key of Object.keys(allContests)) {
        allContests[key] = { strokes: 0, detail: "no card", live: false };
      }
    }

    let earned = sum(Object.values(allContests).map((c) => c.strokes));
    if (-earned > contests.maxContestStrokes) earned = -contests.maxContestStrokes;

    let final = null;
    if (netTotal != null) {
      final = netTotal + earned;
      if (course.floor != null) final = Math.max(course.floor, final);
    }

    return {
      name: card.name, courseHandicap: ch,
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
    let pot = 1;

    for (let h = 0; h < HOLES; h++) {
      const averages = new Map();
      for (const id of order) {
        const played = members.get(id).map((nets) => nets[h]).filter((n) => n != null);
        if (played.length > 0) {
          averages.set(id, played.reduce((a, b) => a + b, 0) / played.length);
        }
      }
      let wonBy = null;
      if (averages.size > 0) {
        let best = Infinity;
        averages.forEach((avg) => { if (avg < best) best = avg; });
        const winners = [];
        averages.forEach((avg, id) => { if (avg === best) winners.push(id); });
        if (winners.length === 1) {
          wonBy = winners[0];
          skins.set(wonBy, skins.get(wonBy) + pot);
        }
        // A tie leaves the pot to carry into the next hole.
      }
      holes.push({ hole: h + 1, averages, pot, wonBy });
      pot = wonBy == null ? pot + 1 : 1;
    }
    return { skins, holes, carried: pot - 1 };
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
   * What ONE skin is worth in a field of `groupCount` groups: the value that
   * makes an even share of the eighteen — 18/groupCount skins — come to
   * `fairShare` at every field size. So a skin is worth LESS in a small field,
   * where each group's share of the eighteen is larger, and more in a big one.
   *
   * Rounded to a hundredth, because this is the figure printed on the Skins
   * tab and a man checking five skins against it must get the number the board
   * paid him. The unrounded value would pay 0.09 a skin and total as if it were
   * 0.0889, and the difference shows up over a dozen skins.
   *
   * With no groups out there is nothing to divide the eighteen between, so a
   * skin is simply worth the fair share.
   */
  function skinValue(config, groupCount) {
    if (!(groupCount > 0)) return config.fairShare;
    return Math.round((config.fairShare * groupCount / 18) * 100) / 100;
  }

  /**
   * What a count of skins is worth in a field of this many groups, in tenths
   * like every other value in the game.
   *
   * Capped at `maxSkinStrokes`. Skins is the one contest that scales with the
   * field, and unchecked it would dwarf the other seven: the best group's haul
   * holds at six or seven skins however many groups are out, so at twelve
   * groups the ordinary winner would take 3.2 and a hot one 6.9, against Agony
   * Alley's hardest-earned 2.5. The cap is slack at the field sizes this club
   * plays — over four groups it is past the 99th percentile of anything seen in
   * the record, so winning more still pays more all the way up.
   */
  function skinStrokes(count, config, groupCount) {
    const raw = toTenth(count * skinValue(config, groupCount));
    return config.maxSkinStrokes == null ? raw : Math.max(raw, config.maxSkinStrokes);
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

    // Everything that measures a man against other men happens inside his
    // flight: Skins, the placings, and the card match that separates a tie.
    // The six individual contests are untouched by it — they are graded against
    // fixed thresholds, so a man's score never depends on who he is drawn with.
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
      // Carts only face carts in the same flight, and the cap is set by how
      // many carts are out in THIS flight, not across the whole field.
      applyCartSkins(group.cards, group.results, course, contests);
      placeField(group.results);
      placed.push.apply(placed, group.results);
    }
    return placed;
  }

  /** Sort one flight into finishing order and give out its places. */
  function placeField(results) {
    /**
     * A finished card outranks an unfinished one however the numbers fall.
     * Twelve holes of net will always total less than eighteen, so comparing
     * them on the final rewards walking in — a short card is placed below every
     * complete one and takes no position at all.
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
  function applyCartSkins(cards, results, course, contests) {
    if (!contests.skins) return null;
    const hasCart = (c) => c.cart != null && String(c.cart).trim() !== "";
    const entered = [];
    cards.forEach((c) => { if (hasCart(c)) entered.push({ card: c, cart: c.cart }); });
    if (entered.length === 0) return null;

    // One cart is nobody to play against. Uncontested it wins every hole by
    // default and takes all eighteen skins for going round on its own, so there
    // are no skins on a round that never divided into two carts.
    const distinctCarts = new Set(entered.map((e) => String(e.cart)));
    if (distinctCarts.size < 2) {
      cards.forEach((card, i) => {
        const r = results[i];
        if (r.holesPlayed === 0) r.contests.skins = { strokes: 0, detail: "no card", live: false };
        else if (!hasCart(card)) r.contests.skins = { strokes: 0, detail: "no group", live: false };
        else r.contests.skins = { strokes: 0, detail: "only one group out", live: false };
      });
      return null;
    }

    const table = cartSkins(entered, course);
    // The cap is set by how many carts are actually competing, not by the
    // number of players — two men in a cart share one cart's share.
    const cartCount = table.skins.size;
    table.cartCount = cartCount;
    table.skinValue = skinValue(contests.skins, cartCount);
    cards.forEach((card, i) => {
      const r = results[i];
      if (r.holesPlayed === 0) {
        // His group may well have won skins; he did not play for any of them.
        r.contests.skins = { strokes: 0, detail: "no card", live: false };
        return;
      }
      if (card.cart == null || String(card.cart).trim() === "") {
        r.contests.skins = { strokes: 0, detail: "no group", live: false };
        return;
      }
      const count = table.skins.get(String(card.cart)) || 0;
      const strokes = skinStrokes(count, contests.skins, cartCount);
      r.contests.skins = {
        strokes, live: true,
        detail: count + " skin" + (count === 1 ? "" : "s") + " for group " + card.cart,
      };
      r.skins = count;
      r.strokesEarned = Math.round((r.strokesEarned + strokes) * 100) / 100;
      if (r.net != null) {
        let f = Math.round((r.net + r.strokesEarned) * 100) / 100;
        const c = courseFor(card, course);
        if (c.floor != null) f = Math.max(c.floor, f);
        r.final = f;
      }
    });
    return table;
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
    parseHandicapIndex, formatHandicapIndex,
    PICKED_UP_OVER_PAR, NET_DOUBLE_OVER_PAR, isPickedUp, grossOnHole, netForHole,
    skinsByGroup, cartSkins, teamSkins, skinStrokes, skinValue, matchOfCards, CARD_MATCH,
    courseHandicap, fullCourseHandicap, FULL_ALLOWANCE,
    resolveCourseHandicap, strokesOnHole, netOnHole, cappedNetByHole,
    birdiePickHoles,
    scorePlayer, scoreField, computeLeaderboard,
    computeFlights, flightOf, flightsInUse, sortFlights,
  };
  globalThis.ClubhouseEngine = api;
})();
