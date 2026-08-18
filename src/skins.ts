/**
 * Skins — TYPED VIEW over `engine.js`, the team element in Clubhouse.
 *
 * The implementation lives once in `engine.js`, the file the browser loads with
 * a plain <script> tag, so the Skins tab and these tests run the same code.
 *
 * A group's score on a hole is the AVERAGE of its players' net scores, not the
 * total. Averaging is self-correcting: totals break with uneven groups, but an
 * average lets a one-man group compete fairly (measured at 1.13× a two-man cart
 * over 3,000 simulated rounds — close enough that no blind partner is needed).
 *
 * Lowest average wins the hole. A tied hole carries its skin into the next, so a
 * later hole can be worth several. A player who didn't play a hole is ignored
 * for that hole; a group with nobody on the hole doesn't compete for it. Skins
 * still carrying after the 18th vanish.
 *
 * Cart Skins and Team Skins are the SAME engine — the only difference is how
 * players are grouped.
 */

import "../engine.js";
import type { CourseConfig, SkinsConfig } from "./courseConfig.ts";
import type { PlayerCard } from "./scoring.ts";

const E = (globalThis as { ClubhouseEngine: any }).ClubhouseEngine;

/** A player's card plus the id of the group they belong to (a cart, or a team). */
export interface SkinsEntry {
  card: PlayerCard;
  group: string | number;
}

export interface HoleSkinResult {
  hole: number; // 1-based
  /** Group id → average net on this hole (only groups with someone playing). */
  averages: Map<string, number>;
  /** Skins at stake on this hole (1 plus any carried in). */
  pot: number;
  /** Winning group id, or `null` when the hole tied and the pot carried on. */
  wonBy: string | null;
}

export interface SkinsResult {
  /** Group id → total skins won. */
  skins: Map<string, number>;
  holes: HoleSkinResult[];
  /** Skins left unresolved by a tie on the final hole — these vanish. */
  carried: number;
  /** How many groups competed; set when scored through `computeLeaderboard`. */
  cartCount?: number;
  /** What one skin is worth in a field this size, in strokes. */
  skinValue?: number;
}

/** A player and the group he plays skins in — his cart, or his team. */
export interface CartEntry {
  card: PlayerCard;
  cart: string | number;
}

/** A team of any size, team against team. */
export interface TeamEntry {
  card: PlayerCard;
  team: string | number;
}

/** Run skins over any grouping of a field. */
export const skinsByGroup: (entries: SkinsEntry[], course?: CourseConfig) => SkinsResult = E.skinsByGroup;

/** Skins grouped by the `cart` field, whatever the club is calling it this week. */
export const cartSkins: (entries: CartEntry[], course?: CourseConfig) => SkinsResult = E.cartSkins;

/** Team Skins: identical engine, grouped by team instead of cart. */
export const teamSkins: (entries: TeamEntry[], course?: CourseConfig) => SkinsResult = E.teamSkins;

/** What a count of skins is worth in strokes, in a field of this many groups. */
export const skinStrokes: (count: number, config: SkinsConfig, skinsWon: number) => number = E.skinStrokes;

/** What ONE skin is worth in a field of this many groups — `fairShare × groups / 18`. */
export const skinValue: (config: SkinsConfig, skinsWon: number) => number = E.skinValue;

/** Which format a field of this size plays: null, "cart" or "team". */
export const skinsFormat: (playerCount: number, config: SkinsConfig | null) =>
  "cart" | "team" | null = E.skinsFormat;

/** A group's score on a hole: its best two net balls, a lone ball counted twice. */
export const bestTwo: (played: number[]) => number | null = E.bestTwo;
