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
import type { CourseConfig, ContestConfig, Gender } from "./courseConfig.ts";

/**
 * How a field is scored. A config scores everyone against one course; omit it
 * and each card falls back to its own tee and gender; a function covers any
 * other arrangement.
 */
export type CourseSource = CourseConfig | ((card: PlayerCard) => CourseConfig) | undefined;

const E = (globalThis as { ClubhouseEngine: any }).ClubhouseEngine;

/** A player's card. `gross[i]` is the gross strokes on hole i, or `null` if not played. */
export interface PlayerCard {
  name: string;
  /** Handicap index, from which the course handicap is computed. */
  handicapIndex?: number;
  /**
   * Course handicap, if already known (Golf Genius prints it). Overrides index —
   * and carries the event's allowance already, so no allowance is applied to it.
   */
  courseHandicap?: number;
  /**
   * The event's handicap allowance as a percentage: 85 means 85%, 100 (the
   * default) the full handicap. Applied only to a handicap worked out from
   * `handicapIndex`, never to one that came off a card.
   */
  allowancePercent?: number;
  /** Tee played. With `gender`, decides rating, slope and which stroke index applies. */
  tee?: string;
  /** Men and women play different tees AND a different stroke index. Defaults to "M". */
  gender?: Gender;
  /**
   * Gross score per hole (18 entries). `null` = hole not played; never 0.
   * A non-numeric entry — Golf Genius prints "X" — means he picked up: the hole
   * WAS played and scores par + 4 gross, which the cap takes to net double.
   */
  gross: (number | string | null)[];
  /** Cart number. Without one a player scores zero from Skins. */
  cart?: string | number | null;
  /**
   * Watch the Birdie: the two par 4s nominated before the round, one per nine
   * (hole numbers, 1-based). Omit and the contest simply doesn't score.
   */
  picks?: BirdiePicks;
}

/** One nominated par 4 on each nine. Both must be par 4s or scoring throws. */
export interface BirdiePicks {
  front: number;
  back: number;
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
  /** The handicap actually played off — the allowance is already in it. */
  courseHandicap: number;
  /**
   * The handicap before the allowance was taken off. Null when it came off a
   * Golf Genius card, which already has the event's allowance applied.
   */
  courseHandicapFull: number | null;
  /** The allowance used, as a percentage. 100 means the full handicap. */
  allowancePercent: number;
  gross: number | null;
  /** Net total after the net-double-bogey cap — the scoring anchor. */
  net: number | null;
  /** Net total before the cap — kept only to reconcile against Golf Genius. */
  netUncapped: number | null;
  /** Capped net per hole — what a match of cards is settled on. */
  netByHole: (number | null)[];
  /** Gross per hole, with picked-up holes filled in at par + 4. */
  grossByHole: (number | null)[];
  /** Hole numbers he picked up on. Show these as X, never as the filled figure. */
  pickedUpHoles: number[];
  holesPlayed: number;
  contests: {
    watchTheBirdie: ContestResult;
    agonyAlley: ContestResult;
    damageControl: ContestResult;
    goLong: ContestResult;
    getShorty: ContestResult;
    bounceBack: ContestResult;
    /** Added by `computeLeaderboard` — Skins can only be settled field-wide. */
    skins?: ContestResult;
  };
  strokesEarned: number;
  final: number | null;
  /** Skins won by this player's cart; present when Skins is on. */
  skins?: number;
  /**
   * Competition rank, from `computeLeaderboard`. Null for a card that isn't a
   * full round: an unfinished card takes no position at all.
   */
  rank?: number | null;
  /** True only for a complete eighteen — the cards that can take a position. */
  eligible?: boolean;
  /**
   * How an equal final was settled, when it was. `shared` means the cards were
   * level too and the place is shared; otherwise `wonBy` names the stretch that
   * took it — "the back nine", "13–18", "16–18", "the 18th".
   */
  cardMatch?: { shared: boolean; wonBy: string | null };
}

/** One stretch of a match of cards, tried in order. */
export interface CardMatchSegment {
  from: number;
  to: number;
  label: string;
}

/** The outcome of reading a hand-typed handicap index. */
export interface ParsedIndex {
  ok: boolean;
  /** The index, or null for a blank field — which is "not filled in", not "wrong". */
  value: number | null;
  /** Why it was refused, ready to show; null when `ok`. */
  error: string | null;
}

/**
 * Read a typed handicap index. Never use `parseFloat` for this: parseFloat("24,4")
 * is 24, silently dropping the tenth. A comma is accepted and normalised; anything
 * else is refused rather than guessed at.
 */
export const parseHandicapIndex: (text: string) => ParsedIndex = E.parseHandicapIndex;

/** A handicap index as text, always period-decimal whatever the locale. */
export const formatHandicapIndex: (value: number | null) => string = E.formatHandicapIndex;

/**
 * The course handicap a player plays off. `allowancePercent` is a percentage —
 * 85 means 85%, 100 (the default) the full handicap. The handicap is worked out
 * in full and then cut, so there are two roundings.
 */
export const courseHandicap: (handicapIndex: number, course: CourseConfig, allowancePercent?: number) => number = E.courseHandicap;

/** The same figure before any allowance. */
export const fullCourseHandicap: (handicapIndex: number, course: CourseConfig) => number = E.fullCourseHandicap;

/** The allowance meaning "no cut" — 100. */
export const FULL_ALLOWANCE: number = E.FULL_ALLOWANCE;
export const resolveCourseHandicap: (card: PlayerCard, course: CourseConfig) => number = E.resolveCourseHandicap;
export const strokesOnHole: (strokeIndex: number, courseHcp: number) => number = E.strokesOnHole;
export const netOnHole: (gross: number | null, par: number, strokeIndex: number, courseHcp: number) => number | null = E.netOnHole;
export const cappedNetByHole: (card: PlayerCard, course: CourseConfig) => (number | null)[] = E.cappedNetByHole;
/** The par 4s nominatable on each nine, derived from the course's par. */
export const birdiePickHoles: (course: CourseConfig) => { front: number[]; back: number[] } = E.birdiePickHoles;
/** Rebuild gross holes from Golf Genius's net ones, so the engine can score them. */
export const grossFromNet: (netHoles: (number | null)[], course: CourseConfig, courseHcp: number) => (number | null)[] = E.grossFromNet;
/** Resolve which course a card is scored against. */
export const courseFor: (card: PlayerCard, course?: CourseSource) => CourseConfig = E.courseFor;

/**
 * Settle two equal finals by match of cards: back nine, then 13–18, 16–18, the
 * 18th. `order` is -1 if `a` takes the place, 1 if `b` does, 0 if they share it.
 * A man who did not finish cannot win a card match and is placed below one who did.
 */
export const matchOfCards: (a: PlayerResult, b: PlayerResult) => { order: number; label: string | null } = E.matchOfCards;

/** The stretches a match of cards is settled on, in order. */
export const CARD_MATCH: CardMatchSegment[] = E.CARD_MATCH;

export const scorePlayer: (card: PlayerCard, course?: CourseSource, contests?: ContestConfig) => PlayerResult = E.scorePlayer;
export const scoreField: (cards: PlayerCard[], course?: CourseSource, contests?: ContestConfig) => PlayerResult[] = E.scoreField;
export const computeLeaderboard: (players?: PlayerCard[], course?: CourseSource, contests?: ContestConfig) => PlayerResult[] = E.computeLeaderboard;
