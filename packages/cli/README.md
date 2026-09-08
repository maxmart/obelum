# @obelum/cli

Part of [Obelum](https://github.com/maxmart/obelum); the [repository README](https://github.com/maxmart/obelum#readme) lists the packages and the roadmap.

The `obelum` command: a Node host for [`@obelum/core`](../core) over plain
git. Which languages are behind, what a translator would be told, the four
verbs as commits, translation rounds with Claude, and an auditor for the
synced copies.

```sh
npm install -g @obelum/cli            # or npx @obelum/cli …
npm install @obelum/translator-claude # for `obelum translate`
```

## Setting up a repository

`obelum.json` at the repository root names the languages and where documents
live, as path patterns with one `{lang}` in them:

```sh
obelum init --langs sv,no,en --anchor mdx 'src/pages/{lang}/**/*.mdx' 'content/*/{lang}/*.mdx'
git add obelum.json && git commit -m "obelum.json"
obelum mark --all          # every language synced to every other, as the files stand; one commit
```

A document is a pattern with `{lang}` left in: `src/pages/{lang}/pricing.mdx`
names every language's file at once. Its synced copies live at
`.obelum/<viewer>/<real path>`, one directory at the repository root. Two
lines worth adding to `.gitattributes`:

```
.obelum/** linguist-generated=true
*.mdx text eol=lf
```

`anchor` says which lines a brief's diff names its hunks after: `mdx` (a
line starting with `<`), `markdown` (a heading), or `git` (the default, a
line starting with a letter). `instructions` may name a file whose contents
are handed to the translator verbatim, a glossary and format rules.

## Commands

```
obelum status [--all] [--json]         which languages are behind, per document
obelum brief <file> [--json]           what a translator would be told for <file>
obelum edit <file>                     commit the working copy of <file> as an edit
obelum fix <file>                      … as a fix, merged into every sibling's copy
obelum sync <file> [--from <path>|-]   … as a sync; content from a file, stdin, or the working copy
obelum mark <file> | mark --all        mark one language, or every document, as synced
obelum translate <file> [--all]        translate <file> from its siblings with Claude
obelum check [--merges N] [--json]     audit .obelum/
```

`<file>` is a real path such as `src/pages/sv/pricing.mdx`; the document and
the language are read off it.

**Reads are HEAD's, and every verb is one commit.** A file edited by hand is
taken in by `obelum edit <file>`, which commits it; before that, `status` does
not see the change. `fix` and `sync` work the same way on the working copy,
so the flow for a correction is: edit the file, `obelum fix <file>`. A
translation produced elsewhere lands with `obelum sync <file> --from
translation.mdx` or `… --from -` on stdin.

### status

```
$ obelum status
src/pages/{lang}/pricing.mdx
    sv: ok   no: ok   en: stale (no)
23 documents, 1 with a language behind
```

Only documents with a language behind are listed; `--all` lists every one. A
missing language shows as `missing`, and is not counted as behind: it is a
state of the language, not staleness.

### translate

```
$ ANTHROPIC_API_KEY=… obelum translate src/pages/en/pricing.mdx
translating src/pages/en/pricing.mdx from no…
sync src/pages/en/pricing.mdx: committed
```

With `--all`, every language of the document that is behind or missing is
translated in turn, as one round: when the round closes, a language whose
edit everyone has now translated is marked as synced (its copy of itself
catches up; see `syncAll` in core). A translation that does not complete is
not saved and the command exits 1.

### check

```
$ obelum check
orphan: .obelum/sv/src/pages/no/old-name.mdx
    src/pages/no/old-name.mdx is not in the tree; delete the copy, or move it with the file
1 finding
```

Reports copies for a language not in the config, copies of files that no
longer exist (a rename or delete without its copies), copies with merge
conflict markers, and merge commits resolved by picking sides per file, where
a language's copy of a sibling came from one parent and the real sibling from
the other, so the language claims a sync it never made. Exits 1 with findings.

## As a library

```ts
import { run } from '@obelum/cli';
const code = await run(['status', '--json'], { cwd, stdout: console.log, stderr: console.error });
```

`run` takes the same arguments as the binary and an `Io`; a `translator`
factory in the `Io` stands in for Claude, which is how the tests script it.

## Not yet

Documents whose language is not a path segment (an unprefixed default locale
at the pages root) have no pattern here yet. The copies live in the working
directory; a host on git objects alone, with `.obelum/` sparse-checked-out,
is on the roadmap.

## License

MIT.
