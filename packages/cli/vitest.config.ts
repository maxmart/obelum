import { defineConfig } from 'vitest/config';

// No aliases, no setup, no environment. If this file ever needs one of those,
// something has been added to the engine that does not belong in it.
export default defineConfig({
  test: { globals: true, environment: 'node' },
});
