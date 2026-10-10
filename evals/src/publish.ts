/**
 * A results file made fit to publish: everything the report shows, in one
 * self-contained file under published/, which is committed (results/ is
 * not). Each case is staged again from the code at hand, to add what the
 * results file does not hold: what the case tests, what changed in the
 * other languages, the check labels, and whether no change is the right
 * answer. Run it at the commit that produced the results, which it checks.
 *
 *   npm run publish-results -w evals                     the newest file in results/
 *   npm run publish-results -w evals -- results/<file>   a given one
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, type FixMode, type Mode } from './case.js';
import { cases } from './cases/index.js';
import { dollars, TRANSLATOR_DEFAULT, TRANSLATOR_EFFORT } from './prices.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export interface PublishedRun {
  rep: number;
  pass: boolean;
  complete: boolean;
  error?: string;
  checks: { label: string; ok: boolean }[];
  before: string;
  output: string;
  /** The model's own words: its plan and its summary. */
  reasoning: string;
  /** Its tool calls, in order. */
  actions: string[];
  /** What it asked, and the answer if anyone gave one. */
  questions?: { question: string; options: string[]; guess: string; answer: string | null }[];
  prompt: { system: string; user: string };
  edits: number;
  turns: number;
  tokens: { input: number; output: number };
  cost: number;
  seconds: number;
}

export interface PublishedCase {
  id: string;
  about: string;
  target: string;
  langs: string[];
  /** What the brief showed: each other language's diff (or whole file, when
   *  the target never saw it), and the target's own unsynced edits. */
  changes: { lang: string; own: boolean; whole: boolean; text: string }[];
  /** The right answer is to leave the target as it was. */
  expectUnchanged: boolean;
  runs: PublishedRun[];
}

export interface Published {
  version: 1;
  date: string;
  commit: string;
  dirty: boolean;
  model: string;
  effort: string;
  style: string;
  approach: string;
  fix: string;
  /** 'peers', or 'single' for single-source mode. */
  mode: string;
  repeat: number;
  cases: PublishedCase[];
}

const arg = process.argv.slice(2).filter(a => a !== '--')[0];
const file = arg
  ? path.resolve(process.env.INIT_CWD ?? process.cwd(), arg)
  : (() => {
      const dir = here('../results');
      const newest = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().at(-1);
      if (!newest) throw new Error('No results file in results/.');
      return path.join(dir, newest);
    })();

const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const variants = [...new Set(raw.results.map((r: { variant: string }) => r.variant))];
if (variants.length !== 1) throw new Error(`One variant per published file; this one has ${variants.join(', ')}.`);

const head = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
if (raw.dirty) console.warn(`warning: the run was made from a tree with uncommitted changes (commit ${raw.commit}).`);
if (head !== raw.commit) console.warn(`warning: the run was made at ${raw.commit}, this is ${head}; cases are staged from the code here.`);

const first = raw.results[0];
const model: string = raw.model ?? raw.args.model ?? TRANSLATOR_DEFAULT;
const fix = first.fix as FixMode;
const mode = (first.mode ?? 'peers') as Mode;
// The results file's name is its time, with ':' and '.' made '-'.
const date = path.basename(file, '.json').replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, 'T$1:$2:$3.$4Z');

const published: Published = {
  version: 1,
  date,
  commit: raw.commit,
  dirty: raw.dirty,
  model,
  effort: raw.effort ?? raw.args.effort ?? TRANSLATOR_EFFORT,
  style: first.style,
  approach: raw.args.approach ?? 'plan',
  fix,
  mode,
  repeat: Number(raw.args.repeat ?? 1),
  cases: [],
};

for (const c of cases) {
  const runs = raw.results.filter((r: { case: string }) => r.case === c.id);
  if (!runs.length) continue;
  const { session } = await stage(c, fix, mode);
  const brief = await session.brief(c.target);
  const lf = (s: string) => s.replace(/\r\n/g, '\n').replace(/\n$/, '');
  published.cases.push({
    id: c.id,
    about: c.about,
    target: c.target,
    langs: c.langs,
    changes: brief.langDiffs.map(d => ({
      lang: d.lang,
      own: d.lang === c.target,
      whole: d.base === '',
      text: d.base === '' ? d.content : d.diff,
    })),
    expectUnchanged: lf(c.reference) === lf(brief.targetContent),
    runs: runs
      .sort((a: { rep: number }, b: { rep: number }) => a.rep - b.rep)
      .map((r: any): PublishedRun => ({
        rep: r.rep,
        pass: r.pass,
        complete: r.complete,
        error: r.error,
        checks: r.checks.map((ch: { label: string; ok: boolean }) => ({ label: ch.label, ok: ch.ok })),
        before: r.before,
        output: r.output,
        reasoning: r.reasoning,
        actions: r.actions ?? [],
        questions: r.questions ?? [],
        prompt: r.prompt,
        edits: r.edits,
        turns: r.usage.turns,
        tokens: { input: r.usage.input + r.usage.cacheWrite + r.usage.cacheRead, output: r.usage.output },
        cost: r.cost ?? dollars(model, r.usage),
        seconds: r.seconds,
      })),
  });
}

const out = here(`../published/${date.slice(0, 10)}-${model}${mode === 'single' ? '-single' : ''}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(published, null, 1) + '\n');
const runs = published.cases.flatMap(c => c.runs);
console.log(`${published.cases.length} cases, ${runs.length} runs, ${runs.filter(r => r.pass).length} passed → ${path.relative(process.cwd(), out)}`);
