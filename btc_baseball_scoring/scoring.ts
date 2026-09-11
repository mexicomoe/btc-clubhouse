/**
 * BEAT THE CROWD · BASEBALL — scoring engine, v4.0 (Switcheroo Split).
 *
 * Every constant below is transcribed from the simulator's own "COMPLETE
 * SCORING REFERENCE v4.0" tab. Nothing here is invented. Where v4.0's reference
 * text is thinner than v3.0's, the v3.0 wording is treated as the governing one
 * and the divergence is called out in a comment — see `inningsPitched` and
 * `scorePredictionPoints`, which are the only two places it matters.
 *
 *   TOTAL = PP + FP (ACE + CLOSER + 4 batters) + WSN
 */

/* ────────────────────────── PREDICTION POINTS ────────────────────────── */

export type Arrival = "ON TIME" | "LATE";

/** Winner pick: +12 on-time / +6 late, negated when wrong. */
export function winnerPoints(correct: boolean, arrival: Arrival): number {
  const magnitude = arrival === "ON TIME" ? 12 : 6;
  return correct ? magnitude : -magnitude;
}

/**
 * Score prediction: 12 / 8 / 4 / 1 on-time, 6 / 4 / 2 / 1 late.
 *
 * THE RULEBOOK IS UNDERSPECIFIED HERE and the sheet does not say what "within
 * 3 runs" is measured against. Three readings are possible for a 7-4 call on a
 * 12-6 game — worst side error (5), best side error (2), or margin error
 * (|3-6| = 3) — and two of them land in the same tier, so one game cannot tell
 * them apart. MARGIN ERROR is implemented because it is the only reading that
 * scores a prediction as a prediction of the game rather than of one team, and
 * it reproduces the simulator here. If the Sheet formula turns out to use a
 * different measure, this is the function to change; the tier table is right
 * either way.
 */
export function scorePredictionPoints(
  predicted: { winner: number; loser: number },
  actual: { winner: number; loser: number },
  arrival: Arrival,
): number {
  const exact = predicted.winner === actual.winner && predicted.loser === actual.loser;
  const onTime = arrival === "ON TIME";
  if (exact) return onTime ? 12 : 6;

  const predictedMargin = predicted.winner - predicted.loser;
  const actualMargin = actual.winner - actual.loser;
  const off = Math.abs(predictedMargin - actualMargin);

  if (off <= 1) return onTime ? 8 : 4;
  if (off <= 3) return onTime ? 4 : 2;
  if (off <= 5) return 1;
  return 0; // 6+ runs off
}

/** You-Turn: +3/-6 on-time, +2/-4 late. Forfeits score-prediction points. */
export function youTurnPoints(correct: boolean, arrival: Arrival): number {
  if (arrival === "ON TIME") return correct ? 3 : -6;
  return correct ? 2 : -4;
}

/* ──────────────────────────── PITCHER FP ─────────────────────────────── */

export interface PitcherStats {
  /** BASEBALL NOTATION, as the Actual Stats tab demands: 5.2 = 5 innings + 2 outs. */
  ip: number;
  er: number;
  /** "H all" — every hit allowed. */
  h: number;
  /** Walks and hit batsmen, scored at the same rate as a hit. */
  bb: number;
  k: number;
  win?: boolean;
  loss?: boolean;
  save?: boolean;
  blownSave?: boolean;
}

/**
 * Convert a baseball-notation IP figure to real innings.
 *
 * THIS IS THE WHOLE POINT OF THE FILE. "5.2" is not five-point-two innings, it
 * is five innings and two outs — 5 + 2/3. The digit after the point counts
 * OUTS, and only 0, 1 and 2 are legal there. A raw `ip * 2.25` treats the field
 * as a decimal and silently underpays every start that ends mid-inning, by
 * 0.75 points on a .1 and 1.05 on a .2. v3.0's reference spelled the rule out
 * ("+2.25 per full inning (+0.75 per out)"); v4.0's shortened it to "IP×2.25",
 * which is the same rule stated carelessly, not a different rule.
 */
export function inningsPitched(ip: number): number {
  const full = Math.trunc(ip);
  // Work in tenths off the integer to dodge binary-float dust: 5.2 - 5 is
  // 0.19999999999999996, and Math.round of ten times that is a clean 2.
  const outs = Math.round((ip - full) * 10);
  if (outs !== 0 && outs !== 1 && outs !== 2) {
    throw new RangeError(
      `IP ${ip}: the digit after the point counts outs and must be 0, 1 or 2`,
    );
  }
  return full + outs / 3;
}

/**
 * ACE / CLOSER fantasy points.
 *
 * `ipMode` exists only so a test can price the same start both ways and name
 * the gap. "baseball" is the correct scoring; "decimal" reproduces the bug in
 * the v4.0 Scorecard — do not ship anything that calls it.
 */
export function pitcherFP(p: PitcherStats, ipMode: "baseball" | "decimal" = "baseball"): number {
  const innings = ipMode === "baseball" ? inningsPitched(p.ip) : p.ip;
  return (
    innings * 2.25 +
    p.k * 0.25 -
    p.er * 1.0 -
    (p.h + p.bb) * 0.25 +
    (p.win ? 4 : 0) +
    (p.loss ? -2 : 0) +
    (p.save ? 4 : 0) +
    (p.blownSave ? -4 : 0)
  );
}

/* ──────────────────────────── BATTER FP ──────────────────────────────── */

export type Slot = "LEADOFF" | "THIEF" | "SLUGGER" | "CLEANUP";

/** One block of a slot's line: innings 1-4 (pre-Switcheroo) or 5-9 (post). */
export interface BatterBlock {
  player: string;
  ab: number;
  bb: number;
  /** TOTAL hits, doubles/triples/homers included. */
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  r: number;
  rbi: number;
  k: number;
  sb: number;
  cs: number;
}

export function emptyBlock(player: string): BatterBlock {
  return { player, ab: 0, bb: 0, h: 0, doubles: 0, triples: 0, hr: 0, r: 0, rbi: 0, k: 0, sb: 0, cs: 0 };
}

/** Add the two Switcheroo blocks. The slot scores on the sum, not on each half. */
export function combine(pre: BatterBlock, post: BatterBlock): Omit<BatterBlock, "player"> {
  return {
    ab: pre.ab + post.ab,
    bb: pre.bb + post.bb,
    h: pre.h + post.h,
    doubles: pre.doubles + post.doubles,
    triples: pre.triples + post.triples,
    hr: pre.hr + post.hr,
    r: pre.r + post.r,
    rbi: pre.rbi + post.rbi,
    k: pre.k + post.k,
    sb: pre.sb + post.sb,
    cs: pre.cs + post.cs,
  };
}

/** Total bases: singles×1 + 2B×2 + 3B×3 + HR×4, with singles backed out of H. */
export function totalBases(b: Omit<BatterBlock, "player">): number {
  const singles = b.h - b.doubles - b.triples - b.hr;
  return singles + b.doubles * 2 + b.triples * 3 + b.hr * 4;
}

/** AB -0.25 | BB/HBP +0.25 | H +1.25 | TB +0.25 | R +1.50 | RBI +1.50 | K -0.50 | SB +2.00 | CS -1.00 */
export function batterBaseFP(b: Omit<BatterBlock, "player">): number {
  return (
    b.ab * -0.25 +
    b.bb * 0.25 +
    b.h * 1.25 +
    totalBases(b) * 0.25 +
    b.r * 1.5 +
    b.rbi * 1.5 +
    b.k * -0.5 +
    b.sb * 2.0 +
    b.cs * -1.0
  );
}

/** The slot's specialty stat, paid a second time on top of the base line. */
export function slotBonus(slot: Slot, b: Omit<BatterBlock, "player">): number {
  switch (slot) {
    case "LEADOFF":
      return b.r > 0 ? b.r * 1.5 : -2.0;
    case "THIEF":
      return b.sb * 2.0 + b.cs * -2.0;
    case "SLUGGER": {
      const tb = totalBases(b);
      return tb > 0 ? tb * 0.25 : -3.0;
    }
    case "CLEANUP":
      return b.rbi > 0 ? b.rbi * 1.5 : -2.0;
  }
}

/* ─────────────────────────────── WSN ─────────────────────────────────── */

export type PositionGroup = "INF" | "OUT" | "C-DH-PR";

export interface WsnRow {
  inning: number;
  /** Blank means skipped. A skip is free — WSN carries no penalty, ever. */
  teamPick?: string;
  positionPick?: PositionGroup;
  actualTeam?: string;
  actualPosition?: PositionGroup;
  scorerInLineup?: boolean;
}

/** Correct team +5 | team AND position +5 more | scorer in your lineup +5. */
export function wsnRowPoints(row: WsnRow): number {
  if (!row.teamPick || !row.actualTeam) return 0;
  if (row.teamPick !== row.actualTeam) return 0;
  let points = 5;
  if (row.positionPick && row.positionPick === row.actualPosition) points += 5;
  if (row.scorerInLineup) points += 5;
  return points;
}

/* ───────────────────────────── SCORECARD ─────────────────────────────── */

export interface Entry {
  arrival: Arrival;
  winnerPickCorrect: boolean;
  predicted: { winner: number; loser: number };
  actual: { winner: number; loser: number };
  youTurn?: { used: boolean; correct?: boolean };
  ace: PitcherStats;
  closer: PitcherStats;
  /** Block 1 (innings 1-4) then Block 2 (innings 5-9), per slot. */
  batters: Record<Slot, { pre: BatterBlock; post: BatterBlock }>;
  wsn: WsnRow[];
}

export interface Scorecard {
  winnerPick: number;
  scorePrediction: number;
  youTurn: number;
  totalPP: number;
  aceFP: number;
  closerFP: number;
  batters: Record<Slot, { base: number; bonus: number }>;
  totalBatterFP: number;
  totalFP: number;
  totalWSN: number;
  grandTotal: number;
}

const SLOTS: Slot[] = ["LEADOFF", "THIEF", "SLUGGER", "CLEANUP"];

export function scoreEntry(entry: Entry, ipMode: "baseball" | "decimal" = "baseball"): Scorecard {
  const usedYouTurn = entry.youTurn?.used === true;

  const winnerPick = winnerPoints(entry.winnerPickCorrect, entry.arrival);
  // A You-Turn buys the late switch by forfeiting the score prediction outright.
  const scorePrediction = usedYouTurn
    ? 0
    : scorePredictionPoints(entry.predicted, entry.actual, entry.arrival);
  const youTurn = usedYouTurn
    ? youTurnPoints(entry.youTurn?.correct === true, entry.arrival)
    : 0;

  const aceFP = pitcherFP(entry.ace, ipMode);
  // The Closer is forfeited entirely by a You-Turn, appearance or not.
  const closerFP = usedYouTurn ? 0 : pitcherFP(entry.closer, ipMode);

  const batters = {} as Record<Slot, { base: number; bonus: number }>;
  let totalBatterFP = 0;
  for (const slot of SLOTS) {
    const combined = combine(entry.batters[slot].pre, entry.batters[slot].post);
    const base = batterBaseFP(combined);
    const bonus = slotBonus(slot, combined);
    batters[slot] = { base, bonus };
    totalBatterFP += base + bonus;
  }

  const totalWSN = entry.wsn.reduce((sum, row) => sum + wsnRowPoints(row), 0);
  const totalPP = winnerPick + scorePrediction + youTurn;
  const totalFP = aceFP + closerFP + totalBatterFP;

  return {
    winnerPick,
    scorePrediction,
    youTurn,
    totalPP,
    aceFP,
    closerFP,
    batters,
    totalBatterFP,
    totalFP,
    totalWSN,
    grandTotal: totalPP + totalFP + totalWSN,
  };
}
