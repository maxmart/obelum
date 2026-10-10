# @obelum/translator-claude

Part of [Obelum](https://github.com/maxmart/obelum); the [repository README](https://github.com/maxmart/obelum#readme) lists the packages and the roadmap.

Brings one language of a document up to date with the others, driven by
Claude.

```sh
npm install @obelum/translator-claude @obelum/core
```

Given a document in several languages, each keeping a copy of what it last
saw of the others (see [`@obelum/core`](../core)), a run shows Claude what
changed in every language since the target last synced and asks it to apply
the equivalent changes. A language the target has never seen is shown in
full instead.

Edits arrive as exact string replacements the way a code agent makes them,
and a run whose edits did not all land is never saved.

## Use

```ts
import { obelum } from '@obelum/core';
import { claude } from '@obelum/translator-claude';

const session = obelum({
  langs: ['en', 'sv', 'no'],
  file:   lang   => file(`pages/${lang}/pricing.mdx`),
  synced: viewer => ({ file: lang => file(`.obelum/${viewer}/pages/${lang}/pricing.mdx`) }),
  commit: (verb, lang) => git.commit(`${verb} ${lang}`),
});

// Optional: a glossary and rules about which parts of the format are code,
// and someone to ask when the documents cannot settle what to write.
const translator = claude({ apiKey, instructions: glossary, ask: q => promptUser(q) });

const content = await translator.run(await session.brief('sv'), {
  onEvent: event => console.log(event),   // thinking, reasoning, edit, question, error, done
  isCancelled: () => false,
});
if (content) await session.sync('sv', content);
```

`run` returns the finished translation, or `null` when the run did not
complete: cancelled, stopped early, or an edit failed and was never put
right. Null is never saved; a partial translation stamped as synced would
hide the loss forever. `translate(brief)` is the same run as a stream of
events, for a host that wants to render them itself.

What changed comes from `@obelum/core`'s brief and saving the result is the
host's `sync`. This package only turns the brief into two prompts and three
tools (`edit_file` for targeted changes, `write_file` for a new or rewritten
document, `ask` for a question), applies the edits as they arrive, and
decides whether the result is complete. It never reads a file or walks a git
log.

The prompt describes the job, not a procedure: understand each change and
why it was made, then make the edits its author would have made in the
target. One change may need several edits or none, and the target keeps what
it does its own way. With a single-source brief (`brief.source`), it says the
target was translated from the source and corrected and localized by hand.
The model's plan and summary are in English.

When the documents cannot settle what to write (two languages give the same
fee different amounts, say), the model asks instead of guessing. With
`ask`, the host puts the question to a person and the answer goes back to
the model; without it, the question is a `question` event for the host to
log, and the content it is about is left as it was.

Options: `model` defaults to `claude-sonnet-5-5` (in `ClaudeAgentOptions`,
through `drive`). `approach`: `plan` (the default) writes out each change and
every place it concerns before editing, and checks each edit against the
lines around it; `check` skips the plan; `batch` is one shot. `diffStyle`:
`hunks` (the default) shows each sibling as the target last saw it plus a
diff; `inline` and `diff` are for comparison. The `evals/` folder of the
repository measures all of them.

For evaluations, `claude({ apiKey, drive })` replaces what talks to the model
with a recorded transcript or a probe; everything else runs for real.

## The API key

The key is passed per run and used directly, including from a browser. This
translator is meant to run where the documents are edited, which may be a
static site with no server behind it; the key is the editor's own. In Node
the same code path applies.

## License

MIT.
