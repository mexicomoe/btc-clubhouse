/**
 * Skins — the team element in Clubhouse: group against group, hole by hole.
 *
 * A group's score on a hole is the AVERAGE of its players' net scores, not the
 * total. Averaging is self-correcting: totals break with uneven groups, but an
 * average lets a one-man group compete fairly (measured at 1.13× a two-man cart
 * over 3,000 simulated rounds — close enough that no blind partner is needed).
 *
 * Lowest average wins the hole. A tied hole carries its skin into the next, so a
 * later hole can be worth several. A player who didn't play a hole is ignored
 * for that hole; a group with nobody on the hole doesn't compete for it.
 *
 * Cart Skins and Team Skins are the SAME engine — the only difference is how
 * players are grouped. `cartSkins` groups by cart, `teamSkins` by team; both are
 * one line over the grouping-agnostic core, `skinsByGroup`.
 */

import type { CourseConfig } from "./courseConfig.ts";
import { cappedNetByHole, type PlayerCard } from "./scoring.ts";

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
  /** Skins left unresolved by a tie on the final hole (0 in a normal round). */
  carried: number;
}

const HOLES = 18;

/**
 * Run skins over any grouping of a field. Group ids are compared as strings so
 * `1` and `"1"` land together. Returns skins per group, the hole-by-hole detail,
 * and any pot left carrying at the end.
 */
export function skinsByGroup(entries: SkinsEntry[], course: CourseConfig): SkinsResult {
  // Per-group list of each member's capped net per hole.
  const members = new Map<string, (number | null)[][]>();
  const order: string[] = [];
  for (const { card, group } of entries) {
    const id = String(group);
    if (!members.has(id)) {
      members.set(id, []);
      order.push(id);
    }
    members.get(id)!.push(cappedNetByHole(card, course));
  }

  const skins = new Map<string, number>(order.map((id) => [id, 0]));
  const holes: HoleSkinResult[] = [];
  let pot = 1;

  for (let h = 0; h < HOLES; h++) {
    // Each group's average over the members who actually played this hole.
    const averages = new Map<string, number>();
    for (const id of order) {
      const played = members.get(id)!
        .map((nets) => nets[h])
        .filter((n): n is number => n != null);
      if (played.length > 0) {
        averages.set(id, played.reduce((a, b) => a + b, 0) / played.length);
      }
    }

    let wonBy: string | null = null;
    if (averages.size > 0) {
      const best = Math.min(...averages.values());
      const winners = [...averages].filter(([, avg]) => avg === best).map(([id]) => id);
      if (winners.length === 1) {
        wonBy = winners[0];
        skins.set(wonBy, skins.get(wonBy)! + pot);
      }
      // A tie (or no clear winner) leaves the pot to carry into the next hole.
    }

    holes.push({ hole: h + 1, averages, pot, wonBy });
    pot = wonBy == null ? pot + 1 : 1;
  }

  return { skins, holes, carried: pot - 1 };
}

/** Two players per cart, cart against cart. */
export interface CartEntry {
  card: PlayerCard;
  cart: string | number;
}

/** Cart Skins: group by cart. */
export function cartSkins(entries: CartEntry[], course: CourseConfig): SkinsResult {
  return skinsByGroup(entries.map((e) => ({ card: e.card, group: e.cart })), course);
}

/** A team of any size, team against team. */
export interface TeamEntry {
  card: PlayerCard;
  team: string | number;
}

/** Team Skins: identical engine, grouped by team instead of cart. */
export function teamSkins(entries: TeamEntry[], course: CourseConfig): SkinsResult {
  return skinsByGroup(entries.map((e) => ({ card: e.card, group: e.team })), course);
}
