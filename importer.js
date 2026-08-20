"use strict";
/**
 * Beat the Crowd · Clubhouse — the Golf Genius paste parser (brief section 10).
 *
 * Same arrangement as engine.js: this plain .js file is the ONE implementation,
 * loaded by the browser with a classic <script src> (no build step, works from
 * a file:// page) and imported for its side effect by src/importScores.ts,
 * which re-exports it with TypeScript types for the tests.
 *
 * Preferred input is pasted tab-separated text, not a file upload: the organiser
 * selects the player rows in the open leaderboard and copies, which puts TSV on
 * the clipboard and needs no `.xls` reader in the browser.
 *
 * The catch is that the same layout carries either **gross** hole scores (the
 * December hole-by-hole export) or **net** hole scores (the Golf Genius low-net
 * leaderboard — it applies the strokes before it posts). We tell them apart the
 * only reliable way: sum the eighteen holes and see which total it lands on.
 *
 *   sum of 18 holes == Net column   → the holes are NET
 *   sum of 18 holes == Total column → the holes are GROSS
 *   neither                         → the paste is broken; say so
 *
 * Out, In and Net are never trusted for arithmetic — everything is recomputed
 * from the eighteen hole values so a bad export is caught rather than believed.
 */
(function () {
  const HOLES = 18;
  /** A hole the player picked up on. Golf Genius prints it as X. */
  const PICKED_UP = "X";

  /**
   * Rows that are in the export but are not a man's round.
   *
   *   "(blind)" in the name — a blind is a phantom player the draw invents to
   *                           even up the teams. There is nobody to score.
   *   a Total of "NC"       — no card returned.
   *
   * Neither is dropped on the floor: they come through marked, so the import
   * screen can show what it left out and why. A paste that quietly loses rows
   * is worse than one that refuses them.
   */
  const BLIND_NAME = /\(\s*blind\s*\)/i;
  const NO_CARD_TOTAL = /^\s*n\.?c\.?\s*$/i;

  /**
   * The export prints three rows for every player: his card, then a "Net Score"
   * row and a "To Par (net)" row, then a blank one. Those are the export
   * talking about the card above, not people — they carry no name and no
   * handicap, and there is nobody they could belong to.
   *
   * They are dropped outright rather than carried through marked, which is what
   * happens to a blind. A blind is a named entry someone might go looking for;
   * these are furniture. Left in they are worse than noise: their eighteen
   * numbers sum to the total beside them, so each one parses as a perfectly
   * good gross card and lands in the list as a phantom player to be assigned.
   */
  const LABEL_ROW = /^\s*(net score|to par)\b/i;

  /** Section-10 fixed layout: name, 1–9, Out, 10–18, In, Total, Net. */
  const FIXED_LAYOUT = {
    holeCols: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    totalCol: 21,
    netCol: 22,
    firstDataRow: 0,
  };

  /** Parse pasted tab-separated Golf Genius rows into classified cards. */
  function parseScores(text) {
    const lines = String(text == null ? "" : text)
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+$/, ""))
      .filter((l) => l.trim() !== "");

    const cards = [];
    const errors = [];
    if (lines.length === 0) return { cards, errors };

    // Locate the columns. A header row is recognised by its run of hole numbers
    // — Total, if there is one, is a bonus — and the hole/Total/Net positions
    // are read from it, which survives Out/In being dropped from a selection
    // and handles a plain table that has neither. Only a paste with no header
    // at all falls back to the fixed section-10 layout.
    const layout = detectLayout(lines);
    const dataLines = lines.slice(layout.firstDataRow);

    for (const line of dataLines) {
      const cells = line.split("\t");
      const rawName = (cells[0] == null ? "" : cells[0]).trim();
      if (rawName === "") continue;        // the blank row between players
      if (LABEL_ROW.test(rawName)) continue;  // "Net Score", "To Par (net)"

      const split = splitName(rawName);
      const name = split.name, handicap = split.handicap;

      if (layout.holeCols.length !== HOLES) {
        errors.push(name + ": could not find 18 hole columns in the paste.");
        continue;
      }

      const holes = layout.holeCols.map((i) => holeValue(cells[i]));
      const grossTotal = layout.totalCol != null ? numOrNull(cells[layout.totalCol]) : null;
      const netTotal = layout.netCol != null ? numOrNull(cells[layout.netCol]) : null;
      // A picked-up hole was played, so it counts towards the eighteen.
      const holesPlayed = holes.filter((h) => h != null).length;
      const pickedUp = holes.filter((h) => h === PICKED_UP).length;

      // A row that is not a round comes through marked rather than dropped, and
      // is never graded — there is nothing to tell gross from net on, and a
      // blind has no card to call broken.
      const rawTotal = layout.totalCol != null ? String(cells[layout.totalCol] || "") : "";
      const skip = BLIND_NAME.test(rawName) ? "a blind, not a player"
                 : NO_CARD_TOTAL.test(rawTotal) ? "no card returned (NC)"
                 : null;
      if (skip) {
        cards.push({ name, handicap, holes, holesPlayed, pickedUp,
                     mode: "unknown", grossTotal, netTotal, skip });
        continue;
      }

      const verdict = classify(name, holes, holesPlayed, pickedUp, grossTotal, netTotal,
                               layout.totalCol != null);
      if (verdict.error) errors.push(verdict.error);

      cards.push({ name, handicap, holes, holesPlayed, pickedUp,
                   mode: verdict.mode, grossTotal, netTotal, skip: null });
    }

    return { cards, errors };
  }

  /** Decide gross vs net for one card by which total the 18 holes sum to. */
  function classify(name, holes, holesPlayed, pickedUp, grossTotal, netTotal, hasTotalColumn) {
    if (!hasTotalColumn) {
      // A plain table — hole numbers and scores, no Out/In/Total. Nothing to
      // reconcile the eighteen against, so gross cannot be told from net here.
      // That is the SHAPE, not a fault: the card read perfectly and the import
      // screen asks which the columns are. Calling it broken would send a man
      // looking for a mistake in a paste that has none.
      return { mode: "unknown" };
    }
    if (grossTotal == null) {
      // There IS a Total column and this row's cell is empty. That used to
      // refuse the card outright, which threw away eighteen perfectly good hole
      // scores over a missing summary of them — a Golf Genius export leaves the
      // cell blank often enough that eight cards in one round were lost to it.
      //
      // The total can be added up from the holes. What adding it up CANNOT do
      // is say whether those holes are gross or net: a sum compared against
      // itself always agrees, so classifying on it would assert "gross" for
      // every card, including net ones. So the NET column is tried, and failing
      // that the card comes through unclassified for the screen to ask about,
      // exactly as a plain table does. It is a shape, not a fault.
      const sum = holes.reduce((a, h) => a + (h == null ? 0 : h), 0);
      if (netTotal != null && pickedUp === 0 && holesPlayed === HOLES && sum === netTotal) {
        return { mode: "net" };
      }
      return { mode: "unknown" };
    }
    if (pickedUp > 0) {
      // A picked-up hole has no number to add, so the eighteen cannot be summed
      // against either total and gross cannot be told from net this way. Not an
      // error — the card is fine, it just needs telling which the columns are.
      return { mode: "unknown" };
    }
    if (holesPlayed < HOLES) {
      // A partial round has nothing to sum against, so gross vs net can't be told
      // apart here. The card still imports; classification is left to the caller.
      return { mode: "unknown" };
    }
    const sum = holes.reduce((a, h) => a + (h == null ? 0 : h), 0);
    if (netTotal != null && sum === netTotal) return { mode: "net" };
    if (sum === grossTotal) return { mode: "gross" };

    const against = netTotal != null
      ? "neither the Total (" + grossTotal + ") nor the Net (" + netTotal + ")"
      : "the Total (" + grossTotal + ")";
    return {
      mode: "unknown",
      error: name + ": 18 holes sum to " + sum + ", which matches " + against + " — the paste looks broken.",
    };
  }

  /**
   * Which line is the header, if there is one.
   *
   * It used to be "the line with Total in it", which is true of a Golf Genius
   * export and false of a plain table — hole numbers across the top, a name and
   * eighteen scores beneath, nothing else. That shape has no Total, so no
   * header was found, the fixed section-10 layout was used instead, and column
   * 10 was read as the Out total: hole 10 was dropped, holes 11–18 slid one
   * place left, seventeen came through and the eighteenth was blank. The header
   * row itself then parsed as a player called "1".
   *
   * So the header is recognised by what it actually is — a row of consecutive
   * hole numbers — and Total, if there is one, is a bonus rather than the test.
   */
  function headerRowIndex(lines) {
    for (let i = 0; i < lines.length; i++) {
      const cells = lines[i].split("\t").map((c) => c.trim());
      if (/(^|\t)\s*total\s*(\t|$)/i.test(lines[i])) return i;
      // A run of at least four hole numbers ascending from 1, and no cell that
      // looks like a player's name. Four is enough to be deliberate and short
      // enough to survive a selection that clipped the right-hand end.
      const numbers = cells.map((c) => (/^\d{1,2}$/.test(c) ? Number(c) : null));
      const run = [];
      for (const n of numbers) {
        if (n == null) continue;
        if (run.length === 0 ? n === 1 : n === run[run.length - 1] + 1) run.push(n);
      }
      const named = cells.some((c) => c !== "" && /[A-Za-z]/.test(c) && !/^(out|in|total|net|tot)$/i.test(c));
      if (run.length >= 4 && !named) return i;
    }
    return -1;
  }

  /** Find the column layout, reading a header row if the paste includes one. */
  function detectLayout(lines) {
    const headerRow = headerRowIndex(lines);
    if (headerRow === -1) return FIXED_LAYOUT;

    const cells = lines[headerRow].split("\t");
    const holeCols = [];
    let totalCol = null;
    let netCol = null;
    cells.forEach((cell, i) => {
      const t = cell.trim();
      if (/^total$/i.test(t)) totalCol = i;
      else if (/^net$/i.test(t)) netCol = i;
      else {
        const n = Number(t);
        // Numeric header cells are the hole numbers 1..18, in order (Out/In are words).
        if (Number.isInteger(n) && n >= 1 && n <= HOLES && holeCols.length < HOLES) holeCols.push(i);
      }
    });

    // Golf Genius does not always print the empty cell that sits above the name
    // column, so the header can be one column to the LEFT of the data it labels.
    // Left uncorrected the whole card slides over: hole 1 reads the name cell,
    // hole 10 reads the Out total, and the round imports as quiet nonsense.
    // Compare the widths and move the header's positions into the data's frame.
    const shift = headerShift(lines, headerRow, cells.length);
    if (shift !== 0) {
      for (let i = 0; i < holeCols.length; i++) holeCols[i] += shift;
      if (totalCol != null) totalCol += shift;
      if (netCol != null) netCol += shift;
    }
    return { holeCols, totalCol, netCol, firstDataRow: headerRow + 1 };
  }

  /**
   * How far the header sits to the left of the data, in columns. Only the
   * one-column case is corrected — that is the shape Golf Genius actually
   * produces. Anything else is left alone for the hole totals to catch, rather
   * than shuffling columns on a guess.
   */
  function headerShift(lines, headerRow, headerWidth) {
    const widths = lines.slice(headerRow + 1)
      .filter((l) => l.trim() !== "")
      .map((l) => l.split("\t").length);
    if (widths.length === 0) return 0;
    const counts = new Map();
    for (const w of widths) counts.set(w, (counts.get(w) || 0) + 1);
    let dataWidth = widths[0], best = 0;
    for (const [w, n] of counts) if (n > best) { best = n; dataWidth = w; }
    return dataWidth - headerWidth === 1 ? 1 : 0;
  }

  /** Split "Sid Ferndale (18)" into name and the parenthesised course handicap. */
  function splitName(cell) {
    const m = cell.match(/^(.*?)\s*\((\d+)\)\s*$/);
    if (m) return { name: m[1].trim(), handicap: Number(m[2]) };
    return { name: cell.trim(), handicap: null };
  }

  function numOrNull(v) {
    if (v == null) return null;
    const t = String(v).trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * One hole cell. Three outcomes, and the difference between the last two
   * matters more than it looks:
   *
   *   ""   → null        the hole was not played
   *   "5"  → 5           a score
   *   "X"  → PICKED_UP   the hole WAS played; he picked up
   *
   * A picked-up hole still counts towards the eighteen, so a man who X'd three
   * holes played a full round and can win. Reading X as "not played" would make
   * him a fourteen-hole card and take him out of the competition.
   */
  function holeValue(v) {
    if (v == null) return null;
    const t = String(v).trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : PICKED_UP;
  }

  /**
   * Turn a GROSS-hole imported card into a PlayerCard the scoring engine can run.
   * The engine recomputes net from gross via the stroke index, so this is only
   * valid for gross holes — net-hole cards must not be double-subtracted.
   */
  function grossCardToPlayer(card, picks) {
    if (card.mode !== "gross") {
      throw new Error(card.name + ": expected gross holes, got " + card.mode + ".");
    }
    if (card.handicap == null) {
      throw new Error(card.name + ": gross scoring needs a course handicap from the name.");
    }
    // Picks come from setup, not the export — Golf Genius knows nothing about them.
    return { name: card.name, courseHandicap: card.handicap, gross: card.holes, picks };
  }

  /** Names match on case and spacing only — the roster is eight men, not a database. */
  function normaliseName(name) {
    return String(name == null ? "" : name).trim().replace(/\s+/g, " ").toLowerCase();
  }

  /** "Ridgeway, Ken" → "Ken Ridgeway". Null when there is no comma to undo. */
  function unreverseName(name) {
    const m = String(name == null ? "" : name).match(/^\s*([^,]+),\s*(.+)$/);
    return m ? m[2].trim() + " " + m[1].trim() : null;
  }

  /**
   * Drop a trailing "(18)". The export carries the handicap after the name, and
   * the organiser may well have typed it into the setup sheet too — on either
   * side it is a handicap, not part of what the man is called.
   */
  function stripHandicap(name) {
    return String(name == null ? "" : name).replace(/\s*\(\s*\d+\s*\)\s*$/, "").trim();
  }

  /**
   * A name in "First Last" order with any handicap removed — the one form both
   * sides can be compared in. Comparing "Last, First" strings directly is what
   * makes "Ridgeway, Robert" and "Ridgeway, Rob" look alike when reduced to a
   * first name and an initial, so every rule below works on this form instead.
   */
  function canonicalName(name) {
    const bare = stripHandicap(name);
    return unreverseName(bare) || bare;
  }

  /**
   * "Ken Ridgeway" and "Ken R." both reduce to "ken r" — a first name plus a
   * last initial, which is how a clubhouse roster is usually written down.
   * Null for a single-word name, which has no initial to match on.
   */
  function initialKey(name) {
    const parts = normaliseName(name).split(" ").filter(Boolean);
    if (parts.length < 2) return null;
    const last = parts[parts.length - 1].replace(/[^a-z0-9]/g, "");
    if (!last) return null;
    return parts[0] + " " + last.charAt(0);
  }

  /**
   * Match one exported name against the setup roster. Golf Genius prints
   * "Last, First"; the setup sheet usually carries "First L.". Tried in order:
   *
   *   exact     — the name as exported
   *   reversed  — "Last, First" turned back into "First Last"
   *   initial   — first name plus last initial
   *
   * Returns the index into `names` and which rule matched, or index -1 with
   * `how` null when nothing fits and "ambiguous" when more than one roster name
   * shares an initial key. Nothing is ever matched on a guess: anything short of
   * these rules comes back unmatched for a person to decide.
   */
  function matchName(exportName, names) {
    // 1 · the names as written, once any handicap is off either side.
    const bareKey = normaliseName(stripHandicap(exportName));
    let i = names.findIndex((n) => normaliseName(stripHandicap(n)) === bareKey);
    if (i !== -1) return { index: i, how: "exact" };

    // 2 · both sides put into "First Last" order.
    const canon = canonicalName(exportName);
    const canonKey = normaliseName(canon);
    i = names.findIndex((n) => normaliseName(canonicalName(n)) === canonKey);
    if (i !== -1) return { index: i, how: "reversed" };

    // 3 · first name plus last initial, on the ordered form only. This is the
    // loosest rule and deliberately the last: it can tell "Rob T." from "Rob
    // Ridgeway", but it must never be asked to tell Robert from Rob.
    const key = initialKey(canon);
    if (key != null) {
      const hits = [];
      names.forEach((n, idx) => { if (initialKey(canonicalName(n)) === key) hits.push(idx); });
      if (hits.length === 1) return { index: hits[0], how: "initial" };
      if (hits.length > 1) return { index: -1, how: "ambiguous" };
    }
    return { index: -1, how: null };
  }

  /**
   * How many single-character edits separate two strings. Iterative and small
   * rather than clever — the longest thing it is ever asked to compare is a
   * man's name against two dozen others.
   */
  function editDistance(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = [];
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[n];
  }

  /**
   * The roster name a failed match was most likely meant to be.
   *
   * WHY. "Score belongs to nobody" is true and useless. The organiser typed
   * "Gidaly, Mitch" into Setup and Golf Genius printed "Gidaly, Mitchell", and
   * he is left to find that himself among two dozen men, six times over. Naming
   * the near miss turns a hunt into a tap.
   *
   * It only ever SUGGESTS. Nothing is assigned on a guess: a man scored on
   * another man's card is far worse than a row that had to be pointed at by
   * hand, and every rule in `matchName` above is built on refusing rather than
   * risking it. This keeps that bargain — it hands the organiser a name to
   * confirm, and confirming is still his to do.
   */
  function nearestName(exportName, names) {
    const want = normaliseName(canonicalName(exportName));
    const nothing = { index: -1, distance: null };
    if (want === "") return nothing;

    let best = -1, bestD = Infinity, runnerUp = Infinity;
    names.forEach((n, i) => {
      const d = editDistance(want, normaliseName(canonicalName(n)));
      if (d < bestD) { runnerUp = bestD; bestD = d; best = i; }
      else if (d < runnerUp) runnerUp = d;
    });

    // About a third of the name may differ, and never more than four letters.
    // Past that it is not a spelling of the same name, it is a different man,
    // and offering him would be worse than offering nobody.
    const allowed = Math.max(1, Math.min(4, Math.floor(want.length / 3)));
    if (best === -1 || bestD > allowed) return nothing;
    // Two roster names equally close is not a suggestion, it is a coin toss.
    if (bestD === runnerUp) return nothing;
    return { index: best, distance: bestD };
  }

  /* ---- pasting a roster ----
     Sixteen men typed in by hand is a long job, and the organiser has them in a
     spreadsheet already. One player a line:

         name, handicap index, tee, group, front pick, back pick

     Tab or comma separated. Tabs come from a spreadsheet and are unambiguous;
     commas are what a typed list looks like, and there the name is the problem —
     "Ridgeway, Ken" is one field with a comma in it. Quoted names are read
     properly, and an unquoted one is rescued when the row is a field too long
     and the second field is plainly not a handicap. */

  /** Split one line on commas, honouring quotes the way a spreadsheet writes them. */
  function splitCsvLine(line) {
    const out = [];
    let field = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line.charAt(i);
      if (inQuotes) {
        if (c === '"' && line.charAt(i + 1) === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") { out.push(field); field = ""; }
      else field += c;
    }
    out.push(field);
    return out;
  }

  const looksNumeric = (s) => /^-?\d{1,2}([.,]\d{1,2})?$/.test(String(s == null ? "" : s).trim());

  const ROSTER_HEADINGS = /^(name|player|handicap|index|hcp|tee|group|cart|team|front|back|pick)/i;

  /**
   * Read a pasted roster. Returns { rows, ignored } where every row carries what
   * was read and a list of anything wrong with it — nothing is committed here,
   * so the screen can show the lot before a man presses the button.
   *
   * `opts` supplies what only the course knows: { tees, frontPicks, backPicks,
   * defaultTee }. Passing them in keeps this readable on its own and testable
   * without the engine.
   */
  /**
   * A Golf Genius TEE SHEET line:
   *
   *     Finkelstein, Dave (26.9 / 21 / 21) IV
   *
   * The bracket carries the handicap index, the playing handicap and the course
   * handicap, in that order. Only the FIRST is kept. The other two are
   * properties of the DAY rather than of the man — the engine works both out
   * from the tee, the index and the allowance every time it scores — so storing
   * them would be storing a stale copy of something already derived, and a
   * changed allowance would silently disagree with them.
   *
   * At least two figures are required inside the bracket. One figure is
   * "Ridgeway, Ken (18)" — a scorecard name carrying a course handicap — and
   * reading that 18 as an index would enter a man at nearly double his true
   * handicap. The slash is what says "tee sheet".
   */
  const TEE_SHEET_LINE =
    /^(.+?)\s*\(\s*([+-]?\d+(?:[.,]\d+)?(?:\s*\/\s*[+-]?\d+(?:[.,]\d+)?)+)\s*\)\s*(.*)$/;

  function teeSheetRow(line) {
    const m = String(line == null ? "" : line).trim().match(TEE_SHEET_LINE);
    if (!m) return null;
    const name = m[1].trim();
    if (name === "") return null;
    // The tee follows the bracket as a Roman numeral, and may be a shared tee
    // written "IV/V". Only the first word is taken; a tee sheet that carries
    // more columns after it does not make the tee unreadable.
    const after = m[3].trim().split(/\s+/)[0] || "";
    // Golf Genius writes a plus handicap "+2.1", meaning 2.1 BETTER than
    // scratch. The engine refuses a TYPED "+2.1" on purpose, because a man
    // writing it by hand may mean either sign and guessing wrong misplaces him
    // by twice his handicap. A tee sheet has one convention and it is not in
    // doubt, so here it is turned into the −2.1 the engine wants. The preview
    // shows the converted figure, so it is still seen before it is committed.
    const first = m[2].split("/")[0].trim();
    return {
      name: name,
      indexText: first.charAt(0) === "+" ? "-" + first.slice(1) : first,
      tee: after.toUpperCase(),
      group: "",
      front: "",
      back: "",
      problems: [],
    };
  }

  function parseRoster(text, options) {
    const opts = options || {};
    const tees = opts.tees || [];
    const frontPicks = opts.frontPicks || [];
    const backPicks = opts.backPicks || [];
    const rows = [];
    let ignored = 0;

    const lines = String(text == null ? "" : text).split(/\r?\n/);
    lines.forEach((line) => {
      if (line.trim() === "") return;

      // A tee sheet line is tried first. Its name carries a comma and its
      // figures a slash, so splitting it as a comma list would take the name
      // apart and leave the whole bracket sitting in the name field.
      let row = teeSheetRow(line);

      if (row == null) {
        // A spreadsheet paste is tabs; anything else is treated as a comma list.
        let cells = line.indexOf("\t") !== -1 ? line.split("\t") : splitCsvLine(line);
        cells = cells.map((c) => String(c == null ? "" : c).trim());

        // "Ridgeway, Ken, 19.4, IV" — the name took two fields. Put it back when
        // the row is one long and what follows the name is not a handicap.
        if (line.indexOf("\t") === -1 && cells.length > 1 && !looksNumeric(cells[1]) && cells[1] !== "") {
          const merged = [cells[0] + ", " + cells[1]].concat(cells.slice(2));
          if (merged.length >= 1 && (merged.length < cells.length)) cells = merged;
        }

        if (cells[0] === "") { ignored++; return; }
        // A heading row from the top of a spreadsheet is not a player.
        if (ROSTER_HEADINGS.test(cells[0]) && !looksNumeric(cells[1] || "")) { ignored++; return; }

        row = {
          name: cells[0],
          indexText: cells[1] || "",
          tee: cells[2] || "",
          group: cells[3] || "",
          front: cells[4] || "",
          back: cells[5] || "",
          problems: [],
        };
      }

      if (row.tee !== "" && tees.indexOf(row.tee) === -1) {
        row.problems.push("no tee called “" + row.tee + "”");
        row.tee = "";
      }
      if (row.tee === "") row.tee = opts.defaultTee || (tees[0] || "");

      if (row.group !== "" && !/^\d{1,2}$/.test(row.group)) {
        row.problems.push("group “" + row.group + "” is not a number");
        row.group = "";
      }
      for (const [key, legal, which] of [["front", frontPicks, "front"], ["back", backPicks, "back"]]) {
        if (row[key] === "") continue;
        const n = Number(row[key]);
        if (!legal.length || legal.indexOf(n) === -1) {
          row.problems.push(which + " pick " + row[key] + " is not a par 4 on that nine");
          row[key] = "";
        } else {
          row[key] = n;
        }
      }
      rows.push(row);
    });

    return { rows, ignored };
  }

  /* ---- Watch the Birdie picks, sent in by text ----
     The men message their picks in one line each:

         Ridgeway, Ken — 8, 2, 4, 13, 14, 16

     Six bare numbers, always in slot order: front par 3, front par 4, front
     par 5, back par 3, back par 4, back par 5. There is nothing in the line to
     say which is which, so the ORDER is the whole of the format and a line
     with any other count of numbers is refused rather than guessed at.

     A block of those lines is pasted in together. Nothing is applied until it
     has been read back, the same as a paste of scores or of players. */

  /* The dash between name and numbers. A phone will turn a typed hyphen into an
     en or em dash on its own, so all three are read — but only when it stands
     apart from the words, or "Jean-Paul" would split down the middle. A colon
     and a tab are read too, because men type what they are used to. */
  const PICK_SPLIT = /\s[—–-]\s|\s*:\s*|\t+/;

  /** The first run of digits, for a line that came with no separator at all. */
  const PICK_FIRST_NUMBER = /\d/;

  /**
   * Read a pasted block of picks, one player a line.
   *
   * `opts.names` is the setup roster to match against, in its own order;
   * `opts.slots` is [{ key, label, legal }] in slot order, from the course.
   *
   * Every line comes back whether it worked or not, carrying `problems` and, if
   * a name was recognised, the index of the player it belongs to. A name that
   * matches nothing — or matches two men equally — is reported, never guessed.
   */
  /**
   * A Hit List line: "Hit List: Mike Knazick", sitting under the man it belongs
   * to.
   *
   * THE LABEL IS THE WHOLE POINT. A block of these is pasted in one go, so
   * without it a bare name on its own line is indistinguishable from the start
   * of the next man's entry — and guessing wrong would either lose a target or
   * invent a player.
   */
  const HIT_LIST_LINE = /^\s*hit\s*list\s*[:\-–—]\s*(.+?)\s*$/i;

  function parseBirdiePicks(text, opts) {
    const names = (opts && opts.names) || [];
    const slots = (opts && opts.slots) || [];
    const rows = [];
    let ignored = 0;

    String(text == null ? "" : text).split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (line === "") { ignored++; return; }

      /* A TARGET BELONGS TO THE MAN ABOVE IT. It is read here, before anything
         else, because it is not a player line and must never be treated as one. */
      const hit = line.match(HIT_LIST_LINE);
      if (hit) {
        const target = hit[1].trim();
        const owner = rows.length ? rows[rows.length - 1] : null;
        if (!owner) {
          rows.push({ name: target, index: -1, how: null, picks: {}, holes: [],
            hitList: null, problems: ["a Hit List line with nobody above it to belong to"] });
          return;
        }
        if (owner.hitList != null || owner.hitListProblem) {
          owner.problems.push("two Hit List lines for one man");
          return;
        }
        const m = matchName(target, names);
        if (m.index === -1) {
          owner.hitListProblem = true;
          owner.problems.push(m.how === "ambiguous"
            ? "Hit List “" + target + "” could be more than one player"
            : "Hit List “" + target + "” is not a player on the list");
          return;
        }
        if (owner.index !== -1 && m.index === owner.index) {
          owner.hitListProblem = true;
          owner.problems.push("a man cannot name himself on the Hit List");
          return;
        }
        owner.hitList = names[m.index];
        owner.hitListHow = m.how;
        return;
      }

      // Split the name off the numbers. Where no separator was typed, the first
      // digit is the boundary — "Ken Ridgeway 8 2 4 13 14 16" is a real message.
      let namePart = line, numberPart = "";
      const cut = line.split(PICK_SPLIT);
      if (cut.length > 1) {
        namePart = cut[0];
        numberPart = cut.slice(1).join(" ");
      } else {
        const at = line.search(PICK_FIRST_NUMBER);
        if (at > 0) { namePart = line.slice(0, at); numberPart = line.slice(at); }
        else { namePart = line; numberPart = ""; }
      }
      namePart = namePart.trim();
      // A heading row off a spreadsheet, or a line that is only a name.
      if (namePart === "" || !PICK_FIRST_NUMBER.test(numberPart)) { ignored++; return; }

      const row = { name: namePart, index: -1, how: null, picks: {}, holes: [],
                    hitList: null, problems: [] };

      // The name first, so a line that is wrong in both ways says so about both.
      //
      // The initial rule — first name plus last initial — is accepted only when
      // the line was actually WRITTEN that way. It exists so "Abe W." finds Abe
      // Whitfield; letting it also swallow "Abe Whitfeld" would turn a spelling
      // mistake into a silent match against the wrong man's card, which is the
      // one thing a paste of picks must never do.
      const match = matchName(namePart, names);
      const surname = namePart.replace(/,/g, " ").trim().split(/\s+/).pop() || "";
      const writtenAsInitial = /^[A-Za-z]\.?$/.test(surname);
      const ok = match.index !== -1 && (match.how !== "initial" || writtenAsInitial);
      row.index = ok ? match.index : -1;
      row.how = ok ? match.how : match.how;
      if (!ok) {
        row.problems.push(match.how === "ambiguous"
          ? "more than one player could be meant — say which"
          : "no player of that name on the list");
      }

      const numbers = numberPart.split(/[^0-9]+/).filter((s) => s !== "");
      const holes = numbers.map(Number);
      row.holes = holes;

      if (holes.length !== slots.length) {
        row.problems.push("expected " + slots.length + " numbers, found " + holes.length);
        rows.push(row);
        return;
      }
      if (holes.some((h) => !(h >= 1 && h <= 18))) {
        row.problems.push("a hole number is outside 1–18");
        rows.push(row);
        return;
      }

      // Duplicates before legality: "hole 8 twice" is what a man will have
      // typed, and reads far better than "8 is not a legal front par 4".
      const seen = new Map();
      let duplicated = false;
      holes.forEach((h, i) => {
        if (seen.has(h)) {
          row.problems.push("hole " + h + " is nominated twice, as " +
            seen.get(h) + " and " + slots[i].label);
          duplicated = true;
        } else {
          seen.set(h, slots[i].label);
        }
      });
      if (duplicated) { rows.push(row); return; }

      slots.forEach((slot, i) => {
        const h = holes[i];
        if (slot.legal.indexOf(h) === -1) {
          row.problems.push("hole " + h + " is not a legal " + slot.label +
            " — " + slot.legal.join(", "));
        } else {
          row.picks[slot.key] = h;
        }
      });

      rows.push(row);
    });

    return { rows, ignored };
  }

  globalThis.ClubhouseImporter = {
    parseRoster, splitCsvLine, parseBirdiePicks,
    parseScores, splitName, grossCardToPlayer,
    normaliseName, unreverseName, stripHandicap, canonicalName, initialKey, matchName,
    nearestName, editDistance,
    PICKED_UP,
  };
})();
