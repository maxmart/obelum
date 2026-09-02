/**
 * cursor.ts — Lazy cursor-based history walking for translation staleness.
 *
 * resolveRevToContent walks the commit history one commit at a time using
 * getParentCommit, stopping as soon as the file's rev matches targetRev or
 * drops below it.  This avoids loading the full history up front.
 *
 * Returns null if:
 *  - targetRev <= 0 (no rev to find)
 *  - The rev is never found (legacy files predating vector clocks → caller
 *    should fall back to full-content sync)
 */

/**
 * The three things this walk needs from a repository — declared here rather
 * than imported, so the engine depends on nothing at all. `GitStore` happens
 * to satisfy it structurally, which is all the caller has to know.
 */
export interface CommitReader {
  getHeadHash(): Promise<string>;
  readBlobAtCommit(file: string, commitHash: string): Promise<string>;
  getParentCommit(commitHash: string): Promise<string | null>;
}
/**
 * Walk back through commit history from HEAD, reading `file` at each commit,
 * until its revision matches `targetRev`.
 *
 * Returns the file content at the commit where rev === targetRev, or null if
 * the rev is never found (including when targetRev <= 0).
 *
 * `revOf` is passed in rather than imported: reading a revision out of a
 * document means knowing where the document keeps it, which is the storage
 * format's business and not this walk's.
 */
export async function resolveRevToContent(
  gitStore: CommitReader,
  file: string,
  targetRev: number,
  revOf: (content: string) => number,
): Promise<string | null> {
  if (targetRev <= 0) return null;

  let hash: string | null = await gitStore.getHeadHash();

  while (hash !== null) {
    let content: string;
    try {
      content = await gitStore.readBlobAtCommit(file, hash);
    } catch {
      // File didn't exist at this commit — we've gone past its creation
      return null;
    }

    const rev = revOf(content);

    if (rev === targetRev) {
      return content;
    }

    if (rev < targetRev) {
      // We've walked past the target without finding it — not in history
      return null;
    }

    // rev > targetRev — keep walking back
    hash = await gitStore.getParentCommit(hash);
  }

  // Reached the root without finding targetRev
  return null;
}
