/**
 * The fifteen traces from sync-copies-lab/traces.sh, against the in-memory
 * host in lab.ts. Matrices and evidence are the ones the shell prototype
 * printed (out/run-leave.txt: three-way fix, diagonal left alone), which
 * are the ones the design session's §9 findings were drawn from.
 */
import { fresh, lab, page, ABC, matrix, evidence, real, copy, LANGS, ALL_OK } from './lab.js';

const VIPPS = page('no', ...ABC, 'Vipps accepted');

describe('1. three verbs + vim', () => {
  it('edit makes siblings stale, sync clears one, fix reaches only who had synced, a hand edit is an edit', async () => {
    const { session, repo } = fresh();
    await session.edit('no', VIPPS);
    expect(await matrix(session)).toEqual({ sv: 'no:STALE en:ok', no: 'sv:ok en:ok', en: 'sv:ok no:STALE' });
    expect(await evidence(session, 'sv', 'no')).toBe(
      '@@ -2,3 +2,4 @@ Pricing (no)\n line A\n line B\n line C\n+Vipps accepted');

    await session.sync('sv', page('sv', ...ABC, 'Swish accepted'));
    expect(await matrix(session)).toEqual({ sv: 'no:ok en:ok', no: 'sv:ok en:ok', en: 'sv:ok no:STALE' });

    const r = await session.fix('no', page('no', ...ABC, 'Vipps is accepted'));
    expect(r).toEqual({ lang: 'no', merged: ['sv'], conflicted: ['en'] });
    expect(await matrix(session)).toEqual({ sv: 'no:ok en:ok', no: 'sv:ok en:ok', en: 'sv:ok no:STALE' });
    expect(await evidence(session, 'sv', 'no')).toBe('');
    expect(await evidence(session, 'en', 'no')).toBe(
      '@@ -2,3 +2,4 @@ Pricing (no)\n line A\n line B\n line C\n+Vipps is accepted');

    // vim: the real file and nothing else.
    repo.tree.set(real('en'), page('en', 'line A', 'line B edited in vim', 'line C'));
    repo.commit('hand edit');
    expect(await matrix(session)).toEqual({ sv: 'no:ok en:STALE', no: 'sv:ok en:STALE', en: 'sv:ok no:STALE' });
    expect(await evidence(session, 'no', 'en')).toBe(
      '@@ -1,4 +1,4 @@\n Pricing (en)\n line A\n-line B\n+line B edited in vim\n line C');
  });
});

describe('2. edit-then-fix-before-sync', () => {
  it('a fix two lines from an unseen edit merges; a fix inside it conflicts and rides with the edit', async () => {
    const { session } = fresh();
    await session.edit('no', VIPPS);
    const near = await session.fix('no', page('no', 'line A', 'line B is fine', 'line C', 'Vipps accepted'));
    expect(near).toEqual({ lang: 'no', merged: ['sv', 'en'], conflicted: [] });
    const inside = await session.fix('no', page('no', 'line A', 'line B is fine', 'line C', 'Vipps is accepted'));
    expect(inside).toEqual({ lang: 'no', merged: [], conflicted: ['sv', 'en'] });
    expect(await matrix(session)).toEqual({ sv: 'no:STALE en:ok', no: 'sv:ok en:ok', en: 'sv:ok no:STALE' });
    // The merged fix is context; the conflicting one is folded into the edit as one hunk.
    expect(await evidence(session, 'sv', 'no')).toBe(
      '@@ -2,3 +2,4 @@ Pricing (no)\n line A\n line B is fine\n line C\n+Vipps is accepted');
  });
});

describe('3. rev-collision: A edits sv + syncs no; B edits sv; merge', () => {
  it('heals for free: no is stale with exactly branch B\'s edit', async () => {
    const { session, repo } = fresh();
    repo.branch('A');
    await session.edit('sv', page('sv', 'line A from branch A', 'line B', 'line C'));
    await session.sync('no', page('no', 'line A fra branch A', 'line B', 'line C'));
    repo.checkout('main'); repo.branch('B');
    await session.edit('sv', page('sv', 'line A', 'line B', 'line C from branch B'));
    repo.checkout('A');
    expect(repo.merge('B').clean).toBe(true);
    expect(await matrix(session)).toEqual({ sv: 'no:ok en:ok', no: 'sv:STALE en:ok', en: 'sv:STALE no:ok' });
    expect(await evidence(session, 'no', 'sv')).toBe(
      '@@ -1,4 +1,4 @@\n Pricing (sv)\n line A from branch A\n line B\n-line C\n+line C from branch B');
  });
});

describe('4. Vipps divergence acknowledged by markAsSynced', () => {
  it('a later edit\'s evidence excludes the paragraph; a fix inside it merges and never appears', async () => {
    const { session } = fresh();
    await session.edit('no', page('no', ...ABC, 'Vipps only in Norway'));
    await session.markAsSynced('sv'); await session.markAsSynced('en');
    expect(await matrix(session)).toEqual(ALL_OK);
    await session.edit('no', page('no', 'line A changed', 'line B', 'line C', 'Vipps only in Norway'));
    expect(await evidence(session, 'sv', 'no')).toBe(
      '@@ -1,5 +1,5 @@\n Pricing (no)\n-line A\n+line A changed\n line B\n line C\n Vipps only in Norway');
    const r = await session.fix('no', page('no', 'line A changed', 'line B', 'line C', 'Vipps only in Norge'));
    expect(r).toEqual({ lang: 'no', merged: ['sv', 'en'], conflicted: [] });
    expect(await evidence(session, 'sv', 'no')).toBe(
      '@@ -1,5 +1,5 @@\n Pricing (no)\n-line A\n+line A changed\n line B\n line C\n Vipps only in Norge');
  });
});

/** Two branches that both edit no and sync sv. */
function twoSyncs(a: string, b: string) {
  const l = fresh();
  const { session, repo } = l;
  const run = async () => {
    repo.branch('X');
    await session.edit('no', page('no', ...a.split('|')));
    await session.sync('sv', page('sv', ...a.split('|')));
    repo.checkout('main'); repo.branch('Y');
    await session.edit('no', page('no', ...b.split('|')));
    await session.sync('sv', page('sv', ...b.split('|')));
    repo.checkout('X');
    return repo.mergeBase(repo.head, repo.branches.get('Y')!);
  };
  return { ...l, run };
}

describe('5. two branches both sync sv', () => {
  it('non-overlapping no edits: the copies merge like the real files, no conflict', async () => {
    const { session, repo, run } = twoSyncs('line A x|line B|line C', 'line A|line B|line C y');
    await run();
    expect(repo.merge('Y')).toEqual({ clean: true, conflicts: [] });
    expect(await matrix(session)).toEqual({ sv: 'no:ok en:ok', no: 'sv:ok en:ok', en: 'sv:ok no:STALE' });
    expect(repo.tree.get(copy('sv', 'no'))).toBe(repo.tree.get(real('no')));
  });

  it('5b. same line: conflict in .obelum, and a mixed resolution gives a false in-sync', async () => {
    const { session, repo, run } = twoSyncs('line A x|line B|line C', 'line A y|line B|line C');
    await run();
    expect(repo.merge('Y').conflicts).toEqual([
      copy('en', 'sv'), copy('no', 'sv'), copy('sv', 'no'), copy('sv', 'sv'), real('no'), real('sv'),
    ]);
    repo.resolve('ours', real('sv'), 'Y');
    repo.resolve('theirs', real('no'), 'Y');
    repo.resolve('theirs', 'pages/.obelum', 'Y');
    repo.commit('merged');
    // sv claims no:ok while holding X's translation of X's no.
    expect(await matrix(session)).toEqual({ sv: 'no:ok en:ok', no: 'sv:STALE en:ok', en: 'sv:STALE no:STALE' });
  });
});

describe('6. hand-resolved foreign merge (contractor PR, git auto-merges)', () => {
  it('the merged edit is news for everyone', async () => {
    const { session, repo } = fresh();
    repo.branch('pr');
    repo.tree.set(real('no'), page('no', 'line A by contractor', 'line B', 'line C')); repo.commit('contractor');
    repo.checkout('main');
    await session.edit('no', page('no', 'line A', 'line B', 'line C by editor'));
    expect(repo.merge('pr').clean).toBe(true);
    expect(await matrix(session)).toEqual({ sv: 'no:STALE en:ok', no: 'sv:ok en:ok', en: 'sv:ok no:STALE' });
    expect(await evidence(session, 'sv', 'no')).toBe(
      '@@ -1,4 +1,4 @@\n Pricing (no)\n-line A\n+line A by contractor\n line B\n-line C\n+line C by editor');
  });
});

describe('7. wholesale-pick foreign merge (take theirs) after sv had synced', () => {
  it('sv sees exactly what replaced the edit it had synced', async () => {
    const { session, repo } = fresh();
    repo.branch('pr');
    repo.tree.set(real('no'), page('no', 'line A by contractor', 'line B', 'line C')); repo.commit('contractor');
    repo.checkout('main');
    await session.edit('no', page('no', 'line A by editor', 'line B', 'line C'));
    await session.sync('sv', page('sv', 'line A by editor', 'line B', 'line C'));
    expect(repo.merge('pr').conflicts).toEqual([real('no')]);
    repo.resolve('theirs', real('no'), 'pr');
    repo.commit('took theirs');
    expect(await matrix(session)).toEqual({ sv: 'no:STALE en:ok', no: 'sv:ok en:ok', en: 'sv:ok no:STALE' });
    expect(await evidence(session, 'sv', 'no')).toBe(
      '@@ -1,4 +1,4 @@\n Pricing (no)\n-line A by editor\n+line A by contractor\n line B\n line C');
  });
});

describe('8. squash-merge, branch deleted', () => {
  it('all state is in the tree, so the squash is all clear', async () => {
    const { session, repo } = fresh();
    repo.branch('feat');
    await session.edit('no', page('no', 'line A', 'line B feat', 'line C'));
    await session.sync('sv', page('sv', 'line A', 'line B feat', 'line C'));
    await session.sync('en', page('en', 'line A', 'line B feat', 'line C'));
    repo.checkout('main');
    repo.squash('feat'); repo.branches.delete('feat');
    expect(await matrix(session)).toEqual(ALL_OK);
  });
});

describe('9. binary media', () => {
  it('replaces the copy iff it equals the old bytes, which is what the 3-way merge degenerates to', async () => {
    const l = lab();
    const { repo, open } = l;
    const session = open('hero.png');
    for (const L of LANGS) repo.tree.set(real(L, 'hero.png'), 'PNGv1');
    for (const V of LANGS) for (const S of LANGS) repo.tree.set(copy(V, S, 'hero.png'), 'PNGv1');
    repo.commit('media in sync');
    await session.edit('no', 'PNGv2');
    await session.markAsSynced('sv');
    const r = await session.fix('no', 'PNGv3');
    expect(r).toEqual({ lang: 'no', merged: ['sv'], conflicted: ['en'] });
    expect(repo.tree.get(copy('sv', 'no', 'hero.png'))).toBe('PNGv3');
    expect(repo.tree.get(copy('en', 'no', 'hero.png'))).toBe('PNGv1');
    expect(await matrix(session)).toEqual({ sv: 'no:ok en:ok', no: 'sv:ok en:ok', en: 'sv:ok no:STALE' });
  });
});

describe('10. sparse checkout: the verbs work on objects', () => {
  it('reads and writes only through the document\'s files, and each commit holds exactly what changed', async () => {
    const { session, commits } = fresh();
    await session.edit('no', page('no', 'line A!', 'line B', 'line C'));
    expect((await session.stale()).sv.stale).toEqual(['no']);
    await session.markAsSynced('sv');
    expect((await session.stale()).sv.stale).toEqual([]);
    // markAsSynced touches no real file: only sv's synced copy of no moved.
    expect(commits.map(c => c.paths)).toEqual([[real('no')], [copy('sv', 'no')]]);
  });
});

describe('11. the diagonal', () => {
  it('fix leaves L\'s own synced copy alone, so sv\'s own diff says what sv changed itself', async () => {
    const { session } = fresh();
    await session.sync('sv', page('sv', ...ABC));
    await session.fix('sv', page('sv', 'line A', 'line B (bättre ordval)', 'line C'));
    await session.edit('no', page('no', 'line A ny', 'line B', 'line C'));
    expect(await evidence(session, 'sv', 'no')).toBe(
      '@@ -1,4 +1,4 @@\n Pricing (no)\n-line A\n+line A ny\n line B\n line C');
    expect(await evidence(session, 'sv', 'sv')).toBe(
      '@@ -1,4 +1,4 @@\n Pricing (sv)\n line A\n-line B\n+line B (bättre ordval)\n line C');
    // and the siblings never saw the fix as news
    expect((await session.stale()).no.stale).toEqual([]);
  });
});

describe('12. rebase feat (edit no + sync sv) onto main (edit en)', () => {
  it('is clean and the matrix is what you would draw', async () => {
    const { session, repo } = fresh();
    repo.branch('feat');
    await session.edit('no', page('no', 'line A', 'line B feat', 'line C'));
    await session.sync('sv', page('sv', 'line A', 'line B feat', 'line C'));
    repo.checkout('main');
    await session.edit('en', page('en', 'line A', 'line B', 'line C main'));
    repo.checkout('feat');
    repo.rebase('main');
    expect(await matrix(session)).toEqual({ sv: 'no:ok en:STALE', no: 'sv:ok en:STALE', en: 'sv:ok no:STALE' });
    expect(await evidence(session, 'sv', 'en')).toBe(
      '@@ -1,4 +1,4 @@\n Pricing (en)\n line A\n line B\n-line C\n+line C main');
  });
});

describe('13. revert an edit, a sync, a fix', () => {
  it('a revert of an edit is an edit, of a sync restores everything, of a fix is a fix', async () => {
    const { session, repo } = fresh();
    await session.edit('no', page('no', ...ABC, 'Vipps'));
    const editC = repo.head;
    await session.sync('sv', page('sv', ...ABC, 'Swish'));
    const syncC = repo.head;
    repo.revert(syncC);
    expect(await matrix(session)).toEqual({ sv: 'no:STALE en:ok', no: 'sv:ok en:ok', en: 'sv:ok no:STALE' });
    repo.revert(repo.head);
    repo.revert(editC);
    expect(await matrix(session)).toEqual({ sv: 'no:STALE en:ok', no: 'sv:ok en:ok', en: 'sv:ok no:ok' });
    expect(await evidence(session, 'sv', 'no')).toBe(
      '@@ -2,4 +2,3 @@ Pricing (no)\n line A\n line B\n line C\n-Vipps');
    await session.fix('no', page('no', 'line A', 'line B fixed', 'line C'));
    repo.revert(repo.head);
    expect(await matrix(session)).toEqual({ sv: 'no:STALE en:ok', no: 'sv:ok en:ok', en: 'sv:ok no:ok' });
  });
});

describe('14. recovery from a mixed .obelum conflict resolution', () => {
  it('markAsSynced keeps the false ok; pointing the copies at the merge base is right', async () => {
    const { session, repo, run } = twoSyncs('line A x|line B|line C', 'line A y|line B|line C');
    const base = await run();
    expect(repo.merge('Y').clean).toBe(false);
    repo.resolve('ours', real('sv'), 'Y');
    repo.resolve('theirs', real('no'), 'Y');
    repo.resolve('theirs', 'pages/.obelum', 'Y');
    repo.commit('mixed resolution');
    const falseOk = { sv: 'no:ok en:ok', no: 'sv:STALE en:ok', en: 'sv:STALE no:STALE' };
    expect(await matrix(session)).toEqual(falseOk);

    repo.branch('snapshot');
    await session.markAsSynced('sv');
    expect(await matrix(session)).toEqual(falseOk);

    repo.checkout('X');
    for (const V of LANGS) repo.tree.set(copy('sv', V), repo.show(base, copy('sv', V))!);
    repo.commit('sv copies := merge base');
    expect(await matrix(session)).toEqual({ sv: 'no:STALE en:ok', no: 'sv:STALE en:ok', en: 'sv:STALE no:STALE' });
    expect(await evidence(session, 'sv', 'no')).toBe(
      '@@ -1,4 +1,4 @@\n Pricing (no)\n-line A\n+line A y\n line B\n line C');
    expect(await evidence(session, 'sv', 'sv')).toBe(
      '@@ -1,4 +1,4 @@\n Pricing (sv)\n-line A\n+line A x\n line B\n line C');
  });
});

describe('15. birth: the page exists only in no', () => {
  it('missing languages make nobody stale; a newborn is synced to at once, not news', async () => {
    const { session, repo } = fresh();
    for (const p of [...repo.tree.keys()]) if (p !== real('no')) repo.tree.delete(p);
    repo.commit('only no exists');
    expect(await session.stale()).toEqual({
      sv: { missing: true, stale: ['no'] },
      no: { missing: false, stale: [] },
      en: { missing: true, stale: ['no'] },
    });
    expect(await evidence(session, 'sv', 'no')).toBe(
      '@@ -0,0 +1,4 @@\n+Pricing (no)\n+line A\n+line B\n+line C');
    expect((await session.brief('sv')).langDiffs.map(d => d.base)).toEqual(['']);

    expect(await session.sync('sv', page('sv', ...ABC))).toEqual({ lang: 'sv', merged: ['no', 'en'], conflicted: [] });
    expect(await matrix(session)).toEqual({ sv: 'no:ok en:ok', no: 'sv:ok en:ok', en: 'sv:ok no:STALE' });
    expect(await session.sync('en', page('en', ...ABC))).toEqual({ lang: 'en', merged: ['sv', 'no'], conflicted: [] });
    expect(await matrix(session)).toEqual(ALL_OK);
    expect((await session.stale()).en.missing).toBe(false);
  });
});

describe('9c. sync fans out like fix', () => {
  it('edit sv, sync no, sync en: all clear, a translation is never news', async () => {
    const { session, commits } = fresh();
    await session.edit('sv', page('sv', 'line A ändrad', 'line B', 'line C'));
    await session.sync('no', page('no', 'line A endret', 'line B', 'line C'));
    expect(await matrix(session)).toEqual({ sv: 'no:ok en:ok', no: 'sv:ok en:ok', en: 'sv:STALE no:ok' });
    await session.sync('en', page('en', 'line A changed', 'line B', 'line C'));
    expect(await matrix(session)).toEqual(ALL_OK);
    expect(commits.map(c => c.message)).toEqual(['edit sv', 'sync no', 'sync en']);
  });
});

describe('16. a round: edit, sync every sibling, done', () => {
  it('catches the editor\'s own copy up once everyone has the edit, and not before', async () => {
    const { session, repo, commits } = fresh();
    await session.edit('sv', page('sv', 'line A ändrad', 'line B', 'line C'));
    const round = session.syncAll();
    await round.sync('no', page('no', 'line A endret', 'line B', 'line C'));
    // en is still behind on sv: closing now marks nothing.
    expect(await round.done()).toEqual([]);
    expect(repo.tree.get(copy('sv', 'sv'))).toBe(page('sv', ...ABC));
    await round.sync('en', page('en', 'line A changed', 'line B', 'line C'));
    expect(await round.done()).toEqual(['sv']);
    expect(repo.tree.get(copy('sv', 'sv'))).toBe(page('sv', 'line A ändrad', 'line B', 'line C'));
    expect(commits.map(c => c.message)).toEqual(['edit sv', 'sync no', 'sync en', 'markAsSynced sv']);
    expect(commits.at(-1)!.paths).toEqual([copy('sv', 'sv')]);
    // Everyone agrees on everything, the editor included.
    expect(await matrix(session)).toEqual(ALL_OK);
    expect((await session.brief('sv')).langDiffs).toEqual([]);
  });

  it('never marks a missing language, so a newborn still gets full evidence', async () => {
    const { session, repo } = fresh();
    for (const p of [...repo.tree.keys()]) if (p.includes('/en/') || p.endsWith('/en/pricing.mdx')) repo.tree.delete(p);
    for (const p of [...repo.tree.keys()]) if (p.includes('.obelum/en/')) repo.tree.delete(p);
    repo.commit('en gone');
    await session.edit('sv', page('sv', 'line A ändrad', 'line B', 'line C'));
    const round = session.syncAll();
    await round.sync('no', page('no', 'line A endret', 'line B', 'line C'));
    expect(await round.done()).toEqual(['sv']);
    // no's sync fanned out into en's missing copy of no (the birth rule), so en is behind on sv only.
    expect((await session.stale()).en).toEqual({ missing: true, stale: ['sv'] });
  });
});

describe('16b. a round closes only its sources', () => {
  it('leaves a pending fix in a sibling\'s own copy alone', async () => {
    const { session, repo } = fresh();
    await session.fix('sv', page('sv', 'line A', 'line B (bättre ordval)', 'line C'));
    await session.edit('no', page('no', 'line A ny', 'line B', 'line C'));
    const round = session.syncAll();
    await round.sync('sv', page('sv', 'line A ny', 'line B (bättre ordval)', 'line C'));
    await round.sync('en', page('en', 'line A new', 'line B', 'line C'));
    // no was the source; sv's fix left nobody behind, so sv is not closed.
    expect(await round.done()).toEqual(['no']);
    expect(await matrix(session)).toEqual(ALL_OK);
    // sv's own copy was refreshed by its sync, which is the only thing that should refresh it.
    expect(repo.tree.get(copy('sv', 'sv'))).toBe(page('sv', 'line A ny', 'line B (bättre ordval)', 'line C'));
  });

  it('keeps a fix in the self diff when the fixed language is not synced in the round', async () => {
    const { session, repo } = fresh();
    await session.fix('en', page('en', 'line A', 'line B (better wording)', 'line C'));
    await session.edit('no', page('no', 'line A ny', 'line B', 'line C'));
    const round = session.syncAll();
    await round.sync('sv', page('sv', 'line A ny', 'line B', 'line C'));
    await round.sync('en', page('en', 'line A new', 'line B (better wording)', 'line C'));
    expect(await round.done()).toEqual(['no']);
    // A language nobody was behind on is never a source, even with a fix pending.
    await session.edit('no', page('no', 'line A nyare', 'line B', 'line C'));
    const round2 = session.syncAll();
    await round2.sync('sv', page('sv', 'line A nyare', 'line B', 'line C'));
    await round2.sync('en', page('en', 'line A newer', 'line B (better wording)', 'line C'));
    expect(await round2.done()).toEqual(['no']);
    expect(repo.tree.get(copy('no', 'no'))).toBe(page('no', 'line A nyare', 'line B', 'line C'));
  });
});
