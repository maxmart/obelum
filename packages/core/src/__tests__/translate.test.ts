/**
 * The runner, with a scripted translator: which versions it asks for, what
 * it puts in the request, and when it is willing to save.
 */
import { runTranslation, buildTranslationRequest } from '../translate.js';
import type { TranslationDeps, Translator, TranslationEvent, TranslationRequest, Version } from '../translate.js';

const drop = (lines: string[]) => lines.filter(l => !/^(rev|synced):/.test(l));

function deps(overrides: Partial<TranslationDeps> & { versions: Record<string, Version | null> }): TranslationDeps & { written: Record<string, string> } {
  const written: Record<string, string> = {};
  return {
    locales: ['en', 'sv'],
    read: async lang => overrides.versions[lang] ?? null,
    readAtRev: async () => null,
    dropLines: drop,
    write: async (lang, content) => { written[lang] = content; },
    ...overrides,
    written,
  };
}

/** A translator that emits a fixed script and remembers what it was asked. */
function scripted(events: TranslationEvent[]): Translator & { request?: TranslationRequest } {
  const t: Translator & { request?: TranslationRequest } = {
    async *translate(request) {
      t.request = request;
      yield* events;
    },
  };
  return t;
}

const callbacks = () => {
  const statuses: string[] = [];
  const items: unknown[] = [];
  return {
    statuses,
    items,
    onLogItem: (i: unknown) => { items.push(i); },
    onStatusChange: (s: string) => { statuses.push(s); },
    isCancelled: () => false,
  };
};

describe('buildTranslationRequest', () => {
  it('sends full content when the target has never synced', async () => {
    const d = deps({ versions: { en: { content: 'rev: 3\nHello', meta: { rev: 3, synced: {} } }, sv: null } });
    const req = await buildTranslationRequest(d, 'sv');
    expect(req.langDiffs).toEqual([]);
    expect(req.fullSyncContents).toEqual([{ lang: 'en', content: 'rev: 3\nHello' }]);
    expect(req.targetContent).toBe('');
  });

  it('diffs each language against the revision the target last took', async () => {
    const d = deps({
      versions: {
        en: { content: 'rev: 4\n<p id="a">Hello there</p>', meta: { rev: 4, synced: { sv: 1 } } },
        sv: { content: 'rev: 1\n<p id="a">Hej</p>', meta: { rev: 1, synced: { en: 3, sv: 1 } } },
      },
      // sv's own base is its current content, so it contributes no diff.
      readAtRev: async (lang, rev) =>
        lang === 'en' && rev === 3 ? 'rev: 3\n<p id="a">Hello</p>'
        : lang === 'sv' && rev === 1 ? 'rev: 1\n<p id="a">Hej</p>'
        : null,
    });
    const req = await buildTranslationRequest(d, 'sv');
    expect(req.langDiffs.map(d => d.lang)).toEqual(['en']);
    expect(req.langDiffs[0].base).toContain('Hello</p>');
    expect(req.langDiffs[0].diff).toContain('Hello there');
    // Bookkeeping never reaches the diff.
    expect(req.langDiffs[0].diff).not.toContain('rev:');
  });

  it('passes the caller\'s instructions through verbatim', async () => {
    const d = deps({ versions: { en: { content: 'Hello', meta: { rev: 1, synced: {} } }, sv: null }, instructions: async () => 'Never translate Cup.' });
    expect((await buildTranslationRequest(d, 'sv')).instructions).toBe('Never translate Cup.');
  });
});

describe('runTranslation', () => {
  it('saves a complete result', async () => {
    const d = deps({ versions: { en: { content: 'Hello', meta: { rev: 1, synced: {} } }, sv: null } });
    const t = scripted([{ type: 'edit', edit: { old_string: '', new_string: 'Hej' } }, { type: 'done', finalContent: 'Hej', complete: true }]);
    const cb = callbacks();
    expect(await runTranslation(d, t, { targetLang: 'sv' }, cb)).toBe('done');
    expect(d.written.sv).toBe('Hej');
    expect(cb.statuses).toEqual(['translating', 'saving', 'done']);
    expect(t.request?.targetLang).toBe('sv');
  });

  it('does not save an incomplete result', async () => {
    const d = deps({ versions: { en: { content: 'Hello', meta: { rev: 1, synced: {} } }, sv: { content: 'Hej', meta: { rev: 1, synced: {} } } } });
    const t = scripted([{ type: 'error', error: 'edit failed' }, { type: 'done', finalContent: 'Hej', complete: false }]);
    const cb = callbacks();
    expect(await runTranslation(d, t, { targetLang: 'sv' }, cb)).toBe('error');
    expect(d.written.sv).toBeUndefined();
    expect(cb.statuses).toEqual(['translating', 'error']);
  });

  it('does not save an empty result even when complete', async () => {
    const d = deps({ versions: { en: { content: 'Hello', meta: { rev: 1, synced: {} } }, sv: null } });
    const t = scripted([{ type: 'done', finalContent: '', complete: true }]);
    const cb = callbacks();
    expect(await runTranslation(d, t, { targetLang: 'sv' }, cb)).toBe('error');
    expect(cb.items).toContainEqual({ type: 'error', content: 'Translation returned no content' });
  });

  it('reports a read failure instead of treating it as a missing translation', async () => {
    const d = deps({ versions: {}, read: async () => { throw new Error('storage timeout'); } });
    const t = scripted([{ type: 'done', finalContent: 'x', complete: true }]);
    const cb = callbacks();
    expect(await runTranslation(d, t, { targetLang: 'sv' }, cb)).toBe('error');
    expect(cb.items).toContainEqual({ type: 'error', content: 'storage timeout' });
    expect(t.request).toBeUndefined();
  });

  it('stops when cancelled mid-stream and saves nothing', async () => {
    const d = deps({ versions: { en: { content: 'Hello', meta: { rev: 1, synced: {} } }, sv: null } });
    let cancelled = false;
    const t: Translator = {
      async *translate() {
        yield { type: 'reasoning', text: 'working' };
        cancelled = true;
        yield { type: 'done', finalContent: 'Hej', complete: true };
      },
    };
    const cb = { ...callbacks(), isCancelled: () => cancelled };
    expect(await runTranslation(d, t, { targetLang: 'sv' }, cb)).toBe('cancelled');
    expect(d.written.sv).toBeUndefined();
  });
});
