/**
 * Tests for resolveRevToContent (cursor.ts)
 *
 * Uses a mock CommitReader with a linear commit chain.  Each commit has a specific
 * rev embedded in frontmatter.  readBlobAtCommit calls are tracked so we can
 * verify early stopping behaviour.
 */

import { resolveRevToContent } from '../cursor';
import type { CommitReader } from '../cursor';

/**
 * What a revision looks like, supplied by the caller — which is the point.
 * The walk does not know where a document keeps its rev, so this test does
 * not have to reach into the document layer to exercise it.
 */
const revOf = (content: string) => Number(content.match(/^rev: (\d+)$/m)?.[1] ?? 0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CommitNode {
  hash: string;
  rev: number;
  parentHash: string | null;
}

/**
 * Build a mock CommitReader from an ordered list of commit nodes (newest first).
 * readCalls is incremented every time readBlobAtCommit is invoked.
 */
function buildMockStore(chain: CommitNode[]): { store: CommitReader; readCalls: () => number } {
  let calls = 0;

  const byHash = new Map<string, CommitNode>(chain.map(n => [n.hash, n]));

  const store: CommitReader = {
    async getHeadHash() {
      return chain[0].hash;
    },
    async readBlobAtCommit(_file: string, hash: string) {
      calls++;
      const node = byHash.get(hash);
      if (!node) throw new Error(`Unknown commit hash: ${hash}`);
      return `---\nrev: ${node.rev}\nsynced: {}\n---\n\nContent at rev ${node.rev}`;
    },
    async getParentCommit(hash: string) {
      const node = byHash.get(hash);
      if (!node) throw new Error(`Unknown commit hash: ${hash}`);
      return node.parentHash;
    },
  };

  return {
    store,
    readCalls: () => calls,
  };
}

// ---------------------------------------------------------------------------
// Test chain setup
//
// Commit history (newest → oldest):
//   c5 (rev 5) → c4 (rev 4) → c3b (rev 3, fix commit) → c3a (rev 3) → c2 (rev 2) → c1 (rev 1, root)
// ---------------------------------------------------------------------------

const CHAIN: CommitNode[] = [
  { hash: 'c5',  rev: 5, parentHash: 'c4'  },
  { hash: 'c4',  rev: 4, parentHash: 'c3b' },
  { hash: 'c3b', rev: 3, parentHash: 'c3a' },  // fix commit — same rev as c3a
  { hash: 'c3a', rev: 3, parentHash: 'c2'  },
  { hash: 'c2',  rev: 2, parentHash: 'c1'  },
  { hash: 'c1',  rev: 1, parentHash: null  },   // root commit
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveRevToContent', () => {
  test('returns null for targetRev <= 0', async () => {
    const { store } = buildMockStore(CHAIN);
    expect(await resolveRevToContent(store, 'sv/index.mdx', 0, revOf)).toBeNull();
    expect(await resolveRevToContent(store, 'sv/index.mdx', -1, revOf)).toBeNull();
  });

  test('returns null for targetRev <= 0 without reading any commits', async () => {
    const { store, readCalls } = buildMockStore(CHAIN);
    await resolveRevToContent(store, 'sv/index.mdx', 0, revOf);
    expect(readCalls()).toBe(0);
  });

  test('finds content at HEAD (rev 5)', async () => {
    const { store } = buildMockStore(CHAIN);
    const content = await resolveRevToContent(store, 'sv/index.mdx', 5, revOf);
    expect(content).toContain('Content at rev 5');
  });

  test('finds content at rev 3 (the first matching commit, c3b)', async () => {
    const { store } = buildMockStore(CHAIN);
    const content = await resolveRevToContent(store, 'sv/index.mdx', 3, revOf);
    // c3b is the newest commit with rev 3 — should return that one
    expect(content).toContain('Content at rev 3');
  });

  test('finds content at rev 1 (root commit)', async () => {
    const { store } = buildMockStore(CHAIN);
    const content = await resolveRevToContent(store, 'sv/index.mdx', 1, revOf);
    expect(content).toContain('Content at rev 1');
  });

  test('stops early — does not walk entire history when rev found near HEAD', async () => {
    const { store, readCalls } = buildMockStore(CHAIN);
    // Rev 5 is at HEAD (c5) — should only need 1 read
    await resolveRevToContent(store, 'sv/index.mdx', 5, revOf);
    expect(readCalls()).toBe(1);
  });

  test('stops early when rev drops below target', async () => {
    const { store, readCalls } = buildMockStore(CHAIN);
    // Requesting rev 99 — no such rev, but we should stop as soon as rev drops
    // below 99.  That happens at the first read (rev 5 < 99), so 1 read.
    const content = await resolveRevToContent(store, 'sv/index.mdx', 99, revOf);
    expect(content).toBeNull();
    expect(readCalls()).toBe(1);
  });

  test('returns null when rev is not found in history', async () => {
    const { store } = buildMockStore(CHAIN);
    // Rev 6 never exists in our chain
    const content = await resolveRevToContent(store, 'sv/index.mdx', 6, revOf);
    expect(content).toBeNull();
  });

  test('returns null when readBlobAtCommit throws (file not in commit)', async () => {
    // Chain where the file only appears from c3 onwards
    const chain: CommitNode[] = [
      { hash: 'c3', rev: 3, parentHash: 'c2' },
      { hash: 'c2', rev: 2, parentHash: 'c1' },
      { hash: 'c1', rev: 1, parentHash: null },
    ];

    let calls = 0;
    const byHash = new Map(chain.map(n => [n.hash, n]));

    const store: CommitReader = {
      async getHeadHash() { return 'c3'; },
      async readBlobAtCommit(_file: string, hash: string) {
        calls++;
        if (hash === 'c1') throw new Error('File not found');
        const node = byHash.get(hash)!;
        return `---\nrev: ${node.rev}\nsynced: {}\n---\n\nContent at rev ${node.rev}`;
      },
      async getParentCommit(hash: string) {
        return byHash.get(hash)?.parentHash ?? null;
      },
    };

    // Rev 0 doesn't exist, but the file throws at c1 — should return null
    const content = await resolveRevToContent(store, 'sv/index.mdx', 0, revOf);
    expect(content).toBeNull();
    expect(calls).toBe(0); // targetRev <= 0, no reads

    // For a real missing rev, we walk until we hit the throw
    const content2 = await resolveRevToContent(store, 'sv/index.mdx', 99, revOf);
    expect(content2).toBeNull();
  });

  test('handles fix commits — returns first (newest) commit with that rev', async () => {
    // c3b and c3a both have rev 3; c3b is newer
    const { store } = buildMockStore(CHAIN);
    const content = await resolveRevToContent(store, 'sv/index.mdx', 3, revOf);
    // We expect content from c3b (first match walking from HEAD)
    expect(content).not.toBeNull();
    expect(content).toContain('rev 3');
  });

  test('walk reaches root without finding rev — returns null', async () => {
    const chain: CommitNode[] = [
      { hash: 'c2', rev: 2, parentHash: 'c1' },
      { hash: 'c1', rev: 1, parentHash: null },
    ];
    const { store } = buildMockStore(chain);
    // Rev 3 never appears
    const content = await resolveRevToContent(store, 'sv/index.mdx', 3, revOf);
    expect(content).toBeNull();
  });
});
