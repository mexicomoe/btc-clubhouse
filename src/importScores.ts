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
  /** The eighteen hole values exactly as pasted; `null` = hole not played. */
  holes: (number | null)[];
  holesPlayed: number;
  /** What the hole numbers are, decided by which total the 18 holes sum to. */
  mode: HoleMode;
  /** The Total column — the gross total, kept to reconcile against Golf Genius. */
  grossTotal: number | null;
  /** The Net column, if the paste had one. Used only to classify, never trusted. */
  netTotal: number | null;
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

/** Case- and spacing-insensitive key for matching a pasted row to a setup player. */
export const normaliseName: (name: string) => string = I.normaliseName;
