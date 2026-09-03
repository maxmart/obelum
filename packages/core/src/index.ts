/**
 * Keeping translations of one document in step, without a server.
 *
 * Every document carries its own revision and a note of the revision it last
 * took from each sibling language. From those two numbers this works out which
 * languages have fallen behind, what changed since they last agreed, and where
 * in history to look for the version they agreed on.
 *
 * It knows nothing about Markdown, git, files, React or any language model. Where a revision is
 * stored, how a commit is read, and who does the translating are all the
 * caller's business, passed in:
 *
 *   computeStaleness(metas)                     — pure, over your own numbers
 *   generateAnchoredDiff(before, after, drop)   — `drop` hides your metadata
 *   resolveRevToContent(reader, file, rev, revOf)
 *                                               — `reader` is any three
 *                                                 methods shaped like a git
 *                                                 log; `revOf` reads a
 *                                                 revision out of your format
 *
 *   runTranslation(deps, translator, opts, callbacks)
 *                                               — the runner: gathers the
 *                                                 above for one document,
 *                                                 hands it to a Translator
 *                                                 you supply, saves only a
 *                                                 complete result
 *
 * That is the whole surface. See CommitReader in cursor.ts for the interface
 * it declares rather than imports.
 *
 */
export type { SyncMeta } from './types.js';
export { computeStaleness, type StalenessInfo, type StalenessStatus } from './staleness.js';
export { generateAnchoredDiff } from './diff.js';
export { resolveRevToContent, type CommitReader } from './cursor.js';
export {
  runTranslation,
  buildTranslationRequest,
  mergeLogItem,
  type Translator,
  type TranslationRequest,
  type TranslationEvent,
  type LangDiff,
  type TranslationDeps,
  type Version,
  type RunTranslationOptions,
  type RunTranslationCallbacks,
  type LogItem,
  type TranslationStatus,
} from './translate.js';
