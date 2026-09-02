# Obelum

Keeping translations of one document in step, without a server.

| package | what it is |
|---|---|
| [`@obelum/core`](packages/core) | the engine: vector clocks, anchored diffs, and a history cursor. No dependencies, no I/O. |
| [`@obelum/translator-claude`](packages/translator-claude) | a translator that applies what changed in one language to another, driven by Claude. Depends on core and the Anthropic SDK. |

Planned: `@obelum/store`, which keeps revisions in a `.obelum/` folder next to
the documents so any file format can be tracked, and a CLI on top of both.

```sh
npm install
npm test
npm run build
```

MIT.
