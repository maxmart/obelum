# Roadmap

What Obelum is meant to grow into, in the order it should happen.

## `@obelum/cli` — started

`packages/cli` has `status`, `brief`, the four verbs, `translate` (one
language or a round), `mark --all` for migration, and `check`. Still to do:
documents whose language is not a path segment (an unprefixed default
locale), `translate` over every document at once, and reading copies from
git objects rather than the working directory (next section).

## Hosts on git objects alone

Core reads and writes only through the host's `file()`, so a host can keep
the copies out of the working directory entirely: read `HEAD:path`, write
with `hash-object` and `update-index` (isomorphic-git's `writeBlob` and
`writeTree` in the browser), and let a sparse checkout exclude `.obelum/`.
The verbs do not change; only the five lines of the host's `file()` do. What
it needs from a host is a commit that combines the checkout's index with the
object-only paths, which is where the work is.

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
