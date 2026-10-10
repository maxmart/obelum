/**
 * Single-source mode: en is the source, sv and no are translated from it.
 * Each target keeps a copy of en only; en keeps none. A change to a target
 * goes nowhere; a change to en makes every target stale; a fix on en is
 * a correction no target should translate.
 */
import { obelum, type Session } from '../index.js';

function single(files: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(files));
  const file = (path: string) => ({
    read: () => store.get(path) ?? null,
    write: (c: string) => { store.set(path, c); },
  });
  const commits: string[] = [];
  const session = obelum({
    langs: ['en', 'sv', 'no'],
    source: 'en',
    file: lang => file(lang),
    synced: v => ({ file: lang => file(`.obelum/${v}/${lang}`) }),
    commit: (verb, lang) => { commits.push(`${verb} ${lang}`); },
  });
  return { session, store, commits };
}

const stale = async (s: Session) => Object.fromEntries(Object.entries(await s.stale()).map(([l, st]) => [l, st.stale]));

describe('single source', () => {
  it('keeps one copy per target, of the source only', async () => {
    const { session, store } = single({ en: 'Hello\n', sv: 'Hej\n', no: 'Hei\n' });
    for (const l of ['en', 'sv', 'no']) await session.markAsSynced(l);
    expect([...store.keys()].filter(k => k.startsWith('.obelum/')).sort()).toEqual(['.obelum/no/en', '.obelum/sv/en']);
    expect(await stale(session)).toEqual({ en: [], sv: [], no: [] });
  });

  it('a change to the source makes every target stale; a change to a target makes nobody stale', async () => {
    const { session, store } = single({ en: 'Hello\n', sv: 'Hej\n', no: 'Hei\n' });
    for (const l of ['sv', 'no']) await session.markAsSynced(l);
    store.set('sv', 'Hej där\n');          // a correction, by hand, committed as is
    expect(await stale(session)).toEqual({ en: [], sv: [], no: [] });
    store.set('en', 'Hello there\n');
    expect(await stale(session)).toEqual({ en: [], sv: ['en'], no: ['en'] });
  });

  it('briefs a target with the source\'s diff only, and names the source', async () => {
    const { session, store } = single({ en: 'Hello\n', sv: 'Hej\n', no: 'Hei\n' });
    for (const l of ['sv', 'no']) await session.markAsSynced(l);
    store.set('sv', 'Hej där\n');
    store.set('no', 'Hei du\n');
    store.set('en', 'Hello there\n');
    const brief = await session.brief('sv');
    expect(brief.source).toBe('en');
    expect(brief.targetContent).toBe('Hej där\n');
    expect(brief.langDiffs.map(d => d.lang)).toEqual(['en']);
  });

  it('sync writes the target and its copy of the source, and touches nothing else', async () => {
    const { session, store, commits } = single({ en: 'Hello\n', sv: 'Hej\n', no: 'Hei\n' });
    for (const l of ['sv', 'no']) await session.markAsSynced(l);
    store.set('en', 'Hello there\n');
    const r = await session.sync('sv', 'Hej där\n');
    expect(r).toEqual({ lang: 'sv', merged: [], conflicted: [] });
    expect(store.get('.obelum/sv/en')).toBe('Hello there\n');
    expect(await stale(session)).toEqual({ en: [], sv: [], no: ['en'] });
    expect(commits.at(-1)).toBe('sync sv');
  });

  it('a fix on the source reaches every target\'s copy, so nobody translates it', async () => {
    const { session, store } = single({ en: 'Helo\nBye\n', sv: 'Hej\nHejdå\n', no: 'Hei\nHa det\n' });
    for (const l of ['sv', 'no']) await session.markAsSynced(l);
    const r = await session.fix('en', 'Hello\nBye\n');
    expect(r.merged.sort()).toEqual(['no', 'sv']);
    expect(store.get('.obelum/sv/en')).toBe('Hello\nBye\n');
    expect(await stale(session)).toEqual({ en: [], sv: [], no: [] });
  });

  it('refuses a fix on a target and a sync of the source, and says why', async () => {
    const { session } = single({ en: 'Hello\n', sv: 'Hej\n', no: 'Hei\n' });
    await expect(session.fix('sv', 'Hej!\n')).rejects.toThrow(/sv is a target.*needs no fix/);
    await expect(session.sync('en', 'Hello!\n')).rejects.toThrow(/en is the source/);
  });

  it('a round closes nothing, since only targets were behind', async () => {
    const { session, store } = single({ en: 'Hello\n', sv: 'Hej\n', no: 'Hei\n' });
    for (const l of ['sv', 'no']) await session.markAsSynced(l);
    store.set('en', 'Hello there\n');
    const round = session.syncAll();
    await round.sync('sv', 'Hej där\n');
    await round.sync('no', 'Hei der\n');
    expect(await round.done()).toEqual([]);
    expect(await stale(session)).toEqual({ en: [], sv: [], no: [] });
  });

  it('refuses a source that is not one of the languages', () => {
    expect(() => obelum({ langs: ['en', 'sv'], source: 'de', file: () => ({ read: () => null, write: () => {} }), synced: () => ({ file: () => ({ read: () => null, write: () => {} }) }), commit: () => {} }))
      .toThrow(/source "de" is not one of the languages/);
  });
});
