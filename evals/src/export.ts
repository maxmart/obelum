/**
 * A case as a folder to try by hand: the pages as they stand after the
 * case's steps, the request Claude Code gets in the eval (PROMPT.md), and
 * what a good result must satisfy (CHECKS.md).
 *
 *   npm run export -w evals -- --case two-places-price --out ../../try
 *
 * Every case whose id contains --case gets a subfolder named after it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { stage } from './case.js';
import { cases } from './cases/index.js';
import { pagePath, request } from './claude-code.js';

const { values: args } = parseArgs({
  args: process.argv.slice(2).filter(a => a !== '--'),
  options: { case: { type: 'string', multiple: true }, out: { type: 'string' } },
});
if (!args.case?.length || !args.out) {
  console.error('usage: npm run export -- --case <text> [--case <text>…] --out <dir>');
  process.exit(2);
}
const chosen = cases.filter(c => args.case!.some(f => c.id.includes(f)));
if (!chosen.length) { console.error('No case matches.'); process.exit(1); }

for (const c of chosen) {
  const dir = path.resolve(process.env.INIT_CWD ?? process.cwd(), args.out, c.id.replace(/\//g, '-'));
  const { session, store } = await stage(c);
  const brief = await session.brief(c.target);
  for (const lang of c.langs) {
    const content = store.get(lang);
    if (content === undefined) continue;
    const p = path.join(dir, pagePath(c, lang));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  fs.writeFileSync(path.join(dir, 'PROMPT.md'), request(c, brief) + '\n');
  fs.writeFileSync(path.join(dir, 'CHECKS.md'),
    `# ${c.id}\n\n${c.about}\n\nThe eval passes a result when all of these hold:\n\n${c.checks.map(ch => `- ${ch.label}`).join('\n')}\n`);
  console.log(`${c.id} → ${dir}`);
}
