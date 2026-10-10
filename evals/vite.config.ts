import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The evals run the packages' sources, not their builds: a prompt change is
// measured without a build step in between.
const src = (pkg: string) => fileURLToPath(new URL(`../packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@obelum/core': src('core'),
      '@obelum/translator-claude': src('translator-claude'),
    },
  },
  test: { globals: true, environment: 'node' },
});
