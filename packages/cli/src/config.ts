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
