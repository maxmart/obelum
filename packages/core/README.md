# Obelum

Keeping translations of one document in step.

Part of [Obelum](https://github.com/maxmart/obelum); the [repository README](https://github.com/maxmart/obelum#readme) lists the packages and the roadmap.

Obelum is experimental. 


## Overview

For every language L, Obelum keeps **a copy of every language's file as it
was the last time L synced**. The copies are ordinary files in one directory
at the repository root, each at the real file's own path:

```
pages/sv/pricing.mdx                 # the real Swedish page
pages/no/pricing.mdx
pages/en/pricing.mdx

.obelum/sv/pages/no/pricing.mdx      # no as sv last saw it
.obelum/sv/pages/en/pricing.mdx      # en as sv last saw it
.obelum/sv/pages/sv/pricing.mdx      # sv itself, at its last sync
.obelum/no/pages/sv/pricing.mdx      # sv as no last saw it
.obelum/no/pages/en/pricing.mdx
.obelum/no/pages/no/pricing.mdx
.obelum/en/pages/sv/pricing.mdx
.obelum/en/pages/no/pricing.mdx
.obelum/en/pages/en/pricing.mdx
```

**A language is stale when a sibling's real file differs from its copy of
it.** That is all the bookkeeping there is: no counter, no clock, no
history. Hand edits, merges, squashes, rebases and reverts all come out
right, because there is nothing to keep consistent with the tree but the
tree.

**Syncing translates only what changed.** The diff between a copy and the
real file is what changed since the target last looked, and Obelum assembles
those diffs into a *brief* for a translator. The translator is a separate
package; `@obelum/translator-claude` runs the brief through a Claude agent
loop and hands back the result, which the host saves as the sync.

**Think of each language as a branch.** `.obelum/sv/` is the sv branch: the
whole repository as sv knows it. An edit is a commit on the author's branch.
A sync copies the siblings' files onto the target's branch and rewrites the
target. A fix is cherry-picked onto every other branch's copy, a three-way
merge that lands when the fix and an unseen edit touch different places and
is left alone when they overlap. Real branches would be unbearable, so the
branches are directories in one tree, and git's merging and diffing follow.

**It costs less than it looks.** Git stores content by hash, so a copy that
equals its real file is the same blob referenced twice, and a sync adds no
objects at all. Only a copy that has drifted holds bytes of its own, and
those are exactly the differences the design needs. What grows is the
checkout: one small file per copy, about 1,350 for three languages and 450
documents. A host working on git objects can keep them off disk entirely
(see the roadmap).

## The four verbs

| verb | writes |
|---|---|
| `edit L` | L's real file. Nothing else. The only verb that creates staleness. |
| `fix L` | L's real file, then the change old L → new L merged three-way into every sibling's synced copy of L. A copy the change does not merge into cleanly is left alone, and that sibling sees the whole fix as news. |
| `sync L` | the same as fix, then L's synced copies of every language overwritten with the real files. A translation is never news for a sibling. |
| `markAsSynced L` | only the second half of sync. An ops primitive, not a button: it asserts a claim that can be false. |

Each verb ends in exactly one commit naming what it wrote.

## What it does not know

Core has no I/O and knows no paths. A document, as the host describes it, is
its languages, a file per language, each language's synced copies of the
others, and a commit; `obelum(document)` opens a session on it:

```ts
import { obelum } from '@obelum/core';

const file = path => ({                        // host-owned, one line each
  read:  () => store.read(path),               // null when it does not exist
  write: content => store.write(path, content),  // stages, as git add would
});

const session = obelum({
  langs: ['sv', 'no', 'en'],
  file:   lang   => file(`pages/${lang}/pricing.mdx`),
  synced: viewer => ({ file: lang => file(`.obelum/${viewer}/pages/${lang}/pricing.mdx`) }),
  commit: (verb, lang) => git.commit(`${verb} ${lang}`),
  anchor: line => line.trimStart().startsWith('<'),   // optional, see brief
});
```

`document.file('no')` is the real no; `document.synced('sv').file('no')` is
*the no that sv is synced to*. A missing synced copy reads as never synced.
Writes stage and each verb ends in exactly one `commit`, which the host
formats as it likes; nothing in obelum reads a message. The same core serves
a Node CLI over plain git, a browser over isomorphic-git, and a test over a
`Map`, with no conditional. A host without git makes `commit` a no-op.

## The surface

```ts
session.edit(lang, content)
session.fix(lang, content)          // → { merged, conflicted }
session.sync(lang, content)         // → { merged, conflicted }
session.markAsSynced(lang)
session.stale()                     // per language: { missing, stale: [siblings] }
session.brief(lang)                 // what a translator is told
session.syncAll()                   // a round: .sync(lang, content)…, then .done()
merge3(ours, base, theirs)      // the three-way merge the fan-out runs
unifiedDiff(before, after, anchor?)
```

### stale()

Per language, whether it exists and which siblings its synced copies are
behind on. A language with no file makes nobody stale; `missing` is a state
of the language, not staleness of its siblings.

### brief(lang)

Everything a translator is told: the target's current content and, for every
language that changed since the target last synced (the target included, so
its own local fixes are preserved), the version the target is synced to, the
current file, and a unified diff between them. An empty base means the target
never saw that language and the diff is the whole file.

Each hunk is named after the nearest line above it that the document's
`anchor` accepts, so a translator can find its place: for MDX a line starting
with `<`, for Markdown a heading. The default is git's rule, a line starting
with a letter.

### syncAll()

A round: every sibling brought up to date after an edit, then closed.

```ts
const round = session.syncAll();
await round.sync('no', contentNo);   // an ordinary sync, one commit each
await round.sync('en', contentEn);
await round.done();                  // → ['sv']
```

Opening the round notes its sources, the languages some sibling is behind
on. `done()` marks each source as synced once nobody is behind on it any
more. After edit sv, sync no, sync en, that is sv: its copies of no and en
already matched (the syncs fanned out into them), and its copy of *itself*
now catches up too, because an edit everyone has translated is behind
everyone, the editor included, and is no longer a local change for a later
sync of sv to preserve. A fix leaves nobody behind, so a language whose only
change is a fix is never a source and keeps that fix. A round that is not
finished is simply never closed.

### Translating

Core does no translating. A translator takes a brief and returns content,
and the host saves it with `sync`:

```ts
import { claude } from '@obelum/translator-claude';

const content = await claude({ apiKey }).run(await session.brief('sv'));
if (content) await session.sync('sv', content);
```

The agent's output is what `sync` saves, so a translation is pure
translation; a human who changes the result afterwards saves with edit or
fix. Whether a run is complete enough to hand back is the translator's rule
(Claude's returns null otherwise); a different model, a service, or a person
at a form are other translators, and each takes the same brief.

## Dependencies

Two, both ordinary: [`node-diff3`](https://www.npmjs.com/package/node-diff3)
for the merge (what isomorphic-git merges with, so a browser host's git and
this agree by construction) and [`diff`](https://www.npmjs.com/package/diff)
for the unified diff. Nothing here reads a file, runs git, or talks to a
model.

## For the repository

Recommended `.gitattributes`, since obelum has no repository of its own:

```
.obelum/** linguist-generated=true
```

Rename and delete are the host's: move or remove every path the `synced`
pattern yields together with the real file, in one commit.

## Tests

```sh
npm test
```

The fifteen traces from the design prototype (three verbs and a hand edit,
edit-then-fix-before-sync, branch merges clean and conflicting, foreign
merges, squash, binary media, rebase, revert, conflict recovery, the birth
of a language), plus the round, run against an in-memory host with a small
model of git's merge. No aliases, no setup file, no environment.

## License

MIT.
