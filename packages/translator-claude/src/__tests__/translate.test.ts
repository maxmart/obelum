/**
 * The contract between a translation run and whoever owns the documents,
 * exercised without a model: driveClaudeAgent is replaced by a script, so
 * what is under test is which versions the run asks for, what it shows the
 * model, and when it is willing to save.
 */
import type { AgentStreamEvent, ToolReply, ClaudeAgentOptions } from '../claude/stream';

type Script = (opts: ClaudeAgentOptions) => AgentStreamEvent[];
let script: Script = () => [{ type: 'stop', reason: 'end_turn' }];
let captured: ClaudeAgentOptions | undefined;

vi.mock('../claude/stream', async importOriginal => {
  const real = await importOriginal<typeof import('../claude/stream')>();
  return {
    ...real,
    async *driveClaudeAgent(opts: ClaudeAgentOptions): AsyncGenerator<AgentStreamEvent, void, ToolReply | undefined> {
      captured = opts;
      for (const ev of script(opts)) yield ev;
    },
  };
});

const { runTranslation } = await import('../translate');
import type { TranslationDeps, Version } from '../translate';

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

const callbacks = () => {
  const statuses: string[] = [];
  return {
    statuses,
    onLogItem: () => {},
    onStatusChange: (s: string) => { statuses.push(s); },
    isCancelled: () => false,
  };
};

beforeEach(() => {
  captured = undefined;
  script = () => [{ type: 'stop', reason: 'end_turn' }];
});

describe('runTranslation', () => {
  it('translates from full content when the target has never synced', async () => {
    const d = deps({ versions: { en: { content: 'rev: 3\nHello', meta: { rev: 3, synced: {} } }, sv: null } });
    script = () => [
      { type: 'tool_use', id: '1', name: 'write_file', input: { content: 'Hej' }, turn: 0 },
      { type: 'stop', reason: 'end_turn' },
    ];
    const result = await runTranslation(d, { targetLang: 'sv', apiKey: 'k' }, callbacks());
    expect(result).toBe('done');
    expect(d.written.sv).toBe('Hej');
    // The model saw the content with bookkeeping stripped, and never the target as a source.
    expect(captured!.userMessage).toContain('Hello');
    expect(captured!.userMessage).not.toContain('rev: 3');
    expect(captured!.system).toContain('does not exist yet');
  });

  it('shows a diff against the revision the target last took', async () => {
    const d = deps({
      versions: {
        en: { content: 'rev: 4\n<p id="a">Hello there</p>', meta: { rev: 4, synced: { sv: 1 } } },
        sv: { content: 'rev: 1\n<p id="a">Hej</p>', meta: { rev: 1, synced: { en: 3 } } },
      },
      readAtRev: async (lang, rev) => (lang === 'en' && rev === 3 ? 'rev: 3\n<p id="a">Hello</p>' : null),
    });
    await runTranslation(d, { targetLang: 'sv', apiKey: 'k' }, callbacks());
    expect(captured!.system).toContain('changes were made in: en');
    expect(captured!.userMessage).toContain('Hello there');
    expect(captured!.userMessage).toContain('en content at time of last sync');
  });

  it('passes the caller\'s instructions into the system prompt verbatim', async () => {
    const d = deps({ versions: { en: { content: 'Hello', meta: { rev: 1, synced: {} } }, sv: null }, instructions: async () => 'Never translate the word Cup.' });
    await runTranslation(d, { targetLang: 'sv', apiKey: 'k' }, callbacks());
    expect(captured!.system).toContain('Never translate the word Cup.');
  });

  it('does not save a run that ended with an unanswered failed edit', async () => {
    const d = deps({ versions: { en: { content: 'Hello', meta: { rev: 1, synced: {} } }, sv: { content: 'Hej', meta: { rev: 1, synced: {} } } } });
    script = () => [
      { type: 'tool_use', id: '1', name: 'edit_file', input: { old_string: 'missing', new_string: 'x' }, turn: 0 },
      { type: 'stop', reason: 'end_turn' },
    ];
    const cb = callbacks();
    expect(await runTranslation(d, { targetLang: 'sv', apiKey: 'k' }, cb)).toBe('error');
    expect(d.written.sv).toBeUndefined();
    expect(cb.statuses).toEqual(['translating', 'error']);
  });

  it('reports a read failure instead of treating it as a missing translation', async () => {
    const d = deps({ versions: {}, read: async () => { throw new Error('storage timeout'); } });
    const items: unknown[] = [];
    const cb = { ...callbacks(), onLogItem: (i: unknown) => items.push(i) };
    expect(await runTranslation(d, { targetLang: 'sv', apiKey: 'k' }, cb)).toBe('error');
    expect(items).toContainEqual({ type: 'error', content: 'storage timeout' });
    expect(captured).toBeUndefined();
  });
});
