/**
 * Score import — TYPED VIEW over `importer.js` (build brief section 10).
 *
 * The implementation lives once in `importer.js`, the file the browser loads
 * with a plain <script> tag. This module keeps the TypeScript interfaces and
 * re-exports the parser with those types, so the tests exercise the exact code
 * the import screen runs — one implementation, no build step.
 *
 * How gross and net holes are told apart, and why Out/In/Net are never trusted,
 * is documented in `importer.js`.
 */

import "../importer.js";
import type { PlayerCard, BirdiePicks } from "./scoring.ts";

const I = (globalThis as { ClubhouseImporter: any }).ClubhouseImporter;

export type HoleMode = "net" | "gross" | "unknown";

export interface ImportedCard {
  /** Player name, with the trailing "(handicap)" stripped off. */
  name: string;
  /** Course handicap from the "(n)" suffix — for reference and, for gross holes,
   *  to recompute net. `null` if the name carried no parenthetical. */
  handicap: number | null;
  /**
   * The eighteen hole values as pasted. `null` = the hole was not played;
   * `"X"` = he picked up, which IS a played hole and scores par + 4 gross.
   */
  holes: (number | string | null)[];
  /** Holes played, counting picked-up ones — an X card is still a full round. */
  holesPlayed: number;
  /** How many of them he picked up on. */
  pickedUp: number;
  /** What the hole numbers are, decided by which total the 18 holes sum to. */
  mode: HoleMode;
  /** The Total column — the gross total, kept to reconcile against Golf Genius. */
  grossTotal: number | null;
  /** The Net column, if the paste had one. Used only to classify, never trusted. */
  netTotal: number | null;
  /**
   * Why this row is not a round, or null when it is one. A blind — the phantom
   * player a draw invents to even up the teams — and a Total of "NC" are both
   * carried through marked rather than dropped, so the import screen can show
   * what it left out.
   */
  skip: string | null;
}

export interface ImportResult {
  cards: ImportedCard[];
  /** One human-readable line per row that could not be parsed or classified. */
  errors: string[];
}

/** Parse pasted tab-separated Golf Genius rows into classified cards. */
export const parseScores: (text: string) => ImportResult = I.parseScores;

/** Split "Sid Ferndale (18)" into name and the parenthesised course handicap. */
export const splitName: (cell: string) => { name: string; handicap: number | null } = I.splitName;

/** Turn a GROSS-hole imported card into a PlayerCard the scoring engine can run. */
export const grossCardToPlayer: (card: ImportedCard, picks?: BirdiePicks) => PlayerCard = I.grossCardToPlayer;

/** The marker a picked-up hole carries in `holes` — Golf Genius prints it as X. */
export const PICKED_UP: string = I.PICKED_UP;

/** Case- and spacing-insensitive key for matching a pasted row to a setup player. */
export const normaliseName: (name: string) => string = I.normaliseName;

/** "Ridgeway, Ken" → "Ken Ridgeway"; null when there is no comma to undo. */
export const unreverseName: (name: string) => string | null = I.unreverseName;

/** Drop a trailing "(18)" — a handicap, on either side, is not part of the name. */
export const stripHandicap: (name: string) => string = I.stripHandicap;

/** A name in "First Last" order with any handicap removed — the form rules compare in. */
export const canonicalName: (name: string) => string = I.canonicalName;

/** "Ken Ridgeway" and "Ken R." both reduce to "ken r"; null for a single word. */
export const initialKey: (name: string) => string | null = I.initialKey;

/** Which rule matched a pasted name to the roster, if any. */
export type MatchHow = "exact" | "reversed" | "initial" | "ambiguous" | null;

/**
 * Match a pasted name against the setup roster: exact, then "Last, First"
 * reversed, then first name plus last initial. `index` is -1 when nothing fits
 * or when an initial key is shared — those come back for a person to decide.
 */
export const matchName: (exportName: string, names: string[]) => { index: number; how: MatchHow } = I.matchName;
