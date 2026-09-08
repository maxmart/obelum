/**
 * A document, as the host describes it: its languages, where each language's
 * file is, where each language's synced copies of the others are, and how
 * what was written becomes a commit.
 *
 * Core has no I/O and knows no paths. The host opens each file on its own
 * store: a checkout, git objects, an in-browser filesystem, a Map in a test.
 * The same core then serves every host with no conditional.
 */

export type MaybePromise<T> = T | Promise<T>;

export interface File {
  /** The content, or null when the file does not exist. Any other failure
   *  should throw: a file presented as missing reads as never synced. */
  read(): MaybePromise<string | null>;
  write(content: string): MaybePromise<void>;
}

/** Every language's file, as one party sees them. */
export interface View {
  file(lang: string): File;
}

export type Verb = 'edit' | 'fix' | 'sync' | 'markAsSynced';

export interface Document extends View {
  /** Every language the document exists in or may exist in. */
  langs: readonly string[];
  /** `synced(viewer)` is the viewer's copies of every language as of the
   *  last time it looked: `synced('sv').file('no')` is the no that sv is
   *  synced to, and `synced('sv').file('sv')` is sv itself at its last sync.
   *  `file(lang)` on the document itself is the real file. */
  synced(viewer: string): View;
  /** Each verb ends with exactly one commit of what its writes staged. The
   *  host formats the message; nothing in obelum reads it. A host without
   *  git makes this a no-op. */
  commit(verb: Verb, lang: string): MaybePromise<void>;
  /** Which lines a brief's diff may name a hunk after: the nearest such
   *  line above the hunk goes after the `@@`, so a translator can find its
   *  place. MDX: `line => line.trimStart().startsWith('<')`. Markdown: a
   *  heading. Default: git's rule, a line that starts with a letter. */
  anchor?(line: string): boolean;
}
