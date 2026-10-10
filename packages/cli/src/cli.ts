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
 *   obelum translate <file> [--all] [--no-ask] [--with claude]
 *   obelum check [--merges N] [--json]
 *
 * <file> is a real path; the document and language are read off it. Every
 * verb is one commit. Reads are HEAD's, so a hand edit is taken in by
 * `obelum edit`, which commits it, and is invisible to `status` before that.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Brief, Session } from '@obelum/core';
import { CONFIG_FILE, documentKeys, loadConfig, locate, matching, patternProblem, realPath, type Config } from './config.js';
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
  translator?: (opts: { apiKey: string; instructions?: string; ask?: Io['ask'] }) => Translator;
  env?: Record<string, string | undefined>;
  /** Puts the translator's question to the person at the terminal, and
   *  resolves with their answer, or null for none. Absent when nobody is
   *  there to ask (no terminal, or --no-ask): questions are then only
   *  printed, and what they are about is left as it was. */
  ask?: (q: { question: string; options: string[]; guess: string }) => Promise<string | null>;
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
      if (next !== undefined && !next.startsWith('--') && !['all', 'json', 'help', 'no-ask'].includes(name)) { flags[name] = next; i++; }
      else flags[name] = true;
    } else positional.push(a);
  }
  return { command, positional, flags };
}

const USAGE = `usage: obelum <command> [options]

  init --langs a,b,c <pattern>…   write ${CONFIG_FILE}; patterns contain {lang}
       [--source a]               translate from one language only (single-source mode)
  status [--all] [--json]         which languages are behind, per document
  brief <file> [--json]           what a translator would be told for <file>
  edit <file>                     commit the working copy as an edit
  fix <file>                      commit the working copy as a fix
  sync <file> [--from <path>|-]   commit as a sync; content from --from, or the working copy
  mark <file> | mark --all        mark a language, or every document, as synced
  translate <file> [--all]        translate <file> from its siblings (needs ANTHROPIC_API_KEY);
                                  asks you in a terminal when it cannot tell, unless --no-ask
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
      const config = loadConfig(git.root, io.cwd);
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

const INIT_USAGE = `usage: obelum init --langs sv,no,en [--source en] 'src/pages/{lang}/**/*.mdx' […]`;

/** A language tag: en, sv, pt-BR, zh_Hant. */
const isLang = (s: string) => /^[A-Za-z]{2,3}([-_][A-Za-z0-9]+)*$/.test(s);

function init(args: Args, io: Io): number {
  const fail = (message: string) => { io.stderr(`obelum init: ${message}`); return 2; };
  const patterns = args.positional.filter(p => p.includes('{lang}'));
  const loose = args.positional.filter(p => !p.includes('{lang}'));
  // PowerShell passes an unquoted `--langs en,sv` as two arguments, so "sv"
  // arrives among the patterns. A pattern always has {lang} in it; a bare
  // language tag without one is a language, wherever it stands.
  const langs = [...(typeof args.flags.langs === 'string' ? args.flags.langs.split(',') : []), ...loose.filter(isLang)]
    .map(s => s.trim()).filter(Boolean);
  const strays = loose.filter(p => !isLang(p));
  if (strays.length) return fail(`${strays.map(p => `"${p}"`).join(', ')} has no {lang} in it. A pattern needs {lang} where the language goes: 'src/pages/{lang}/**/*.mdx'.`);
  if (langs.length < 2) return fail(`--langs needs at least two languages${langs.length ? `; got only "${langs[0]}"` : ''}.\n${INIT_USAGE}`);
  const twice = langs.filter((l, i) => langs.indexOf(l) !== i);
  if (twice.length) return fail(`"${twice[0]}" is listed twice in --langs.`);
  if (!patterns.length) return fail(`no document pattern. A pattern says where each language's files are, with {lang} where the language goes.\n${INIT_USAGE}`);
  for (const p of patterns) {
    const problem = patternProblem(p);
    if (problem) return fail(problem);
  }

  const git = Git.open(io.cwd);
  const file = path.join(git.root, CONFIG_FILE);
  if (fs.existsSync(file)) { io.stderr(`obelum: ${file} already exists`); return 1; }

  // Patterns are matched from the repository root. Run from a directory
  // below it, a pattern written from where the user stands matches nothing;
  // when the same pattern under that directory does match, that is almost
  // certainly what was meant, and writing the file at the root would only
  // leave it somewhere unexpected.
  const files = git.workingPaths();
  const below = subdirectory(git.root, io.cwd);
  const counts = patterns.map(p => matching(p, langs, files).length);
  if (below && counts.every(n => n === 0)) {
    const meant = patterns.map(p => `${below}/${p}`);
    if (meant.some(p => matching(p, langs, files).length > 0)) {
      return fail(`patterns are matched from the repository root, ${git.root}, and from there ${patterns.map(p => `'${p}'`).join(', ')} matches no file. ` +
        `Nothing was written. Either give the path from the root: obelum init --langs ${langs.join(',')} ${meant.map(p => `'${p}'`).join(' ')}\n` +
        `or make ${below} a repository of its own first: git init, in ${below}.`);
    }
  }

  const source = typeof args.flags.source === 'string' ? args.flags.source : undefined;
  if (source !== undefined && !langs.includes(source)) return fail(`--source "${source}" is not one of --langs (${langs.join(', ')}).`);
  const config: Config = { langs, documents: patterns, ...(source ? { source } : {}) };
  if (typeof args.flags.anchor === 'string') config.anchor = args.flags.anchor as Config['anchor'];
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  io.stdout(`wrote ${file}`);
  if (below) io.stdout(`  at the repository root, not in ${below}: patterns are matched from there`);
  patterns.forEach((p, i) => io.stdout(`  ${p}: ${counts[i] ? `${counts[i]} file${counts[i] === 1 ? '' : 's'}` : 'no files yet'}`));
  io.stdout(`Next: commit ${CONFIG_FILE} together with your pages, then \`obelum mark --all\` to record every language as synced as the files stand.`);
  return 0;
}

/** `dir` relative to `root`, with forward slashes; '' when it is the root. */
function subdirectory(root: string, dir: string): string {
  const rel = path.relative(root, path.resolve(dir)).replace(/\\/g, '/');
  return rel.startsWith('..') ? '' : rel;
}

/** A repository path as the user would type it from where they stand. */
function fromCwd(h: Host, io: Io, real: string): string {
  return path.relative(path.resolve(io.cwd), path.join(h.git.root, real)).replace(/\\/g, '/');
}

/** The document and language a <file> argument names. */
function target(h: Host, file: string | undefined, io: Io): { key: string; lang: string } {
  if (!file) throw new Error('a file path is required');
  const rel = path.relative(h.git.root, path.resolve(io.cwd, file)).replace(/\\/g, '/');
  const found = locate(h.config, rel);
  if (!found) {
    const flag = /^-[^-]/.test(file) ? ` "${file}" looks like a flag; flags take two dashes: -${file}.` : '';
    const where = subdirectory(h.git.root, io.cwd) ? ` Patterns are matched from the repository root, ${h.git.root}.` : '';
    throw new Error(`${rel} matches no document pattern in ${CONFIG_FILE} (${h.config.documents.join(', ')}).${where}${flag}`);
  }
  return found;
}

/** A language file whose working copy differs from what is committed: a
 *  change obelum has not been told about, and cannot classify for itself.
 *  An edit makes the siblings stale and a fix does not, so status names the
 *  file and the choice rather than guessing. */
interface Pending { lang: string; real: string; isNew: boolean }

async function pendingChanges(h: Host): Promise<Map<string, Pending[]>> {
  const out = new Map<string, Pending[]>();
  for (const p of h.git.changedPaths()) {
    if (p.startsWith('.obelum/')) continue;
    const found = locate(h.config, p);
    if (!found) continue;
    const working = h.git.readWorking(p);
    if (working === null) continue; // deleted on disk: nothing to take in
    const committed = await h.git.read(p);
    if (working === committed) continue; // line endings only
    const list = out.get(found.key) ?? [];
    list.push({ lang: found.lang, real: p, isNew: committed === null });
    out.set(found.key, list);
  }
  return out;
}

async function status(h: Host, args: Args, io: Io): Promise<number> {
  const pending = await pendingChanges(h);
  const keys = [...new Set([...documentKeys(h.config, h.git.paths()), ...pending.keys()])].sort();
  const rows: { key: string; langs: Record<string, { missing: boolean; stale: string[] }>; pending?: string[] }[] = [];
  for (const key of keys) {
    const row: (typeof rows)[number] = { key, langs: await h.document(key).stale() };
    const p = pending.get(key);
    if (p) row.pending = p.map(x => x.lang);
    rows.push(row);
  }
  // A missing language is a state of its own, not a language behind; it is
  // shown as "missing" and `translate --all` offers to create it.
  const isBehind = (r: (typeof rows)[number]) => Object.values(r.langs).some(s => !s.missing && s.stale.length > 0);
  const behind = rows.filter(isBehind);
  const waiting = rows.filter(r => r.pending);
  const shown = args.flags.all ? rows : rows.filter(r => isBehind(r) || r.pending);
  if (args.flags.json) { io.stdout(JSON.stringify(shown, null, 2)); return 0; }

  for (const r of shown) {
    const cells = h.config.langs.map(l => {
      const s = r.langs[l];
      return `${l}: ${s.missing ? 'missing' : s.stale.length ? `stale (${s.stale.join(', ')})` : 'ok'}`;
    });
    io.stdout(`${r.key}\n    ${cells.join('   ')}`);
    for (const p of pending.get(r.key) ?? []) {
      const file = fromCwd(h, io, p.real);
      const others = h.config.langs.filter(l => l !== p.lang && !r.langs[l].missing);
      const needs = others.length ? `${others.join(', ')} will need ${p.isNew ? 'it' : 'them'}` : 'no other language exists yet';
      const source = h.config.source;
      const choices: [string, string][] = source !== undefined
        // Single source: the source's changes are edits or fixes; a target's
        // change goes nowhere, so committing it is all there is to do.
        ? p.lang === source
          ? [[`obelum edit ${file}`, `if ${p.isNew ? 'it is' : 'they are'} new content (${needs})`],
             [`obelum fix ${file}`, `if ${p.isNew ? 'it' : 'they'} correct the source and need no translation (no target will)`]]
          : [[`obelum edit ${file}`, `to commit ${p.isNew ? 'it' : 'them'}; a target's changes go nowhere`],
             ...(p.isNew || r.langs[p.lang].stale.length
               ? [[`obelum sync ${file}`, `if ${p.isNew ? 'it translates' : 'they translate'} ${source} as it stands`] as [string, string]]
               : [])]
        : p.isNew
        ? [[`obelum sync ${file}`, `if it translates the other languages as they stand`],
           [`obelum edit ${file}`, `if it is new content (${needs})`]]
        : [[`obelum edit ${file}`, `if they are new content (${needs})`],
           [`obelum fix ${file}`, `if they correct the translation (nobody will)`],
           ...(r.langs[p.lang].stale.length
             ? [[`obelum sync ${file}`, `if they translate what ${p.lang} was behind on`] as [string, string]]
             : [])];
      const width = Math.max(...choices.map(([c]) => c.length));
      io.stdout(`    ${file} ${p.isNew ? 'is new' : 'has changes'}, not taken in yet:`);
      for (const [command, when] of choices) io.stdout(`      ${command.padEnd(width)}   ${when}`);
    }
  }
  io.stdout(`${rows.length} document${rows.length === 1 ? '' : 's'}, ${behind.length} with a language behind` +
    (waiting.length ? `, ${waiting.length} with changes not taken in yet` : ''));
  if (rows.length === 0) {
    const where = subdirectory(h.git.root, io.cwd);
    io.stdout(`No file matches the patterns in ${CONFIG_FILE} (${h.config.documents.join(', ')}); they are matched from the repository root, ${h.git.root}.` +
      (where ? ` You are in ${where}/.` : ''));
  }
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
  const before = h.git.head();
  const result = args.command === 'fix' ? await session.fix(lang, content) : await session.sync(lang, content);
  if (h.git.head() === before) {
    io.stdout(args.command === 'fix'
      ? `${real}: no change against HEAD; nothing to fix`
      : `${real}: already synced as it stands; nothing to commit`);
    return 0;
  }
  io.stdout(`${args.command} ${real}: committed; merged into ${result.merged.length ? result.merged.join(', ') : 'nobody'}` +
    (result.conflicted.length ? `; left alone for ${result.conflicted.join(', ')} (it will be in their next diff)` : ''));
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
        if (stale[lang].missing || lang === h.config.source) continue;
        await session.markAsSynced(lang);
        n++;
      }
    }
    if (keys.length === 0) {
      io.stdout(`Nothing to mark: no committed file matches the patterns in ${CONFIG_FILE} (${h.config.documents.join(', ')}). ` +
        `mark reads what is committed; commit your pages first.`);
      return 0;
    }
    const before = h.git.head();
    batch.flush(`markAsSynced: every language of ${keys.length} documents`);
    io.stdout(h.git.head() === before
      ? `every language of ${keys.length} document${keys.length === 1 ? ' was' : 's was'} already marked as synced; nothing to commit`
      : `marked ${n} languages across ${keys.length} documents as synced, in one commit`);
    return 0;
  }
  const { key, lang } = target(h, args.positional[0], io);
  const before = h.git.head();
  await h.document(key).markAsSynced(lang);
  io.stdout(h.git.head() === before
    ? `${realPath(key, lang)} was already marked as synced; nothing to commit`
    : `markAsSynced ${realPath(key, lang)}: committed`);
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
  const ask = args.flags['no-ask'] ? undefined : io.ask;
  const translator = make({ apiKey: apiKey ?? '', instructions, ask });
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
    const changed = b.langDiffs.filter(d => d.lang !== t).map(d => d.lang);
    const own = b.langDiffs.some(d => d.lang === t) ? `; ${t} itself changed too` : '';
    io.stderr(`${realPath(key, t)}: bringing up to date with changes in ${changed.join(', ')}${own}…`);
    const events = reporter(io);
    const content = await translator.run(b, { onEvent: events.onEvent });
    events.flush();
    if (content === null) { io.stderr(`${realPath(key, t)}: the translation did not complete; not saved`); failed++; continue; }
    const r = await round.sync(t, content);
    io.stdout(`sync ${realPath(key, t)}: committed` + (r.conflicted.length ? `; left alone for ${r.conflicted.join(', ')}` : ''));
    const open = events.unanswered();
    if (open) io.stderr(`${realPath(key, t)}: ${open} question${open === 1 ? '' : 's'} left unanswered (above); what ${open === 1 ? 'it is' : 'they are'} about was left as it was`);
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
function reporter(io: Io): { onEvent: (e: { type: string; [k: string]: unknown }) => void; flush: () => void; unanswered: () => number } {
  let text = '';
  let unanswered = 0;
  const model = (line: string) => { if (line.trim()) io.stderr(`│ ${line.trim()}`); };
  const flush = () => { model(text); text = ''; };
  return {
    flush,
    unanswered: () => unanswered,
    onEvent: e => {
      if (e.type === 'question') {
        flush();
        model(`question: ${String(e.question)}`);
        if (e.answer) model(`answer: ${String(e.answer)}`);
        else { model(`unanswered; its guess was: ${String(e.guess)}`); unanswered++; }
        return;
      }
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
  let mod: { claude: (o: { apiKey: string; instructions?: string; ask?: Io['ask'] }) => Translator };
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
