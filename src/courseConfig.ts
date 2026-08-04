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
  /** Lowest final allowed; `null` = no floor (the Clubhouse default). */
  floor: number | null;
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
  perPick: number;
  byHole?: Record<number, number>;
}

/**
 * What a skin is worth. Skins sits outside `maxContestStrokes` — that governs
 * the six contests — and carries its own cap. Set the whole thing to null to
 * switch Skins off for a round.
 */
export interface SkinsConfig {
  perSkin: number;
  cap: number;
}

/** Contest thresholds. Agony/Damage/Long/Shorty grade `<=`; Bounce grades `>=`. */
export interface ContestConfig {
  /** Not a ladder — paid per pick. */
  watchTheBirdie: BirdiePayout;
  agonyAlley: Step[];
  damageControl: Step[];
  goLong: Step[];
  getShorty: Step[];
  bounceBack: Step[];
  maxContestStrokes: number;
  /** Null switches Skins off; it then scores nothing and no cart is read. */
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
