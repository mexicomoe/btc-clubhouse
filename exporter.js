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
  /**
   * The contests, in the order a card reads them.
   *
   * THIS IS A FRESH WORKBOOK. The zero base makes every past round
   * incomparable, so the archive is kept as it stands and this file starts
   * clean — which means the switched-off contests no longer need blank columns
   * holding their place. Damage Control, Go Long and Get Shorty are gone from
   * it. Bounce Back has a column of its own again — it is its own contest with
   * its own switch, and burying it inside Triple Threat's figure meant a sheet
   * could not tell a man who never blew up from one who blew up and recovered.
   */
  const CONTEST_COLUMNS = [
    ["watchTheBirdie", "Watch the Birdie"],
    ["sixPack", "Six Pack"],
    ["agonyAlley", "Agony Alley"],
    ["easyStreet", "Easy Street"],
    ["tripleThreat", "Triple Threat"],
    ["bounceBack", "Bounce Back"],
    ["hitList", "Hit List"],
    ["skins", "Skins"],
  ];

  function headerRow() {
    // The event's own columns lead every row. They repeat, which is the point:
    // several rounds can be piled into one sheet and still be told apart.
    const cols = ["Event", "Date", "Rules", "Format",
                  // Two names. The canonical one is what the scoreboard shows;
                  // the one as entered is what Golf Genius will match on, and
                  // only the organiser's own typing will do for that.
                  "Name", "Name as entered", "GHIN",
                  "Handicap index", "Tee", "Gender", "Group", "Flight",
                  // The six picks, in slot order. Par 4s are split front and
                  // back; the par 3s and par 5s float across the whole course.
                  "Front par 4 pick", "Back par 4 pick",
                  "Par 3 pick 1", "Par 3 pick 2",
                  "Par 5 pick 1", "Par 5 pick 2",
                  // Who he NAMED, spelled as he named him. Not to be confused
                  // with the "Hit List" column further right, which is what the
                  // pick paid — two columns of the same name in one sheet is a
                  // trap for whoever sorts on it six months from now.
                  "Hit List pick",
                  "Course handicap"];
    // Gross per hole, then the capped net per hole beside it. The net columns
    // are what the contests are actually graded on, so anything reading this
    // file no longer has to redo the handicap allocation to get at them.
    for (let h = 1; h <= HOLES; h++) cols.push("H" + h);
    for (let h = 1; h <= HOLES; h++) cols.push("N" + h);
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
        // A round scored on changed values must not sit in a sheet looking like
        // an ordinary one. Named contests rather than a bare flag, so a column
        // sort tells whoever reads it WHAT was different.
        e.contests ? "house: " + Object.keys(e.contests).join(" ") : "default",
        e.format == null ? "" : e.format,
        shown,
        p.name == null ? "" : p.name,        // exactly as it was typed on Setup
        p.ghin == null ? "" : p.ghin,
        p.index == null ? "" : p.index,
        p.tee || "",
        p.gender || "",
        p.cart == null ? "" : p.cart,
        (p.flight || "").trim(),
        p.p4f == null ? "" : p.p4f,
        p.p4b == null ? "" : p.p4b,
        p.p3a == null ? "" : p.p3a,
        p.p3b == null ? "" : p.p3b,
        p.p5a == null ? "" : p.p5a,
        p.p5b == null ? "" : p.p5b,
        p.hitList == null ? "" : p.hitList,
        r ? r.courseHandicap : "",
      ];
      for (let i = 0; i < HOLES; i++) {
        const v = holes[i];
        cells.push(v == null ? "" : v);      // "X" stays X; a blank stays blank
      }
      // The capped net per hole, straight off the result — the figure every
      // contest was graded on, so nothing downstream has to allocate the
      // strokes again. Every played hole carries its number, a pick-up
      // included: that one is net double, and the gross column beside it
      // already says X, so marking it twice would only cost the reader the
      // figure the contest actually read. A hole not played is blank on both
      // sides, which nothing can mistake for a score.
      const net = r && r.netByHole ? r.netByHole : null;
      for (let i = 0; i < HOLES; i++) {
        cells.push(net && net[i] != null ? net[i] : "");
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
      skinsOn: !(e.contests && "skins" in e.contests && e.contests.skins == null),
      players: (e.players || []).map((p) => [
        p.id, p.name, p.ghin, p.index, p.tee, p.gender, p.cart, p.flight,
        p.p4f, p.p4b, p.p3a, p.p3b, p.p5a, p.p5b, p.hitList,
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

  /* ---- moving an event between devices ----
     Everything lives in the browser, so an event set up on a laptop is not on
     the phone. This puts one on the clipboard as a single line of text, which
     can be messaged and pasted back — no file picker, which on a phone is the
     part that makes people give up.

     One line, no spaces, so nothing a messaging app does to whitespace can
     break it, and a marker at the front so a wrong paste is refused with a
     reason rather than half-read. */
  const CODE_PREFIX = "BTCCLUB1:";

  function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
  }
  function fromBase64(b64) {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  /* ---- packing a round small ----
     The code has to survive a text message and a clipboard, and the first
     attempt did not: an eight-man round came to 2,193 characters, because every
     player carried the same ten field names and an id nobody needs on the other
     side, and every hole was written as a number with a comma after it.

     So nothing is named. A player is a list in a fixed order, a card is
     eighteen characters, and the ids are dropped and made again on arrival.
     The same round now takes about a third of that. */

  /** One character a hole: 0–32 as a digit or letter, "." unplayed, "X" picked up. */
  const HOLE_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVW";
  const HOLE_UNPLAYED = ".";
  const HOLE_PICKED_UP = "X";

  function packHoles(holes) {
    let out = "";
    for (let i = 0; i < 18; i++) {
      const v = holes ? holes[i] : null;
      if (v == null) { out += HOLE_UNPLAYED; continue; }
      if (typeof v !== "number") { out += HOLE_PICKED_UP; continue; }
      const n = Math.max(0, Math.min(HOLE_CHARS.length - 1, Math.round(v)));
      out += HOLE_CHARS.charAt(n);
    }
    return out;
  }

  function unpackHoles(text) {
    const s = String(text == null ? "" : text);
    const out = [];
    for (let i = 0; i < 18; i++) {
      const c = s.charAt(i);
      if (c === HOLE_PICKED_UP) { out.push("X"); continue; }
      const n = HOLE_CHARS.indexOf(c);
      out.push(n === -1 ? null : n);       // "." and anything unexpected read as unplayed
    }
    return out;
  }

  /** Drop trailing nothings — they cost characters and carry no meaning. */
  function trimTail(list) {
    const out = list.slice();
    while (out.length && (out[out.length - 1] === null || out[out.length - 1] === "")) out.pop();
    return out;
  }

  /** The whole event as one line of text: players, scores, picks, everything. */
  function encodeEvent(event) {
    const e = event || {};
    const scores = e.scores || {};
    const handicaps = e.handicaps || {};

    // A player, in a fixed order. His id is left behind: it means nothing on
    // the other device, and a new one is made when the round lands there.
    const players = (e.players || []).map((p) => trimTail([
      p.name == null ? "" : p.name,
      p.ghin == null ? "" : p.ghin,
      p.index == null ? null : p.index,
      p.tee == null ? "" : p.tee,
      p.gender == null ? "" : p.gender,
      p.cart == null ? null : p.cart,
      (p.flight || "").trim(),
      // The two par 4 picks keep slots 7 and 8, where the two-pick form put
      // them, so a code written by the old app still reads correctly here and a
      // code written by this one still reads on a phone that has not updated —
      // it will simply see the two picks it knows about. The four new slots are
      // APPENDED past the end for the same reason.
      p.p4f == null ? null : p.p4f,
      p.p4b == null ? null : p.p4b,
      packHoles(scores[p.id]),
      handicaps[p.id] == null ? null : handicaps[p.id],
      p.p3a == null ? null : p.p3a,
      p.p3b == null ? null : p.p3b,
      p.p5a == null ? null : p.p5a,
      p.p5b == null ? null : p.p5b,
      // Appended past the end, so a code written by an older app still reads.
      p.hitList == null ? null : p.hitList,
    ]));

    // What travels is the round itself. Which tab was open, and whether THIS
    // device has exported it, belong to the device and are left behind.
    const payload = [
      2,                                   // an array marks the packed form
      e.name || "",
      e.date || "",
      e.format || "",
      typeof e.allowancePercent === "number" ? e.allowancePercent : 100,
      // Skins is switched under the rules now, like every other contest. The
      // flag is still WRITTEN so a phone on the older app reads the round the
      // way it was meant, and still READ so a code from that app arrives right.
      //
      // Either source counts: an event object still in the old shape — one
      // handed straight in rather than through the app's own migration — must
      // not quietly lose the fact that Skins was switched off.
      ((e.contests && "skins" in e.contests && e.contests.skins == null) ||
       e.skinsOn === false) ? 0 : 1,
      players,
      // THE RULES TRAVEL WITH THE ROUND. Appended past the end, so a code
      // written by an older app still reads and simply carries no rules — which
      // is exactly right, because it was played on the defaults.
      //
      // A DIFF, never a copy: a full config would cost 980 characters here and
      // a round on the defaults costs nothing at all.
      e.contests || null,
    ];
    return CODE_PREFIX + toBase64(JSON.stringify(payload));
  }

  /** Read the packed form back into the shape the app stores. */
  function unpackEvent(payload) {
    const players = [], scores = {}, handicaps = {};
    (payload[6] || []).forEach((row, i) => {
      const id = "p" + (i + 1);            // ids are made fresh on this device
      players.push({
        id,
        name: row[0] == null ? "" : row[0],
        ghin: row[1] == null ? "" : row[1],
        index: typeof row[2] === "number" ? row[2] : null,
        tee: row[3] || "IV",
        gender: row[4] === "F" ? "F" : "M",
        cart: row[5] == null ? null : row[5],
        flight: row[6] == null ? "" : row[6],
        p4f: row[7] == null ? null : row[7],
        p4b: row[8] == null ? null : row[8],
        p3a: row[11] == null ? null : row[11],
        p3b: row[12] == null ? null : row[12],
        p5a: row[13] == null ? null : row[13],
        p5b: row[14] == null ? null : row[14],
        hitList: row[15] == null ? "" : row[15],
      });
      if (row[9]) scores[id] = unpackHoles(row[9]);
      if (row[10] != null) handicaps[id] = row[10];
    });
    return {
      name: typeof payload[1] === "string" ? payload[1] : "",
      date: typeof payload[2] === "string" ? payload[2] : "",
      format: typeof payload[3] === "string" ? payload[3] : "",
      allowancePercent: typeof payload[4] === "number" ? payload[4] : 100,
      contests: (() => {
        const c = payload[7] && typeof payload[7] === "object" ? Object.assign({}, payload[7]) : null;
        if (payload[5] === 0 && !(c && "skins" in c)) return Object.assign({}, c || {}, { skins: null });
        return c;
      })(),
      players, scores, handicaps,
    };
  }

  /**
   * Read a pasted code back. Returns { ok, event, error } — and when it is not
   * ok, `error` says which part failed, so a man who pasted the wrong thing is
   * told what he pasted rather than just refused.
   */
  const refuse = (error) => ({ ok: false, event: null, error });

  /**
   * Pull the payload out of a body that may have a signature, a "cheers", or a
   * quoted reply stuck to the end of it. Trailing words cannot be told from the
   * code by their letters — "cheers" is as valid a run of base64 as any — so
   * when the whole thing will not read, characters are dropped from the end and
   * it is tried again. base64 only decodes on a multiple of four, so the
   * attempts are few and the search is bounded.
   */
  function readPayload(body) {
    for (let end = body.length - (body.length % 4); end >= 8; end -= 4) {
      try {
        const payload = JSON.parse(fromBase64(body.slice(0, end)));
        if (payload && typeof payload === "object") return payload;
      } catch (err) { /* shorter, then */ }
    }
    return null;
  }

  /**
   * Read a pasted code back.
   *
   * Deliberately forgiving about everything except the payload itself: the
   * marker is matched in any case and found anywhere in the text, so a code
   * sent inside a message still works and a phone that lowercased it on the way
   * in is no obstacle. Whitespace and line breaks are taken back out.
   *
   * Returns { ok, event, error }, and when it is not ok the error says what was
   * found rather than only what was wanted — a man who pasted the wrong thing
   * needs to know which wrong thing it was.
   */
  function decodeEvent(text) {
    const raw = String(text == null ? "" : text);
    if (raw.trim() === "") return refuse("Nothing pasted yet.");

    const at = raw.toUpperCase().indexOf(CODE_PREFIX);
    if (at === -1) {
      const looksLikeCard = /\t/.test(raw) || /\d[\t ]+\d/.test(raw);
      return refuse(looksLikeCard
        ? "That looks like pasted scores, not an event code. Scores go on the Import tab; " +
          "an event code begins " + CODE_PREFIX + " and comes from “Copy this event”."
        : "No " + CODE_PREFIX + " marker in what you pasted, so this is not an event code. " +
          "Copy it again from the other device with “Copy this event”.");
    }

    // Everything after the marker, with every kind of whitespace a message or a
    // mail client might have folded into it taken out again.
    const body = raw.slice(at + CODE_PREFIX.length).replace(/\s+/g, "");
    if (body === "") {
      return refuse("The marker is there but nothing follows it — the code was cut off before it started.");
    }

    const payload = readPayload(body);
    if (!payload) {
      // Three different failures, and they want three different answers.
      if (/[^A-Za-z0-9+/=]/.test(body)) {
        return refuse("There are characters in that code which are not part of one — " +
          "something was added to it, or a phone changed it on the way in. " +
          "Copy it again and paste it without editing.");
      }
      let unpacked = null;
      try { unpacked = fromBase64(body.slice(0, body.length - (body.length % 4))); }
      catch (err) { /* it did not even unpack */ }

      // A code cut off mid-way still unpacks — into the FRONT of the payload,
      // which always opens with a bracket (packed) or a brace (the older form).
      // That is how a half-copied code is told from one that was never a code.
      const opens = unpacked == null ? "" : unpacked.trim().charAt(0);
      const looksTruncated = unpacked == null || opens === "[" || opens === "{";
      return refuse(looksTruncated
        ? "This doesn't look like a complete event code — it was cut short. Only " +
          body.length + " characters came through after the marker, and an event " +
          "is usually several hundred. Copy the whole of it and paste it again."
        : "That unpacked, but what came out was not an event — the code was altered on the way, " +
          "or it was never an event code.");
    }
    // An array is the packed form; an object is the first, wordy one. Codes
    // made before the packing still read, which costs one branch.
    if (Array.isArray(payload)) {
      if (!Array.isArray(payload[6])) {
        return refuse("That code unpacked, but there are no players in it — it is not an event.");
      }
      return { ok: true, error: null, event: unpackEvent(payload) };
    }

    if (!Array.isArray(payload.players)) {
      return refuse("That code unpacked, but there are no players in it — it is not an event.");
    }

    return {
      ok: true, error: null,
      event: {
        name: typeof payload.name === "string" ? payload.name : "",
        date: typeof payload.date === "string" ? payload.date : "",
        format: typeof payload.format === "string" ? payload.format : "",
        allowancePercent: typeof payload.allowancePercent === "number" ? payload.allowancePercent : 100,
        skinsOn: payload.skinsOn !== false,
        players: payload.players,
        scores: payload.scores && typeof payload.scores === "object" ? payload.scores : {},
        handicaps: payload.handicaps && typeof payload.handicaps === "object" ? payload.handicaps : {},
      },
    };
  }

  globalThis.ClubhouseExporter = {
    encodeEvent, decodeEvent, CODE_PREFIX,
    eventToCsv, csvFilename, csvField, headerRow, CONTEST_COLUMNS,
    eventSignature, changedSinceExport,
  };
})();
