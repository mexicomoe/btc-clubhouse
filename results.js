"use strict";
/**
 * Beat the Crowd · Clubhouse — a finished round, small enough to text.
 *
 * Same arrangement as engine.js, importer.js and exporter.js: this plain .js
 * file is the ONE implementation, loaded by both pages with a classic
 * <script src> and imported for its side effect by src/shareResults.ts, which
 * re-exports it with types so the tests run this exact code.
 *
 * WHAT THIS IS FOR. A round is scored on the organiser's phone and nobody else
 * can see it. This turns the finished leaderboard into one link he can text.
 * There is no server: the round travels inside the link.
 *
 * IT CARRIES RESULTS, NOT A ROUND. The event code in exporter.js carries SETUP
 * — players, handicaps, eighteen holes each — and the far end scores it again.
 * That is exactly wrong for a share link, three times over: it needs the
 * scoring engine present on a page that must never reach it; it would rescore
 * against the READER's settings, so a link would change its numbers when the
 * organiser changed a threshold; and it costs the eighteen holes a man will
 * never read on a phone. So the finished figures travel, already settled, and
 * results.html carries no engine at all.
 *
 * IT IS OBFUSCATED, NOT ENCRYPTED. Nothing is legible in the address bar — the
 * payload is base64, so a forwarded text shows no member names to anyone
 * glancing at it. But anyone who pastes it into a decoder has the names and
 * scores back in seconds. TREAT A SHARED LINK AS PUBLIC. That is the right
 * trade for this: it is a golf leaderboard, the same names and scores are
 * already on the club's Golf Genius portal, and a password to type would
 * defeat the one thing the link is for.
 *
 * NO COMPRESSION, DELIBERATELY. A full 24-man field — the app's own maximum —
 * comes to about 1,700 characters, comfortably inside the 2,000 this refuses
 * above. Deflate would roughly halve that, but it needs CompressionStream at
 * BOTH ends, and a man on an older phone would tap the link and get nothing.
 * Plain base64 works on anything with a browser.
 */
(function () {

  /**
   * The marker, with a version number in it so a later format can be told apart.
   *
   * IT ENDS IN AN UNDERSCORE, AND THAT MATTERS. It used to end in a colon, like
   * the event code's marker, and a link sent by e-mail worked while the same
   * link sent by text arrived with nothing after the "#". The colon was the only
   * character in the whole fragment that is not base64url, and it can do two
   * separate kinds of damage:
   *
   *   · "BTCR1:" has the exact shape of a URI SCHEME — a letter followed by
   *     letters and digits, then a colon. A link detector scanning a message can
   *     end the https URL at the "#" and read the rest as a second URI with an
   *     unknown scheme, which it then drops. The address that gets tapped is the
   *     page with no round on it.
   *   · A sender that percent-encodes the fragment writes "BTCR1%3A", and a
   *     marker matched by its literal characters no longer matches at all.
   *
   * An underscore is in the base64url alphabet, is not a scheme separator and is
   * not percent-encoded by anything. The fragment is now a single unbroken run
   * of [A-Za-z0-9_-] with nothing in it for a parser to take an interest in.
   */
  const RESULT_PREFIX = "BTCR1_";

  /**
   * Every marker a link may arrive with. Only the first is ever written; the
   * others are read so that a link already sent still opens.
   */
  const READ_PREFIXES = ["BTCR1_", "BTCR1:", "BTCR1%3A", "BTCR1-"];

  /**
   * The most characters a whole URL may run to. The figure is not a browser
   * limit — Safari and Chrome take fragments of 64 KB — but the point at which
   * a link stops surviving the trip. A messaging app decides for itself where a
   * URL ends, and a long one is where that goes wrong.
   *
   * The payload is base64url (A–Z a–z 0–9 - _), which every link-detector
   * agrees is part of a URL. Standard base64's "+" and "/" are not.
   */
  const MAX_URL_LENGTH = 2000;

  /** The seven contests, in the order they are shown. Index, not name, travels. */
  const RESULT_CONTESTS = ["watchTheBirdie", "agonyAlley", "damageControl",
                           "easyStreet", "tripleThreat", "bounceBack", "skins"];

  /* ---- base64url, which survives a text message ---- */
  function toBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromBase64Url(code) {
    let b64 = String(code).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  /**
   * Strokes travel as TENTHS, as whole numbers — 0.5 becomes 5 and −2.5 becomes
   * −25. Every value in the game is a multiple of 0.1, so nothing is lost, and
   * it saves the decimal point on every figure on the card.
   */
  const toTenths = (v) => (v == null ? null : Math.round(v * 10));
  const fromTenths = (v) => (v == null ? null : Math.round(v) / 10);

  /**
   * Pack a scored leaderboard.
   *
   *   round    { course, date, tee, note } — the heading, and any way this round
   *            differed from the defaults ("85% allowance", "skins off")
   *   results  what computeLeaderboard returned, in finishing order
   *   live     the contest keys actually scored this round
   *
   * A player is a list in fixed order, never named fields. What is settled here
   * is settled for good: the rank and the tie phrase travel as decided, because
   * the far end has no cards to run a card match on and must not guess at one.
   */
  /*
   * The payload is DELIMITED TEXT, not JSON. JSON spends a quote on every name,
   * a bracket on every row and the word "null" on every gap, and it cost four
   * or five players off the top of the field — a 24-man round did not fit,
   * which is the app's own maximum and so the only number that matters. The
   * same round in the form below has room to spare.
   *
   *   line 0    version, course, date, tee, contest indexes, note
   *   line n    name, course handicap, gross, net, contest tenths,
   *             final tenths, rank, tie phrase, eligible, holes played
   *
   * Tab between fields, newline between players, comma inside the two lists.
   * None of the three can occur in a name — and any that somehow did is taken
   * out on the way in rather than left to shift every later field along by one.
   *
   * THE LAST THREE FIELDS ARE ORDERED TO BE DROPPED. A tie phrase is empty for
   * almost everybody, almost everybody is eligible, and almost everybody played
   * eighteen — so all three are written as nothing when they say the ordinary
   * thing, and trailing nothings are cut off the end of the row. Six characters
   * a player, which is two more men in the field.
   */
  const FIELD = "\t", ROW = "\n", LIST = ",";
  const clean = (s) => String(s == null ? "" : s).replace(/[\t\r\n]+/g, " ").trim();
  const num = (v) => (v == null ? "" : String(v));

  function encodeResults(round, results, live) {
    const r = round || {};
    const keys = (live && live.length ? live : RESULT_CONTESTS)
      .filter((k) => RESULT_CONTESTS.indexOf(k) !== -1);

    const head = [1, clean(r.course), clean(r.date), clean(r.tee),
                  keys.map((k) => RESULT_CONTESTS.indexOf(k)).join(LIST),
                  clean(r.note)].join(FIELD);

    const rows = (results || []).map((p) => row([
      clean(p.name),
      num(p.courseHandicap),
      num(p.gross),
      num(p.net),
      keys.map((k) => (p.contests && p.contests[k] ? num(toTenths(p.contests[k].strokes)) : "")).join(LIST),
      num(toTenths(p.final)),
      num(p.rank),
      clean(p.tieNote),
      p.eligible === false ? "0" : "",              // blank is the ordinary case
      p.holesPlayed == null || p.holesPlayed === 18 ? "" : String(p.holesPlayed),
    ]));

    return RESULT_PREFIX + toBase64Url([head].concat(rows).join(ROW));
  }

  /** Drop trailing nothings, then join. They cost a character each and say nothing. */
  function row(fields) {
    const out = fields.slice();
    while (out.length > 6 && out[out.length - 1] === "") out.pop();
    return out.join(FIELD);
  }

  /**
   * The whole link for a round, and whether it will survive being sent.
   *
   * Returns { code, url, length, fits, players }. `fits` false means the button
   * must say so rather than hand over an address that will arrive cut in half —
   * a truncated link is worse than no link, because it looks like it worked.
   */
  function resultsLink(baseUrl, round, results, live) {
    const code = encodeResults(round, results, live);
    const url = String(baseUrl || "") + "#" + code;
    return { code, url, length: url.length, fits: url.length <= MAX_URL_LENGTH,
             players: (results || []).length, limit: MAX_URL_LENGTH };
  }

  const refuse = (error) => ({ ok: false, round: null, error });

  /**
   * Read a link back.
   *
   * Every failure gets its own sentence. A man who taps a link that arrived
   * broken should be told the link is broken — not shown an empty leaderboard,
   * which he would read as "nobody scored" and repeat in the bar.
   */
  function decodeResults(text) {
    let raw = String(text == null ? "" : text);

    // Percent-escapes first, in case something on the way encoded the fragment.
    // A payload of base64url has nothing in it that needs encoding, so anything
    // escaped here was added by a messenger rather than by us.
    if (raw.indexOf("%") !== -1) {
      try { raw = decodeURIComponent(raw); } catch (err) { /* leave it as it came */ }
    }

    // The round may ride in the fragment (where it is never sent to a server) or
    // in a query string. Only the fragment is written today; the query string is
    // read as well so that moving to it, if a messenger ever forces the issue,
    // needs no change to this page — and a link already out there keeps working.
    const upper = raw.toUpperCase();
    let at = -1, markerLength = 0;
    for (const prefix of READ_PREFIXES) {
      const found = upper.indexOf(prefix.toUpperCase());
      if (found !== -1 && (at === -1 || found < at)) { at = found; markerLength = prefix.length; }
    }
    if (at === -1) {
      // Say which of the two it was. "The link opened but the board is empty" is
      // the hardest kind of fault to report on, and the difference between an
      // address with nothing after the "#" and one that was never a round at all
      // is the difference between "your messenger ate it" and "wrong link".
      const hasPage = /results\.html/i.test(raw);
      const hasNothingAfterHash = /#\s*$/.test(raw) || (hasPage && raw.indexOf("#") === -1);
      return refuse(hasNothingAfterHash
        ? "The round is missing from this link — everything after the “#” was lost on the way. " +
          "Ask for it again, and send it as an e-mail if a text keeps doing this."
        : "This link does not carry a round. Ask for it to be sent again.");
    }
    const body = raw.slice(at + markerLength).replace(/\s+/g, "");
    if (body === "") {
      return refuse("The link arrived empty — everything after the marker was lost. Ask for it again.");
    }
    if (/[^A-Za-z0-9\-_=]/.test(body)) {
      return refuse("There are characters in this link that are not part of one. " +
        "It was probably edited or wrapped by a message. Ask for it again.");
    }

    let plain;
    try {
      plain = fromBase64Url(body);
    } catch (err) {
      // Overwhelmingly the cut-in-half case: base64 only decodes on a multiple
      // of four, so a link that lost its tail usually fails right here.
      return refuse("This link is cut short — only part of it arrived. " +
        "Messages sometimes shorten a long link; ask for it again.");
    }

    const lines = plain.split(ROW);
    const head = lines[0].split(FIELD);
    if (head[0] !== "1") {
      // A truncated payload that happened to decode lands here too: the first
      // field is the version and nothing else may stand in that place.
      return refuse(/^\d+$/.test(head[0])
        ? "This link was made by a newer version of Clubhouse than this page. " +
          "Open it again from the message, or ask for a fresh one."
        : "This link is cut short or was edited — it does not read as a round. " +
          "Ask for it to be sent again.");
    }

    const keys = String(head[4] || "").split(LIST)
      .map((i) => RESULT_CONTESTS[Number(i)]).filter(Boolean);

    const number = (s) => (s === "" || s == null ? null : Number(s));
    const players = [];
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === "") continue;
      const f = lines[i].split(FIELD);
      // The last three fields are dropped when they say the ordinary thing, so
      // a short row is expected — but not shorter than the figures themselves,
      // because the fields are positional and a truncated one would read a
      // final as a rank.
      if (f.length < 7) {
        return refuse("This link is cut short — the last player on it is incomplete. " +
          "Ask for it to be sent again.");
      }
      const values = String(f[4] || "").split(LIST);
      const contests = {};
      keys.forEach((k, n) => {
        const v = number(values[n]);
        if (v != null) contests[k] = fromTenths(v);
      });
      players.push({
        name: f[0] || "",
        courseHandicap: number(f[1]),
        gross: number(f[2]),
        net: number(f[3]),
        contests,
        final: fromTenths(number(f[5])),
        rank: number(f[6]),
        tieNote: f[7] || "",
        eligible: f[8] !== "0",
        holesPlayed: f[9] == null || f[9] === "" ? 18 : Number(f[9]),
      });
    }

    if (players.length === 0) {
      return refuse("This link carries no players. Ask for it to be sent again.");
    }

    return {
      ok: true, error: null,
      round: {
        course: head[1] || "", date: head[2] || "", tee: head[3] || "",
        contests: keys, note: head[5] || "", players,
      },
    };
  }

  /**
   * The most players that will fit under the limit, for a given average name
   * length. Worked out by building a field and measuring, rather than by
   * arithmetic on an estimate — the JSON punctuation is real and counts.
   */
  function maxPlayersThatFit(baseUrl, nameLength) {
    const len = nameLength || 14;
    const name = "X".repeat(Math.max(1, len));
    const one = (n) => {
      const results = Array.from({ length: n }, (_, i) => ({
        name: name, courseHandicap: 22, gross: 95, net: 76, final: 72.5,
        rank: i + 1, tieNote: "", eligible: true, holesPlayed: 18,
        contests: Object.fromEntries(RESULT_CONTESTS.map((k) => [k, { strokes: -1.5 }])),
      }));
      return resultsLink(baseUrl, { course: "Aberdeen Golf & Country Club",
        date: "2026-08-14", tee: "IV", note: "" }, results, RESULT_CONTESTS);
    };
    let n = 0;
    while (n < 200 && one(n + 1).fits) n++;
    return n;
  }

  globalThis.ClubhouseResults = {
    RESULT_PREFIX, READ_PREFIXES, RESULT_CONTESTS, MAX_URL_LENGTH,
    encodeResults, decodeResults, resultsLink, maxPlayersThatFit,
    toBase64Url, fromBase64Url,
  };
})();
