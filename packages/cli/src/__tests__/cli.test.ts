/**
 * The command against a real temporary repository: plain git, three
 * languages, the four verbs, a translation round with a scripted translator,
 * and the auditor.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { run, type Io } from '../index.js';

let root: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (rel: string, content: string) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};
const at = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const head = (rel: string) => execFileSync('git', ['show', `HEAD:${rel}`], { cwd: root, encoding: 'utf8' });

interface Result { code: number; out: string; err: string }
const obelum = (...argv: string[]) => obelumIn('', ...argv);
/** The command run from a directory below the root. */
async function obelumIn(dir: string, ...argv: string[]): Promise<Result> {
  const out: string[] = [], err: string[] = [];
  const io: Io = {
    cwd: path.join(root, dir),
    stdout: l => out.push(l),
    stderr: l => err.push(l),
    stdin: async () => stdinText,
    translator: opts => { madeWith = opts; return { run: async (brief, o) => script(brief, o?.onEvent) }; },
    env: { ANTHROPIC_API_KEY: 'test' },
    ask: async () => 'asked',
  };
  const code = await run(argv, io);
  return { code, out: out.join('\n'), err: err.join('\n') };
}
let stdinText = '';
let script: (brief: import('@obelum/core').Brief, onEvent?: (e: { type: string; [k: string]: unknown }) => void) => string | null = () => null;
let madeWith: { ask?: unknown } | undefined;

const page = (lang: string, ...lines: string[]) => [`# Pricing (${lang})`, ...lines].join('\n') + '\n';
const ABC = ['line A', 'line B', 'line C'];

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'obelum-cli-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  git('config', 'core.autocrlf', 'false');
  for (const l of ['sv', 'no', 'en']) write(`src/pages/${l}/pricing.mdx`, page(l, ...ABC));
  write('content/news/sv/summer.mdx', page('sv', 'news'));
  write('content/news/no/summer.mdx', page('no', 'news'));
  git('add', '-A'); git('commit', '-q', '-m', 'content');
  const r = await obelum('init', '--langs', 'sv,no,en', '--anchor', 'markdown', 'src/pages/{lang}/**/*.mdx', 'content/*/{lang}/*.mdx');
  expect(r.code).toBe(0);
  git('add', '-A'); git('commit', '-q', '-m', 'obelum.json');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
});

describe('init and mark --all', () => {
  it('records every language as synced in one commit, and status is then clean', async () => {
    let s = await obelum('status');
    expect(s.out).toContain('2 documents, 2 with a language behind');   // no copies yet: everyone existing is never synced

    const m = await obelum('mark', '--all');
    expect(m.code).toBe(0);
    expect(m.out).toContain('marked 5 languages across 2 documents');
    expect(git('log', '--format=%s', '-1')).toBe('markAsSynced: every language of 2 documents');
    expect(git('ls-tree', '-r', '--name-only', 'HEAD').split('\n').filter(p => p.startsWith('.obelum/')).length).toBe(9 + 4);

    s = await obelum('status');
    expect(s.out).toBe('2 documents, 0 with a language behind');
    const all = await obelum('status', '--all', '--json');
    expect(JSON.parse(all.out)[0].langs.en).toEqual({ missing: true, stale: ['sv', 'no'] });
  });
});

describe('init, told plainly what went wrong', () => {
  beforeEach(() => { fs.rmSync(path.join(root, 'obelum.json')); });

  it('takes languages split into separate arguments, as PowerShell passes an unquoted --langs sv,no', async () => {
    const r = await obelum('init', '--langs', 'sv', 'no', 'en', 'src/pages/{lang}/**/*.mdx');
    expect(r.code).toBe(0);
    expect(JSON.parse(at('obelum.json'))).toEqual({ langs: ['sv', 'no', 'en'], documents: ['src/pages/{lang}/**/*.mdx'] });
    expect(r.out).toContain(`wrote ${path.join(root, 'obelum.json')}`);
    expect(r.out).toContain('src/pages/{lang}/**/*.mdx: 3 files');
  });

  it('names what is missing: a second language, a pattern, {lang} in a pattern', async () => {
    expect((await obelum('init', '--langs', 'sv', 'src/pages/{lang}/*.mdx')).err).toContain('at least two languages; got only "sv"');
    expect((await obelum('init', '--langs', 'sv,no')).err).toContain('no document pattern');
    expect((await obelum('init', '--langs', 'sv,no', 'src/pages/*.mdx')).err).toContain('"src/pages/*.mdx" has no {lang} in it');
    expect(fs.existsSync(path.join(root, 'obelum.json'))).toBe(false);
  });

  it('run from below the root, refuses a pattern that only matches from where the user stands, and says why', async () => {
    const r = await obelumIn('src', 'init', '--langs', 'sv,no,en', 'pages/{lang}/*.mdx');
    expect(r.code).toBe(2);
    expect(r.err).toContain('matched from the repository root');
    expect(r.err).toContain(`'src/pages/{lang}/*.mdx'`);
    expect(r.err).toContain('Nothing was written');
    expect(fs.existsSync(path.join(root, 'obelum.json'))).toBe(false);

    const ok = await obelumIn('src', 'init', '--langs', 'sv,no,en', 'src/pages/{lang}/*.mdx');
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('at the repository root, not in src');
  });

  it('says a config below the root is not read', async () => {
    write('src/obelum.json', '{}');
    expect((await obelumIn('src', 'status')).err).toContain('is not read: obelum reads its config from the root');
  });
});

describe('single source', () => {
  beforeEach(async () => {
    fs.rmSync(path.join(root, 'obelum.json'));
    const r = await obelum('init', '--langs', 'sv,no,en', '--source', 'en', 'src/pages/{lang}/**/*.mdx');
    expect(r.code).toBe(0);
    git('add', '-A'); git('commit', '-q', '-m', 'single source');
    expect((await obelum('mark', '--all')).out).toContain('marked 2 languages');   // sv and no; en keeps no copies
  });

  it('a change to en makes the targets stale; a change to a target needs nothing and makes nobody stale', async () => {
    expect(git('ls-tree', '-r', '--name-only', 'HEAD').split('\n').filter(p => p.startsWith('.obelum/')).sort())
      .toEqual(['.obelum/no/src/pages/en/pricing.mdx', '.obelum/sv/src/pages/en/pricing.mdx']);

    write('src/pages/sv/pricing.mdx', page('sv', 'line A rättad', 'line B', 'line C'));
    const pending = await obelum('status');
    expect(pending.out).toMatch(/obelum edit src\/pages\/sv\/pricing\.mdx +to commit them; a target's changes go nowhere/);
    git('add', '-A'); git('commit', '-q', '-m', 'a correction to sv, committed by hand');
    expect((await obelum('status')).out).toContain('0 with a language behind');

    write('src/pages/en/pricing.mdx', page('en', ...ABC, 'Vipps'));
    expect((await obelum('status')).out).toMatch(/obelum fix src\/pages\/en\/pricing\.mdx +if they correct the source/);
    git('add', '-A'); git('commit', '-q', '-m', 'en: new content');
    const s = await obelum('status');
    expect(s.out).toContain('sv: stale (en)');
    expect(s.out).toContain('no: stale (en)');
    expect(s.out).toContain('en: ok');
  });

  it('a fix on en reaches no target as something to translate; a fix on a target is refused', async () => {
    write('src/pages/en/pricing.mdx', page('en', 'line A', 'line B', 'line C.'));
    const f = await obelum('fix', 'src/pages/en/pricing.mdx');
    expect(f.out).toContain('merged into');
    expect((await obelum('status')).out).toContain('0 with a language behind');

    write('src/pages/sv/pricing.mdx', page('sv', 'line A', 'line B', 'line C!'));
    expect((await obelum('fix', 'src/pages/sv/pricing.mdx')).err).toContain('sv is a target');
  });

  it('check names the copies left over from the peer system, which nothing reads now', async () => {
    write('.obelum/en/src/pages/sv/pricing.mdx', page('sv', ...ABC));     // the source's copy of a target
    write('.obelum/sv/src/pages/no/pricing.mdx', page('no', ...ABC));     // a target's copy of another target
    git('add', '-A'); git('commit', '-q', '-m', 'copies from the peer days');
    const c = await obelum('check');
    expect(c.code).toBe(1);
    expect(c.out).toContain('unread: .obelum/en/src/pages/sv/pricing.mdx');
    expect(c.out).toContain('unread: .obelum/sv/src/pages/no/pricing.mdx');
    expect(c.out).not.toContain('unread: .obelum/sv/src/pages/en/pricing.mdx');
    expect(c.out).toContain('2 findings');
  });

  it('refuses a source that is not one of the languages', async () => {
    fs.rmSync(path.join(root, 'obelum.json'));
    expect((await obelum('init', '--langs', 'sv,no', '--source', 'en', 'src/pages/{lang}/**/*.mdx')).err).toContain('--source "en" is not one of --langs');
  });
});

describe('the verbs', () => {
  beforeEach(async () => { await obelum('mark', '--all'); });

  it('edit takes a hand edit in as one commit and makes siblings stale', async () => {
    write('src/pages/no/pricing.mdx', page('no', ...ABC, 'Vipps'));
    expect((await obelum('status')).out).toContain('0 with a language behind');   // uncommitted: not seen
    const e = await obelum('edit', 'src/pages/no/pricing.mdx');
    expect(e.out).toBe('edit src/pages/no/pricing.mdx: committed');
    expect(git('log', '--format=%s', '-1')).toBe('edit src/pages/no/pricing.mdx');
    expect(git('show', '--stat', '--format=', 'HEAD')).toContain(' 1 file changed');
    const s = await obelum('status');
    expect(s.out).toContain('sv: stale (no)');
    expect(s.out).toContain('en: stale (no)');
    expect((await obelum('edit', 'src/pages/no/pricing.mdx')).out).toContain('no change against HEAD');
  });

  it('brief shows the diff, sync from stdin lands it, fix fans out', async () => {
    write('src/pages/no/pricing.mdx', page('no', ...ABC, 'Vipps'));
    await obelum('edit', 'src/pages/no/pricing.mdx');
    const b = await obelum('brief', 'src/pages/sv/pricing.mdx');
    expect(b.out).toContain('## no changed since sv last synced:');
    expect(b.out).toContain('+Vipps');
    expect(b.out).toContain('@@ -2,3 +2,4 @@ # Pricing (no)');

    stdinText = page('sv', ...ABC, 'Swish');
    const s = await obelum('sync', 'src/pages/sv/pricing.mdx', '--from', '-');
    expect(s.out).toBe('sync src/pages/sv/pricing.mdx: committed; merged into no, en');
    expect(head('src/pages/sv/pricing.mdx')).toBe(stdinText);
    expect(head('.obelum/sv/src/pages/no/pricing.mdx')).toBe(page('no', ...ABC, 'Vipps'));
    expect(at('src/pages/sv/pricing.mdx')).toBe(stdinText);   // working copy too
    expect((await obelum('status')).out).toContain('en: stale (no)');
    expect((await obelum('brief', 'src/pages/sv/pricing.mdx')).out).toContain('nothing to translate');

    write('src/pages/no/pricing.mdx', page('no', ...ABC, 'Vipps is fine'));
    const f = await obelum('fix', 'src/pages/no/pricing.mdx');
    expect(f.out).toBe('fix src/pages/no/pricing.mdx: committed; merged into sv; left alone for en (it will be in their next diff)');
    expect(head('.obelum/sv/src/pages/no/pricing.mdx')).toBe(page('no', ...ABC, 'Vipps is fine'));
    expect((await obelum('status')).out).not.toContain('sv: stale');
  });

  it('mark <file> marks one language', async () => {
    write('src/pages/no/pricing.mdx', page('no', ...ABC, 'Vipps only in Norway'));
    await obelum('edit', 'src/pages/no/pricing.mdx');
    const m = await obelum('mark', 'src/pages/sv/pricing.mdx');
    expect(m.out).toBe('markAsSynced src/pages/sv/pricing.mdx: committed');
    expect((await obelum('status')).out).not.toContain('sv: stale');
    expect((await obelum('status')).out).toContain('en: stale (no)');
  });

  it('status names a change not taken in yet, and the choice it needs', async () => {
    write('src/pages/no/pricing.mdx', page('no', ...ABC, 'Vipps'));
    write('src/pages/sv/about.mdx', page('sv', 'om oss'));
    const s = await obelum('status');
    expect(s.out).toContain('src/pages/no/pricing.mdx has changes, not taken in yet:');
    expect(s.out).toMatch(/obelum edit src\/pages\/no\/pricing\.mdx +if they are new content \(sv, en will need them\)/);
    expect(s.out).toMatch(/obelum fix src\/pages\/no\/pricing\.mdx +if they correct the translation \(nobody will\)/);
    expect(s.out).toContain('src/pages/sv/about.mdx is new, not taken in yet:');
    expect(s.out).toMatch(/obelum sync src\/pages\/sv\/about\.mdx +if it translates/);
    expect(s.out).toContain('3 documents, 0 with a language behind, 2 with changes not taken in yet');
    expect(JSON.parse((await obelum('status', '--json')).out).map((r: { pending: string[] }) => r.pending)).toEqual([['sv'], ['no']]);   // about, then pricing

    // From a subdirectory the commands are written as they would be typed there.
    expect((await obelumIn('src/pages', 'status')).out).toContain('obelum edit no/pricing.mdx');
    await obelum('edit', 'src/pages/no/pricing.mdx');
    expect((await obelum('status')).out).not.toContain('src/pages/no/pricing.mdx has changes');
  });

  it('fix and sync say so when there was nothing to commit', async () => {
    expect((await obelum('fix', 'src/pages/sv/pricing.mdx')).out).toBe('src/pages/sv/pricing.mdx: no change against HEAD; nothing to fix');
    expect((await obelum('sync', 'src/pages/sv/pricing.mdx')).out).toBe('src/pages/sv/pricing.mdx: already synced as it stands; nothing to commit');
  });

  it('mark says so when there was nothing to mark', async () => {
    expect((await obelum('mark', '--all')).out).toContain('already marked as synced; nothing to commit');
    expect((await obelum('mark', 'src/pages/sv/pricing.mdx')).out).toBe('src/pages/sv/pricing.mdx was already marked as synced; nothing to commit');
  });

  it('refuses a path outside the patterns and a missing config', async () => {
    expect((await obelum('brief', 'README.md')).err).toContain('matches no document pattern');
    expect((await obelum('mark', '-all')).err).toContain('looks like a flag; flags take two dashes: --all');
    expect((await obelumIn('src', 'brief', 'pages/sv/pricing.mdx')).err).not.toContain('matches no');
    expect((await obelumIn('src', 'brief', 'sv/pricing.mdx')).err).toContain('Patterns are matched from the repository root');
    fs.rmSync(path.join(root, 'obelum.json'));
    expect((await obelum('status')).err).toContain('No obelum.json');
  });
});

describe('translate', () => {
  beforeEach(async () => { await obelum('mark', '--all'); });

  it('prints the questions the translator asks, counts the unanswered, and withholds the asker with --no-ask', async () => {
    write('src/pages/sv/pricing.mdx', page('sv', 'line A ändrad', 'line B', 'line C'));
    await obelum('edit', 'src/pages/sv/pricing.mdx');
    script = (brief, onEvent) => {
      onEvent?.({ type: 'question', question: 'sv says one thing, en another: which?', options: [], guess: 'keep it', answer: null });
      return page(brief.targetLang, 'line A', 'line B', 'line C');
    };
    const r = await obelum('translate', 'src/pages/no/pricing.mdx', '--no-ask');
    expect(madeWith?.ask).toBeUndefined();
    expect(r.err).toContain('│ question: sv says one thing, en another: which?');
    expect(r.err).toContain('│ unanswered; its guess was: keep it');
    expect(r.err).toContain('src/pages/no/pricing.mdx: 1 question left unanswered (above)');
    expect(r.out).toContain('sync src/pages/no/pricing.mdx: committed');

    await obelum('edit', 'src/pages/sv/pricing.mdx');
    write('src/pages/sv/pricing.mdx', page('sv', 'line A ändrad igen', 'line B', 'line C'));
    await obelum('edit', 'src/pages/sv/pricing.mdx');
    await obelum('translate', 'src/pages/en/pricing.mdx');
    expect(madeWith?.ask).toBeTypeOf('function');
  });

  it('translates one language, or a round of every stale one, and closes the round', async () => {
    write('src/pages/sv/pricing.mdx', page('sv', 'line A ändrad', 'line B', 'line C'));
    await obelum('edit', 'src/pages/sv/pricing.mdx');
    script = brief => page(brief.targetLang, `line A changed for ${brief.targetLang}`, 'line B', 'line C');

    const one = await obelum('translate', 'src/pages/no/pricing.mdx');
    expect(one.code).toBe(0);
    expect(one.out).toContain('sync src/pages/no/pricing.mdx: committed');
    expect(head('src/pages/no/pricing.mdx')).toContain('line A changed for no');
    expect((await obelum('status')).out).toContain('en: stale (sv)');

    const all = await obelum('translate', 'src/pages/sv/pricing.mdx', '--all');
    expect(all.code).toBe(0);
    expect(all.out).toContain('sync src/pages/en/pricing.mdx: committed');
    expect(all.out).toContain('round closed: sv marked as synced');
    expect(head('.obelum/sv/src/pages/sv/pricing.mdx')).toBe(page('sv', 'line A ändrad', 'line B', 'line C'));
    expect((await obelum('status')).out).toBe('2 documents, 0 with a language behind');
  });

  it('does not save a translation that did not complete', async () => {
    write('src/pages/sv/pricing.mdx', page('sv', 'line A ändrad', 'line B', 'line C'));
    await obelum('edit', 'src/pages/sv/pricing.mdx');
    script = () => null;
    const r = await obelum('translate', 'src/pages/no/pricing.mdx');
    expect(r.code).toBe(1);
    expect(r.err).toContain('did not complete; not saved');
    expect(git('log', '--format=%s', '-1')).toBe('edit src/pages/sv/pricing.mdx');
  });
});

describe('check', () => {
  beforeEach(async () => { await obelum('mark', '--all'); });

  it('is clean after a migration, and reports orphans and conflict markers', async () => {
    expect((await obelum('check')).out).toBe('.obelum/ is clean');

    git('rm', '-q', 'content/news/no/summer.mdx'); git('commit', '-q', '-m', 'delete no news');
    write('.obelum/sv/src/pages/no/pricing.mdx', '<<<<<<< ours\nx\n=======\ny\n>>>>>>> theirs\n');
    git('add', '-A'); git('commit', '-q', '-m', 'bad resolution');
    const c = await obelum('check');
    expect(c.code).toBe(1);
    expect(c.out).toContain('orphan: .obelum/sv/content/news/no/summer.mdx');
    expect(c.out).toContain('orphan: .obelum/no/content/news/no/summer.mdx');
    expect(c.out).toContain('conflict-markers: .obelum/sv/src/pages/no/pricing.mdx');
    expect(c.out).toContain('3 findings');
  });

  it('flags a merge resolved by picking sides per file', async () => {
    // X: edit no, sync sv.  Y: edit no differently, sync sv.  Merge, taking
    // real sv from X and everything else from Y: sv claims a sync with a no
    // it never saw.
    git('checkout', '-q', '-b', 'X');
    write('src/pages/no/pricing.mdx', page('no', 'line A x', 'line B', 'line C')); await obelum('edit', 'src/pages/no/pricing.mdx');
    stdinText = page('sv', 'line A x', 'line B', 'line C'); await obelum('sync', 'src/pages/sv/pricing.mdx', '--from', '-');
    git('checkout', '-q', 'main'); git('checkout', '-q', '-b', 'Y');
    write('src/pages/no/pricing.mdx', page('no', 'line A y', 'line B', 'line C')); await obelum('edit', 'src/pages/no/pricing.mdx');
    stdinText = page('sv', 'line A y', 'line B', 'line C'); await obelum('sync', 'src/pages/sv/pricing.mdx', '--from', '-');
    git('checkout', '-q', 'X');
    try { git('merge', '-q', 'Y', '-m', 'merge'); } catch { /* conflicts, as expected */ }
    git('checkout', '--ours', '--', 'src/pages/sv/pricing.mdx');
    git('checkout', '--theirs', '--', 'src/pages/no/pricing.mdx', '.obelum');
    git('add', '-A'); git('commit', '-q', '-m', 'mixed resolution');

    const c = await obelum('check');
    expect(c.code).toBe(1);
    expect(c.out).toContain('mixed-resolution: .obelum/sv/src/pages/no/pricing.mdx');
    expect(c.out).toContain('sv claims a sync with no it never made');
  });
});

describe('object mode', () => {
  it('leaves staged and unstaged work elsewhere untouched, and commits only the verb\'s paths', async () => {
    await obelum('mark', '--all');
    write('README.md', 'staged\n'); git('add', 'README.md');
    write('src/pages/en/pricing.mdx', page('en', 'dirty, not part of this'));
    write('src/pages/no/pricing.mdx', page('no', ...ABC, 'Vipps'));
    await obelum('edit', 'src/pages/no/pricing.mdx');
    expect(git('show', '--stat', '--format=', 'HEAD')).toContain('1 file changed');
    expect(git('status', '--porcelain')).toBe('A  README.md\n M src/pages/en/pricing.mdx');
  });

  it('works under a sparse checkout that keeps .obelum/ off disk', async () => {
    execFileSync('git', ['sparse-checkout', 'set', '--no-cone', '/*', '!/.obelum/'], { cwd: root, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
    await obelum('mark', '--all');
    expect(fs.existsSync(path.join(root, '.obelum'))).toBe(false);
    expect(git('ls-tree', '-r', '--name-only', 'HEAD').split('\n').filter(p => p.startsWith('.obelum/')).length).toBe(13);
    expect(git('status', '--porcelain')).toBe('');

    write('src/pages/no/pricing.mdx', page('no', ...ABC, 'Vipps'));
    await obelum('edit', 'src/pages/no/pricing.mdx');
    expect((await obelum('status')).out).toContain('sv: stale (no)');
    stdinText = page('sv', ...ABC, 'Swish');
    const s = await obelum('sync', 'src/pages/sv/pricing.mdx', '--from', '-');
    expect(s.code).toBe(0);
    expect(head('.obelum/sv/src/pages/no/pricing.mdx')).toBe(page('no', ...ABC, 'Vipps'));
    expect(at('src/pages/sv/pricing.mdx')).toBe(stdinText);       // the real file is checked out
    expect(fs.existsSync(path.join(root, '.obelum'))).toBe(false);  // the copies still are not
    expect(git('status', '--porcelain')).toBe('');
    expect((await obelum('status')).out).toContain('en: stale (no)');
    expect((await obelum('check')).out).toBe('.obelum/ is clean');
  });
});
