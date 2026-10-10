/**
 * One published results file as a static site, to look at locally.
 *
 *   npm run report -w evals                                   newest file in published/ → site/
 *   npm run report -w evals -- published/<file> --out <dir>
 *
 * The site that is deployed is built by site.ts, from every published file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { Published } from './publish.js';
import { render } from './render.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const { values, positionals } = parseArgs({
  args: process.argv.slice(2).filter(a => a !== '--'),
  options: { out: { type: 'string' } },
  allowPositionals: true,
});
const cwd = process.env.INIT_CWD ?? process.cwd();
const input = positionals[0]
  ? path.resolve(cwd, positionals[0])
  : (() => {
      const dir = here('../published');
      const newest = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().at(-1);
      if (!newest) throw new Error('No file in published/. Run npm run publish-results first.');
      return path.join(dir, newest);
    })();
const out = values.out ? path.resolve(cwd, values.out) : here('../site');
const data: Published = JSON.parse(fs.readFileSync(input, 'utf8'));
render(data, out);
console.log(`${data.cases.length} case pages + index → ${path.relative(process.cwd(), out) || '.'}`);
