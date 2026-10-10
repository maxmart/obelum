/**
 * The cases themselves, without a model: each stages a brief with something
 * to do, its reference answer passes every check, and leaving the target as it
 * was fails at least one, so no check passes by default.
 */
import { stage } from '../case.js';
import { cases } from '../cases/index.js';

describe.each(cases.map(c => [c.id, c] as const))('%s', (_, c) => {
  it('stages a brief with something to do', async () => {
    const { session } = await stage(c);
    expect((await session.brief(c.target)).langDiffs).not.toEqual([]);
  });

  it('passes every check with its reference', async () => {
    const { session } = await stage(c);
    const before = (await session.brief(c.target)).targetContent;
    expect(c.checks.filter(ch => !ch.ok(c.reference, before)).map(ch => ch.label)).toEqual([]);
  });

  it('fails some check when nothing is done, unless nothing is the answer', async () => {
    const { session } = await stage(c);
    const before = (await session.brief(c.target)).targetContent;
    if (c.reference === before) return;
    expect(c.checks.some(ch => !ch.ok(before, before))).toBe(true);
  });
});

it('ids are unique', () => {
  expect(new Set(cases.map(c => c.id)).size).toBe(cases.length);
});
