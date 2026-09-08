# Obelum

Keeping translations of one document in step, without a server.

| package | what it is |
|---|---|
| [`@obelum/core`](packages/core) | the engine: every language keeps a copy of what it last saw of the others; staleness, the translator's brief and the fix fan-out are diffs and three-way merges against those copies. No I/O. |
| [`@obelum/translator-claude`](packages/translator-claude) | a translator that applies what changed in one language to another, driven by Claude. Depends on core and the Anthropic SDK. |
| [`obelum`](packages/obelum) | the unscoped name for `@obelum/core`; a re-export. |

See [ROADMAP.md](ROADMAP.md) for what comes next: a CLI, and prompt regression
testing for translators.

```sh
npm install
npm test
npm run build
```

MIT.
