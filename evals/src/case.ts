/**
 * An eval case: a document staged in memory, the edits that make one
 * language stale, and what an acceptable translation must satisfy.
 *
 * Every language in `files` starts synced to every other (each is marked as
 * synced), so a language left out of `files` is one the target has never
 * seen. Then the steps run, as a person would make them, and the target's
 * brief is whatever core computes from that: nothing here writes a brief by
 * hand.
 */
import { obelum, type Session } from '@obelum/core';
import { structuredPatch } from 'diff';

export interface Step {
  verb: 'edit' | 'fix';
  lang: string;
  content: string;
}

export interface Check {
  label: string;
  /** `before` is the target as it was when the brief was taken. */
  ok(out: string, before: string): boolean;
}

export interface Case {
  id: string;
  /** What the case probes, in a sentence. Also shown to the judge. */
  about: string;
  langs: string[];
  files: Record<string, string>;
  steps: Step[];
  target: string;
  checks: Check[];
  /** One acceptable result. The self-test holds every check to it. */
  reference: string;
  /** The host's glossary and rules, as the translator receives them. */
  instructions?: string;
  /** Languages in `files` that start out never synced: no copies, so their
   *  brief has nothing to diff against. */
  neverSynced?: string[];
}

/**
 * How a `fix` step treats the fixer's own synced copy. 'merged' is core as
 * it is: the fix is merged into it, so the target's brief does not show its
 * own fix. 'kept' is how core used to be: the own copy is left alone, and
 * the fix shows in the target's brief as a change of its own to keep.
 */
export type FixMode = 'merged' | 'kept';

/** The case's document, with every step applied. */
export async function stage(c: Case, fixMode: FixMode = 'merged'): Promise<{ session: Session; store: Map<string, string> }> {
  const store = new Map<string, string>(Object.entries(c.files));
  const file = (path: string) => ({
    read: () => store.get(path) ?? null,
    write: (content: string) => { store.set(path, content); },
  });
  const session = obelum({
    langs: c.langs,
    file: lang => file(lang),
    synced: viewer => ({ file: lang => file(`.obelum/${viewer}/${lang}`) }),
    commit: () => {},
  });
  for (const lang of Object.keys(c.files)) if (!c.neverSynced?.includes(lang)) await session.markAsSynced(lang);
  for (const step of c.steps) {
    const own = `.obelum/${step.lang}/${step.lang}`;
    const before = store.get(own);
    await session[step.verb](step.lang, step.content);
    if (step.verb === 'fix' && fixMode === 'kept' && before !== undefined) store.set(own, before);
  }
  return { session, store };
}

/** A template literal's text without the newline after the opening backtick. */
export const doc = (text: string) => text.replace(/^\n/, '');

/** `text` with each [from, to] replaced once; a `from` that is not there
 *  throws, so a case never stages a step that silently changed nothing. */
export function change(text: string, ...pairs: [from: string, to: string][]): string {
  for (const [from, to] of pairs) {
    if (!text.includes(from)) throw new Error(`not in the text: ${JSON.stringify(from)}`);
    text = text.replace(from, to);
  }
  return text;
}

// ── checks ────────────────────────────────────────────────────────────────

type Pattern = string | RegExp;
const show = (p: Pattern) => (typeof p === 'string' ? JSON.stringify(p) : String(p));
const test = (p: Pattern, s: string) => (typeof p === 'string' ? s.includes(p) : p.test(s));
const lines = (s: string) => s.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');

export const has = (p: Pattern, label = `has ${show(p)}`): Check => ({ label, ok: out => test(p, out) });

export const lacks = (p: Pattern, label = `lacks ${show(p)}`): Check => ({ label, ok: out => !test(p, out) });

/** Text of the target that must survive verbatim. */
export const keeps = (text: string): Check => ({
  label: `keeps ${JSON.stringify(text.length > 50 ? text.slice(0, 50) + '…' : text)}`,
  ok: out => out.includes(text),
});

export const count = (p: RegExp, n: number): Check => ({
  label: `${n}× ${p}`,
  ok: out => (out.match(new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g')) ?? []).length === n,
});

/** Each pattern found after the previous one. */
export const inOrder = (...ps: Pattern[]): Check => ({
  label: `in order: ${ps.map(show).join(' → ')}`,
  ok: out => {
    let at = 0;
    for (const p of ps) {
      const rest = out.slice(at);
      const i = typeof p === 'string' ? rest.indexOf(p) : rest.search(p);
      if (i < 0) return false;
      at += i + 1;
    }
    return true;
  },
});

/** The section under `heading` (up to the next heading of any level)
 *  matches `p`. */
export const inSection = (heading: string, p: Pattern): Check => ({
  label: `under ${JSON.stringify(heading)}: ${show(p)}`,
  ok: out => {
    const ls = lines(out);
    const start = ls.findIndex(l => l.trim() === heading);
    if (start < 0) return false;
    let end = ls.findIndex((l, i) => i > start && /^#{1,6} /.test(l));
    if (end < 0) end = ls.length;
    return test(p, ls.slice(start + 1, end).join('\n'));
  },
});

/** The MDX element with this id (from its opening line to its first
 *  closing `</…>` or `/>` line) matches `p`. */
export const inElement = (id: string, p: Pattern): Check => ({
  label: `in #${id}: ${show(p)}`,
  ok: out => {
    const ls = lines(out);
    const start = ls.findIndex(l => l.includes(`id="${id}"`));
    if (start < 0) return false;
    let end = ls.findIndex((l, i) => i >= start && (/^\s*<\//.test(l) || /^\s*\/>\s*$/.test(l)));
    if (end < 0) end = ls.length - 1;
    return test(p, ls.slice(start, end + 1).join('\n'));
  },
});

/**
 * Every line the translation changed lies inside one of the regions of the
 * original target, each given as the first line containing `from` and the
 * first line from there on containing `to` (the same line, if it does),
 * both included. What a targeted edit
 * must not do is reach anywhere else.
 */
export const onlyTouches = (...regions: [from: string, to: string][]): Check => ({
  label: `changes only ${regions.map(([f, t]) => `${JSON.stringify(f)}…${JSON.stringify(t)}`).join(', ')}`,
  ok: (out, before) => {
    const b = lines(before);
    const spans = regions.map(([from, to]) => {
      const i = b.findIndex(l => l.includes(from));
      const j = b.findIndex((l, k) => k >= i && l.includes(to));
      if (i < 0 || j < 0) throw new Error(`region ${from}…${to} is not in the target`);
      return [i, j] as const; // 0-based, inclusive
    });
    const patch = structuredPatch('a', 'b', b.join('\n'), lines(out).join('\n'), undefined, undefined, { context: 0 });
    const inside = (k: number) => spans.some(([i, j]) => k >= i && k <= j);
    return patch.hunks.every(h => {
      // jsdiff puts a pure insertion at the old line after it: it sits
      // between 0-based lines oldStart-2 and oldStart-1, and is inside a
      // region when either neighbour is.
      if (h.oldLines === 0) return inside(h.oldStart - 2) || inside(h.oldStart - 1);
      for (let k = h.oldStart - 1; k < h.oldStart - 1 + h.oldLines; k++) if (!inside(k)) return false;
      return true;
    });
  },
});

/** The target exactly as it was: the right answer when the change is not
 *  the target's business. Line endings and a final newline aside. */
export const unchanged = (): Check => ({
  label: 'unchanged',
  ok: (out, before) => lines(out).join('\n') === lines(before).join('\n'),
});

/** The target's words are unchanged; only how its lines wrap may differ. */
export const sameWords = (): Check => ({
  label: 'same words as before',
  ok: (out, before) => out.split(/\s+/).join(' ').trim() === before.split(/\s+/).join(' ').trim(),
});

export const crlf = (): Check => ({
  label: 'CRLF line endings throughout',
  ok: out => /\r\n/.test(out) && !/(?<!\r)\n/.test(out),
});

/** Passes when any of the alternatives does: for cases where more than one
 *  outcome is consistent, but a mixture of them is not. */
export const either = (label: string, ...alternatives: Check[][]): Check => ({
  label,
  ok: (out, before) => alternatives.some(all => all.every(c => c.ok(out, before))),
});
