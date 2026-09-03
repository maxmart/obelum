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
| a `Translator` | who does the translating is not its business either |
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

### runTranslation(deps, translator, { targetLang }, callbacks)

The runner. Given how one document is stored (`TranslationDeps`: read a
language's current version with its `SyncMeta`, read the version at an older
revision, drop bookkeeping lines, write) and something that can translate
(`Translator`: one method that takes a request and streams events), it
gathers what changed in every language since the target last synced, hands
that to the translator, and saves the result. A result the translator did
not finish is never saved: stamping a partial translation as synced would
hide the loss forever, so that rule lives here, next to the clocks it
protects, and not in any translator.

```ts
import { runTranslation } from '@obelum/core';
import { claude } from '@obelum/translator-claude';

await runTranslation(deps, claude({ apiKey }), { targetLang: 'sv' }, {
  onLogItem: item => console.log(item),
  onStatusChange: status => console.log(status),
  isCancelled: () => false,
});
```

A `Translator` is anything with `translate(request)`. Claude is one; a
different model, a service, or a person at a form are others.

## Why it is separate

Five files, and the only imports anywhere inside them are between two of
them. Even the runner performs no I/O: it reads, writes and translates
through what it is handed. A separate package means a compiler enforces what a code review used
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
