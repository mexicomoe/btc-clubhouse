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
    const cols = ["Name", "Handicap index", "Tee", "Gender", "Cart", "Flight",
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
   *   players   the event's player records, exported in the order they are set up
   *   results   what computeLeaderboard returned for the whole field
   *   options   { displayNameOf, holesOf } — how to read a player's shown name
   *             and the raw hole values on his card
   *
   * A player with no result yet — no handicap index, so nothing to score —
   * still gets his row, with the scoring columns left empty. He is in the event
   * and an export that dropped him would be lying about who was there.
   */
  function eventToCsv(players, results, options) {
    const opts = options || {};
    const displayNameOf = opts.displayNameOf || ((p) => p.name);
    const holesOf = opts.holesOf || ((p) => p.gross || []);

    const byName = new Map();
    (results || []).forEach((r) => { if (!byName.has(r.name)) byName.set(r.name, r); });

    const lines = [csvRow(headerRow())];
    (players || []).forEach((p) => {
      const shown = displayNameOf(p);
      const r = byName.get(shown) || null;
      const holes = holesOf(p) || [];

      const cells = [
        shown,
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
  };
})();
