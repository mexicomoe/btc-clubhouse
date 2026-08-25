/**
 * Event export — TYPED VIEW over `exporter.js` (build brief section 5).
 *
 * The implementation lives once in `exporter.js`, the file the browser loads
 * with a plain <script> tag, so the Export button and these tests run the same
 * code. One row per player, in the order the brief asks for.
 */

/* The engine as well as the exporter, and not for a function: the exporter
   reads DEFAULT_CONTESTS to decide which contests get a column, and a test that
   imported this module alone would otherwise get every column in the list
   rather than the four this club plays. */
import "../engine.js";
import "../exporter.js";
import type { ContestConfig } from "./courseConfig.ts";
import type { PlayerResult } from "./scoring.ts";

const X = (globalThis as { ClubhouseExporter: any }).ClubhouseExporter;

/** A player as the Setup screen stores him. */
export interface EventPlayer {
  id: string;
  /** Exactly as typed on Setup — what Golf Genius will match on. */
  name: string;
  /** Handicap number, where the club has one for him. */
  ghin?: string | null;
  index?: number | null;
  tee?: string;
  gender?: string;
  cart?: string | number | null;
  flight?: string | null;
  front?: number | null;
  back?: number | null;
}

/** An event as the app stores it — enough of one to export. */
export interface ExportableEvent {
  name?: string;
  date?: string;
  /** How the round was played: individual net, better ball, a scramble. */
  format?: string;
  players?: EventPlayer[];
  scores?: Record<string, (number | string | null)[]>;
  handicaps?: Record<string, number>;
  allowancePercent?: number;
  skinsOn?: boolean;
  exportedAt?: string | null;
  exportedSignature?: string | null;
}

export interface CsvOptions {
  /** The name to print — the Setup name tidied for the scoreboard. */
  displayNameOf?: (p: EventPlayer) => string;
  /** The raw hole values on his card: numbers, "X" for a pick-up, null for unplayed. */
  holesOf?: (p: EventPlayer) => (number | string | null)[];
}

/** Build the CSV text for one event. */
export const eventToCsv: (
  event: ExportableEvent, results: PlayerResult[], options?: CsvOptions,
) => string = X.eventToCsv;

/** The outcome of reading a pasted event code. */
export interface DecodedEvent {
  ok: boolean;
  event: ExportableEvent | null;
  /** Why it was refused, ready to show; null when `ok`. */
  error: string | null;
}

/** The whole event as one line of text, for messaging to another device. */
export const encodeEvent: (event: ExportableEvent) => string = X.encodeEvent;

/** Read a pasted code back into an event, or say why it could not be. */
export const decodeEvent: (text: string) => DecodedEvent = X.decodeEvent;

/** The marker every event code begins with. */
export const CODE_PREFIX: string = X.CODE_PREFIX;

/** A fingerprint of everything the CSV would carry. */
export const eventSignature: (event: ExportableEvent) => string = X.eventSignature;

/** Has the round moved since it was last exported? True if it never was. */
export const changedSinceExport: (event: ExportableEvent) => boolean = X.changedSinceExport;

/** "Friday" on 2026-08-07 → "Friday 2026-08-07.csv". */
export const csvFilename: (name: string, date: string) => string = X.csvFilename;

/** One CSV field, quoted and escaped if it needs to be. */
export const csvField: (value: unknown) => string = X.csvField;

/** The header row, in order. */
export const headerRow: (contests?: ContestConfig | null) => string[] = X.headerRow;

/**
 * The contest columns this round's rules earn it. A contest that is not in the
 * game gets no column at all — not a heading with blanks under it, which reads
 * as a field that all scored zero.
 */
export const columnsFor: (contests?: ContestConfig | null) => [string, string][] = X.columnsFor;

/** The contest columns as [key, label] pairs, in scoring order. */
export const CONTEST_COLUMNS: [string, string][] = X.CONTEST_COLUMNS;
