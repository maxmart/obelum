/**
 * What a translator is told to bring one language up to date: a pure
 * function of the tree, computed by `document.brief(lang)`.
 *
 * Who translates, how the result is produced, and whether it is complete
 * enough to save are the translator's business. Saving it is the host's:
 *
 *   const content = await translator.run(await session.brief('sv'));
 *   if (content) await session.sync('sv', content);
 */

/** One language's contribution: the version the target is synced to, the
 *  current file, and the unified diff between them. An empty base means the
 *  target never saw this language, and the diff is the whole file. The
 *  target itself appears when it changed since its own last sync, so that
 *  its own local changes are preserved. */
export interface LangDiff {
  lang: string;
  base: string;
  content: string;
  diff: string;
}

export interface Brief {
  targetLang: string;
  /** Current content of the target; empty when it does not exist yet. */
  targetContent: string;
  /** Every language that changed since the target last synced, target
   *  included. Empty means nothing to do. */
  langDiffs: LangDiff[];
}
