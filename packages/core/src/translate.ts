/**
 * The runner: bring one language of a document up to date with the others.
 *
 * Given how the document is stored (TranslationDeps) and something that can
 * translate (Translator), this gathers what changed in every language since
 * the target last synced, hands that to the translator, and saves the result
 * — or refuses to, when the translator did not finish cleanly. Saving a
 * partial result and stamping it as synced would hide the loss forever, so
 * the save rule lives here, next to the clocks it protects, and not in any
 * translator.
 *
 * Like everything in this package it performs no I/O of its own: reading,
 * history and writing come through deps, and the translating through the
 * translator.
 */
import { generateAnchoredDiff } from './diff.js';
import type { SyncMeta } from './types.js';

// ---------------------------------------------------------------------------
// What a translator is
// ---------------------------------------------------------------------------

/** One language's contribution to a translation: where it was at the last
 *  sync, and an anchored diff of what has changed since. */
export interface LangDiff {
  lang: string;
  /** Content at the time of the last sync. */
  base: string;
  /** Anchored diff showing what changed since. */
  diff: string;
}

/** Everything a translator is told for one run. */
export interface TranslationRequest {
  targetLang: string;
  /** Current content of the target; empty when it does not exist yet. */
  targetContent: string;
  /** Per language, the base the target last took and what changed since.
   *  Empty when there is no sync point, in which case fullSyncContents is
   *  set instead. */
  langDiffs: LangDiff[];
  /** When no sync point exists, the current content of every other
   *  language, for a full translation rather than a diff. */
  fullSyncContents?: { lang: string; content: string }[];
  /** The caller's rules: a glossary, which parts of the format are code
   *  rather than content, house style. Verbatim. */
  instructions?: string;
  /** Keep bookkeeping lines out of what is shown or compared. */
  dropLines: (lines: string[]) => string[];
}

export type TranslationEvent =
  | { type: 'thinking' }
  | { type: 'reasoning'; text: string }
  | { type: 'edit'; edit: { old_string: string; new_string: string } }
  | { type: 'error'; error: string }
  /** Always last. `complete` is false when the run stopped for any reason
   *  other than finishing cleanly — the result must not be saved then. */
  | { type: 'done'; finalContent: string; complete: boolean };

/**
 * Something that can translate. Handed to runTranslation; a model, a
 * service, a person at a form. It receives the request and streams events,
 * ending with `done`.
 */
export interface Translator {
  translate(request: TranslationRequest): AsyncIterable<TranslationEvent>;
}

// ---------------------------------------------------------------------------
// What the host supplies
// ---------------------------------------------------------------------------

/** One language's version of the document, with its revision bookkeeping. */
export interface Version {
  content: string;
  meta: SyncMeta;
}

/**
 * What a run needs from whoever owns the documents. Everything here is about
 * ONE document: the caller binds the path, the storage and the format.
 *
 * Where a revision is kept (in the document, in a sidecar, in a database)
 * and how the version at an older revision is found are the caller's
 * business, asked for through these methods.
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
  /** Keep bookkeeping out of what the translator sees and out of the diffs.
   *  Given the lines of a version, return the lines worth showing. */
  dropLines(lines: string[]): string[];
  /** Persist the finished translation. The caller records the sync (bumping
   *  the target's rev, stamping what it incorporated) as part of this. */
  write(lang: string, content: string): Promise<void>;
  /** Rules for the translator, verbatim. Optional. */
  instructions?(): Promise<string | undefined>;
}

// ---------------------------------------------------------------------------
// What the run reports
// ---------------------------------------------------------------------------

/** One entry in the running log a translation shows on screen. */
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

export interface RunTranslationOptions {
  targetLang: string;
}

export interface RunTranslationCallbacks {
  onLogItem: (item: LogItem) => void;
  onStatusChange: (status: TranslationStatus) => void;
  /** Polled between steps and stream events; a true return aborts the run. */
  isCancelled: () => boolean;
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/**
 * Build the request: diff mode when the target has synced before, full
 * content otherwise. Exported for evaluation harnesses that want to see what
 * a translator would be asked without running one.
 */
export async function buildTranslationRequest(
  deps: TranslationDeps,
  targetLang: string,
): Promise<TranslationRequest> {
  const { locales, read, readAtRev, dropLines } = deps;
  const target = await read(targetLang);
  const targetContent = target?.content ?? '';
  const synced = target?.meta.synced ?? {};
  const instructions = await deps.instructions?.();

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
        if (diff || !baseContent) return { lang, base: baseContent, diff };
        return null;
      } catch {
        return null;
      }
    }));
    const langDiffs = diffResults.filter((d): d is LangDiff => d !== null);
    if (langDiffs.length > 0) {
      return { targetLang, targetContent, langDiffs, instructions, dropLines };
    }
  }

  // Full sync: no sync point or no diffs, send every other language's content.
  const contentResults = await Promise.all(locales.filter(l => l !== targetLang).map(async lang => {
    try {
      const v = await read(lang);
      return v ? { lang, content: v.content } : null;
    } catch {
      return null;
    }
  }));
  return {
    targetLang,
    targetContent,
    langDiffs: [],
    fullSyncContents: contentResults.filter((c): c is { lang: string; content: string } => c !== null),
    instructions,
    dropLines,
  };
}

/**
 * Run a single translation: gather what changed in every language since the
 * target last synced, have the translator apply it, save the result.
 * Returns 'done' on success, 'error' on failure, 'cancelled' if cancelled.
 */
export async function runTranslation(
  deps: TranslationDeps,
  translator: Translator,
  opts: RunTranslationOptions,
  callbacks: RunTranslationCallbacks,
): Promise<'done' | 'error' | 'cancelled'> {
  const { targetLang } = opts;
  const { onLogItem, onStatusChange, isCancelled } = callbacks;

  try {
    if (isCancelled()) return 'cancelled';
    onStatusChange('translating');

    const request = await buildTranslationRequest(deps, targetLang);
    if (isCancelled()) return 'cancelled';

    let finalContent = '';
    let complete = false;

    for await (const event of translator.translate(request)) {
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
          // Not necessarily fatal: a translator may recover from a failed
          // edit. Whether the run as a whole succeeded rides on done.complete.
          onLogItem({ type: 'error', content: event.error });
          break;
        case 'done':
          finalContent = event.finalContent;
          complete = event.complete;
          break;
      }
    }

    // An incomplete run must not be saved: the caller would stamp the
    // partial result as fully synced, hiding that anything went wrong.
    if (!complete || !finalContent) {
      if (complete) onLogItem({ type: 'error', content: 'Translation returned no content' });
      onStatusChange('error');
      return 'error';
    }

    if (isCancelled()) return 'cancelled';
    onStatusChange('saving');
    await deps.write(targetLang, finalContent);
    onStatusChange('done');
    return 'done';
  } catch (err) {
    onLogItem({ type: 'error', content: err instanceof Error ? err.message : String(err) });
    onStatusChange('error');
    return 'error';
  }
}
