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
 * That is the whole surface. See CommitReader in cursor.ts for the interface
 * it declares rather than imports.
 *
 */
export type { SyncMeta } from './types';
export { computeStaleness, type StalenessInfo, type StalenessStatus } from './staleness';
export { generateAnchoredDiff } from './diff';
export { resolveRevToContent, type CommitReader } from './cursor';
