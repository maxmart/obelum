# Evals

The Claude translator run for real against staged documents, with each
result checked. Not published; lives beside the packages and runs their
sources directly.

```sh
echo ANTHROPIC_API_KEY=sk-ant-... > evals/.env     # gitignored

npm run eval -w evals                                          # every case, as the translator ships
npm run eval -w evals -- --case locality --repeat 3            # ids containing "locality", 3 times each
npm run eval -w evals -- --approach batch,check,plan           # one column per approach
npm run eval -w evals -- --style hunks,cc:claude-opus-5-5      # the translator beside Claude Code
npm run eval -w evals -- --judge --verbose                     # a model's verdict, diffs of failures
npm run eval -w evals -- --case identical --dry                # print the prompts; no key, no call
npm run export -w evals -- --case two-places --out ../try      # a case as a folder, to try by hand
```

Defaults are the translator's own: the `hunks` brief, the `plan` approach,
and its default model. Other flags: `--concurrency <n>` (4), `--model <id>`
and `--effort <level>` (override the translator's), `--judge-model <id>`
(claude-opus-5-5), `--fix merged,kept` (how a fix step treats the fixer's
own copy), `--cc-mode <mode>` and `--cc-bash` (Claude Code's permission
mode and whether it may use Bash). The runner needs Node 22 or later.

Each run prints one line, then a table: per case and style, how many runs
passed, and per style the pass rate, incomplete runs, failed edits, turns,
tokens and time. Everything a run saw and said (both prompts, the model's
text, the result, every check) goes to `results/<time>.json`, with the
commit it ran on.

## Styles

`hunks` shows each changed sibling as the file the target last saw, then a
three-line-context diff. `inline` shows it once, as a diff with every line
in it, so each change sits where it happens. `diff` shows the diff alone.
The translator's `diffStyle` option picks one; the default is `hunks`,
which these evals favour: `inline` costs as much, and `diff` misses
rewordings it cannot see the surroundings of.

`cc` and `cc:<model>` run Claude Code itself (`claude -p`) on the case's
pages in a temporary folder, asked in plain words, with none of the local
settings or MCP servers (`src/claude-code.ts`).

## Cases

A case (`src/case.ts`) is a document in memory, every language synced to
every other, then the steps a person took (`edit`, `fix`), then the target
to translate. The brief is whatever core computes from that. Checks are
plain string tests, chosen so they hold for any reasonable wording:

- `has`, `lacks`, `keeps` (target text that must survive verbatim), `count`, `inOrder`
- `inSection(heading, p)`: `p` is found under that heading
- `onlyTouches([from, to], …)`: nothing outside those lines of the target changed
- `sameWords`, `crlf`, `either` (for cases where more than one outcome is consistent)

The groups, in `src/cases/`:

- **basics**: one thing changed in a target shaped like the source.
- **structure**: the target is shaped differently: an extra section, a split
  paragraph, merged list items, reordered sections, a table where the
  source has a list, a section it left out.
- **locality**: finding the place: one change in a long page, blocks that
  read the same, scattered changes.
- **formats**: front matter, MDX props, code blocks, tables, a moved section,
  a rewrap, CRLF.
- **multi**: two siblings that changed, the target's own fix, a sibling the
  target never saw, siblings that disagree, a target that does not exist.

`npm test -w evals` needs no key: it checks every case stages a brief with
something to do, that its reference answer passes every check, and that leaving
the target untouched fails one. Write the reference first; it is how a
check that is wrong gets caught.

`--judge` asks a second model whether the update is faithful and whether
anything the checks do not name was lost. It is reported beside the checks,
not folded into them.

## Publishing a run

The results of a run are published as a static site at
[maxmart.github.io/obelum/evals](https://maxmart.github.io/obelum/evals/):
one row per case, and a page per case with what changed, each run's before
and after, its checks, the translator's notes and tool calls, and the full
prompt. Failures are published too.

```sh
git status                                  # the run must start from a clean tree
npm run eval -w evals -- --repeat 3         # every case, three times
npm run publish-results -w evals            # newest results/ file → published/<date>-<model>.json
npm run report -w evals                     # published/ → site/, to look at locally
```

`publish-results` stages every case again to add what the site shows but a
results file does not hold, so run it at the commit the run was made at; it
warns otherwise. Commit the file it writes. On push, the `Evals site`
workflow builds the site from the newest file in `published/`; it never runs
the evals, which cost money and need a key.
