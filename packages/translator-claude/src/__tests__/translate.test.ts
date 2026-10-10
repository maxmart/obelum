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
    expect(captured!.system).toContain('someone changed English (en)');
    expect(captured!.userMessage).toContain('en content at time of last sync:\n<p id="a">Hello</p>');
    expect(captured!.userMessage).toContain('+<p id="a">Hello there</p>');
  });

  it('shows the whole file once, as a diff, in the inline style', async () => {
    const { session } = document({ en: 'Intro\nHello\nOutro\n', sv: 'Intro\nHej\nOutro\n' });
    await session.markAsSynced('sv');
    await session.edit('en', 'Intro\nHello there\nOutro\n');
    await claude({ apiKey: 'k', drive, diffStyle: 'inline' }).run(await session.brief('sv'));
    expect(captured!.system).toContain('"+" was added');
    expect(captured!.userMessage).toContain('## en since last sync, the whole file as a diff:\n Intro\n-Hello\n+Hello there\n Outro\n\n');
    expect(captured!.userMessage).not.toContain('at time of last sync');
  });

  it('shows the diff alone, without the source file, in the diff style', async () => {
    const { session } = document({ en: 'Intro\nHello\nOutro\n', sv: 'Intro\nHej\nOutro\n' });
    await session.markAsSynced('sv');
    await session.edit('en', 'Intro\nHello there\nOutro\n');
    await claude({ apiKey: 'k', drive, diffStyle: 'diff' }).run(await session.brief('sv'));
    expect(captured!.system).toContain('The rest of that file is not shown');
    expect(captured!.userMessage).toContain('## Changes made to en since sv last synced:\n@@ -1,3 +1,3 @@');
    expect(captured!.userMessage).not.toContain('at time of last sync');
  });

  it('answers an edit with the lines around it in the check approach, and only "applied" in batch', async () => {
    const replies: (string | undefined)[] = [];
    const recording: DriveFn = async function* (opts) {
      captured = opts;
      for (const ev of script(opts)) replies.push((yield ev)?.content);
    };
    script = () => [
      { type: 'tool_use', id: '1', name: 'edit_file', input: { old_string: 'Hej', new_string: 'Hej där' }, turn: 0 },
      { type: 'stop', reason: 'end_turn' },
    ];
    const { session } = document({ en: 'A\nB\nHello\nC\n', sv: 'A\nB\nHej\nC\n' });
    await session.markAsSynced('sv');
    await session.edit('en', 'A\nB\nHello there\nC\n');
    const brief = await session.brief('sv');

    await claude({ apiKey: 'k', drive: recording, approach: 'check' }).run(brief);
    expect(captured!.system).toContain('Each edit\'s result shows the Swedish file around it');
    expect(replies[0]).toBe('Edit applied. Around it, the file now reads:\n1\tA\n2\tB\n3\tHej där\n4\tC\n5\t');

    replies.length = 0;
    await claude({ apiKey: 'k', drive: recording, approach: 'batch' }).run(brief);
    expect(replies[0]).toBe('Edit applied successfully.');
  });

  it('passes a question to the host\'s ask and the answer back to the model, and logs it either way', async () => {
    const replies: (string | undefined)[] = [];
    const recording: DriveFn = async function* (opts) {
      captured = opts;
      for (const ev of script(opts)) replies.push((yield ev)?.content);
    };
    script = () => [
      { type: 'tool_use', id: '1', name: 'ask', input: { question: 'en says 250, de says 300: which?', options: ['250', '300'], guess: 'keep 200' }, turn: 0 },
      { type: 'stop', reason: 'end_turn' },
    ];
    const { session } = document({ en: 'Fee 200\n', sv: 'Avgift 200\n' });
    await session.markAsSynced('sv');
    await session.edit('en', 'Fee 250\n');
    const brief = await session.brief('sv');

    const asked: string[] = [];
    const events: TranslationEvent[] = [];
    const answered = claude({ apiKey: 'k', drive: recording, ask: async q => { asked.push(q.question); return '250'; } });
    expect(await answered.run(brief, { onEvent: e => events.push(e) })).toBe('Avgift 200\n');   // a question is no failure
    expect(asked).toEqual(['en says 250, de says 300: which?']);
    expect(replies[0]).toBe('The answer: 250');
    expect(events.find(e => e.type === 'question')).toMatchObject({ options: ['250', '300'], guess: 'keep 200', answer: '250' });
    expect(captured!.system).toContain('Call ask, once');
    expect(captured!.tools.map(t => t.name)).toContain('ask');

    replies.length = 0; events.length = 0;
    await claude({ apiKey: 'k', drive: recording }).run(brief, { onEvent: e => events.push(e) });
    expect(replies[0]).toContain('No one can answer now');
    expect(events.find(e => e.type === 'question')).toMatchObject({ answer: null });
  });

  it('asks for notes in English', async () => {
    const { session } = document({ en: 'Hello\n', sv: 'Hej\n' });
    await session.markAsSynced('sv');
    await session.edit('en', 'Hello!\n');
    await translateInto(session, 'sv');
    expect(captured!.system).toContain('Write your plan, your notes and your summary in English');
  });

  it('does not count an edit that changes nothing as a failure, even when its text is not there', async () => {
    // A model that decided nothing needs to change sometimes still calls
    // edit_file, with a placeholder. That loses nothing; the run is saved.
    const { session } = document({ en: 'Hello\n', sv: 'Hej\n' });
    await session.markAsSynced('sv');
    await session.edit('en', 'Hello!\n');
    script = () => [
      { type: 'tool_use', id: '1', name: 'edit_file', input: { old_string: 'placeholder_no_change', new_string: 'placeholder_no_change' }, turn: 0 },
      { type: 'stop', reason: 'end_turn' },
    ];
    expect(await translator.run(await session.brief('sv'))).toBe('Hej\n');
  });

  it('tells the model to keep the target\'s own local edits', async () => {
    const { session } = document({ en: 'Hello\nBye', sv: 'Hej\nHejdå' });
    await session.markAsSynced('sv');
    await session.edit('sv', 'Hej\nHejdå\nVälkommen');
    await session.edit('en', 'Hello!\nBye');
    await translateInto(session, 'sv');
    expect(captured!.system).toContain('Swedish has been edited itself since then too');
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
