/**
 * The compiled output must load in plain Node, not only under a bundler.
 *
 * Vite and vitest resolve an extensionless `./staleness` to `staleness.ts`;
 * Node's ESM loader does not, and rejects the module. That shipped once, in
 * 0.1.0: every test was green and `import('@obelum/core')` failed for the
 * first person to install it. This runs Node itself against dist/, so the
 * bundler's leniency cannot hide the difference again.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/index.js');

describe('compiled output', () => {
  it.skipIf(!fs.existsSync(dist))('loads in plain Node', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(dist).href)})`], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
