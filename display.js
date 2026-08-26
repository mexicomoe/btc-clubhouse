"use strict";
/**
 * Beat the Crowd · Clubhouse — the display helpers both pages share.
 *
 * Loaded with a classic <script src> by leaderboard.html (the app) and by
 * results.html (the read-only view a shared link opens). One copy rather than
 * two, for the same reason clubhouse.css is one file: a shared leaderboard has
 * to look like the app, and two copies of the name-fitting rule would quietly
 * stop agreeing about when a surname becomes an initial.
 *
 * Nothing here knows how to score anything. It formats and it measures text.
 */
(function () {

  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }
  /**
   * The final, SIGNED. The base is zero and the measure is strokes under and
   * over par, so a board reads −4.0, −2.0, +1.0, +3.0 and a bare "4.0" would be
   * read as a score rather than as three over. Real minus sign, one decimal —
   * every value in the game is a multiple of a tenth.
   */
  function fmtFinal(x){
    if(x == null) return "—";
    if(x === 0) return "0.0";
    return (x < 0 ? "−" : "+") + Math.abs(x).toFixed(1);
  }
  function fmtStrokes(s){
    if(s===0) return "0.0";
    let str = Math.abs(s).toFixed(2);
    if(str.endsWith("0")) str = str.slice(0,-1);   // 2.00→2.0, 0.50→0.5, 0.75 stays
    return (s<0 ? "−" : "+") + str;            // real minus sign
  }
  /* Shrink a nowrap element's font down from its max only as far as needed to fit
     on one line within its box, but never below min. */
  function fitText(el, max, min){
    if(!el) return;
    el.style.fontSize = max + "px";
    let size = max;
    while(size > min && el.scrollWidth > el.clientWidth + 0.5){
      size -= 1;
      el.style.fontSize = size + "px";
    }
  }
  /* "Christiaan Bezuidenhout" -> "Christiaan B." — first name kept, surname to an initial. */
  function abbreviate(full){
    const p = String(full).trim().split(/\s+/);
    return p.length < 2 ? full : p[0] + " " + p[p.length - 1].charAt(0) + ".";
  }
  /* Names never render below 18px (the legibility floor for this audience). Fit the
     full name down to 18; if it still won't fit, shorten the surname to an initial the
     way a clubhouse scoreboard always has, then fit that — still never below 18. */
  function fitName(el, max, min){
    if(!el) return;
    const full = el.dataset.full || (el.dataset.full = el.textContent.trim());
    el.textContent = full;
    fitText(el, max, min);
    if(el.scrollWidth > el.clientWidth + 0.5){
      el.textContent = abbreviate(full);
      fitText(el, max, min);
    }
  }

  const MONTHS = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];

  /**
   * A date in the box a man types into: MM/DD/YYYY.
   *
   * WHY NOT `<input type="date">`. A native date field is drawn by the BROWSER
   * in the BROWSER's locale, and nothing on the page reaches it — not `lang`,
   * not a format attribute, because there is no such attribute. A laptop set to
   * a British locale showed the event date as 28/08/2026 while every date the
   * app itself printed read August 28, 2026. Same fault as the rules screen
   * showing −0,5, and the same fix: stop handing the value to something that
   * will redraw it, and render the string ourselves.
   *
   * THE COST IS THE NATIVE PICKER — the wheel on a phone. Accepted because the
   * date defaults to today and most rounds never touch it, and because a field
   * that shows the wrong date every time is worse than one that takes eight
   * digits on the rare occasion it is wrong.
   */
  function usDate(iso){
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    return m ? m[2] + "/" + m[3] + "/" + m[1] : "";
  }

  /**
   * Read one back. Returns an ISO date, or null for anything it cannot be sure
   * of — the caller keeps the date it had rather than storing a guess.
   *
   * FORGIVING IN THE DIRECTIONS THAT ARE SAFE: single digits, dashes or dots
   * instead of slashes, and a pasted ISO date, which is what comes off a
   * spreadsheet. NOT forgiving about a two-digit year, because 08/09/26 has
   * three readings and only one of them is right.
   */
  function isoFromUs(text){
    const s = String(text == null ? "" : text).trim();
    if(s === "") return null;
    // A pasted ISO date is unambiguous, so it is taken as it stands.
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    const us = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
    let y, mo, d;
    if(iso){ y = +iso[1]; mo = +iso[2]; d = +iso[3]; }
    else if(us){ mo = +us[1]; d = +us[2]; y = +us[3]; }
    else return null;
    if(mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2999) return null;
    // A real calendar day, so 02/30 is refused rather than rolled into March.
    const probe = new Date(Date.UTC(y, mo - 1, d));
    if(probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
    const p = (n) => String(n).padStart(2, "0");
    return y + "-" + p(mo) + "-" + p(d);
  }

  function niceDate(iso){
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if(!m) return String(iso || "");
    /* MONTH, DAY, YEAR — this is a Florida golf club. It read "22 August 2026"
       for a while, which is not how anybody here writes a date.
       Built by hand rather than by toLocaleDateString, which would read
       differently again on a phone set to another language. The point is that
       every phone shows the SAME thing, and that thing is US. */
    return MONTHS[Number(m[2]) - 1] + " " + Number(m[3]) + ", " + m[1];
  }

    /** The contests, by the names a man reads on the card. */
    const CONTEST_NAMES = {
      watchTheBirdie: "Watch the Birdie", sixPack: "Six Pack",
      agonyAlley: "Agony Alley", easyStreet: "Easy Street",
      tripleThreat: "Triple Threat", hitList: "Hit List",
      damageControl: "Damage Control", goLong: "Go Long",
      getShorty: "Get Shorty", bounceBack: "Bounce Back",
      skins: "Skins",
      // Not a contest and never a line on a card, but it is a rule of the round
      // and it needs a name for the "what was changed" note.
      boards: "The boards",
    };

    /**
     * One duel, as a sentence a man would say in the bar.
     *
     * "Wallach beat Teitelbaum by 4" — the most repeatable thing in the game,
     * and the reveal: nobody knows who named whom until it is published.
     *
     * THE UNSETTLED ONES GET A SENTENCE TOO. A duel that never came off is
     * still a bet a man made, and leaving it off the table would let him think
     * he had been forgotten rather than voided.
     */
    function duelSentence(d){
      const who = d.name, him = d.opponent;
      switch(d.outcome){
        case "win":  return who + " beat " + him + " by " + d.margin;
        case "loss": return who + " lost to " + him + " by " + d.margin;
        case "tie":  return who + " and " + him + " tied";
        case "unfinished": return who + " named " + him + " — no full round, so it is void";
        case "void": return who + " named " + him + ", who has no full round — void";
        case "self": return who + " named himself";
        default:     return who + " named " + him + ", who is not in this round";
      }
    }

    /**
     * The order a list of men is read in: SURNAME, then first name.
     *
     * Names are stored canonically as "First Last", so the surname is the last
     * word. Sorting on the whole string put Abe Whitfield and Al Brightman both
     * under A, which is not a list anybody scans down. A single-word name sorts
     * on itself.
     *
     * HERE rather than in the app because it is a rule about reading names,
     * which is what this file is for — and because the roster is shown in two
     * places and the same forty men in two orders on two screens is its own
     * kind of wrong.
     */
    function surnameKey(name){
      const parts = String(name == null ? "" : name).trim().split(/\s+/).filter(Boolean);
      if(parts.length === 0) return "";
      const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
      return (last + " " + parts.slice(0, -1).join(" ")).trim().toLowerCase();
    }
    /** Comparator for anything with a `name`. */
    function bySurname(a, b){
      return surnameKey(a && a.name).localeCompare(surnameKey(b && b.name), "en-US");
    }

    globalThis.ClubhouseDisplay = {
      esc, fmtFinal, fmtStrokes, fitText, abbreviate, fitName, niceDate,
      MONTHS, CONTEST_NAMES, duelSentence, surnameKey, bySurname,
      usDate, isoFromUs,
    };
})();
