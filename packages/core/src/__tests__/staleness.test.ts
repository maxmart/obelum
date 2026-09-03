import { computeStaleness, StalenessInfo } from '../staleness.js';
import type { SyncMeta } from '../types.js';

// Helper to build a null-filled metas map for missing langs
function metas(
  langs: string[],
  values: Record<string, SyncMeta | null>,
): Record<string, SyncMeta | null> {
  const result: Record<string, SyncMeta | null> = {};
  for (const lang of langs) {
    result[lang] = values[lang] ?? null;
  }
  return result;
}

const LANGS = ['sv', 'no', 'en'];

describe('computeStaleness', () => {
  it('fresh install: all rev 0, empty synced maps → all synced', () => {
    const input = metas(LANGS, {
      sv: { rev: 0, synced: {} },
      no: { rev: 0, synced: {} },
      en: { rev: 0, synced: {} },
    });
    const result = computeStaleness(input, LANGS);
    expect(result.sv.status).toBe('synced');
    expect(result.no.status).toBe('synced');
    expect(result.en.status).toBe('synced');
  });

  it('all explicitly synced: each lang records others at current rev → all synced', () => {
    const input = metas(LANGS, {
      sv: { rev: 3, synced: { no: 2, en: 1 } },
      no: { rev: 2, synced: { sv: 3, en: 1 } },
      en: { rev: 1, synced: { sv: 3, no: 2 } },
    });
    const result = computeStaleness(input, LANGS);
    expect(result.sv.status).toBe('synced');
    expect(result.no.status).toBe('synced');
    expect(result.en.status).toBe('synced');
  });

  it('one edited: sv edited → no and en are stale', () => {
    // sv was updated to rev 3, but no/en still think sv is at rev 2
    const input = metas(LANGS, {
      sv: { rev: 3, synced: { no: 2, en: 1 } },
      no: { rev: 2, synced: { sv: 2, en: 1 } }, // sv.rev (3) > no.synced.sv (2) → stale
      en: { rev: 1, synced: { sv: 2, no: 2 } }, // sv.rev (3) > en.synced.sv (2) → stale
    });
    const result = computeStaleness(input, LANGS);
    expect(result.sv.status).toBe('synced');
    expect(result.no.status).toBe('stale');
    expect(result.en.status).toBe('stale');
  });

  it('divergent edits: sv and no both edited without syncing → both stale', () => {
    // sv rev=3, no rev=2, neither knows about the other's latest edit
    const input = metas(LANGS, {
      sv: { rev: 3, synced: { no: 1, en: 1 } }, // no.rev (2) > sv.synced.no (1) → sv stale
      no: { rev: 2, synced: { sv: 2, en: 1 } }, // sv.rev (3) > no.synced.sv (2) → no stale
      en: { rev: 1, synced: { sv: 2, no: 1 } }, // both sv.rev(3)>en.synced.sv(2) and no.rev(2)>en.synced.no(1) → en stale
    });
    const result = computeStaleness(input, LANGS);
    expect(result.sv.status).toBe('stale');
    expect(result.no.status).toBe('stale');
    expect(result.en.status).toBe('stale');
  });

  it('after sync: target updated its synced map to include source rev → synced', () => {
    // sv edited to rev 3, no was translated and updated synced.sv = 3
    const input = metas(LANGS, {
      sv: { rev: 3, synced: { no: 2, en: 1 } },
      no: { rev: 2, synced: { sv: 3, en: 1 } }, // no.synced.sv = 3 = sv.rev → no is up-to-date with sv
      en: { rev: 1, synced: { sv: 2, no: 2 } }, // sv.rev (3) > en.synced.sv (2) → en still stale
    });
    const result = computeStaleness(input, LANGS);
    expect(result.sv.status).toBe('synced');
    expect(result.no.status).toBe('synced');
    expect(result.en.status).toBe('stale');
  });

  it('missing language: null SyncMeta → missing status', () => {
    const input = metas(LANGS, {
      sv: { rev: 1, synced: {} },
      no: { rev: 1, synced: { sv: 1 } },
      en: null, // file does not exist
    });
    const result = computeStaleness(input, LANGS);
    expect(result.en.status).toBe('missing');
  });

  it('legacy files: empty synced maps, one has rev > 0 → others stale', () => {
    // sv has been edited (rev=1) but no/en have empty synced maps (legacy)
    const input = metas(LANGS, {
      sv: { rev: 1, synced: {} },
      no: { rev: 0, synced: {} }, // sv.rev (1) > no.synced.sv (0, default) → stale
      en: { rev: 0, synced: {} }, // sv.rev (1) > en.synced.sv (0, default) → stale
    });
    const result = computeStaleness(input, LANGS);
    expect(result.sv.status).toBe('synced'); // sv has no unseen edits from others
    expect(result.no.status).toBe('stale');
    expect(result.en.status).toBe('stale');
  });

  it('StalenessInfo includes status, rev, synced — no base field', () => {
    const input = metas(LANGS, {
      sv: { rev: 2, synced: { no: 1, en: 1 } },
      no: { rev: 1, synced: { sv: 2, en: 1 } },
      en: { rev: 1, synced: { sv: 2, no: 1 } },
    });
    const result = computeStaleness(input, LANGS);
    const info = result.sv;
    expect(info).toHaveProperty('status');
    expect(info).toHaveProperty('rev');
    expect(info).toHaveProperty('synced');
    expect(info).not.toHaveProperty('base');
  });

  it('missing language info has rev 0 and empty synced', () => {
    const input = metas(LANGS, {
      sv: { rev: 1, synced: {} },
      no: { rev: 0, synced: {} },
      en: null,
    });
    const result = computeStaleness(input, LANGS);
    expect(result.en.rev).toBe(0);
    expect(result.en.synced).toEqual({});
  });

  it('self-entry in synced does not cause self to be stale', () => {
    // sv has self-entry sv:3 but sv.rev is 5 (edited since last sync).
    // This should NOT make sv stale — only other langs can make sv stale.
    const input = metas(LANGS, {
      sv: { rev: 5, synced: { sv: 3, no: 2, en: 2 } },
      no: { rev: 2, synced: { sv: 5, no: 2, en: 2 } },
      en: { rev: 2, synced: { sv: 5, no: 2, en: 2 } },
    });
    const result = computeStaleness(input, LANGS);
    expect(result.sv.status).toBe('synced'); // self-entry sv:3 < sv.rev:5 must not cause stale
    expect(result.no.status).toBe('synced');
    expect(result.en.status).toBe('synced');
  });
});
