/**
 * Event export — TYPED VIEW over `exporter.js` (build brief section 5).
 *
 * The implementation lives once in `exporter.js`, the file the browser loads
 * with a plain <script> tag, so the Export button and these tests run the same
 * code. One row per player, in the order the brief asks for.
 */

import "../exporter.js";
import type { PlayerResult } from "./scoring.ts";

const X = (globalThis as { ClubhouseExporter: any }).ClubhouseExporter;

/** A player as the Setup screen stores him. */
export interface EventPlayer {
  id: string;
  name: string;
  index?: number | null;
  tee?: string;
  gender?: string;
  cart?: string | number | null;
  flight?: string | null;
  front?: number | null;
  back?: number | null;
}

export interface CsvOptions {
  /** The name to print — the Setup name tidied for the scoreboard. */
  displayNameOf?: (p: EventPlayer) => string;
  /** The raw hole values on his card: numbers, "X" for a pick-up, null for unplayed. */
  holesOf?: (p: EventPlayer) => (number | string | null)[];
}

/** Build the CSV text for one event. */
export const eventToCsv: (
  players: EventPlayer[], results: PlayerResult[], options?: CsvOptions,
) => string = X.eventToCsv;

/** "Friday" on 2026-08-07 → "Friday 2026-08-07.csv". */
export const csvFilename: (name: string, date: string) => string = X.csvFilename;

/** One CSV field, quoted and escaped if it needs to be. */
export const csvField: (value: unknown) => string = X.csvField;

/** The header row, in order. */
export const headerRow: () => string[] = X.headerRow;

/** The contest columns as [key, label] pairs, in scoring order. */
export const CONTEST_COLUMNS: [string, string][] = X.CONTEST_COLUMNS;
