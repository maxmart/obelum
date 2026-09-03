/**
 * The Claude translator with a scripted model: what it puts in the prompts,
 * how it applies edits, and when it reports a run as complete. The runner
 * (in @obelum/core) is exercised for real; only what talks to the model is
 * replaced through the `drive` option.
 */
import { runTranslation, type TranslationDeps, type Version } from '@obelum/core';
import { claude, type DriveFn } from '../index.js';
import type { AgentStreamEvent, ClaudeAgentOptions } from '../claude/stream.js';

let script: (opts: ClaudeAgentOptions) => AgentStreamEvent[] = () => [{ type: 'stop', reason: 'end_turn' }];
let captured: ClaudeAgentOptions | undefined;
const drive: DriveFn = async function* (opts) {
  captured = opts;
  for (const ev of script(opts)) yield ev;
};
const translator = claude({ apiKey: 'k', drive });

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

describe('claude translator', () => {
  it('asks for a new file via write_file when the target does not exist', async () => {
    const d = deps({ versions: { en: { content: 'rev: 3\nHello', meta: { rev: 3, synced: {} } }, sv: null } });
    script = () => [
      { type: 'tool_use', id: '1', name: 'write_file', input: { content: 'Hej' }, turn: 0 },
      { type: 'stop', reason: 'end_turn' },
    ];
    expect(await runTranslation(d, translator, { targetLang: 'sv' }, callbacks())).toBe('done');
    expect(d.written.sv).toBe('Hej');
    expect(captured!.system).toContain('does not exist yet');
    // Bookkeeping stripped from what the model sees.
    expect(captured!.userMessage).toContain('Hello');
    expect(captured!.userMessage).not.toContain('rev: 3');
  });

  it('shows the base and the diff in diff mode', async () => {
    const d = deps({
      versions: {
        en: { content: 'rev: 4\n<p id="a">Hello there</p>', meta: { rev: 4, synced: { sv: 1 } } },
        sv: { content: 'rev: 1\n<p id="a">Hej</p>', meta: { rev: 1, synced: { en: 3 } } },
      },
      readAtRev: async (lang, rev) => (lang === 'en' && rev === 3 ? 'rev: 3\n<p id="a">Hello</p>' : null),
    });
    await runTranslation(d, translator, { targetLang: 'sv' }, callbacks());
    expect(captured!.system).toContain('changes were made in: en');
    expect(captured!.userMessage).toContain('en content at time of last sync');
    expect(captured!.userMessage).toContain('Hello there');
  });

  it('puts the caller\'s instructions into the system prompt verbatim', async () => {
    const d = deps({ versions: { en: { content: 'Hello', meta: { rev: 1, synced: {} } }, sv: null }, instructions: async () => 'Never translate the word Cup.' });
    await runTranslation(d, translator, { targetLang: 'sv' }, callbacks());
    expect(captured!.system).toContain('Never translate the word Cup.');
  });

  it('applies edits and reports complete only when every failure was remediated', async () => {
    const d = deps({ versions: { en: { content: 'Hello', meta: { rev: 1, synced: {} } }, sv: { content: 'Hej alla', meta: { rev: 1, synced: {} } } } });
    script = () => [
      { type: 'tool_use', id: '1', name: 'edit_file', input: { old_string: 'missing', new_string: 'x' }, turn: 0 },
      { type: 'tool_use', id: '2', name: 'edit_file', input: { old_string: 'alla', new_string: 'världen' }, turn: 1 },
      { type: 'stop', reason: 'end_turn' },
    ];
    expect(await runTranslation(d, translator, { targetLang: 'sv' }, callbacks())).toBe('done');
    expect(d.written.sv).toBe('Hej världen');
  });

  it('is not complete when a failed edit was never answered in a later turn', async () => {
    const d = deps({ versions: { en: { content: 'Hello', meta: { rev: 1, synced: {} } }, sv: { content: 'Hej', meta: { rev: 1, synced: {} } } } });
    script = () => [
      { type: 'tool_use', id: '1', name: 'edit_file', input: { old_string: 'missing', new_string: 'x' }, turn: 0 },
      { type: 'stop', reason: 'end_turn' },
    ];
    const cb = callbacks();
    expect(await runTranslation(d, translator, { targetLang: 'sv' }, cb)).toBe('error');
    expect(d.written.sv).toBeUndefined();
    expect(cb.statuses).toEqual(['translating', 'error']);
  });
});
