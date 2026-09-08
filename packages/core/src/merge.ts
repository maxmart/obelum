/**
 * The three-way merge the fan-out runs: the change old → new, merged into a
 * sibling's synced copy of the changed language. Whole-file: either the
 * whole change lands or the copy is left as it was, and the sibling sees
 * the change as news. Hunk-level application is a later refinement.
 *
 * node-diff3 is what isomorphic-git merges with, so a browser host's git
 * and this agree by construction. Lines are split on '\n' only; the host
 * normalises line endings if its store does not.
 */
import { merge as diff3 } from 'node-diff3';

export type MergeResult = { clean: true; content: string } | { clean: false };

/** Merge the change `base → theirs` into `ours`. */
export function merge3(ours: string, base: string, theirs: string): MergeResult {
  if (ours === base) return { clean: true, content: theirs };
  if (theirs === base || ours === theirs) return { clean: true, content: ours };
  const r = diff3(ours.split('\n'), base.split('\n'), theirs.split('\n'), { excludeFalseConflicts: true });
  if (r.conflict) return { clean: false };
  return { clean: true, content: r.result.join('\n') };
}
