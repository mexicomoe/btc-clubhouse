"use strict";
/**
 * Beat the Crowd · Clubhouse — the leaderboard as a picture.
 *
 * WHY THIS EXISTS. The share link works by e-mail and does not survive iOS
 * Messages. Measured on the club's own phone: links of 154, 159, 190 and 219
 * characters arrived first time; 250 and 299 failed once each and only arrived
 * on a second attempt; 350 failed twice. The break is somewhere between 299 and
 * 350 and it is FLAKY from 250 up — and a ten-man round cannot be squeezed under
 * 250 without throwing away the contest breakdown, which would still leave it
 * inside the flaky band. A link that works on the second try is not good enough
 * for the men, so the round goes as a PICTURE instead. An image has no length
 * limit in any messenger.
 *
 * WHAT IT COSTS. A picture cannot be tapped into, so there is no per-player
 * breakdown and no tie note beyond what fits on the line. It is the board and
 * nothing else. That is the trade: the link carries everything and sometimes
 * arrives, the picture carries the board and always does.
 *
 * HOW IT IS BUILT. `layout()` returns a plain list of drawing operations and
 * touches no canvas, so the whole arrangement — every figure, every size, the
 * height of the image — is testable in Node with no browser. `paint()` walks
 * that list onto a real 2D context and knows nothing about leaderboards.
 *
 * The palette and the type sizes are lifted from clubhouse.css so the picture
 * looks like the app. They cannot be READ from it — a canvas has no cascade —
 * so they are repeated here, and a test holds the two together.
 */
(function () {

  /** Straight out of clubhouse.css. Changing one means changing both. */
  const INK = "#000";
  const PAPER = "#fff";
  const BAND = "#0b2e13";
  const LEADER = "#fff7d6";
  const WASH = "#f0efe9";

  /**
   * Everything is laid out in POINTS at a 360-wide phone, then multiplied up.
   * Drawing at 3× and letting the messenger scale down is what keeps the type
   * crisp — a picture of a scoreboard that has gone soft is worse than no
   * picture, for eyes this is built for.
   */
  const W = 360;
  const PAD = 14;
  const SCALE = 3;

  const TYPE = {
    title: 30, sub: 18,          // the band
    rank: 28, name: 26, meta: 18, tie: 18, final: 44,
    section: 20, foot: 18,
  };
  /** Nothing in the picture may be smaller than this, the same floor as the app. */
  const MIN_TYPE = 18;

  const font = (size, weight) => (weight || 800) + " " + size + "px " +
    '"Helvetica Neue", Helvetica, Arial, sans-serif';

  /** "Christiaan Bezuidenhout" → "Christiaan B." — the app's own rule. */
  function abbreviate(full) {
    const p = String(full).trim().split(/\s+/);
    return p.length < 2 ? full : p[0] + " " + p[p.length - 1].charAt(0) + ".";
  }

  /**
   * Fit a name into `room` points, shrinking to the 18-point floor and then
   * shortening the surname to an initial — never below the floor, exactly as
   * the app does on screen.
   *
   * `measure(text, size)` comes from the caller because only a real canvas can
   * measure text. In a test it is a stub, which is the point.
   */
  function fitName(name, room, measure) {
    let size = TYPE.name;
    while (size > MIN_TYPE && measure(name, size) > room) size--;
    if (measure(name, size) <= room) return { text: name, size };

    const short = abbreviate(name);
    size = TYPE.name;
    while (size > MIN_TYPE && measure(short, size) > room) size--;
    if (measure(short, size) <= room) return { text: short, size };

    // Last resort, and it has to exist. Shortening the surname does nothing for
    // a name written "Bezuidenhout-Wolstenholme, Chris", where the surname comes
    // first — the abbreviation is no shorter than the name. Rather than let it
    // run over the final beside it, which is how two numbers become one, it is
    // clipped. Never below the floor: the type size stays put and the TEXT goes.
    let clipped = short;
    while (clipped.length > 1 && measure(clipped + "…", MIN_TYPE) > room) {
      clipped = clipped.slice(0, -1);
    }
    return { text: clipped + "…", size: MIN_TYPE };
  }

  /**
   * Break a line into as many as will fit `room`, on word boundaries.
   *
   * The heading and the footer are prose, not figures, and prose has to wrap:
   * "Aberdeen Golf & Country Club · 14 August 2026 · 10 players" is half as wide
   * again as the picture at the 18-point floor, and shrinking it is not allowed.
   * So it wraps and the picture grows, which is the only move left.
   */
  function wrap(text, room, size, measure) {
    const words = String(text).split(" ");
    const lines = [];
    let line = "";
    for (const word of words) {
      const next = line === "" ? word : line + " " + word;
      if (line !== "" && measure(next, size) > room) { lines.push(line); line = word; }
      else line = next;
    }
    if (line !== "") lines.push(line);
    return lines.length ? lines : [""];
  }

  /**
   * The whole picture as a list of operations, in points.
   *
   *   { rect, x, y, w, h, fill }
   *   { text, x, y, size, weight, align, fill }   y is the BASELINE
   *
   * Returns { width, height, scale, ops } — height is whatever the field needs.
   */
  function layout(round, options) {
    const opts = options || {};
    const measure = opts.measure || ((t, s) => t.length * s * 0.55);
    const players = (round && round.players) || [];
    const ops = [];
    let y = 0;

    /* ---- the band ---- */
    const n = players.length;
    const textLeft = PAD + 6;
    const textRoom = W - textLeft - PAD;
    const sub = [round.course || "Aberdeen G&CC", round.dateText || round.date,
                 n + " player" + (n === 1 ? "" : "s")].filter(Boolean).join("  ·  ");
    const subLines = wrap(sub, textRoom, TYPE.sub, measure);
    const bandH = 20 + TYPE.title + 10 + subLines.length * (TYPE.sub + 5) + 12;
    ops.push({ rect: true, x: 0, y: 0, w: W, h: bandH, fill: BAND });
    ops.push({ text: "Leaderboard", x: textLeft, y: 20 + TYPE.title,
               size: TYPE.title, weight: 800, fill: PAPER });
    let sy = 20 + TYPE.title + 10 + TYPE.sub;
    for (const line of subLines) {
      ops.push({ text: line, x: textLeft, y: sy, size: TYPE.sub, weight: 700, fill: PAPER });
      sy += TYPE.sub + 5;
    }
    y = bandH;

    /* ---- the rows ---- */
    let markedIneligible = false;
    for (const p of players) {
      if (!p.eligible && !markedIneligible) {
        markedIneligible = true;
        const h = 14 + TYPE.section + 8;
        ops.push({ rect: true, x: 0, y, w: W, h, fill: WASH });
        ops.push({ rect: true, x: 0, y, w: W, h: 3, fill: INK });
        ops.push({ text: "NOT ELIGIBLE — NO FULL ROUND", x: PAD + 6, y: y + 14 + TYPE.section,
                   size: TYPE.section, weight: 800, fill: INK });
        y += h;
      }

      const tie = p.eligible ? (p.tieNote || "") : "not eligible";
      const rowH = 18 + TYPE.name + 7 + TYPE.meta + (tie ? 5 + TYPE.tie : 0) + 18;
      const leader = p.eligible && p.rank === 1;
      ops.push({ rect: true, x: 0, y, w: W, h: rowH, fill: leader ? LEADER : PAPER });

      // rank, left; final, right; the name and its lines between them.
      const finalText = p.final == null ? "—" : p.final.toFixed(1);
      const finalW = measure(finalText, TYPE.final);
      const rankX = PAD + 16;
      const nameLeft = PAD + 40;
      // A clear gap between the longest name and the final, or the two read as
      // one number. 20 points is about a character at the name's own size.
      const room = W - nameLeft - finalW - PAD - 20;

      let ty = y + 18 + TYPE.name;
      ops.push({ text: String(p.eligible ? p.rank : "–"), x: rankX, y: ty,
                 size: TYPE.rank, weight: 800, align: "center", fill: INK });

      const fitted = fitName(p.name, room, measure);
      ops.push({ text: fitted.text, x: nameLeft, y: ty, size: fitted.size, weight: 800, fill: INK });

      ty += 7 + TYPE.meta;
      const meta = p.net == null ? "no card"
        : "Net " + p.net + (p.holesPlayed > 0 && p.holesPlayed < 18 ? "  ·  " + p.holesPlayed + " holes" : "");
      ops.push({ text: meta, x: nameLeft, y: ty, size: TYPE.meta, weight: 700, fill: INK });

      if (tie) {
        ty += 5 + TYPE.tie;
        ops.push({ text: tie, x: nameLeft, y: ty, size: TYPE.tie, weight: 700, fill: INK });
      }

      ops.push({ text: finalText, x: W - PAD, y: y + 18 + TYPE.final * 0.82,
                 size: TYPE.final, weight: 800, align: "right", fill: INK });

      y += rowH;
      ops.push({ rect: true, x: 0, y: y - 3, w: W, h: 3, fill: INK });
    }

    /* ---- the footer ---- */
    const said = ["Final = net score less the strokes earned in the contests."];
    if (round.note) said.unshift(round.note);
    const footLines = said.reduce((acc, line) =>
      acc.concat(wrap(line, textRoom, TYPE.foot, measure)), []);
    const footH = 16 + footLines.length * (TYPE.foot + 7) + 8;
    ops.push({ rect: true, x: 0, y, w: W, h: footH, fill: PAPER });
    let fy = y + 16 + TYPE.foot;
    for (const line of footLines) {
      ops.push({ text: line, x: textLeft, y: fy, size: TYPE.foot, weight: 700, fill: INK });
      fy += TYPE.foot + 7;
    }
    y += footH;

    return { width: W, height: Math.round(y), scale: opts.scale || SCALE, ops };
  }

  /** Walk the operations onto a real 2D context. Knows nothing about golf. */
  function paint(ctx, plan) {
    const s = plan.scale;
    ctx.save();
    ctx.scale(s, s);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, plan.width, plan.height);
    ctx.textBaseline = "alphabetic";
    for (const op of plan.ops) {
      ctx.fillStyle = op.fill;
      if (op.rect) { ctx.fillRect(op.x, op.y, op.w, op.h); continue; }
      ctx.font = font(op.size, op.weight);
      ctx.textAlign = op.align || "left";
      ctx.fillText(op.text, op.x, op.y);
    }
    ctx.restore();
  }

  /**
   * Draw the round onto a canvas and hand back the canvas. The text measurer is
   * the canvas's own, so a name is fitted against the type that will really be
   * drawn rather than an estimate.
   */
  function render(canvas, round, options) {
    const ctx = canvas.getContext("2d");
    const measure = (text, size) => {
      ctx.font = font(size, 800);
      return ctx.measureText(text).width;
    };
    const plan = layout(round, Object.assign({ measure }, options || {}));
    canvas.width = plan.width * plan.scale;
    canvas.height = plan.height * plan.scale;
    paint(canvas.getContext("2d"), plan);
    return { canvas, plan };
  }

  /** "Friday 2026-08-14 leaderboard.png" — what the picture is called. */
  function imageFilename(name, date) {
    const clean = String(name == null ? "" : name)
      .replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
    return [clean || "round", date || "", "leaderboard"].filter(Boolean).join(" ") + ".png";
  }

  globalThis.ClubhouseBoardImage = {
    layout, paint, render, imageFilename, fitName, abbreviate, wrap,
    W, PAD, SCALE, TYPE, MIN_TYPE, INK, PAPER, BAND, LEADER, WASH,
  };
})();
