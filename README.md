# Obelum

Keeping translations of one document in step, without a server.

| package | what it is |
|---|---|
| [`@obelum/core`](packages/core) | the engine: vector clocks, anchored diffs, and a history cursor. No dependencies, no I/O. |
| [`@obelum/translator-claude`](packages/translator-claude) | a translator that applies what changed in one language to another, driven by Claude. Depends on core and the Anthropic SDK. |

See [ROADMAP.md](ROADMAP.md) for what comes next: `@obelum/store` (a `.obelum/`
folder with git-style content hashes), a CLI, and prompt regression testing for translators.

```sh
npm install
npm test
npm run build
```

MIT.
