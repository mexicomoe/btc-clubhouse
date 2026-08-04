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
      if (rawName === "") continue; // stray blank-first-cell row

      const split = splitName(rawName);
      const name = split.name, handicap = split.handicap;

      if (layout.holeCols.length !== HOLES) {
        errors.push(name + ": could not find 18 hole columns in the paste.");
        continue;
      }

      const holes = layout.holeCols.map((i) => numOrNull(cells[i]));
      const grossTotal = layout.totalCol != null ? numOrNull(cells[layout.totalCol]) : null;
      const netTotal = layout.netCol != null ? numOrNull(cells[layout.netCol]) : null;
      const holesPlayed = holes.filter((h) => h != null).length;

      const verdict = classify(name, holes, holesPlayed, grossTotal, netTotal);
      if (verdict.error) errors.push(verdict.error);

      cards.push({ name, handicap, holes, holesPlayed, mode: verdict.mode, grossTotal, netTotal });
    }

    return { cards, errors };
  }

  /** Decide gross vs net for one card by which total the 18 holes sum to. */
  function classify(name, holes, holesPlayed, grossTotal, netTotal) {
    if (grossTotal == null) {
      return { mode: "unknown", error: name + ": no Total column — cannot read the card." };
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
    return { holeCols, totalCol, netCol, firstDataRow: headerRow + 1 };
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

  globalThis.ClubhouseImporter = {
    parseScores, splitName, grossCardToPlayer, normaliseName,
  };
})();
