/**
 * Runs every case through the real translator, once per variant (a diff
 * style, an approach, a fix mode) and per repeat, checks each result, and
 * prints a table. Everything a run saw and said goes to results/<time>.json,
 * for reading afterwards.
 *
 *   npm run eval                                       every case, as the translator ships
 *   npm run eval -- --case locality --repeat 3         cases whose id contains "locality"
 *   npm run eval -- --approach batch,check,plan        one column per approach
 *   npm run eval -- --style hunks,cc:claude-opus-5-5   the translator beside Claude Code
 *
 * Flags: --case <text> (repeatable), --style hunks,inline,diff,cc,cc:<model> (cc
 * is Claude Code itself, claude -p; see claude-code.ts), --cc-mode <permission
 * mode, default acceptEdits>, --cc-bash (let cc use Bash), --approach
 * batch,check,plan (how the translator works; see its approach option), --fix merged,kept
 * (how a fix step treats the fixer's own copy; see FixMode), --repeat <n>,
 * --concurrency <n>, --model <id>, --effort <level>, --judge,
 * --judge-model <id>, --verbose (show the diff of every failed result),
 * --mode peers,single (single runs each case whose steps change one language
 * other than the target in single-source mode, with that language as the
 * source; the others are skipped), --dry (print each prompt and stop; no key,
 * no API call). Defaults are the translator's own: hunks, plan, merged, peers.
 *
 * The key comes from ANTHROPIC_API_KEY, or from evals/.env.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { createPatch } from 'diff';
import { claude, driveClaudeAgent, type Approach, type DiffStyle, type DriveFn, type ToolReply, type TranslationEvent } from '@obelum/translator-claude';
import { sourceOf, stage, type Case, type FixMode, type Mode } from './case.js';
import { cases as allCases } from './cases/index.js';
import { judge, judgeUsage, type Verdict } from './judge.js';
import { request, runClaudeCode } from './claude-code.js';
import { dollars, TRANSLATOR_DEFAULT, TRANSLATOR_EFFORT } from './prices.js';

type Style = DiffStyle | 'cc';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const { values: args } = parseArgs({
  args: process.argv.slice(2).filter(a => a !== '--'),
  options: {
    case: { type: 'string', multiple: true },
    style: { type: 'string', default: 'hunks' },
    fix: { type: 'string', default: 'merged' },
    approach: { type: 'string', default: 'plan' },
    mode: { type: 'string', default: 'peers' },
    repeat: { type: 'string', default: '1' },
    concurrency: { type: 'string', default: '4' },
    model: { type: 'string' },
    effort: { type: 'string' },
    'cc-mode': { type: 'string', default: 'acceptEdits' },
    'cc-bash': { type: 'boolean', default: false },
    judge: { type: 'boolean', default: false },
    'judge-model': { type: 'string', default: 'claude-opus-5-5' },
    verbose: { type: 'boolean', default: false },
    dry: { type: 'boolean', default: false },
  },
});

// A style is one of the translator's diff styles, or `cc` / `cc:<model>`:
// Claude Code itself (claude -p), asked in plain words; see claude-code.ts.
const styles = args.style.split(',').map(s => s.trim());
for (const s of styles) if (!['hunks', 'inline', 'diff'].includes(s) && !/^cc(:.+)?$/.test(s)) throw new Error(`unknown style: ${s}`);
const fixModes = args.fix.split(',').map(s => s.trim()) as FixMode[];
for (const f of fixModes) if (f !== 'merged' && f !== 'kept') throw new Error(`unknown fix mode: ${f}`);
const approaches = args.approach.split(',').map(s => s.trim()) as Approach[];
for (const a of approaches) if (!['batch', 'check', 'plan'].includes(a)) throw new Error(`unknown approach: ${a}`);
const modes = args.mode.split(',').map(s => s.trim()) as Mode[];
for (const m of modes) if (m !== 'peers' && m !== 'single') throw new Error(`unknown mode: ${m}`);

/** One column of the table: a diff style (or Claude Code), a fix mode, an
 *  approach and a mode. Its label names only what varies between columns. */
interface Variant { style: Style; ccModel?: string; fix: FixMode; approach: Approach; mode: Mode; label: string }
const variants: Variant[] = styles.flatMap(s => fixModes.flatMap(fix => approaches.flatMap(approach => modes.map(mode => ({
  style: (s.startsWith('cc') ? 'cc' : s) as Style,
  ccModel: s.startsWith('cc:') ? s.slice(3) : undefined,
  fix, approach, mode,
  label: [
    styles.length > 1 || (fixModes.length === 1 && approaches.length === 1 && modes.length === 1) ? s : '',
    fixModes.length > 1 ? fix : '',
    approaches.length > 1 ? approach : '',
    modes.length > 1 ? mode : '',
  ].filter(Boolean).join('/'),
})))));
/** Single-source mode applies to a case only when one language changes. */
const applies = (c: Case, v: Variant) => v.mode === 'peers' || sourceOf(c) !== null;
const repeat = Number(args.repeat);
const cases =args.case?.length ? allCases.filter(c => args.case!.some(f => c.id.includes(f))) : allCases;
if (!cases.length) { console.error('No case matches.'); process.exit(1); }

if (args.dry) {
  for (const c of cases) for (const v of variants) {
    if (!applies(c, v)) continue;
    const { session } = await stage(c, v.fix, v.mode);
    if (v.style === 'cc') {
      console.log(`\n━━ ${c.id} (${v.label}) ━━\n${request(c, await session.brief(c.target))}`);
      continue;
    }
    const probe: DriveFn = async function* (opts) {
      console.log(`\n━━ ${c.id} (${v.label}) ━━\n${opts.system}\n\n── user ──\n${opts.userMessage}`);
      yield { type: 'stop', reason: 'end_turn' };
    };
    await claude({ apiKey: 'dry', instructions: c.instructions, diffStyle: v.style, approach: v.approach, drive: probe }).run(await session.brief(c.target));
  }
  process.exit(0);
}

try { process.loadEnvFile(here('../.env')); } catch { /* no .env: the environment must have the key */ }
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY is not set. Put it in evals/.env (ANTHROPIC_API_KEY=sk-ant-...) or the environment.');
  process.exit(1);
}


interface Usage { input: number; cacheWrite: number; cacheRead: number; output: number; turns: number }

interface RunResult {
  case: string;
  variant: string;
  style: Style;
  fix: FixMode;
  mode: Mode;
  rep: number;
  complete: boolean;
  /** Every check passed on a complete result. The judge is reported apart. */
  pass: boolean;
  checks: { label: string; ok: boolean; error?: string }[];
  judge?: Verdict;
  edits: number;
  editFailures: number;
  usage: Usage;
  seconds: number;
  error?: string;
  before: string;
  output: string;
  reasoning: string;
  prompt: { system: string; user: string };
  /** What the run cost, as its harness reported it (Claude Code); when
   *  absent, priced from `usage`. */
  cost?: number;
  /** Claude Code's tool calls, in order. */
  actions?: string[];
  /** The questions the translator raised; no one answers them in an eval. */
  questions?: { question: string; options: string[]; guess: string; answer: string | null }[];
}

const judgeClient = args.judge ? new Anthropic({ apiKey }) : undefined;

/** The case's checks on a result, and the judge's verdict when asked for. */
async function score(c: Case, brief: Awaited<ReturnType<Awaited<ReturnType<typeof stage>>['session']['brief']>>, output: string, questions: string[] = []) {
  const checks = c.checks.map(check => {
    try { return { label: check.label, ok: check.ok(output, brief.targetContent, { questions }) }; }
    catch (err) { return { label: check.label, ok: false, error: String(err) }; }
  });
  let verdict: Verdict | undefined;
  if (judgeClient) {
    try { verdict = await judge(judgeClient, args['judge-model'], c, brief, output); }
    catch (err) { verdict = { pass: false, reason: `judge failed: ${err}` }; }
  }
  return { checks, verdict };
}

async function runOne(c: Case, v: Variant, rep: number): Promise<RunResult> {
  const { style } = v;
  const { session, store } = await stage(c, v.fix, v.mode);
  const brief = await session.brief(c.target);
  if (style === 'cc') {
    const r = await runClaudeCode(c, brief, store, { model: v.ccModel, effort: args.effort, mode: args['cc-mode'], bash: args['cc-bash'] });
    const { checks, verdict } = await score(c, brief, r.output);
    return {
      case: c.id, variant: v.label, style, fix: v.fix, mode: v.mode, rep, complete: r.complete,
      pass: r.complete && checks.every(ch => ch.ok),
      checks, judge: verdict,
      edits: 0, editFailures: 0,
      usage: { ...r.usage, turns: r.turns },
      seconds: r.seconds, error: r.error,
      before: brief.targetContent, output: r.output, reasoning: r.said, actions: r.actions,
      prompt: { system: '(Claude Code)', user: r.prompt },
      cost: r.cost,
    };
  }
  const usage: Usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, turns: 0 };
  let prompt = { system: '', user: '' };
  const actions: string[] = [];
  const drive: DriveFn = opts => {
    prompt = { system: opts.system, user: opts.userMessage };
    // Passed through as is; only each tool call is noted on its way out.
    const inner = driveClaudeAgent({
      ...opts,
      ...(args.model ? { model: args.model } : {}),
      ...(args.effort ? { effort: args.effort as never } : {}),
      onUsage: u => {
        usage.turns++;
        usage.input += u.input_tokens;
        usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
        usage.cacheRead += u.cache_read_input_tokens ?? 0;
        usage.output += u.output_tokens;
      },
    });
    return (async function* () {
      let reply: ToolReply | undefined;
      while (true) {
        const { value, done } = await inner.next(reply);
        if (done) return;
        if (value.type === 'tool_use') actions.push(`${value.name}: ${JSON.stringify(value.input).slice(0, 160)}`);
        reply = yield value;
      }
    })();
  };
  const translator = claude({ apiKey: apiKey!, instructions: c.instructions, diffStyle: style, approach: v.approach, drive });

  const started = Date.now();
  const events: TranslationEvent[] = [];
  for await (const e of translator.translate(brief)) events.push(e);
  const done = events.find(e => e.type === 'done');
  const output = done?.type === 'done' ? done.finalContent : brief.targetContent;
  const complete = done?.type === 'done' && done.complete;

  const questions = events.flatMap(e => (e.type === 'question' ? [{ question: e.question, options: e.options, guess: e.guess, answer: e.answer }] : []));
  const { checks, verdict } = await score(c, brief, output, questions.map(q => [q.question, ...q.options].join(' ')));
  const errors = events.flatMap(e => (e.type === 'error' ? [e.error] : []));
  return {
    case: c.id, variant: v.label, style, fix: v.fix, mode: v.mode, rep, complete,
    pass: complete && checks.every(ch => ch.ok),
    checks, judge: verdict,
    edits: events.filter(e => e.type === 'edit').length,
    editFailures: errors.filter(e => e.startsWith('Edit failed')).length,
    usage,
    seconds: (Date.now() - started) / 1000,
    error: errors.find(e => !e.startsWith('Edit failed')),
    before: brief.targetContent,
    output,
    reasoning: events.flatMap(e => (e.type === 'reasoning' ? [e.text] : [])).join(''),
    prompt,
    actions,
    questions,
  };
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ── run ───────────────────────────────────────────────────────────────────

// The code a run tests is the code as it stands when the run starts: files
// edited while it runs do not change what it runs, and must not make it
// look dirty.
const git = (cmd: string) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const gitAtStart = { commit: git('rev-parse --short HEAD'), dirty: git('status --porcelain') !== '' };

const jobs = cases.flatMap(c => variants.filter(v => applies(c, v)).flatMap(v => Array.from({ length: repeat }, (_, rep) => ({ c, v, rep }))));
console.log(`${cases.length} cases × ${variants.map(v => v.label).join(', ')} × ${repeat} = ${jobs.length} runs${args.model ? ` on ${args.model}` : ''}${args.judge ? `, judged by ${args['judge-model']}` : ''}\n`);

const labelWidth = Math.max(...variants.map(v => v.label.length));
const results = await pool(jobs, Number(args.concurrency), async ({ c, v, rep }) => {
  const r = await runOne(c, v, rep);
  const failed = r.checks.filter(ch => !ch.ok).map(ch => ch.label);
  const why = [
    !r.complete && `incomplete${r.error ? `: ${r.error}` : ''}`,
    ...failed,
    r.judge && !r.judge.pass && `judge: ${r.judge.reason}`,
  ].filter(Boolean);
  const mark = r.pass && (r.judge?.pass ?? true) ? '✓' : '✗';
  console.log(`${mark} ${v.label.padEnd(labelWidth)} ${c.id}${repeat > 1 ? ` #${rep + 1}` : ''}  ${r.seconds.toFixed(1)}s${why.length ? `\n    ${why.join('\n    ')}` : ''}`);
  if (args.verbose && !r.pass) console.log(createPatch(c.target, r.before, r.output, 'before', 'after').split('\n').slice(4).map(l => `    ${l}`).join('\n'));
  return r;
});

// ── summary ───────────────────────────────────────────────────────────────

const width = Math.max(20, ...cases.map(c => c.id.length)) + 2;
const cell = (s: string) => s.padStart(Math.max(10, labelWidth + 2));
console.log(`\n${'case'.padEnd(width)}${variants.map(v => cell(v.label)).join('')}`);
for (const c of cases) {
  const row = variants.map(v => {
    const rs = results.filter(r => r.case === c.id && r.variant === v.label);
    return cell(rs.length ? `${rs.filter(r => r.pass).length}/${rs.length}` : '–');
  });
  console.log(`${c.id.padEnd(width)}${row.join('')}`);
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stat = (label: string, f: (rs: RunResult[]) => string) =>
  console.log(`${label.padEnd(width)}${variants.map(v => cell(f(results.filter(r => r.variant === v.label)))).join('')}`);
console.log('');
stat('checks passed', rs => `${Math.round((100 * rs.filter(r => r.pass).length) / rs.length)}%`);
if (args.judge) stat('judge passed', rs => `${Math.round((100 * rs.filter(r => r.judge?.pass).length) / rs.length)}%`);
stat('incomplete', rs => String(rs.filter(r => !r.complete).length));
stat('failed edits / run', rs => mean(rs.map(r => r.editFailures)).toFixed(2));
stat('turns / run', rs => mean(rs.map(r => r.usage.turns)).toFixed(2));
stat('input tok / run', rs => Math.round(mean(rs.map(r => r.usage.input + r.usage.cacheWrite + r.usage.cacheRead))).toString());
stat('output tok / run', rs => Math.round(mean(rs.map(r => r.usage.output))).toString());
stat('seconds / run', rs => mean(rs.map(r => r.seconds)).toFixed(1));
const translatorModel = args.model ?? TRANSLATOR_DEFAULT;
stat('$ / run', rs => '$' + mean(rs.map(r => (r.cost ?? dollars(translatorModel, r.usage)))).toFixed(4));

const spent = results.reduce((sum, r) => sum + (r.cost ?? dollars(translatorModel, r.usage)), 0);
const judged = args.judge ? dollars(args['judge-model'], judgeUsage) : 0;
console.log(`\nCost: $${spent.toFixed(2)} translating${args.judge ? `, $${judged.toFixed(2)} judging` : ''} (list prices; NaN means a model with no price here)`);

fs.mkdirSync(here('../results'), { recursive: true });
const file = here(`../results/${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify({
  commit: gitAtStart.commit,
  dirty: gitAtStart.dirty,
  model: translatorModel, effort: args.effort ?? TRANSLATOR_EFFORT,
  args, results,
}, null, 2));
console.log(`\nEverything each run saw and said: ${file}`);
