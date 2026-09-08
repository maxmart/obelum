/**
 * The obelum command.
 *
 *   obelum init --langs sv,no,en 'src/pages/{lang}/**\/*.mdx' …
 *   obelum status [--all] [--json]
 *   obelum brief <file> [--json]
 *   obelum edit <file>            commit the working copy of <file> as an edit
 *   obelum fix <file>             … as a fix: merged into every sibling's copy
 *   obelum sync <file> [--from <path>|-]   … as a sync (a translation landing)
 *   obelum mark <file> | --all    markAsSynced one language, or every document
 *   obelum translate <file> [--all] [--with claude]
 *   obelum check [--merges N] [--json]
 *
 * <file> is a real path; the document and language are read off it. Every
 * verb is one commit. Reads are HEAD's, so a hand edit is taken in by
 * `obelum edit`, which commits it, and is invisible to `status` before that.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Brief, Session } from '@obelum/core';
import { CONFIG_FILE, documentKeys, loadConfig, locate, realPath, type Config } from './config.js';
import { Git } from './git.js';
import { host, type Host } from './host.js';
import { check } from './check.js';

export interface Io {
  cwd: string;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  /** Whole stdin, for `sync --from -`. */
  stdin?: () => Promise<string>;
  /** A translator for `translate`; defaults to @obelum/translator-claude. */
  translator?: (opts: { apiKey: string; instructions?: string }) => Translator;
  env?: Record<string, string | undefined>;
}

export interface Translator {
  run(brief: Brief, opts?: { onEvent?: (event: { type: string; [k: string]: unknown }) => void }): Promise<string | null>;
}

interface Args {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parse(argv: string[]): Args {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) { flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const name = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--') && !['all', 'json', 'help'].includes(name)) { flags[name] = next; i++; }
      else flags[name] = true;
    } else positional.push(a);
  }
  return { command, positional, flags };
}

const USAGE = `usage: obelum <command> [options]

  init --langs a,b,c <pattern>…   write ${CONFIG_FILE}; patterns contain {lang}
  status [--all] [--json]         which languages are behind, per document
  brief <file> [--json]           what a translator would be told for <file>
  edit <file>                     commit the working copy as an edit
  fix <file>                      commit the working copy as a fix
  sync <file> [--from <path>|-]   commit as a sync; content from --from, or the working copy
  mark <file> | mark --all        mark a language, or every document, as synced
  translate <file> [--all]        translate <file> from its siblings (needs ANTHROPIC_API_KEY)
  check [--merges N] [--json]     audit .obelum/

<file> is a real path such as src/pages/sv/pricing.mdx.`;

export async function run(argv: string[], io: Io): Promise<number> {
  const args = parse(argv);
  const out = io.stdout, err = io.stderr;
  try {
    switch (args.command) {
      case 'help': case '--help': case '-h': out(USAGE); return 0;
      case 'init': return init(args, io);
    }
    const git = Git.open(io.cwd);
    try {
      const config = loadConfig(git.root);
      const h = host(git, config);
      switch (args.command) {
        case 'status': return await status(h, args, io);
        case 'brief': return await brief(h, args, io);
        case 'edit': case 'fix': case 'sync': return await verb(h, args, io);
        case 'mark': return await mark(h, args, io);
        case 'translate': return await translate(h, args, io);
        case 'check': return await audit(h, args, io);
        default: err(`obelum: unknown command "${args.command}"\n\n${USAGE}`); return 2;
      }
    } finally {
      await git.close();
    }
  } catch (e) {
    err(`obelum: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

// ---------------------------------------------------------------------------

function init(args: Args, io: Io): number {
  const langs = String(args.flags.langs ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (langs.length < 2 || args.positional.length === 0) {
    io.stderr(`usage: obelum init --langs sv,no,en 'src/pages/{lang}/**/*.mdx' […]`);
    return 2;
  }
  const root = Git.open(io.cwd).root;
  const file = path.join(root, CONFIG_FILE);
  if (fs.existsSync(file)) { io.stderr(`obelum: ${CONFIG_FILE} already exists`); return 1; }
  const config: Config = { langs, documents: args.positional };
  if (typeof args.flags.anchor === 'string') config.anchor = args.flags.anchor as Config['anchor'];
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  io.stdout(`wrote ${CONFIG_FILE}. Next: commit it, then \`obelum mark --all\` to record every language as synced as the files stand.`);
  return 0;
}

/** The document and language a <file> argument names. */
function target(h: Host, file: string | undefined, io: Io): { key: string; lang: string } {
  if (!file) throw new Error('a file path is required');
  const rel = path.relative(h.git.root, path.resolve(io.cwd, file)).replace(/\\/g, '/');
  const found = locate(h.config, rel);
  if (!found) throw new Error(`${rel} matches no document pattern in ${CONFIG_FILE}`);
  return found;
}

async function status(h: Host, args: Args, io: Io): Promise<number> {
  const keys = documentKeys(h.config, h.git.paths());
  const rows: { key: string; langs: Record<string, { missing: boolean; stale: string[] }> }[] = [];
  for (const key of keys) rows.push({ key, langs: await h.document(key).stale() });
  // A missing language is a state of its own, not a language behind; it is
  // shown as "missing" and `translate --all` offers to create it.
  const behind = rows.filter(r => Object.values(r.langs).some(s => !s.missing && s.stale.length > 0));
  if (args.flags.json) { io.stdout(JSON.stringify(args.flags.all ? rows : behind, null, 2)); return 0; }
  const shown = args.flags.all ? rows : behind;
  for (const r of shown) {
    const cells = h.config.langs.map(l => {
      const s = r.langs[l];
      return `${l}: ${s.missing ? 'missing' : s.stale.length ? `stale (${s.stale.join(', ')})` : 'ok'}`;
    });
    io.stdout(`${r.key}\n    ${cells.join('   ')}`);
  }
  io.stdout(`${rows.length} document${rows.length === 1 ? '' : 's'}, ${behind.length} with a language behind`);
  return 0;
}

async function brief(h: Host, args: Args, io: Io): Promise<number> {
  const { key, lang } = target(h, args.positional[0], io);
  const b = await h.document(key).brief(lang);
  if (args.flags.json) { io.stdout(JSON.stringify(b, null, 2)); return 0; }
  if (b.langDiffs.length === 0) { io.stdout(`${realPath(key, lang)} is synced to every language; nothing to translate.`); return 0; }
  io.stdout(`brief for ${realPath(key, lang)}`);
  for (const d of b.langDiffs) {
    io.stdout('');
    io.stdout(d.lang === lang
      ? `## ${d.lang} (the target itself) changed since its last sync:`
      : d.base === '' ? `## ${d.lang}: never seen by ${lang}; the whole file:` : `## ${d.lang} changed since ${lang} last synced:`);
    io.stdout(d.diff);
  }
  return 0;
}

async function verb(h: Host, args: Args, io: Io): Promise<number> {
  const { key, lang } = target(h, args.positional[0], io);
  const real = realPath(key, lang);
  let content: string | null;
  if (args.command === 'sync' && typeof args.flags.from === 'string') {
    content = args.flags.from === '-'
      ? await (io.stdin ?? (() => Promise.reject(new Error('no stdin'))))()
      : fs.readFileSync(path.resolve(io.cwd, args.flags.from), 'utf8').replace(/\r\n/g, '\n');
  } else {
    content = h.git.readWorking(real);
    if (content === null) throw new Error(`${real} does not exist in the working directory`);
  }
  const session = h.document(key);
  if (args.command === 'edit') {
    if ((await h.git.read(real)) === content) { io.stdout(`${real}: no change against HEAD`); return 0; }
    await session.edit(lang, content);
    io.stdout(`edit ${real}: committed`);
    return 0;
  }
  const result = args.command === 'fix' ? await session.fix(lang, content) : await session.sync(lang, content);
  io.stdout(`${args.command} ${real}: committed; merged into ${result.merged.length ? result.merged.join(', ') : 'nobody'}` +
    (result.conflicted.length ? `; left alone for ${result.conflicted.join(', ')} (they will see it as news)` : ''));
  return 0;
}

async function mark(h: Host, args: Args, io: Io): Promise<number> {
  if (args.flags.all) {
    const keys = documentKeys(h.config, h.git.paths());
    const batch = h.batched();
    let n = 0;
    for (const key of keys) {
      const session = batch.document(key);
      const stale = await session.stale();
      for (const lang of h.config.langs) {
        if (stale[lang].missing) continue;
        await session.markAsSynced(lang);
        n++;
      }
    }
    batch.flush(`markAsSynced: every language of ${keys.length} documents`);
    io.stdout(`marked ${n} languages across ${keys.length} documents as synced, in one commit`);
    return 0;
  }
  const { key, lang } = target(h, args.positional[0], io);
  await h.document(key).markAsSynced(lang);
  io.stdout(`markAsSynced ${realPath(key, lang)}: committed`);
  return 0;
}

async function translate(h: Host, args: Args, io: Io): Promise<number> {
  const { key, lang } = target(h, args.positional[0], io);
  const env = io.env ?? process.env;
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey && !io.translator) throw new Error('ANTHROPIC_API_KEY is not set');
  const instructions = h.config.instructions
    ? fs.readFileSync(path.join(h.git.root, h.config.instructions), 'utf8')
    : undefined;
  const make = io.translator ?? (await claudeTranslator(args.flags.with));
  const translator = make({ apiKey: apiKey ?? '', instructions });
  const session = h.document(key);

  const targets = args.flags.all
    ? Object.entries(await session.stale()).filter(([, s]) => s.missing || s.stale.length > 0).map(([l]) => l)
    : [lang];
  if (targets.length === 0) { io.stdout(`${key}: every language is synced; nothing to do`); return 0; }

  const round = session.syncAll();
  let failed = 0;
  for (const t of targets) {
    const b = await session.brief(t);
    if (b.langDiffs.length === 0) { io.stdout(`${realPath(key, t)}: synced; skipped`); continue; }
    io.stderr(`translating ${realPath(key, t)} from ${b.langDiffs.filter(d => d.lang !== t).map(d => d.lang).join(', ')}…`);
    const events = reporter(io);
    const content = await translator.run(b, { onEvent: events.onEvent });
    events.flush();
    if (content === null) { io.stderr(`${realPath(key, t)}: the translation did not complete; not saved`); failed++; continue; }
    const r = await round.sync(t, content);
    io.stdout(`sync ${realPath(key, t)}: committed` + (r.conflicted.length ? `; left alone for ${r.conflicted.join(', ')}` : ''));
  }
  if (args.flags.all) {
    const marked = await round.done();
    if (marked.length) io.stdout(`round closed: ${marked.join(', ')} marked as synced`);
  }
  return failed ? 1 : 0;
}

/**
 * The translator's events, as lines on stderr. Everything from the model is
 * prefixed with `│ ` so it reads apart from the command's own lines.
 * Reasoning streams in fragments of a few words; they are buffered and
 * written at a newline, or when another kind of event arrives, so a
 * sentence stays one line.
 */
function reporter(io: Io): { onEvent: (e: { type: string; [k: string]: unknown }) => void; flush: () => void } {
  let text = '';
  const model = (line: string) => { if (line.trim()) io.stderr(`│ ${line.trim()}`); };
  const flush = () => { model(text); text = ''; };
  return {
    flush,
    onEvent: e => {
      if (e.type === 'reasoning') {
        text += String(e.text);
        const lines = text.split('\n');
        text = lines.pop() ?? '';
        lines.forEach(model);
        return;
      }
      flush();
      if (e.type === 'edit') model(`edit: ${String((e.edit as { old_string: string }).old_string).slice(0, 60).replace(/\n/g, ' ')}…`);
      else if (e.type === 'error') model(`error: ${String(e.error)}`);
    },
  };
}

async function claudeTranslator(withFlag: string | boolean | undefined): Promise<NonNullable<Io['translator']>> {
  if (withFlag !== undefined && withFlag !== true && withFlag !== 'claude') throw new Error(`unknown translator "${withFlag}"; only claude is available`);
  let mod: { claude: (o: { apiKey: string; instructions?: string }) => Translator };
  try {
    mod = await import('@obelum/translator-claude') as typeof mod;
  } catch {
    throw new Error('@obelum/translator-claude is not installed; `npm install @obelum/translator-claude`');
  }
  return o => mod.claude(o);
}

async function audit(h: Host, args: Args, io: Io): Promise<number> {
  const merges = typeof args.flags.merges === 'string' ? Number(args.flags.merges) : 20;
  const findings = await check(h.git, h.config, { merges });
  if (args.flags.json) { io.stdout(JSON.stringify(findings, null, 2)); return findings.length ? 1 : 0; }
  for (const f of findings) io.stdout(`${f.kind}: ${f.path}\n    ${f.detail}`);
  io.stdout(findings.length ? `${findings.length} finding${findings.length === 1 ? '' : 's'}` : '.obelum/ is clean');
  return findings.length ? 1 : 0;
}

export type { Session };
