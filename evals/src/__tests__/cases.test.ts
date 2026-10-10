/**
 * The cases themselves, without a model: each stages a brief with something
 * to do, its reference answer passes every check, and leaving the target as it
 * was fails at least one, so no check passes by default.
 */
import { sourceOf, stage } from '../case.js';
import { cases } from '../cases/index.js';

describe.each(cases.map(c => [c.id, c] as const))('%s', (_, c) => {
  it('stages a brief with something to do', async () => {
    const { session } = await stage(c);
    expect((await session.brief(c.target)).langDiffs).not.toEqual([]);
  });

  it('passes every check with its reference', async () => {
    const { session } = await stage(c);
    const before = (await session.brief(c.target)).targetContent;
    const run = { questions: c.referenceQuestions ?? [] };
    expect(c.checks.filter(ch => !ch.ok(c.reference, before, run)).map(ch => ch.label)).toEqual([]);
  });

  it('fails some check when nothing is done, unless nothing is the answer', async () => {
    const { session } = await stage(c);
    const before = (await session.brief(c.target)).targetContent;
    if (c.reference === before && !c.referenceQuestions?.length) return;
    expect(c.checks.some(ch => !ch.ok(before, before, { questions: [] }))).toBe(true);
  });
});

it('ids are unique', () => {
  expect(new Set(cases.map(c => c.id)).size).toBe(cases.length);
});

describe.each(cases.filter(c => sourceOf(c) !== null).map(c => [c.id, c] as const))('%s, single source', (_, c) => {
  it('stages a brief with something to do, from the source only', async () => {
    const { session } = await stage(c, 'merged', 'single');
    const brief = await session.brief(c.target);
    expect(brief.source).toBe(sourceOf(c));
    expect(brief.langDiffs.map(d => d.lang)).toEqual([sourceOf(c)]);
  });

  it('passes every check with its reference', async () => {
    const { session } = await stage(c, 'merged', 'single');
    const before = (await session.brief(c.target)).targetContent;
    const run = { questions: c.referenceQuestions ?? [] };
    expect(c.checks.filter(ch => !ch.ok(c.reference, before, run)).map(ch => ch.label)).toEqual([]);
  });
});
