import type { SyncMeta } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StalenessStatus = 'synced' | 'stale' | 'missing';

export interface StalenessInfo {
  status: StalenessStatus;
  /** The language's own rev. 0 for missing languages. */
  rev: number;
  /** The language's synced vector clock. Empty object for missing languages. */
  synced: Record<string, number>;
}

// ---------------------------------------------------------------------------
// computeStaleness
// ---------------------------------------------------------------------------

/**
 * Compute staleness for all languages using vector clocks.
 *
 * A language is:
 * - `missing`  — its SyncMeta is null (file does not exist)
 * - `stale`    — any other language Y has `Y.rev > this.synced[Y]`
 *                (missing synced entries default to 0)
 * - `synced`   — it has incorporated all other languages' current revs
 *
 * Special case: all-zero revs with empty synced maps = synced (fresh install).
 */
export function computeStaleness(
  metas: Record<string, SyncMeta | null>,
  allLangs: readonly string[],
): Record<string, StalenessInfo> {
  const result: Record<string, StalenessInfo> = {};

  for (const lang of allLangs) {
    const meta = metas[lang];

    if (meta == null) {
      result[lang] = { status: 'missing', rev: 0, synced: {} };
      continue;
    }

    // Check if any other language has a rev that this language hasn't seen
    let isStale = false;
    for (const otherLang of allLangs) {
      if (otherLang === lang) continue;
      const otherMeta = metas[otherLang];
      if (!otherMeta) continue; // missing langs can't make us stale

      const otherRev = otherMeta.rev;
      const seenRev = meta.synced[otherLang] ?? 0;

      if (otherRev > seenRev) {
        isStale = true;
        break;
      }
    }

    result[lang] = {
      status: isStale ? 'stale' : 'synced',
      rev: meta.rev,
      synced: meta.synced,
    };
  }

  return result;
}
