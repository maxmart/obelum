# Obelum

Obelum is a typescript library to help keep documents in sync between languages. There is no master/primary 
language, you can edit any of them and have changes propagate to the others. 
Also supports keeping language versions structurally different - for localizing marketing for example.

Designed to use git for history and an LLM as the translator, but not locked to it. 

Obelum is experimental. 
It is used by [Plinto](https://github.com/maxmart/plinto), a CMS admin for static git-backed sites.

## Why

A translated document tends to drift over time. Someone fixes a paragraph in English and the
Swedish page silently goes out of date, or someone corrects the Swedish wording and the next 
automated translation from English overwrites it.

The usual tools solve half of this by declaring one language the source and
regenerating the others from it. That keeps the translations current, but
it makes them disposable: correcting a translation doesn't survive the next
run.

Obelum keeps track of history in a special way so it can give the translator better context. It gives the translator:

1. **The source document(s) as it was**
2. **What changed in the source(s) since the target last looked**, as a diff,
   so the translator's job is to carry that change over, and everything else in the
   target is left alone.
3. **The target as it is now**, so the terms and voice already in use there
   are kept, and localized passages stay localized.

Given that, a Spanish page can be structured differently from the English
one and still receive the English edits. And once "what changed since you
last looked" is the unit of work, there is no reason for one language to be
special. Every language can be edited, every edit can propagate, and the
same machinery runs in every direction.

It's important to note that it's up to the LLM to reason and generate minimal edits, all Obelum does is give it the best possible conditions.

## The concept

**Each language remembers what it last saw of the others.** For every
language, Obelum keeps a copy of every language's file as it was the last
time that language synced. That is the whole state. It's remininescent of vector clocks, but we store the entire copy instead of a counter. 
Thanks to Git, this part can be done without causing n^2 storage (see [how it is built](#how-it-is-built))

**A language is stale when a sibling's file no longer matches its copy of
it.** Staleness is a file comparison, per pair of languages. Because it 
is only ever a comparison of what is in the tree, ordinary git work such as 
merges, squashes, rebases and reverts cannot confuse it.

**The brief is the diff.** To bring a language up to date, Obelum hands a
translator the target's current content and, for each language that
changed, the old version the target is synced to and a diff to the current one.
The translator applies the changes. 

**A change should either propagate or not.** 
Three verbs:

| verb | meaning |
|---|---|
| `edit` | this change should propagate to the other languages. The only verb that makes other languages stale. |
| `fix` | this change is local (a typo, a word choice, restructuring) and should not propagate, but should also not be overwritten. The fix is merged three-way into every sibling's copy, so from their point of view it already happened. |
| `sync` | this language has now incorporated all changes from other languages. Its copies are refreshed and it is no longer stale. |

The output from the translator is saved with `sync` and then you can touch up the result
afterwards using `fix`. A fix that cannot be merged cleanly into one sibling's copy (for example if the
fix overlaps an edit that sibling has not seen yet) is left alone. That language will see the whole fix as part of an edit.

**Think of each language as a branch.** The copies a language keeps are the
repository, as that language knows it. An edit is a commit on the author's
branch; a sync pulls the siblings' current files onto the target's branch
and rewrites the target; a fix is cherry-picked onto every other branch.
Real branches would be unbearable to work with, so the "branches" are
directories in one tree, and git's diff and merge do the rest.

## What you can do with it

- **Edit whichever language is convenient.** Fix the Norwegian page because
  the Norwegian reviewer found the problem, and let English and Swedish
  catch up.
- **Keep deliberate differences.** A localized page that dropped a section
  or reordered one keeps that shape through later syncs, because syncs
  carry changes, not content.
- **Correct without propagating.** A typo fix does not trigger three
  re-translations.
- **See what is behind what.** Per document, which languages are stale and
  on whom.
- **Use any translator.** The brief is plain data: current content, base,
  current, diff, per language. `@obelum/translator-claude` runs it through
  a Claude agent loop with edit tools; a different model, a translation
  service, or a person could use the same brief.
- **Run it over a plain git repository.** Every verb is one commit. The
  state lives in the tree, so it survives every git operation the tree
  survives and needs nothing running alongside.
- **No partial translation work is saved.** A translator that could not
  finish returns nothing, and nothing is what gets synced.

## How it is built

The copies are ordinary files under `.obelum/<viewer>/<real path>`:

```
pages/sv/pricing.mdx                 # the real Swedish page
.obelum/sv/pages/en/pricing.mdx      # en as sv last saw it
.obelum/sv/pages/sv/pricing.mdx      # sv itself, at its last sync
.obelum/en/pages/sv/pricing.mdx      # sv as en last saw it
…
```

That is n×n copies per document, which is cheaper than it looks. Git
stores content by hash, so a copy that equals its real file is the same
blob referenced twice, and a sync adds no objects at all. Only a copy that
has drifted costs bytes, and those are exactly the differences the design
needs. What does grow is the checkout, one small file per copy; the CLI can
keep them off disk entirely under a sparse checkout and work on git objects
alone.

| package | what it is |
|---|---|
| [`@obelum/core`](packages/core) | the rules: staleness, the brief, the verbs and the fix fan-out, as diffs and three-way merges over copies the host provides. No I/O, no git, no model. |
| [`@obelum/translator-claude`](packages/translator-claude) | a translator: turns a brief into prompts and edit tools for Claude, applies the edits, decides whether the run is complete. |
| [`@obelum/cli`](packages/cli) | the `obelum` command over plain git: status, briefs, the verbs as commits, translation rounds, and an auditor for the copies. |
| [`obelum`](packages/obelum) | the unscoped name for `@obelum/core`; a re-export. |

See [ROADMAP.md](ROADMAP.md) for what comes next.

```sh
npm install
npm test
npm run build
```

MIT.
