/**
 * A session on one document: every language of it, over the files the host
 * describes.
 *
 * Every language keeps a copy of every language's file as of the last time
 * it looked (its synced files). Staleness is whether a copy differs from
 * the real file; the brief for a translator is that same difference. No
 * counter, no clock, no history: the verb is only what it writes.
 *
 *   edit L          L's real file. Nothing else. The only verb that
 *                   creates staleness.
 *   fix L           L's real file, then the change old L → new L merged
 *                   three-way into every synced copy of L, L's own
 *                   included. A copy the change does not merge into cleanly
 *                   is left alone, and the whole fix is in that language's
 *                   next diff (for L itself, as a change of its own).
 *   sync L          the same as fix, then L's synced copies of every
 *                   language overwritten with the real files. A translation
 *                   is never in a sibling's next diff.
 *   markAsSynced L  only the second half of sync. An ops primitive: it
 *                   asserts a claim that can be false.
 *
 * The diagonal (L's synced copy of L) against real L is what L edited
 * since its last sync, which a translator is told to keep. A fix is merged
 * into it like any other copy: a fix is part of L's text, not a change to
 * keep, and a "keep this" on it froze the whole line it sat on, old wording
 * included, against a sibling rewording that line.
 */
import type { Document, File } from './document.js';
import { merge3 } from './merge.js';
import { unifiedDiff } from './diff.js';
import type { Brief, LangDiff } from './brief.js';

export interface LangStatus {
  /** The language has no file. It makes nobody stale. */
  missing: boolean;
  /** Siblings whose real file differs from this language's synced copy of
   *  it, or that it has no synced copy of. */
  stale: string[];
}

export interface FanoutResult {
  lang: string;
  /** Siblings whose copy now carries the change. */
  merged: string[];
  /** Siblings whose copy was left alone; the change will be in their next diff. */
  conflicted: string[];
}

export interface Session {
  readonly langs: readonly string[];
  edit(lang: string, content: string): Promise<void>;
  fix(lang: string, content: string): Promise<FanoutResult>;
  sync(lang: string, content: string): Promise<FanoutResult>;
  markAsSynced(lang: string): Promise<void>;
  /** Per language, whether it exists and which siblings it is behind on. */
  stale(): Promise<Record<string, LangStatus>>;
  /** Everything a translator is told to bring `lang` up to date. */
  brief(lang: string): Promise<Brief>;
  /** A round of syncs after an edit: sync each sibling, then `done()`. */
  syncAll(): Round;
}

/**
 * A round: every sibling brought up to date after an edit, then the round
 * closed. Each `sync` is an ordinary sync. Opening the round notes its
 * sources, the languages some sibling is behind on; `done()` marks as
 * synced each source that no existing sibling is behind on any more, so the
 * edited language's own copy of itself catches up once everyone has its
 * edit — an edit that everyone has translated is behind everyone, the
 * editor included, and is no longer a local change for a later sync to
 * preserve. A fix leaves nobody behind and is already in the fixer's own
 * copy, so a language whose only change is a fix is never a source. A
 * round that is not finished is simply never closed.
 */
export interface Round {
  sync(lang: string, content: string): Promise<FanoutResult>;
  /** Closes the round; returns the languages it marked as synced. */
  done(): Promise<string[]>;
}

export function obelum(document: Document): Session {
  const { langs } = document;
  const real = (lang: string) => document.file(lang);
  const copyOf = (viewer: string, viewed: string) => document.synced(viewer).file(viewed);
  const read = async (f: File) => (await f.read()) ?? null;
  /** Write only when the content differs, so a commit holds only real changes. */
  const put = async (f: File, content: string) => {
    if ((await read(f)) !== content) await f.write(content);
  };

  /** Merge the change old → next into every language's synced copy of
   *  lang: the siblings', and lang's own. */
  async function fanout(lang: string, old: string, next: string): Promise<FanoutResult> {
    const result: FanoutResult = { lang, merged: [], conflicted: [] };
    // lang's own copy takes the change too, so its diff against the real file
    // stays what lang edited since its last sync, with no fix in it. A brief
    // tells the translator to keep that diff; a fix in it would freeze the
    // whole line it sits on, old wording and all, against a sibling's change
    // to that line. A conflict leaves the copy alone and the fix in the diff.
    // A language that never synced keeps no copy of itself: none is made.
    const own = await read(copyOf(lang, lang));
    if (own !== null) {
      const m = merge3(own, old, next);
      if (m.clean) await put(copyOf(lang, lang), m.content);
    }
    for (const viewer of langs) {
      if (viewer === lang) continue;
      const copy = await read(copyOf(viewer, lang));
      // A missing synced file is an empty base: the sibling never saw this
      // language, and is synced to it now rather than given it as a diff.
      const m = copy === null ? merge3('', '', next) : merge3(copy, old, next);
      if (!m.clean) { result.conflicted.push(viewer); continue; }
      await put(copyOf(viewer, lang), m.content);
      result.merged.push(viewer);
    }
    return result;
  }

  /** Overwrite lang's synced copy of every existing language with the real file. */
  async function snapshot(lang: string): Promise<void> {
    for (const viewed of langs) {
      const content = await read(real(viewed));
      if (content !== null) await put(copyOf(lang, viewed), content);
    }
  }

  /** Write lang's real file; returns what it held before ('' when missing). */
  async function writeReal(lang: string, content: string): Promise<string> {
    const old = await read(real(lang));
    await put(real(lang), content);
    return old ?? '';
  }

  return {
    langs,

    async edit(lang, content) {
      await writeReal(lang, content);
      await document.commit('edit', lang);
    },

    async fix(lang, content) {
      const old = await writeReal(lang, content);
      const result = await fanout(lang, old, content);
      await document.commit('fix', lang);
      return result;
    },

    async sync(lang, content) {
      const old = await writeReal(lang, content);
      const result = await fanout(lang, old, content);
      await snapshot(lang);
      await document.commit('sync', lang);
      return result;
    },

    async markAsSynced(lang) {
      await snapshot(lang);
      await document.commit('markAsSynced', lang);
    },

    syncAll() {
      const session = this;
      /** Languages some existing sibling is behind on. */
      const behindOn = async (): Promise<Set<string>> => {
        const status = await session.stale();
        const out = new Set<string>();
        for (const viewer of langs) {
          if (status[viewer].missing) continue;
          for (const viewed of status[viewer].stale) out.add(viewed);
        }
        return out;
      };
      const sources = behindOn();
      return {
        sync: (lang, content) => session.sync(lang, content),
        async done() {
          const still = await behindOn();
          const marked: string[] = [];
          for (const lang of langs) {
            if (!(await sources).has(lang) || still.has(lang)) continue;
            if ((await read(real(lang))) === null) continue;
            if ((await read(copyOf(lang, lang))) === (await read(real(lang)))) continue;
            await session.markAsSynced(lang);
            marked.push(lang);
          }
          return marked;
        },
      };
    },

    async stale() {
      const out: Record<string, LangStatus> = {};
      for (const viewer of langs) {
        const status: LangStatus = { missing: (await read(real(viewer))) === null, stale: [] };
        for (const viewed of langs) {
          if (viewed === viewer) continue;
          const content = await read(real(viewed));
          if (content === null) continue;
          if ((await read(copyOf(viewer, viewed))) !== content) status.stale.push(viewed);
        }
        out[viewer] = status;
      }
      return out;
    },

    async brief(lang) {
      const targetContent = (await read(real(lang))) ?? '';
      const langDiffs: LangDiff[] = [];
      for (const viewed of langs) {
        const content = await read(real(viewed));
        if (content === null) continue;
        const base = (await read(copyOf(lang, viewed))) ?? '';
        const diff = unifiedDiff(base, content, document.anchor);
        if (diff) langDiffs.push({ lang: viewed, base, content, diff });
      }
      return { targetLang: lang, targetContent, langDiffs };
    },
  };
}
