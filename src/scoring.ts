/**
 * Beat the Crowd · Clubhouse — scoring engine, TYPED VIEW over `engine.js`.
 *
 * The implementation lives once in `engine.js` (the file the browser loads with
 * a plain <script> tag). This module keeps the TypeScript interfaces and
 * re-exports the engine's functions with those types, so the tests exercise the
 * exact code the leaderboard runs — one implementation, no build step.
 *
 *   FINAL = capped net score for the round − strokes earned in the contests
 *
 * Lowest wins. Every threshold lives in engine.js's DEFAULT_CONTESTS.
 */

import "../engine.js";
import type { CourseConfig, ContestConfig } from "./courseConfig.ts";

const E = (globalThis as { ClubhouseEngine: any }).ClubhouseEngine;

/** A player's card. `gross[i]` is the gross strokes on hole i, or `null` if not played. */
export interface PlayerCard {
  name: string;
  /** Handicap index, from which the course handicap is computed. */
  handicapIndex?: number;
  /** Course handicap, if already known (Golf Genius prints it). Overrides index. */
  courseHandicap?: number;
  /** Gross score per hole (18 entries). `null` = hole not played; never 0. */
  gross: (number | null)[];
  /** The gross total the player predicted before the round (Call Your Number). */
  predicted: number;
}

export interface ContestResult {
  strokes: number;
  /** Human-readable summary, e.g. "off by 2", "net 13 across the stretch". */
  detail: string;
  /** False when the contest can't be scored yet (needs holes not played). */
  live: boolean;
}

export interface PlayerResult {
  name: string;
  courseHandicap: number;
  gross: number | null;
  /** Net total after the net-double-bogey cap — the scoring anchor. */
  net: number | null;
  /** Net total before the cap — kept only to reconcile against Golf Genius. */
  netUncapped: number | null;
  holesPlayed: number;
  contests: {
    callYourNumber: ContestResult;
    agonyAlley: ContestResult;
    damageControl: ContestResult;
    goLong: ContestResult;
    getShorty: ContestResult;
    bounceBack: ContestResult;
  };
  strokesEarned: number;
  final: number | null;
  /** Competition rank; present only on results from `computeLeaderboard`. */
  rank?: number;
}

export const courseHandicap: (handicapIndex: number, course: CourseConfig) => number = E.courseHandicap;
export const resolveCourseHandicap: (card: PlayerCard, course: CourseConfig) => number = E.resolveCourseHandicap;
export const strokesOnHole: (strokeIndex: number, courseHcp: number) => number = E.strokesOnHole;
export const netOnHole: (gross: number | null, par: number, strokeIndex: number, courseHcp: number) => number | null = E.netOnHole;
export const cappedNetByHole: (card: PlayerCard, course: CourseConfig) => (number | null)[] = E.cappedNetByHole;
export const scorePlayer: (card: PlayerCard, course: CourseConfig, contests: ContestConfig) => PlayerResult = E.scorePlayer;
export const scoreField: (cards: PlayerCard[], course: CourseConfig, contests: ContestConfig) => PlayerResult[] = E.scoreField;
export const computeLeaderboard: (players?: PlayerCard[], course?: CourseConfig, contests?: ContestConfig) => PlayerResult[] = E.computeLeaderboard;
