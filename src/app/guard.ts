const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/** Every number written in the text, as a value ("1,200" is 1200, "0.5" is 0.5, "55%" is 55). */
export function numbersIn(text: string): number[] {
  return (text.match(NUMBER) ?? []).map((t) => Number(t.replace(/,/g, ""))).filter((n) => Number.isFinite(n));
}

/**
 * The model may only repeat numbers it was given. True when every number in the text appears in the computed facts
 * (compared to the precision the facts were written with); otherwise the caller uses the template text instead.
 */
export function numbersAreGrounded(text: string, allowed: Iterable<number>): boolean {
  const facts = [...allowed];
  return numbersIn(text).every((n) => facts.some((f) => Math.abs(f - n) < 1e-9 || Math.abs(Math.round(f * 100) / 100 - n) < 1e-9 || Math.abs(Math.round(f * 10) / 10 - n) < 1e-9));
}

const OUTCOME_CLAIM = /\b(attendance|revenue|sales|sell(s|ing)? out|sell-?outs?|boost(s|ed|ing)?|raise[sd]?|increase[sd]?|drive[sn]?|more fans|bigger crowds?|fill(s|ed)? the park)\b/i;

/** Wording rule: scores describe local taste. Text that promises an attendance or revenue effect is rejected. */
export const claimsOutcome = (text: string): boolean => OUTCOME_CLAIM.test(text);
