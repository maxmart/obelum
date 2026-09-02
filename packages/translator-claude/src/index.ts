/**
 * A translator for Obelum-tracked documents, driven by Claude.
 *
 * Given one document in several languages and a record of what each language
 * last took from the others, this asks Claude to bring one language up to
 * date: as a set of targeted edits when a sync point exists, or as a full
 * translation when none does.
 *
 * It owns its own agent loop (claude/stream.ts) rather than sharing one with
 * anything else, so it can be used on its own. What it does not own is the
 * document: reading, writing, revisions and history are all handed in
 * through TranslationDeps.
 */
export {
  runTranslation,
  mergeLogItem,
  type TranslationDeps,
  type Version,
  type RunTranslationOptions,
  type RunTranslationCallbacks,
  type LogItem,
  type TranslationStatus,
} from './translate';
export {
  translateWithAgent,
  type TranslateAgentParams,
  type TranslationEvent,
  type LangDiff,
} from './translate-prompt';
export { claudeErrorMessage } from './claude/client';
