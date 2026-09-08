/**
 * The auditor: what can be wrong with `.obelum/` that the verbs would never
 * produce on their own.
 *
 * - A copy whose language is not one of the configured languages.
 * - A copy of a file that no longer exists: the real file was renamed or
 *   deleted without its copies (rename and delete are the host's).
 * - A copy with merge conflict markers: a `.obelum/` conflict resolved by
 *   hand and committed as it stood.
 * - A merge commit resolved by picking sides per file: a language's copy of
 *   a sibling taken from one parent while the real sibling was taken from the
 *   other. The copy then claims a sync that never happened (trace 5b). The
 *   remedy is to point that language's copies at the merge base and sync.
 */
import { copyPath, locate, type Config } from './config.js';
import type { Git } from './git.js';

export interface Finding {
  kind: 'unknown-language' | 'orphan' | 'conflict-markers' | 'mixed-resolution';
  path: string;
  detail: string;
}

export async function check(git: Git, config: Config, opts: { merges?: number } = {}): Promise<Finding[]> {
  const findings: Finding[] = [];
  const paths = git.paths();
  const real = new Set(paths.filter(p => !p.startsWith('.obelum/')));

  for (const p of paths) {
    if (!p.startsWith('.obelum/')) continue;
    const [, viewer, ...rest] = p.split('/');
    const target = rest.join('/');
    if (!config.langs.includes(viewer)) {
      findings.push({ kind: 'unknown-language', path: p, detail: `"${viewer}" is not in obelum.json's langs` });
      continue;
    }
    if (!real.has(target)) {
      findings.push({ kind: 'orphan', path: p, detail: `${target} is not in the tree; delete the copy, or move it with the file` });
      continue;
    }
    const content = await git.read(p);
    if (content && /^(<{7}|={7}|>{7})( |$)/m.test(content)) {
      findings.push({ kind: 'conflict-markers', path: p, detail: 'merge conflict markers; resolve by deleting the language\'s copies or re-syncing it' });
    }
  }

  // Mixed-side resolutions, over the last few merge commits.
  for (const merge of git.merges(opts.merges ?? 20)) {
    if (merge.parents.length < 2) continue;
    const [a, b] = merge.parents;
    for (const p of paths) {
      if (!p.startsWith('.obelum/')) continue;
      const [, viewer, ...rest] = p.split('/');
      const target = rest.join('/');
      const doc = locate(config, target);
      if (!doc || doc.lang === viewer) continue;
      const viewerReal = target.replace(`/${doc.lang}/`, `/${viewer}/`);
      const copyA = git.oidAt(a, p), copyB = git.oidAt(b, p);
      if (!copyA || !copyB || copyA === copyB) continue;
      const now = git.oidAt(merge.hash, p);
      const realA = git.oidAt(a, viewerReal), realB = git.oidAt(b, viewerReal);
      const realNow = git.oidAt(merge.hash, viewerReal);
      if (!realA || !realB || realA === realB) continue;
      const copyFrom = now === copyA ? 'A' : now === copyB ? 'B' : null;
      const realFrom = realNow === realA ? 'A' : realNow === realB ? 'B' : null;
      if (copyFrom && realFrom && copyFrom !== realFrom) {
        findings.push({
          kind: 'mixed-resolution',
          path: p,
          detail: `merge ${merge.hash.slice(0, 7)} took this copy from one parent and ${viewerReal} from the other; ` +
            `${viewer} claims a sync with ${doc.lang} it never made. Point ${copyPath(viewer, '…')} at the merge base and sync ${viewer}`,
        });
      }
    }
  }

  return findings;
}
