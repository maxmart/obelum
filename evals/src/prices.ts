/**
 * What a run costs, and which model the translator uses when it is not told.
 * Shared by the runner and the publish step, so both price a run the same way.
 */

/** $ per million tokens: input, output. A cache write is 1.25× input, a
 *  read 0.1×. Models not listed are not priced. */
export const PRICES: Record<string, [number, number]> = {
  'claude-sonnet-5': [2, 10], 'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20], 'claude-opus-5': [5, 25],
  'claude-haiku-4-5': [1, 5], 'claude-fable-5-1': [10, 50],
};

export interface Tokens { input: number; cacheWrite: number; cacheRead: number; output: number }

export function dollars(model: string, u: Tokens): number {
  const price = PRICES[model];
  if (!price) return NaN;
  const [i, o] = price;
  return (u.input * i + u.cacheWrite * i * 1.25 + u.cacheRead * i * 0.1 + u.output * o) / 1e6;
}

/** The translator's own default (MODEL in translator-claude's stream.ts),
 *  when --model does not name one. */
export const TRANSLATOR_DEFAULT = 'claude-sonnet-5-5';

/** The translator's own effort (in translator-claude's claude.ts), when
 *  --effort does not name one. */
export const TRANSLATOR_EFFORT = 'medium';
