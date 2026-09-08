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
async function obelum(...argv: string[]): Promise<Result> {
  const out: string[] = [], err: string[] = [];
  const io: Io = {
    cwd: root,
    stdout: l => out.push(l),
    stderr: l => err.push(l),
    stdin: async () => stdinText,
    translator: () => ({ run: async brief => script(brief) }),
    env: { ANTHROPIC_API_KEY: 'test' },
  };
  const code = await run(argv, io);
  return { code, out: out.join('\n'), err: err.join('\n') };
}
let stdinText = '';
let script: (brief: import('@obelum/core').Brief) => string | null = () => null;

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
    expect(f.out).toBe('fix src/pages/no/pricing.mdx: committed; merged into sv; left alone for en (they will see it as news)');
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

  it('refuses a path outside the patterns and a missing config', async () => {
    expect((await obelum('brief', 'README.md')).err).toContain('matches no document pattern');
    fs.rmSync(path.join(root, 'obelum.json'));
    expect((await obelum('status')).err).toContain('No obelum.json');
  });
});

describe('translate', () => {
  beforeEach(async () => { await obelum('mark', '--all'); });

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
