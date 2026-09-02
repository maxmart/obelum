# @obelum/translator-claude

Brings one language of a document up to date with the others, driven by
Claude.

```sh
npm install @obelum/translator-claude @obelum/core
```

Given a document in several languages and, for each, a note of the revision
it last took from the others (see [`@obelum/core`](../core)), a run shows
Claude what changed in every language since the target last synced and asks
it to apply the equivalent changes. When there is no sync point yet, it
translates from the full current content instead.

Edits arrive as exact string replacements the way a code agent makes them,
and a run whose edits did not all land is never saved.

## The contract

Everything the run touches comes through `TranslationDeps`, bound to one
document by you:

```ts
import { runTranslation, type TranslationDeps } from '@obelum/translator-claude';

const deps: TranslationDeps = {
  locales: ['en', 'sv', 'no'],
  // The current version, or null when the document has no such language yet.
  read: async lang => ({ content: await readFile(lang), meta: metaOf(lang) }),
  // The content of `lang` as it stood at revision `rev`, or null if unknown.
  readAtRev: async (lang, rev) => historyLookup(lang, rev),
  // Keep bookkeeping lines out of what the model sees.
  dropLines: lines => lines.filter(l => !/^(rev|synced):/.test(l)),
  // Persist the result and record the sync.
  write: async (lang, content) => save(lang, content),
  // Optional: a glossary and rules about which parts of the format are code.
  instructions: async () => glossary,
};

const result = await runTranslation(deps, { targetLang: 'sv', apiKey }, {
  onLogItem: item => console.log(item),
  onStatusChange: status => console.log(status),
  isCancelled: () => false,
});
// 'done' | 'error' | 'cancelled'
```

The package never reads a file, parses a frontmatter, or walks a git log.
Where revisions live and how an older version is found are yours, so the
same translator works over frontmatter, a sidecar folder, or a database.

## The API key

The key is passed per run and used directly, including from a browser. This
translator is meant to run where the documents are edited, which may be a
static site with no server behind it; the key is the editor's own. In Node
the same code path applies.

## License

MIT.
