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
 *                   three-way into every sibling's synced copy of L. A copy
 *                   the change does not merge into cleanly is left alone,
 *                   and that sibling sees the whole fix as news.
 *   sync L          the same as fix, then L's synced copies of every
 *                   language overwritten with the real files. A translation
 *                   is never news for a sibling.
 *   markAsSynced L  only the second half of sync. An ops primitive: it
 *                   asserts a claim that can be false.
 *
 * fix never writes the diagonal (L's synced copy of L): that is written
 * only by sync and markAsSynced, so its diff against real L is what L
 * changed itself since its last sync, which a translator is told to keep.
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
  /** Siblings whose copy was left alone; they will see the change as news. */
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
 * preserve. A fix leaves nobody behind, so a language whose only change is
 * a fix is never a source and keeps that fix in its own copy's diff. A
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

  /** Merge the change old → next into every sibling's synced copy of lang. */
  async function fanout(lang: string, old: string, next: string): Promise<FanoutResult> {
    const result: FanoutResult = { lang, merged: [], conflicted: [] };
    for (const viewer of langs) {
      if (viewer === lang) continue;
      const copy = await read(copyOf(viewer, lang));
      // A missing synced file is an empty base: the sibling never saw this
      // language, and is synced to it now rather than told it is news.
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
