# Roadmap

What Obelum is meant to grow into, in the order it should happen. None of this
is started.

## `@obelum/store` — the `.obelum/` folder

Today the revision bookkeeping (`rev`, `synced`) lives wherever the host puts
it; the CMS that Obelum came out of keeps it in each document's frontmatter.
`store` moves it into a `.obelum/` folder next to the documents, the way
`.git` sits next to a working tree, so that:

- any file format can be tracked, not only ones with a frontmatter;
- the documents themselves are never rewritten for bookkeeping.

Design points already settled:

- **One store per repository**, keyed by repository-relative path. Documents
  can be shared between several sites in one repo, so per-site would not work.
- **A file port, not a filesystem.** `store` takes read/write/list/remove as
  arguments. A browser hands it an in-browser filesystem, Node hands it `fs`.
- **Content hashes, git's recipe.** Every revision is recorded with the oid of
  its content: sha1 over `blob <length>\0<content>`, hashed over the bytes as
  stored (no normalisation; the caller normalises if it wants to). Because
  that is exactly git's blob id, when git is present the store keeps no
  content of its own and reads old revisions straight from git. Without git,
  the store keeps the referenced blobs under `.obelum/objects/` and drops a
  blob once no language's clock references it any more.
- **Oids are what make conflicts visible.** Two editors bumping the same
  document from rev 6 to rev 7 offline produce equal counters that the
  vector clock cannot tell apart; two different oids at the same rev can.
  Merging two store entries is then mechanical: same oid, nothing to do;
  different oids with one rev ahead, take the newer; different oids at the
  same rev, a conflict for whatever resolves conflicts.
- **`readAtRev` becomes a lookup.** The history cursor in `core` walks commits
  and parses each version to find a revision. With oids recorded per rev it
  is a map lookup followed by one blob read.

Deferred until Obelum has a real consumer on the new layout, so the contract
gets tested by one rather than designed in the abstract.

## `@obelum/cli`

A Node host over `core` and `store`:

```
obelum status                      which languages of which documents are behind
obelum diff docs/en/pricing.md sv  the anchored diff since sv last synced
obelum bump docs/en/pricing.md     record a new revision after an edit (a git hook can call this)
obelum translate ... --with claude drive a translator package
```

It hands `store` Node's `fs` and a `CommitReader` built on plain `git`
commands. A CMS hands the same packages a browser filesystem and
isomorphic-git. That is the test of the layering: same `core`, same `store`,
two hosts, nothing shared between the hosts.

## More translators

`runTranslation` in core takes any `Translator`. Claude is the one that
exists. Candidates: another model, a translation service, a person at a
form (the runner shows what changed and takes back the result). Each is its
own package, `@obelum/translator-<name>`, and none of them owns the save
rule.

## Prompt verification for translators

The Claude translator's product is its prompts: the two system prompts, the
user message layout, the tool design, and the rule that an unanswered failed
edit means the run is not complete. Its unit tests pin the plumbing, not the
quality.

The CMS this came out of has an evaluation suite for that (scenario
documents, recorded transcripts keyed to the exact prompts, a harness that
checks a translation against what the scenario allows). It stayed behind
because it ran on a git store. With the per-document `TranslationDeps`
contract it needs only an in-memory implementation of five methods, so it
should move here, and grow into a small dev UI: a playground to run a
scenario against a prompt change and see the transcript and the verdict, so
prompt regressions are caught before they ship.

One thing to hold onto meanwhile: the prompts are format-agnostic, and the
format's own rules (for MDX, "the frontmatter's `layout` and the `import`
lines are code, never translate them") arrive through `instructions`. A host
that forgets to send them gets worse translations, and only an eval would
notice.
