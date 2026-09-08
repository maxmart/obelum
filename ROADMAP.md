# Roadmap

What Obelum is meant to grow into, in the order it should happen.

## `@obelum/cli` — started

`packages/cli` has `status`, `brief`, the four verbs, `translate` (one
language or a round), `mark --all` for migration, and `check`. Still to do:
documents whose language is not a path segment (an unprefixed default
locale) and `translate` over every document at once.

## Browser hosts on git objects alone

The CLI already works on objects: reads from HEAD, commits built from blobs
and a temporary index, and copies kept off disk under a sparse checkout. The
browser host (plinto over isomorphic-git) still reads and writes the copies
through its filesystem. The same shape applies there — `writeBlob`,
`writeTree`, `commit` — and would keep the copies out of lightning-fs.

## Hunk-level fix

A fix whose merge conflicts on one hunk leaves that sibling's copy untouched
entirely, and the sibling sees the whole fix as news. Applying the clean
hunks and leaving only the conflicting one (`diff3Merge` gives the regions)
would narrow what the sibling is told. A refinement, not a correctness
matter; measure how often whole-file conflicts happen on real fixes first.

## More translators

A translator takes core's brief and returns content, or nothing when the
run did not complete; the host saves it with `sync`. Claude is the one that
exists. Candidates: another model, a translation service, a person at a
form (shown what changed, handing back the result). Each is its own package,
`@obelum/translator-<name>`, and each owns its own completeness rule.

## Prompt verification for translators

The Claude translator's product is its prompts: the two system prompts, the
user message layout, the tool design, and the rule that an unanswered failed
edit means the run is not complete. Its unit tests pin the plumbing, not the
quality.

The CMS this came out of has an evaluation suite for that (scenario
documents, recorded transcripts keyed to the exact prompts, a harness that
checks a translation against what the scenario allows). It stayed behind
because it ran on a git store. With core's document (a file per language,
the synced copies, a commit) it needs only an in-memory implementation, so it
should move here, and grow into a small dev UI: a playground to run a
scenario against a prompt change and see the transcript and the verdict, so
prompt regressions are caught before they ship.

One thing to hold onto meanwhile: the prompts are format-agnostic, and the
format's own rules (for MDX, "the frontmatter's `layout` and the `import`
lines are code, never translate them") arrive through `instructions`. A host
that forgets to send them gets worse translations, and only an eval would
notice.
