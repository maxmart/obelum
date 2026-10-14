/**
 * `obelum.json` at the repository root: the languages, and where documents
 * live as path patterns with one `{lang}` in them.
 *
 *   {
 *     "langs": ["sv", "no", "en"],
 *     "documents": ["src/pages/{lang}/**\/*.mdx", "content/*\/{lang}/*.mdx"],
 *     "anchor": "mdx",
 *     "instructions": "src/translation-glossary.md",
 *     "source": "en"
 *   }
 *
 * With "source", only that language is translated from (single-source
 * mode); without it, every language is (the peer system).
 *
 * A document is one pattern instance with `{lang}` left in: the key
 * `src/pages/{lang}/pricing.mdx` names every language's file at once, and
 * its synced copies live at `.obelum/<viewer>/<real path>`.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface Config {
  langs: string[];
  documents: string[];
  /** Which lines a brief's diff names hunks after. Default: git's rule. */
  anchor?: 'mdx' | 'markdown' | 'git';
  /** A file whose contents are handed to the translator verbatim. */
  instructions?: string;
  /** Single-source mode: the one language the others are translated from. */
  source?: string;
}

export const CONFIG_FILE = 'obelum.json';

/** The config at the repository root. `cwd` is only for a better error: a
 *  config in the current directory below the root is never read. */
export function loadConfig(root: string, cwd?: string): Config {
  const file = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(file)) {
    const here = cwd && path.join(path.resolve(cwd), CONFIG_FILE);
    if (here && here !== file && fs.existsSync(here)) {
      throw new Error(`No ${CONFIG_FILE} in ${root}, the repository root. The one in ${path.resolve(cwd!)} is not read: ` +
        `obelum reads its config from the root. Move it there, or make ${path.resolve(cwd!)} a repository of its own with git init.`);
    }
    throw new Error(`No ${CONFIG_FILE} in ${root}. Run \`obelum init\` first.`);
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Config>;
  if (!Array.isArray(raw.langs) || raw.langs.length < 2) throw new Error(`${CONFIG_FILE}: "langs" must list at least two languages`);
  if (!Array.isArray(raw.documents) || raw.documents.length === 0) throw new Error(`${CONFIG_FILE}: "documents" must list at least one pattern`);
  for (const p of raw.documents) {
    const problem = patternProblem(p);
    if (problem) throw new Error(`${CONFIG_FILE}: ${problem}`);
  }
  if (raw.source !== undefined && !raw.langs.includes(raw.source)) throw new Error(`${CONFIG_FILE}: "source" must be one of "langs"`);
  return { langs: raw.langs, documents: raw.documents, anchor: raw.anchor, instructions: raw.instructions, source: raw.source };
}

/** What is wrong with a document pattern, or null. */
export function patternProblem(p: unknown): string | null {
  if (typeof p !== 'string' || p.split('{lang}').length !== 2) return `pattern "${p}" must contain {lang} exactly once`;
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.includes('..')) return `pattern "${p}" must be a path relative to the repository root`;
  return null;
}

/** The files among `paths` that one pattern matches. */
export function matching(pattern: string, langs: string[], paths: Iterable<string>): string[] {
  const re = patternRegex(pattern, langs);
  return [...paths].filter(p => !p.startsWith('.obelum/') && re.test(p));
}

export const ANCHORS = {
  mdx: (line: string) => line.trimStart().startsWith('<'),
  markdown: (line: string) => line.startsWith('#'),
  git: (line: string) => /^[A-Za-z_$]/.test(line),
} as const;

// ---------------------------------------------------------------------------
// Keys and paths
// ---------------------------------------------------------------------------

/** The real path of `key` in `lang`. */
export const realPath = (key: string, lang: string) => key.replace('{lang}', lang);

/** Where `viewer` keeps its copy of the file at `real`. */
export const copyPath = (viewer: string, real: string) => `.obelum/${viewer}/${real}`;

/** The document key and language a real path belongs to, or null. */
export function locate(config: Config, real: string): { key: string; lang: string } | null {
  for (const pattern of config.documents) {
    const m = patternRegex(pattern, config.langs).exec(real);
    if (!m || !m.indices) continue;
    const [start, end] = m.indices[1];
    return { key: real.slice(0, start) + '{lang}' + real.slice(end), lang: m[1] };
  }
  return null;
}

/** The pattern as a regex over a whole path, `{lang}` captured as group 1. */
export function patternRegex(pattern: string, langs: string[]): RegExp {
  const esc = (s: string) => s.replace(/[.+^$()|[\]\\]/g, '\\$&');
  const src = pattern
    .split('{lang}')
    .map(part => esc(part).replace(/\*\*\//g, '(?:.*/)?').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'))
    .join(`(${langs.map(esc).join('|')})`);
  return new RegExp(`^${src}$`, 'd');
}

/**
 * Every document key under the patterns, from the paths present in the
 * tree. A key exists as soon as one language's file does.
 */
export function documentKeys(config: Config, paths: Iterable<string>): string[] {
  const keys = new Set<string>();
  for (const p of paths) {
    if (p.startsWith('.obelum/')) continue;
    const found = locate(config, p);
    if (found) keys.add(found.key);
  }
  return [...keys].sort();
}

// ---------------------------------------------------------------------------
// Detection, for `init` without patterns
// ---------------------------------------------------------------------------

/** Language codes common enough to take a directory of that name for one.
 *  A guess only: two of them side by side with files in common. */
const COMMON_LANGS = new Set(('ar bg bn ca cs cy da de el en es et eu fa fi fil fr ga gl he hi hr hu hy id is it ja ' +
  'ka kk ko lt lv mk ms mt nb nl nn no pl pt ro ru sk sl sq sr sv sw ta th tl tr uk ur uz vi zh').split(' '));

/** A directory name that reads as a language: en, sv, pt-BR, zh-Hant, en_US. */
export const looksLikeLang = (s: string, langs?: string[]) =>
  langs ? langs.includes(s) : COMMON_LANGS.has(s.split(/[-_]/)[0].toLowerCase()) && /^[a-z]{2,3}([-_][A-Za-z0-9]{2,4})?$/.test(s);

/** File types worth translating as documents. */
const DOC_EXTENSIONS = new Set(['md', 'mdx', 'markdown', 'html', 'txt', 'adoc', 'rst']);

export interface Detected { langs: string[]; documents: string[]; files: number }

/**
 * Where documents live, guessed from the paths in the tree: a directory
 * whose children are language directories (`content/en`, `content/sv`)
 * holding files of a document type, at least two of them with a file in
 * common unless `langs` names the languages. One pattern per directory and
 * extension: `content/{lang}/**\/*.md`. Null when nothing looks like one.
 */
export function detect(paths: Iterable<string>, langs?: string[]): Detected | null {
  // parent dir + extension → lang → files below the lang dir
  const groups = new Map<string, Map<string, Set<string>>>();
  for (const p of paths) {
    if (p.startsWith('.obelum/') || p.split('/').some(s => s === 'node_modules' || s.startsWith('.'))) continue;
    const ext = p.includes('.') ? p.slice(p.lastIndexOf('.') + 1).toLowerCase() : '';
    if (!DOC_EXTENSIONS.has(ext)) continue;
    const segs = p.split('/');
    // The language directory nearest the root wins: content/en/blog/sv.md is en's.
    const i = segs.findIndex((s, j) => j < segs.length - 1 && looksLikeLang(s, langs));
    if (i < 0) continue;
    const key = `${segs.slice(0, i).join('/')}\0${ext}`;
    const byLang = groups.get(key) ?? new Map<string, Set<string>>();
    const rest = byLang.get(segs[i]) ?? new Set<string>();
    rest.add(segs.slice(i + 1).join('/'));
    byLang.set(segs[i], rest);
    groups.set(key, byLang);
  }
  const found: { pattern: string; langs: string[]; files: number }[] = [];
  for (const [key, byLang] of groups) {
    const shared = [...byLang.values()].some((files, i, all) => all.some((other, j) => j !== i && [...files].some(f => other.has(f))));
    if (!langs && (byLang.size < 2 || !shared)) continue;
    const [parent, ext] = key.split('\0');
    found.push({
      pattern: `${parent ? parent + '/' : ''}{lang}/**/*.${ext}`,
      langs: [...byLang.keys()],
      files: [...byLang.values()].reduce((n, s) => n + s.size, 0),
    });
  }
  if (!found.length) return null;
  found.sort((a, b) => a.pattern.localeCompare(b.pattern));
  // Languages in order of how many files each has, the likeliest source first.
  const count = new Map<string, number>();
  for (const [, byLang] of groups) for (const [l, files] of byLang) count.set(l, (count.get(l) ?? 0) + files.size);
  const all = langs ?? [...new Set(found.flatMap(f => f.langs))].sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0) || a.localeCompare(b));
  return { langs: all, documents: found.map(f => f.pattern), files: found.reduce((n, f) => n + f.files, 0) };
}

/** The anchor the patterns' file type suggests, or undefined for git's. */
export function anchorFor(patterns: string[]): Config['anchor'] {
  const exts = new Set(patterns.map(p => p.slice(p.lastIndexOf('.') + 1).toLowerCase()));
  if (exts.size !== 1) return undefined;
  const [ext] = exts;
  return ext === 'mdx' ? 'mdx' : ext === 'md' || ext === 'markdown' ? 'markdown' : undefined;
}
