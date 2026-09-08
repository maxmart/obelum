/**
 * The brief: what a translator is told, and the host's hunk header hook.
 * The save is the host's: brief, translate, sync.
 */
import { obelum } from '../index.js';
import { fresh, page, ABC, matrix, real } from './lab.js';

describe('brief', () => {
  it('shows each changed language as base, current content and diff', async () => {
    const { session } = fresh();
    await session.edit('no', page('no', ...ABC, 'Vipps'));
    expect(await session.brief('sv')).toEqual({
      targetLang: 'sv',
      targetContent: page('sv', ...ABC),
      langDiffs: [
        { lang: 'no', base: page('no', ...ABC), content: page('no', ...ABC, 'Vipps'), diff: '@@ -2,3 +2,4 @@ Pricing (no)\n line A\n line B\n line C\n+Vipps' },
      ],
    });
  });

  it('includes the target\'s own local changes, and sync saves the translation', async () => {
    const { session, commits } = fresh();
    await session.fix('sv', page('sv', 'line A', 'line B (bättre)', 'line C'));
    await session.edit('no', page('no', 'line A ny', 'line B', 'line C'));
    const brief = await session.brief('sv');
    expect(brief.langDiffs.map(d => d.lang)).toEqual(['sv', 'no']);
    await session.sync('sv', page('sv', 'line A ny', 'line B (bättre)', 'line C'));
    expect(commits.at(-1)!.message).toBe('sync sv');
    expect(await matrix(session)).toEqual({ sv: 'no:ok en:ok', no: 'sv:ok en:ok', en: 'sv:ok no:STALE' });
  });

  it('briefs a newborn language with empty bases and whole-file diffs', async () => {
    const { session, repo } = fresh();
    for (const p of [...repo.tree.keys()]) if (p !== real('no')) repo.tree.delete(p);
    repo.commit('only no');
    const brief = await session.brief('sv');
    expect(brief.targetContent).toBe('');
    expect(brief.langDiffs).toEqual([{ lang: 'no', base: '', content: page('no', ...ABC), diff: '@@ -0,0 +1,4 @@\n+Pricing (no)\n+line A\n+line B\n+line C' }]);
  });

  it('is empty when nothing changed', async () => {
    const { session } = fresh();
    expect((await session.brief('sv')).langDiffs).toEqual([]);
  });

  it('names hunks after the nearest line the document calls an anchor', async () => {
    const store = new Map<string, string>([['no', '<Hero id="top">\n  <p>a</p>\n  <p>b</p>\n  <p>c</p>\n  <p>d</p>\n'], ['sv', 'x\n']]);
    const file = (path: string) => ({
      read: () => store.get(path) ?? null,
      write: (c: string) => { store.set(path, c); },
    });
    const session = obelum({
      langs: ['sv', 'no'],
      file: lang => file(lang),
      synced: v => ({ file: lang => file(`synced/${v}/${lang}`) }),
      commit: () => {},
      anchor: line => line.trimStart().startsWith('<') && !line.trimStart().startsWith('<p'),
    });
    await session.markAsSynced('sv');
    await session.edit('no', '<Hero id="top">\n  <p>a</p>\n  <p>b</p>\n  <p>c</p>\n  <p>D</p>\n');
    expect((await session.brief('sv')).langDiffs[0].diff).toBe(
      '@@ -2,4 +2,4 @@ <Hero id="top">\n   <p>a</p>\n   <p>b</p>\n   <p>c</p>\n-  <p>d</p>\n+  <p>D</p>');
  });
});
