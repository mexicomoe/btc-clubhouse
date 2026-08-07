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

    // Locate the columns. If a header row is present (it carries "Total"), read
    // the hole/Total/Net positions from it — that survives Out/In being dropped
    // from a selection. Otherwise fall back to the fixed section-10 layout.
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

      const verdict = classify(name, holes, holesPlayed, pickedUp, grossTotal, netTotal);
      if (verdict.error) errors.push(verdict.error);

      cards.push({ name, handicap, holes, holesPlayed, pickedUp,
                   mode: verdict.mode, grossTotal, netTotal, skip: null });
    }

    return { cards, errors };
  }

  /** Decide gross vs net for one card by which total the 18 holes sum to. */
  function classify(name, holes, holesPlayed, pickedUp, grossTotal, netTotal) {
    if (grossTotal == null) {
      return { mode: "unknown", error: name + ": no Total column — cannot read the card." };
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

  /** Find the column layout, reading a header row if the paste includes one. */
  function detectLayout(lines) {
    const headerRow = lines.findIndex((l) => /(^|\t)\s*total\s*(\t|$)/i.test(l));
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

  globalThis.ClubhouseImporter = {
    parseScores, splitName, grossCardToPlayer,
    normaliseName, unreverseName, stripHandicap, canonicalName, initialKey, matchName,
    PICKED_UP,
  };
})();
