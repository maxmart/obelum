/**
 * The document, as this host describes it to core: a file per language at
 * the key's real path, the copies under `.obelum/<viewer>/`, and a commit
 * by path. Reads are HEAD's; writes stage into the working directory and the
 * verb's commit takes exactly them.
 */
import { obelum, type Document, type Session } from '@obelum/core';
import { ANCHORS, copyPath, realPath, type Config } from './config.js';
import type { Git } from './git.js';

export interface Host {
  git: Git;
  config: Config;
  /** Open a session on one document. */
  document(key: string): Session;
  /** Open a session whose commits are held back and made at `flush`, for
   *  a migration that marks hundreds of documents as one commit. */
  batched(): { document(key: string): Session; flush(message: string): void };
}

export function host(git: Git, config: Config): Host {
  const anchor = ANCHORS[config.anchor ?? 'git'];

  const describe = (key: string, onCommit: (message: string, files: Map<string, string>) => void): Document => {
    // What a verb has written but not yet committed. Reads are HEAD's, and a
    // verb reads back what it just wrote (sync snapshots the file it saved),
    // so the pending writes overlay HEAD until the verb's commit takes them.
    let pending = new Map<string, string>();
    const file = (p: string) => ({
      read: () => pending.has(p) ? pending.get(p)! : git.read(p),
      write: (content: string) => { pending.set(p, content); },
    });
    return {
      langs: config.langs,
      file: lang => file(realPath(key, lang)),
      synced: viewer => ({ file: lang => file(copyPath(viewer, realPath(key, lang))) }),
      anchor,
      commit: (verb, lang) => {
        const files = pending;
        pending = new Map();
        onCommit(`${verb} ${key.replace('{lang}', lang)}`, files);
      },
    };
  };

  return {
    git,
    config,
    document: key => obelum(describe(key, (message, files) => git.commit(message, files))),
    batched() {
      const all = new Map<string, string>();
      return {
        document: key => obelum(describe(key, (_message, files) => { for (const [p, c] of files) all.set(p, c); })),
        flush: message => { git.commit(message, new Map(all)); all.clear(); },
      };
    },
  };
}
