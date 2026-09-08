/**
 * The Claude translator with a scripted model: what it puts in the prompts,
 * how it applies edits, and when it hands back a result. The document (in
 * @obelum/core) is exercised for real over an in-memory document; only what
 * talks to the model is replaced through `drive`.
 */
import { obelum, type Session } from '@obelum/core';
import { claude, type DriveFn, type TranslationEvent } from '../index.js';
import type { AgentStreamEvent, ClaudeAgentOptions } from '../claude/stream.js';

let script: (opts: ClaudeAgentOptions) => AgentStreamEvent[] = () => [{ type: 'stop', reason: 'end_turn' }];
let captured: ClaudeAgentOptions | undefined;
const drive: DriveFn = async function* (opts) {
  captured = opts;
  for (const ev of script(opts)) yield ev;
};
const translator = claude({ apiKey: 'k', drive });

/** One document over a Map: real files at `<lang>`, synced copies at `.obelum/<viewer>/<lang>`. */
function document(files: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(files));
  const file = (path: string) => ({
    read: () => store.get(path) ?? null,
    write: (content: string) => { store.set(path, content); },
  });
  const commits: string[] = [];
  const session = obelum({
    langs: ['en', 'sv'],
    file: lang => file(lang),
    synced: v => ({ file: lang => file(`.obelum/${v}/${lang}`) }),
    commit: (verb, lang) => { commits.push(`${verb} ${lang}`); },
  });
  return { session, store, commits };
}

/** The host's three lines: brief, translate, sync. */
async function translateInto(session: Session, lang: string) {
  const content = await translator.run(await session.brief(lang));
  if (content) await session.sync(lang, content);
  return content;
}

beforeEach(() => {
  captured = undefined;
  script = () => [{ type: 'stop', reason: 'end_turn' }];
});

describe('claude translator', () => {
  it('asks for a new file via write_file when the target does not exist', async () => {
    const { session, store, commits } = document({ en: 'Hello' });
    script = () => [
      { type: 'tool_use', id: '1', name: 'write_file', input: { content: 'Hej' }, turn: 0 },
      { type: 'stop', reason: 'end_turn' },
    ];
    expect(await translateInto(session, 'sv')).toBe('Hej');
    expect(store.get('sv')).toBe('Hej');
    expect(commits).toEqual(['sync sv']);
    expect(captured!.system).toContain('does not exist yet');
    expect(captured!.userMessage).toContain('## Current en content:\nHello');
  });

  it('shows the base and the diff in diff mode', async () => {
    const { session } = document({ en: '<p id="a">Hello</p>', sv: '<p id="a">Hej</p>' });
    await session.markAsSynced('sv');
    await session.edit('en', '<p id="a">Hello there</p>');
    await translateInto(session, 'sv');
    expect(captured!.system).toContain('changes were made in: en');
    expect(captured!.userMessage).toContain('en content at time of last sync:\n<p id="a">Hello</p>');
    expect(captured!.userMessage).toContain('+<p id="a">Hello there</p>');
  });

  it('tells the model to keep the target\'s own local changes', async () => {
    const { session } = document({ en: 'Hello\nBye', sv: 'Hej\nHejdå' });
    await session.markAsSynced('sv');
    await session.fix('sv', 'Hej\nHej då');
    await session.edit('en', 'Hello!\nBye');
    await translateInto(session, 'sv');
    expect(captured!.system).toContain('sv itself also changed');
    expect(captured!.userMessage).toContain('Changes made to sv (the file you\'re editing) since last sync');
  });

  it('puts the instructions into the system prompt verbatim', async () => {
    const { session } = document({ en: 'Hello' });
    await claude({ apiKey: 'k', drive, instructions: 'Never translate the word Cup.' }).run(await session.brief('sv'));
    expect(captured!.system).toContain('Never translate the word Cup.');
  });

  it('applies edits and hands back the result only when every failure was remediated', async () => {
    const { session, store } = document({ en: 'Hello', sv: 'Hej alla' });
    script = () => [
      { type: 'tool_use', id: '1', name: 'edit_file', input: { old_string: 'missing', new_string: 'x' }, turn: 0 },
      { type: 'tool_use', id: '2', name: 'edit_file', input: { old_string: 'alla', new_string: 'världen' }, turn: 1 },
      { type: 'stop', reason: 'end_turn' },
    ];
    expect(await translateInto(session, 'sv')).toBe('Hej världen');
    expect(store.get('sv')).toBe('Hej världen');
  });

  it('returns null when a failed edit was never answered in a later turn, so nothing is saved', async () => {
    const { session, store, commits } = document({ en: 'Hello', sv: 'Hej' });
    script = () => [
      { type: 'tool_use', id: '1', name: 'edit_file', input: { old_string: 'missing', new_string: 'x' }, turn: 0 },
      { type: 'stop', reason: 'end_turn' },
    ];
    const events: TranslationEvent['type'][] = [];
    const content = await translator.run(await session.brief('sv'), { onEvent: e => events.push(e.type) });
    expect(content).toBeNull();
    expect(events).toEqual(['error', 'done']);
    expect(store.get('sv')).toBe('Hej');
    expect(commits).toEqual([]);
  });

  it('returns null when cancelled', async () => {
    const { session } = document({ en: 'Hello', sv: 'Hej' });
    expect(await translator.run(await session.brief('sv'), { isCancelled: () => true })).toBeNull();
  });
});
