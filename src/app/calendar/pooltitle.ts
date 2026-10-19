import { normTitle } from "../themes/match";

export interface PoolName {
  entityId: string;
  name: string;
}

/** "the lion king" and "lion king" are the same title; only a whole-word match counts. */
const bare = (s: string): string => normTitle(s).replace(/^the /, "");

/**
 * A calendar name that contains a pool title as whole words ("Lion King Night" and "The Lion King"). The longest title wins; two different titles of the
 * same length are never guessed between, and a title under five letters is never matched. No fuzzy matching: the pool entity was resolved by exact name.
 */
export function matchPoolTitle(text: string, pool: readonly PoolName[]): PoolName | null {
  const padded = ` ${bare(text)} `;
  let best: PoolName | null = null;
  let tie = false;
  for (const p of pool) {
    const n = bare(p.name);
    if (n.length < 5 || !padded.includes(` ${n} `)) continue;
    if (!best || n.length > bare(best.name).length) {
      best = p;
      tie = false;
    } else if (n.length === bare(best.name).length && p.entityId !== best.entityId) tie = true;
  }
  return tie ? null : best;
}
