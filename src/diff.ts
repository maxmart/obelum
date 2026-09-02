/**
 * AnchorDiff format: a diff format anchored to component IDs for MDX files.
 * Used to provide Claude with minimal, structured diffs for translation.
 *
 * Depends on nothing. It used to reach for stripSyncMetadataLines, which made
 * a line-diff know what a vector clock looks like — the caller knows that and
 * passes a filter instead.
 */

interface DiffOp {
  type: 'equal' | 'insert' | 'delete';
  lines: string[];
  oldStart: number; // line index in 'before' (for equal/delete)
  newStart: number; // line index in 'after' (for equal/insert)
}

/**
 * Find the nearest line containing an id="..." attribute at or before lineIndex.
 */
function findNearestAnchor(
  lines: string[],
  lineIndex: number
): { line: string; index: number } | null {
  for (let i = Math.min(lineIndex, lines.length - 1); i >= 0; i--) {
    if (/\bid=["']/.test(lines[i])) {
      return { line: lines[i], index: i };
    }
  }
  return null;
}

/**
 * Compute longest common subsequence table for line-level diff.
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

/**
 * Backtrack through LCS table to produce diff operations.
 */
function buildDiffOps(a: string[], b: string[], dp: number[][]): DiffOp[] {
  const ops: DiffOp[] = [];
  let i = a.length;
  let j = b.length;

  // Collect raw operations in reverse
  const raw: Array<{ type: 'equal' | 'insert' | 'delete'; aIdx: number; bIdx: number; line: string }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      raw.push({ type: 'equal', aIdx: i - 1, bIdx: j - 1, line: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: 'insert', aIdx: i, bIdx: j - 1, line: b[j - 1] });
      j--;
    } else {
      raw.push({ type: 'delete', aIdx: i - 1, bIdx: j, line: a[i - 1] });
      i--;
    }
  }

  raw.reverse();

  // Group consecutive operations of the same type
  for (const r of raw) {
    const last = ops[ops.length - 1];
    if (last && last.type === r.type) {
      last.lines.push(r.line);
    } else {
      ops.push({
        type: r.type,
        lines: [r.line],
        oldStart: r.aIdx,
        newStart: r.bIdx,
      });
    }
  }

  return ops;
}

interface Hunk {
  anchorLine: string;
  body: string[];
}

const CONTEXT_LINES = 2;

/**
 * Generate an AnchorDiff format diff between two versions of a document.
 * Returns empty string if there are no differences.
 *
 * `dropLines` removes lines neither side should be shown — the caller's
 * business, not this module's. Translation passes the sync-metadata filter so
 * the model never sees a rev change and reports it as an edit.
 */
export function generateAnchoredDiff(
  before: string,
  after: string,
  dropLines: (lines: string[]) => string[] = lines => lines,
): string {
  // Normalize CRLF to LF — git blobs use LF, working tree files may use CRLF
  const normalizedBefore = before.replace(/\r\n/g, '\n');
  const normalizedAfter = after.replace(/\r\n/g, '\n');
  if (normalizedBefore === normalizedAfter) return '';

  const aLines = dropLines(normalizedBefore.split('\n'));
  const bLines = dropLines(normalizedAfter.split('\n'));
  const dp = lcsTable(aLines, bLines);
  const ops = buildDiffOps(aLines, bLines, dp);

  // Find change regions (groups of consecutive non-equal ops)
  const changeRegions: Array<{ ops: DiffOp[]; firstOldLine: number }> = [];
  let currentRegion: DiffOp[] | null = null;
  let currentFirstOldLine = 0;

  for (const op of ops) {
    if (op.type !== 'equal') {
      if (!currentRegion) {
        currentRegion = [];
        currentFirstOldLine = op.oldStart;
      }
      currentRegion.push(op);
    } else {
      if (currentRegion) {
        changeRegions.push({ ops: currentRegion, firstOldLine: currentFirstOldLine });
        currentRegion = null;
      }
    }
  }
  if (currentRegion) {
    changeRegions.push({ ops: currentRegion, firstOldLine: currentFirstOldLine });
  }

  // Build hunks with context
  const hunks: Hunk[] = [];

  for (const region of changeRegions) {
    // Find context lines before the change
    const changeStartOld = region.firstOldLine;
    const contextStart = Math.max(0, changeStartOld - CONTEXT_LINES);

    // Find anchor: nearest id= line before the change
    const anchor = findNearestAnchor(aLines, changeStartOld);
    const anchorLine = anchor
      ? anchor.line
      : aLines[contextStart] ?? '';

    // Build body with context before
    const body: string[] = [];

    // Context before
    for (let i = contextStart; i < changeStartOld; i++) {
      body.push(` ${aLines[i]}`);
    }

    // The change ops
    for (const op of region.ops) {
      for (const line of op.lines) {
        if (op.type === 'delete') {
          body.push(`-${line}`);
        } else if (op.type === 'insert') {
          body.push(`+${line}`);
        }
      }
    }

    // Context after: find the end position in the old file
    let lastOldLine = changeStartOld;
    for (const op of region.ops) {
      if (op.type === 'delete') {
        lastOldLine = op.oldStart + op.lines.length;
      }
    }
    const contextEnd = Math.min(aLines.length, lastOldLine + CONTEXT_LINES);
    for (let i = lastOldLine; i < contextEnd; i++) {
      body.push(` ${aLines[i]}`);
    }

    hunks.push({ anchorLine, body });
  }

  // Format output
  const parts: string[] = [];
  for (const hunk of hunks) {
    parts.push(`@@${hunk.anchorLine}@@`);
    parts.push(...hunk.body);
    parts.push('@@');
  }

  return parts.join('\n');
}
