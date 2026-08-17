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
  function fmtFinal(x){ return x==null ? "—" : x.toFixed(1); }  // golf scores: one decimal, no hundredths
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
    // Built by hand rather than by toLocaleDateString, which would read
    // differently on a phone set to another language.
    return Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] + " " + m[1];
  }

    /** The contests, by the names a man reads on the card. */
    const CONTEST_NAMES = {
      watchTheBirdie: "Watch the Birdie", sixPack: "Six Pack",
      agonyAlley: "Agony Alley", easyStreet: "Easy Street",
      tripleThreat: "Triple Threat", hitList: "Hit List",
      damageControl: "Damage Control", goLong: "Go Long",
      getShorty: "Get Shorty", bounceBack: "Bounce Back",
      skins: "Skins",
    };

    globalThis.ClubhouseDisplay = {
      esc, fmtFinal, fmtStrokes, fitText, abbreviate, fitName, niceDate,
      MONTHS, CONTEST_NAMES,
    };
})();
