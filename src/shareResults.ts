/**
 * Sharing a finished round — TYPED VIEW over `results.js`.
 *
 * The implementation lives once in `results.js`, the file both pages load with
 * a plain <script> tag. This module keeps the interfaces and re-exports it with
 * types, so the tests exercise the exact code the Share button runs.
 *
 * The link is OBFUSCATED, NOT ENCRYPTED: nothing is legible in the address bar,
 * but anyone who pastes it into a decoder has the names and scores back. Treat
 * a shared link as public.
 */

import "../results.js";

const R = (globalThis as { ClubhouseResults: any }).ClubhouseResults;

/** One man's finished line, as it travels. */
export interface SharedPlayer {
  name: string;
  courseHandicap: number | null;
  gross: number | null;
  net: number | null;
  /** Contest key → strokes. Only the contests this round played are present. */
  contests: Record<string, number>;
  final: number | null;
  /** Settled before it left — the far end has no cards to place anyone with. */
  rank: number | null;
  /** "won on the back nine", or empty. Also settled before it left. */
  tieNote: string;
  eligible: boolean;
  holesPlayed: number | null;
}

export interface SharedRound {
  course: string;
  date: string;
  tee: string;
  /** The contests this round scored, in the order they are shown. */
  contests: string[];
  /** Anything off default — "85% handicap allowance · skins not played". */
  note: string;
  players: SharedPlayer[];
}

/** The heading a round travels under. */
export interface RoundHeading {
  course?: string;
  date?: string;
  tee?: string;
  note?: string;
}

export interface ResultsLink {
  code: string;
  url: string;
  length: number;
  /** False means the button must refuse rather than hand over a broken address. */
  fits: boolean;
  players: number;
  limit: number;
}

/** The marker every shared link carries, with its format version in it. */
export const RESULT_PREFIX: string = R.RESULT_PREFIX;

/** The contests that can travel, in the order they are shown. */
export const RESULT_CONTESTS: string[] = R.RESULT_CONTESTS;

/** The longest URL that reliably survives a text message. */
export const MAX_URL_LENGTH: number = R.MAX_URL_LENGTH;

/** Pack a scored leaderboard into one code. */
export const encodeResults: (round: RoundHeading, results: unknown[], live?: string[]) => string
  = R.encodeResults;

/** Read a link back. `ok` false carries a sentence saying what went wrong. */
export const decodeResults: (text: string) =>
  { ok: boolean; round: SharedRound | null; error: string | null } = R.decodeResults;

/** The whole link, its length, and whether it will survive being sent. */
export const resultsLink: (baseUrl: string, round: RoundHeading, results: unknown[], live?: string[]) => ResultsLink
  = R.resultsLink;

/** The largest field that fits, for a given average name length. */
export const maxPlayersThatFit: (baseUrl: string, nameLength?: number) => number
  = R.maxPlayersThatFit;
