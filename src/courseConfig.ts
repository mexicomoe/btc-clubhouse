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

export interface CourseConfig {
  name: string;
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

/** A single graded step: if the measured value satisfies `threshold`, award `strokes`. */
export interface Step {
  threshold: number;
  strokes: number;
}

/** Contest thresholds. Call/Agony/Damage/Long/Shorty grade `<=`; Bounce grades `>=`. */
export interface ContestConfig {
  callYourNumber: Step[];
  agonyAlley: Step[];
  damageControl: Step[];
  goLong: Step[];
  getShorty: Step[];
  bounceBack: Step[];
  maxContestStrokes: number;
}

export const ABERDEEN_TEE_IV: CourseConfig = E.ABERDEEN_TEE_IV;
export const DEFAULT_CONTESTS: ContestConfig = E.DEFAULT_CONTESTS;
