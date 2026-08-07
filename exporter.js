"use strict";
/**
 * Beat the Crowd · Clubhouse — the event export (build brief section 5).
 *
 * Same arrangement as engine.js and importer.js: this plain .js file is the ONE
 * implementation, loaded by the browser with a classic <script src> and imported
 * for its side effect by src/exportScores.ts, which re-exports it with types so
 * the tests run this exact code.
 *
 * One row per player, in the order the brief asks for. The hole columns carry
 * what is on the card and nothing else: a blank for a hole not played, and X
 * where a man picked up — never the par + 4 filled in behind it, which is a
 * scoring device rather than something he shot.
 */
(function () {
  const HOLES = 18;

  /** The contests, in the order they are scored and shown. */
  const CONTEST_COLUMNS = [
    ["watchTheBirdie", "Watch the Birdie"],
    ["agonyAlley", "Agony Alley"],
    ["damageControl", "Damage Control"],
    ["goLong", "Go Long"],
    ["getShorty", "Get Shorty"],
    ["bounceBack", "Bounce Back"],
    ["skins", "Cart Skins"],
  ];

  function headerRow() {
    // The event's own columns lead every row. They repeat, which is the point:
    // several rounds can be piled into one sheet and still be told apart.
    const cols = ["Event", "Date", "Format",
                  // Two names. The canonical one is what the scoreboard shows;
                  // the one as entered is what Golf Genius will match on, and
                  // only the organiser's own typing will do for that.
                  "Name", "Name as entered", "GHIN",
                  "Handicap index", "Tee", "Gender", "Cart", "Flight",
                  "Front pick", "Back pick", "Course handicap"];
    for (let h = 1; h <= HOLES; h++) cols.push("H" + h);
    cols.push("Net", "Gross");
    for (const [, label] of CONTEST_COLUMNS) cols.push(label);
    cols.push("Final");
    return cols;
  }

  /**
   * A CSV field. Anything holding a comma, a quote or a line break is wrapped in
   * quotes and its own quotes doubled — the rule every spreadsheet agrees on.
   * Null and undefined become empty rather than the words "null"/"undefined".
   */
  function csvField(value) {
    if (value == null) return "";
    const s = String(value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function csvRow(values) {
    return values.map(csvField).join(",");
  }

  /**
   * Build the CSV for one event.
   *
   *   event     the event itself — its name, date, format and players
   *   results   what computeLeaderboard returned for the whole field
   *   options   { displayNameOf, holesOf } — how to read a player's shown name
   *             and the raw hole values on his card
   *
   * A player with no result yet — no handicap index, so nothing to score —
   * still gets his row, with the scoring columns left empty. He is in the event
   * and an export that dropped him would be lying about who was there.
   */
  function eventToCsv(event, results, options) {
    const opts = options || {};
    const e = event || {};
    const players = e.players || [];
    const displayNameOf = opts.displayNameOf || ((p) => p.name);
    const holesOf = opts.holesOf || ((p) => p.gross || []);

    const byName = new Map();
    (results || []).forEach((r) => { if (!byName.has(r.name)) byName.set(r.name, r); });

    const lines = [csvRow(headerRow())];
    players.forEach((p) => {
      const shown = displayNameOf(p);
      const r = byName.get(shown) || null;
      const holes = holesOf(p) || [];

      const cells = [
        e.name == null ? "" : e.name,
        e.date == null ? "" : e.date,
        e.format == null ? "" : e.format,
        shown,
        p.name == null ? "" : p.name,        // exactly as it was typed on Setup
        p.ghin == null ? "" : p.ghin,
        p.index == null ? "" : p.index,
        p.tee || "",
        p.gender || "",
        p.cart == null ? "" : p.cart,
        (p.flight || "").trim(),
        p.front == null ? "" : p.front,
        p.back == null ? "" : p.back,
        r ? r.courseHandicap : "",
      ];
      for (let i = 0; i < HOLES; i++) {
        const v = holes[i];
        cells.push(v == null ? "" : v);      // "X" stays X; a blank stays blank
      }
      cells.push(r && r.net != null ? r.net : "");
      cells.push(r && r.gross != null ? r.gross : "");
      for (const [key] of CONTEST_COLUMNS) {
        const c = r && r.contests ? r.contests[key] : null;
        cells.push(c ? c.strokes : "");
      }
      cells.push(r && r.final != null ? r.final : "");
      lines.push(csvRow(cells));
    });

    // A trailing newline: the last row is a row like any other, and a file
    // without one trips some readers.
    return lines.join("\r\n") + "\r\n";
  }

  /**
   * A fingerprint of everything the CSV would carry. Compared with the one
   * taken when the event was last exported, it answers the question that
   * actually matters before a delete: not "was this ever exported" but "has it
   * moved since". Exported at lunch, the real scores imported after, deleted
   * next week is exactly how a round gets lost.
   *
   * Only what the file carries is fingerprinted. Which tab was open or which
   * flight was being looked at is not part of the round.
   */
  function eventSignature(event) {
    const e = event || {};
    return JSON.stringify({
      name: e.name || "",
      date: e.date || "",
      format: e.format || "",
      allowancePercent: e.allowancePercent,
      skinsOn: e.skinsOn !== false,
      players: (e.players || []).map((p) => [
        p.id, p.name, p.ghin, p.index, p.tee, p.gender, p.cart, p.flight, p.front, p.back,
      ]),
      scores: e.scores || {},
      handicaps: e.handicaps || {},
    });
  }

  /** Has the round moved since it was last exported? */
  function changedSinceExport(event) {
    const e = event || {};
    if (!e.exportedAt) return true;                  // never exported at all
    if (!e.exportedSignature) return true;           // exported before this was recorded
    return e.exportedSignature !== eventSignature(e);
  }

  /**
   * "Friday" on 2026-08-07 becomes "Friday 2026-08-07.csv". Anything a file
   * system objects to is replaced rather than left to fail silently on save.
   */
  function csvFilename(name, date) {
    const clean = String(name == null ? "" : name)
      .replace(/[\\/:*?"<>|]+/g, "-")     // illegal on Windows, awkward everywhere
      .replace(/\s+/g, " ")
      .trim();
    const stem = [clean || "event", date || ""].filter(Boolean).join(" ");
    return stem + ".csv";
  }

  globalThis.ClubhouseExporter = {
    eventToCsv, csvFilename, csvField, headerRow, CONTEST_COLUMNS,
    eventSignature, changedSinceExport,
  };
})();
