/**
 * The deployed site: every file in published/ at /evals/<commit>/, and a
 * list of them at /evals/, newest first. A run's address never changes when
 * a newer one is published, so a link to it (from a blog post, say) keeps
 * pointing at the numbers and notes it quoted.
 *
 *   npm run site -w evals -- --out _site/evals
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { Published } from './publish.js';
import { render, renderList } from './render.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const { values } = parseArgs({ args: process.argv.slice(2).filter(a => a !== '--'), options: { out: { type: 'string' } } });
const out = values.out ? path.resolve(process.env.INIT_CWD ?? process.cwd(), values.out) : here('../site');

const dir = here('../published');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
const items = files
  .map(f => ({ data: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Published }))
  .sort((a, b) => b.data.date.localeCompare(a.data.date));

// One directory per commit; a second run published at the same commit gets
// a suffix, so neither overwrites the other.
const used = new Set<string>();
const placed = items.map(({ data }) => {
  let name = data.commit + (data.mode === 'single' ? '-single' : '');
  for (let i = 2; used.has(name); i++) name = `${data.commit}-${i}`;
  used.add(name);
  return { dir: name, data };
});

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const { dir: d, data } of placed) render(data, path.join(out, d), { allRuns: '../', permalink: `../${d}/` });
renderList(placed, out);
console.log(`${placed.length} published run${placed.length === 1 ? '' : 's'} → ${path.relative(process.cwd(), out) || '.'}: ${placed.map(p => p.dir).join(', ')}`);
