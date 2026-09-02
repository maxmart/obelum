import { generateAnchoredDiff, type SyncMeta } from '@obelum/core';
import { translateWithAgent, type LangDiff, type DriveFn } from './translate-prompt';

/**
 * One entry in the running log a translation shows on screen.
 */
export type LogItem =
  | { type: 'thinking' }
  | { type: 'text'; content: string }
  | { type: 'edit'; old_string: string; new_string: string }
  | { type: 'error'; content: string };

export type TranslationStatus =
  | 'pending' | 'translating' | 'saving' | 'done' | 'error' | 'skipped';

/**
 * Add a streaming item to a log.
 *
 * Two rules, both about what a reader wants to see: "thinking" is a spinner,
 * not history, so it is replaced rather than appended; and consecutive text
 * is one paragraph arriving in pieces, so it is concatenated.
 */
export function mergeLogItem(log: LogItem[], item: LogItem): LogItem[] {
  const withoutThinking = log.filter(l => l.type !== 'thinking');
  if (item.type === 'thinking') return [...withoutThinking, item];
  if (item.type === 'text') {
    const last = withoutThinking[withoutThinking.length - 1];
    if (last?.type === 'text') {
      return [...withoutThinking.slice(0, -1), { type: 'text', content: last.content + item.content }];
    }
  }
  return [...withoutThinking, item];
}

/** One language's version of the document, with its revision bookkeeping. */
export interface Version {
  content: string;
  meta: SyncMeta;
}

/**
 * What a translation needs from whoever owns the documents. Everything here is
 * about ONE document: the caller binds the path, the storage and the format.
 *
 * Nothing in this package reads a file, parses a frontmatter, or walks a git
 * log. Where a revision is kept (in the document, in a sidecar, in a database)
 * and how the version at an older revision is found are the caller's
 * business, and they are asked for through these methods.
 */
export interface TranslationDeps {
  /** Every language the document exists in or may exist in, target included. */
  locales: readonly string[];
  /** The current version in `lang`, or null when the document has no such
   *  language yet. Any other failure should throw: an existing translation
   *  presented as missing would be translated from scratch and written over. */
  read(lang: string): Promise<Version | null>;
  /** The content of `lang` as it stood at revision `rev`, or null if that
   *  revision cannot be found. Null means "no base": the run falls back to
   *  translating from the full current content instead of a diff. */
  readAtRev(lang: string, rev: number): Promise<string | null>;
  /** Keep bookkeeping out of what the model sees and out of the diffs it is
   *  shown. Given the lines of a version, return the lines worth showing. */
  dropLines(lines: string[]): string[];
  /** Persist the finished translation. The caller records the sync (bumping
   *  the target's rev, stamping what it incorporated) as part of this. */
  write(lang: string, content: string): Promise<void>;
  /**
   * Extra rules for the model, injected verbatim into the system prompt: a
   * terminology glossary, what parts of the format are code rather than
   * content, house style. Optional.
   */
  instructions?(): Promise<string | undefined>;
}

export interface RunTranslationOptions {
  targetLang: string;
  apiKey: string;
  /** Replace the model with a script or a recording; see DriveFn. */
  drive?: DriveFn;
}

export interface RunTranslationCallbacks {
  onLogItem: (item: LogItem) => void;
  onStatusChange: (status: TranslationStatus) => void;
  /** Polled between steps and stream events; a true return aborts the run. */
  isCancelled: () => boolean;
}

/**
 * Run a single translation: gather what changed in every language since the
 * target last synced, ask Claude to apply it, save the result.
 * Returns 'done' on success, 'error' on failure, 'cancelled' if cancelled.
 */
export async function runTranslation(
  deps: TranslationDeps,
  opts: RunTranslationOptions,
  callbacks: RunTranslationCallbacks,
): Promise<'done' | 'error' | 'cancelled'> {
  const { locales, read, readAtRev, dropLines, write } = deps;
  const { targetLang, apiKey, drive } = opts;
  const { onLogItem, onStatusChange, isCancelled } = callbacks;

  try {
    const target = await read(targetLang);
    const targetContent = target?.content ?? '';
    const synced = target?.meta.synced ?? {};

    if (isCancelled()) return 'cancelled';

    onStatusChange('translating');

    let agentParams;

    // Diff mode: the target has synced before, so each language is shown as
    // the version the target last took plus what changed since.
    if (Object.keys(synced).length > 0) {
      const diffResults = await Promise.all(locales.map(async (lang): Promise<LangDiff | null> => {
        const incorporatedRev = synced[lang] ?? 0;
        try {
          const current = await read(lang);
          if (!current) return null;
          const baseContent = incorporatedRev > 0 ? (await readAtRev(lang, incorporatedRev)) ?? '' : '';
          const diff = generateAnchoredDiff(baseContent, current.content, dropLines);
          if (diff || !baseContent) {
            return { lang, base: baseContent, diff };
          }
          return null;
        } catch {
          return null;
        }
      }));

      const langDiffs = diffResults.filter((d): d is LangDiff => d !== null);
      if (langDiffs.length > 0) {
        agentParams = { targetLang, targetContent, langDiffs, apiKey };
      }
    }

    if (!agentParams) {
      // Full sync: no sync point or no diffs, send every language's current content.
      const sourceLangs = locales.filter(l => l !== targetLang);
      const contentResults = await Promise.all(sourceLangs.map(async lang => {
        try {
          const v = await read(lang);
          return v ? { lang, content: v.content } : null;
        } catch {
          return null;
        }
      }));
      agentParams = {
        targetLang,
        targetContent,
        langDiffs: [],
        fullSyncContents: contentResults.filter((c): c is { lang: string; content: string } => c !== null),
        apiKey,
      };
    }

    const instructions = await deps.instructions?.();
    const generator = translateWithAgent({ ...agentParams, instructions, dropLines, drive });

    let finalContent = '';
    let complete = false;

    for await (const event of generator) {
      if (isCancelled()) return 'cancelled';

      switch (event.type) {
        case 'thinking':
          onLogItem({ type: 'thinking' });
          break;
        case 'reasoning':
          onLogItem({ type: 'text', content: event.text });
          break;
        case 'edit':
          onLogItem({ type: 'edit', old_string: event.edit.old_string, new_string: event.edit.new_string });
          break;
        case 'error':
          // Not necessarily fatal: a failed edit is retried by the model.
          // Whether the run as a whole succeeded rides on done.complete.
          onLogItem({ type: 'error', content: event.error });
          break;
        case 'done':
          finalContent = event.finalContent;
          complete = event.complete;
          break;
      }
    }

    // An incomplete run (API error, truncation, turn limit) must not be
    // saved: the caller would stamp the partial result as fully synced,
    // hiding that anything went wrong.
    if (!complete || !finalContent) {
      if (complete) onLogItem({ type: 'error', content: 'Translation returned no content' });
      onStatusChange('error');
      return 'error';
    }

    if (isCancelled()) return 'cancelled';

    onStatusChange('saving');

    await write(targetLang, finalContent);

    onStatusChange('done');
    return 'done';
  } catch (err) {
    onLogItem({ type: 'error', content: err instanceof Error ? err.message : String(err) });
    onStatusChange('error');
    return 'error';
  }
}
