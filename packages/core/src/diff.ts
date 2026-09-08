/**
 * The brief's diff: unified, three lines of context, and after each `@@`
 * the nearest anchor line above the hunk so a translator can find its place.
 * The host says which lines are anchors; the default is git's own rule.
 */
import { structuredPatch } from 'diff';

export type Anchor = (line: string) => boolean;

/** git's default: a line that starts with a letter, `_` or `$`. */
export const gitAnchor: Anchor = line => /^[A-Za-z_$]/.test(line);

/** Unified diff from `before` to `after`; '' when they are equal. */
export function unifiedDiff(before: string, after: string, anchor: Anchor = gitAnchor): string {
  if (before === after) return '';
  const patch = structuredPatch('a', 'b', before, after, undefined, undefined, { context: 3 });
  const oldLines = before.split('\n');
  const out: string[] = [];
  for (const h of patch.hunks) {
    const header = nearestAbove(oldLines, h.oldStart - 1, anchor);
    const range = `@@ -${span(h.oldStart, h.oldLines)} +${span(h.newStart, h.newLines)} @@`;
    out.push(header ? `${range} ${header}` : range);
    for (const line of h.lines) out.push(line.replace(/\r?\n$/, ''));
  }
  return out.join('\n');
}

function nearestAbove(lines: string[], index: number, anchor: Anchor): string | undefined {
  for (let i = index - 1; i >= 0; i--) if (anchor(lines[i])) return lines[i];
  return undefined;
}

function span(start: number, count: number): string {
  // git's convention: an empty range is reported at the line before it.
  if (count === 0) return `${start - 1},0`;
  return count === 1 ? String(start) : `${start},${count}`;
}
