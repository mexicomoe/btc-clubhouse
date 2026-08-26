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
    };
})();
