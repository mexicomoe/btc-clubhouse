"use strict";
/**
 * Beat the Crowd · Clubhouse — the field, packed into a link.
 *
 * WHY THIS EXISTS. Birdie picks need only the course, so one pick sheet serves
 * everybody and always has. The HIT LIST needs the field and its handicaps: a
 * man's eight opponents are the eight nearest his own index, and a page with no
 * idea who is playing cannot work that out. So Rob generates one link carrying
 * the field and texts it to the group.
 *
 * ONE IMPLEMENTATION, loaded by both ends. leaderboard.html writes the link and
 * picks.html reads it; two copies of this would drift the first time a name
 * with a comma in it came up, and the failure would be silent — a man offered
 * the wrong eight opponents, or none.
 *
 * WHAT IT CARRIES, AND WHAT THAT MEANS. Every player's name and handicap index,
 * readable by anyone who opens the link. That is not a leak to worry about —
 * the same names and handicaps are on the Golf Genius portal and pinned in the
 * clubhouse — but it is a fact the generating screen states plainly rather than
 * leaving to be discovered.
 *
 * IT IS A SNAPSHOT. The field is baked in when the link is made. Men who join
 * or drop out afterwards are not in it, so the page carries the date it was
 * made and says so.
 */
(function () {

  /** The marker, and the version. A link is not a round; it needs neither. */
  const FIELD_PREFIX = "BTCF1_";
  /** Where the field rides. A query string, for the same reason the results
      link uses one: iOS Messages ends a link at the "#" and drops the rest. */
  const FIELD_QUERY = "?f=";

  /* Tab between fields, newline between players — neither can occur in a name,
     and any that somehow did is taken out on the way in rather than left to
     shift every later field along by one. */
  const FIELD = "\t", ROW = "\n";
  const clean = (s) => String(s == null ? "" : s).replace(/[\t\r\n]+/g, " ").trim();

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
   * Pack a field. `players` is [{ name, index }, ...] — nothing else travels,
   * because nothing else is needed to work out a man's eight.
   *
   * `made` is the date the link was generated, so the page can say how old it
   * is. Passed in rather than read from a clock here, so a test can pin it.
   */
  function encodeField(players, made) {
    const head = [1, clean(made)].join(FIELD);
    const rows = (players || []).map((p) =>
      [clean(p.name), p.index == null ? "" : String(p.index)].join(FIELD));
    return FIELD_PREFIX + toBase64Url([head].concat(rows).join(ROW));
  }

  /**
   * Read one back. Returns { ok, field, error } — and when it is not ok, `error`
   * says which part failed, because a man who opens a mangled link should be
   * told the link is wrong rather than shown an empty page he blames himself for.
   */
  function decodeField(text) {
    let raw = String(text == null ? "" : text).trim();
    if (raw === "") return { ok: false, field: null, error: "There is no field in this link." };
    if (raw.indexOf("%") !== -1) {
      try { raw = decodeURIComponent(raw); } catch (err) { /* leave it as it came */ }
    }
    if (raw.indexOf(FIELD_PREFIX) === 0) raw = raw.slice(FIELD_PREFIX.length);

    let text2;
    try { text2 = fromBase64Url(raw); }
    catch (err) { return { ok: false, field: null, error: "This link is damaged and cannot be read." }; }

    const lines = text2.split(ROW);
    const head = (lines.shift() || "").split(FIELD);
    if (head[0] !== "1") {
      return { ok: false, field: null, error: "This link was made by a newer version of the app." };
    }
    const players = [];
    for (const line of lines) {
      if (line.trim() === "") continue;
      const cell = line.split(FIELD);
      const index = cell[1] === "" || cell[1] == null ? null : Number(cell[1]);
      players.push({ name: cell[0], index: Number.isFinite(index) ? index : null });
    }
    if (players.length === 0) {
      return { ok: false, field: null, error: "This link carries no players." };
    }
    return { ok: true, field: { made: head[1] || "", players }, error: null };
  }

  /** The whole address a man taps. `base` is the pick sheet's own URL. */
  function fieldLink(base, players, made) {
    return String(base).split("?")[0].split("#")[0] + FIELD_QUERY + encodeField(players, made);
  }

  /**
   * The field out of a full URL or a bare code — whatever was pasted.
   *
   * A URL WITH NO FIELD IN IT IS NOT A DAMAGED LINK, it is the plain pick sheet,
   * which is a perfectly ordinary thing to open. Handing the whole address to
   * the decoder made it read as base64, fail, and report "made by a newer
   * version of the app" — an alarming answer to somebody who did nothing wrong.
   */
  function fieldFromUrl(url) {
    const s = String(url == null ? "" : url);
    const at = s.indexOf(FIELD_QUERY);
    if (at === -1) {
      // A bare code, pasted on its own, still reads. Anything that looks like an
      // address without the marker simply has no field in it.
      if (s.indexOf(FIELD_PREFIX) === 0) return decodeField(s);
      return { ok: false, field: null, error: "There is no field in this link." };
    }
    return decodeField(s.slice(at + FIELD_QUERY.length));
  }

  globalThis.ClubhouseFieldLink = {
    encodeField, decodeField, fieldLink, fieldFromUrl,
    FIELD_PREFIX, FIELD_QUERY,
  };
})();
