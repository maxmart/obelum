# Obelum

Keeping translations of one document in step, without a server.

```sh
npm install @obelum/core
```

Every document carries its own revision number and a note of the revision it
last took from each sibling language:

```yaml
rev: 7
synced: {en: 5, no: 6}
```

From those two numbers Obelum works out which languages have fallen behind,
what changed since they last agreed, and where in history to find the version
they agreed on. That is all it does.

## What it does not know

It has no idea what Markdown is, or git, or a filesystem, or React, or any
language model. It does not read or write anything. Three things it needs from
the outside are passed in as arguments:

| you pass | so that |
|---|---|
| `SyncMeta` values | it never has to know where you store a revision |
| a `dropLines` filter | your bookkeeping lines stay out of the diff |
| a `CommitReader` | any three methods shaped like a git log will do |

`CommitReader` is declared here rather than imported from anywhere:

```ts
export interface CommitReader {
  getHeadHash(): Promise<string>;
  readBlobAtCommit(file: string, commitHash: string): Promise<string>;
  getParentCommit(commitHash: string): Promise<string | null>;
}
```

Give it something with those three methods and it works against your history.

## The surface

```ts
import {
  computeStaleness,      // which languages have fallen behind
  generateAnchoredDiff,  // what changed, anchored so it survives reformatting
  resolveRevToContent,   // walk back through history to a given revision
} from '@obelum/core';
```

### computeStaleness(metas)

Takes a map of language → `SyncMeta | null` and returns, per language,
whether it is `synced`, `stale` or `missing`, along with its own revision and
vector clock. Pure.

### generateAnchoredDiff(before, after, dropLines?)

A line diff of two versions of a document, where every hunk is anchored to
the nearest preceding line carrying an `id="…"` attribute. A translator can
find the hunk again in the other language even after it was reformatted,
because component ids are shared across languages while line numbers are not.

### resolveRevToContent(reader, file, targetRev, revOf)

Walks back from HEAD one commit at a time until `revOf(content)` equals
`targetRev`, and returns that content. Returns `null` when the revision is
never found, which is how a document that predates revision tracking asks
for a full-content sync instead of a diff.

## Why it is separate

Four files, and the only import anywhere inside them is one type between two
of them. A separate package means a compiler enforces what a code review used
to: nothing in here can reach for a CMS, a browser, or a build tool without
failing to install. If this package ever gains a dependency, something has
been added that does not belong in it.

## Tests

```sh
npm test
```

No aliases, no setup file, no environment.

## License

MIT.
