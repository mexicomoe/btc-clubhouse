/**
 * Course setup and contest thresholds — TYPES here, VALUES from the one engine.
 *
 * The runtime course config and contest ladders live in `engine.js` (the single
 * source the browser also loads). This module keeps the TypeScript interfaces
 * and re-exports the engine's values with those types, so recalibrating a
 * threshold is a one-line edit in engine.js and never drifts from the app.
 */

import "../engine.js";

const E = (globalThis as { ClubhouseEngine: any }).ClubhouseEngine;

/** Which set of tees and stroke index a player uses. */
export type Gender = "M" | "F";

export interface CourseConfig {
  name: string;
  /** Tee this config was built for, when it came from `courseForTee`. */
  tee?: string;
  /** Gender this config was built for — decides rating, slope and stroke index. */
  gender?: Gender;
  /** Par for holes 1..18. */
  par: number[];
  /** Stroke index (allocation order, 1 = hardest) for holes 1..18. */
  strokeIndex: number[];
  slope: number;
  courseRating: number;
  /** Hole numbers (1-based) making up the Agony Alley stretch. */
  agonyHoles: number[];
  /** Holes Watch the Birdie may not be nominated on, whatever their par. */
  barredPicks: number[];
  /** Easy Street's three holes. */
  easyStreetHoles: number[];
}

/** Rating and slope for one tee, per gender. Par is 72 from every Aberdeen tee. */
export interface TeeRating {
  courseRating: number;
  slope: number;
}

/** A single graded step: if the measured value satisfies `threshold`, award `strokes`. */
export interface Step {
  threshold: number;
  strokes: number;
}

/**
 * What one Watch the Birdie pick pays for a net birdie. `perPick` applies to
 * every nominated hole; `byHole` optionally overrides single holes, so a hard
 * hole can be made worth more than an easy one.
 */
export interface BirdiePayout {
  /** What a net birdie on a nominated hole pays. */
  birdie: number;
  /** What a net eagle or better pays. A hole pays this OR the birdie, never both. */
  eagle: number;
  /**
   * What NOTHING on any of the six costs — the contest's only penalty side.
   * Charged only once every pick has been played.
   */
  blank: number;
}>;
}

/**
 * What a skin is worth. Skins sits outside `maxContestStrokes` — that governs
 * the six individual contests. Set the whole thing to null to switch Skins off
 * for a round.
 */
export interface SkinsConfig {
  /**
   * The WHOLE contest's worth, divided among however many skins were actually
   * won that round. Negative, like every other credit. A typical 11 skins makes
   * one worth about 0.36; a lean 7 makes it 0.57.
   */
  pot: number;
  /** Below this many finishers there are no skins at all. */
  minPlayers: number;
  /** At this many finishers the format becomes Team Skins rather than Cart. */
  teamFrom: number;
}

/** Triple Threat is a tally, not a ladder: one flat rate for every player. */
export interface TripleThreatConfig {
  /**
   * What a NET DOUBLE BOGEY or worse costs. Positive — it adds strokes.
   * It was a gross triple, which within one tee ran r = +0.43 with handicap
   * index: it was measuring the handicap, not the round.
   */
  perTriple: number;
  /**
   * What a BOUNCE BACK pays — a net par or better on the very next hole. Named
   * for the contest it absorbed: Bounce Back used to stand on its own, and the
   * half of Triple Threat that answers the damage is still called that.
   */
  perBounceBack: number;
}

/** Six Pack needs nothing but the par its six leftover holes always come to. */
export interface SixPackConfig {
  /**
   * Always 24 at Aberdeen, and not by choice: the slot structure forces the
   * leftovers to four par 4s, one par 3 and one par 5 for every player.
   */
  par: number;
}

/** What one Hit List result pays. */
export interface HitListRates {
  win: number;
  tie: number;
  loss: number;
}

/**
 * Hit List is priced by the OPPONENT's band, because the choice is not a coin
 * flip: backing yourself against a higher index wins 54% of the time and
 * against a lower index only 39%. Flat pricing would make the weakest man on
 * the list the only sane pick.
 */
export interface HitListConfig {
  /** Two indexes this close count as equal. Lower index = the better player. */
  equalBand: number;
  lower: HitListRates;
  equal: HitListRates;
  higher: HitListRates;
}

/** Contest thresholds. Agony/Easy grade `<=`; Bounce grades `>=`. */
export interface ContestConfig {
  /** Not a ladder — each nominated hole pays its own best result. */
  watchTheBirdie: BirdiePayout;
  /** The six candidates he did NOT pick, scored as raw net strokes to par 24. */
  sixPack: SixPackConfig | null;
  agonyAlley: Step[];
  /** Graded on a COUNT of holes at NET par or better — gross measured handicap. */
  easyStreet: Step[];
  tripleThreat: TripleThreatConfig;
  /** Settled field-wide, not in `scorePlayer` — it needs the opponent's card. */
  hitList: HitListConfig | null;
  /** Null switches the contest off — Triple Threat absorbed it. */
  damageControl: Step[] | null;
  /** Null switches the contest off — Easy Street replaced both. */
  goLong: Step[] | null;
  /** Null switches the contest off — Easy Street replaced both. */
  getShorty: Step[] | null;
  /** Null switches the contest off — Triple Threat carries the name now. */
  bounceBack: Step[] | null;
  /** Null means no ceiling. On a zero base a cap would cap the score itself. */
  maxContestStrokes: number | null;
  /** Null switches Skins off; it then scores nothing and no group is read. */
  skins: SkinsConfig | null;
}

export const ABERDEEN_TEE_IV: CourseConfig = E.ABERDEEN_TEE_IV;
export const DEFAULT_CONTESTS: ContestConfig = E.DEFAULT_CONTESTS;

/** Every Aberdeen tee: id → rating and slope for each gender. */
export const ABERDEEN_TEES: Record<string, Record<Gender, TeeRating>> = E.ABERDEEN_TEES;
/** Tee ids in display order, back of the course forward. */
export const TEE_IDS: string[] = E.TEE_IDS;
export const GENDERS: Gender[] = E.GENDERS;

/** The course a player actually plays: their tee and their stroke index. */
export const courseForTee: (tee: string, gender?: Gender) => CourseConfig = E.courseForTee;
