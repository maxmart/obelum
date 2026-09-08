/**
 * Keeping translations of one document in step, without a server.
 *
 * Every language keeps a copy of every sibling's file as of the last time it
 * looked. Staleness is whether a copy differs from the real file; the brief
 * for a translator is that same diff; a fix is a change merged into every
 * sibling's copy so it is never news. No counter, no clock, no history.
 *
 *   obelum(document)                   — open a session on one document: the
 *                                        host says where its files and synced copies live and how to commit
 *     .edit / .fix / .sync / .markAsSynced
 *     .stale() / .brief(lang)
 *   merge3(ours, base, theirs)         — the three-way merge the fan-out runs
 *   unifiedDiff(before, after, hook)   — the brief's diff
 *
 * Core has no I/O, knows no paths, and does no translating: a translator
 * takes a brief and returns content, and the host saves it with sync.
 */
export type { Document, View, File, Verb, MaybePromise } from './document.js';
export { obelum, type Session, type Round, type LangStatus, type FanoutResult } from './session.js';
export type { Brief, LangDiff } from './brief.js';
export { merge3, type MergeResult } from './merge.js';
export { unifiedDiff, gitAnchor, type Anchor } from './diff.js';
