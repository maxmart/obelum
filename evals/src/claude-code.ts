/**
 * The same case, done by Claude Code instead of the translator: `claude -p`
 * in a directory holding the case's pages, asked the way a person would ask
 * it ("English changed, here is the diff, update the Swedish"), with its
 * own system prompt, tools and loop. The page it leaves behind is checked
 * like any other result.
 *
 * Settings, hooks, MCP servers and plugins are all left out
 * (--setting-sources "" --strict-mcp-config), and the directory is fresh,
 * so no project instructions apply. Not --bare: that also swaps in a
 * minimal system prompt, and the point is the harness as it is used.
 * Billing is ANTHROPIC_API_KEY's, like the translator's.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Brief } from '@obelum/core';
import type { Case } from './case.js';

const NAMES: Record<string, string> = { en: 'English', sv: 'Swedish', de: 'German', no: 'Norwegian' };
const name = (lang: string) => NAMES[lang] ?? lang;

export interface ClaudeCodeResult {
  output: string;
  complete: boolean;
  cost: number;
  turns: number;
  usage: { input: number; cacheWrite: number; cacheRead: number; output: number };
  seconds: number;
  prompt: string;
  said: string;
  /** Each tool call in order, as "Tool: input", to see what it did first. */
  actions: string[];
  error?: string;
}

export interface ClaudeCodeOptions {
  model?: string;
  effort?: string;
  /** --permission-mode; acceptEdits unless given. */
  mode?: string;
  /** Allow Bash, as an interactive session does. */
  bash?: boolean;
}

/** Where each language's page goes: pages/<lang>/page.md, or .mdx when it
 *  holds components. */
export function pagePath(c: Case, lang: string): string {
  const mdx = Object.values(c.files).some(f => /<[A-Z]\w*[\s>/]/.test(f));
  return `pages/${lang}/page.${mdx ? 'mdx' : 'md'}`;
}

/** The request, as a person would write it, from what the brief says. */
export function request(c: Case, brief: Brief): string {
  const t = brief.targetLang;
  const target = pagePath(c, t);
  const others = brief.langDiffs.filter(d => d.lang !== t);
  if (brief.targetContent === '') {
    return `Please create ${target}: a ${name(t)} translation of ${others.map(d => pagePath(c, d.lang)).join(' and ')}.` + rules(c);
  }
  const parts = others.map(d => d.base === ''
    ? `${pagePath(c, d.lang)} is a ${name(d.lang)} version the ${name(t)} page has never been updated against; read it in full.`
    : `The ${name(d.lang)} page (${pagePath(c, d.lang)}) changed. This is what changed since the ${name(t)} page was last updated against it:\n\n\`\`\`diff\n${d.diff}\n\`\`\``);
  const own = brief.langDiffs.find(d => d.lang === t);
  if (own) parts.push(`The ${name(t)} page has also been edited itself since then; keep those edits:\n\n\`\`\`diff\n${own.diff}\n\`\`\``);
  return `${parts.join('\n\n')}\n\nPlease update ${target} accordingly.` + rules(c);
}

const rules = (c: Case) => (c.instructions ? `\n\nFollow these rules:\n${c.instructions}` : '');

export async function runClaudeCode(c: Case, brief: Brief, pages: Map<string, string>, { model, effort, mode = 'acceptEdits', bash = false }: ClaudeCodeOptions = {}): Promise<ClaudeCodeResult> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obelum-cc-'));
  try {
    for (const lang of c.langs) {
      const content = pages.get(lang);
      if (content === undefined) continue;
      const p = path.join(dir, pagePath(c, lang));
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
    }
    const prompt = request(c, brief);
    const argv = [
      // stream-json (which needs --verbose) carries every message, so the
      // tool calls are there to read; its last line is the result object.
      '-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
      '--setting-sources', '', '--strict-mcp-config',
      '--permission-mode', mode, '--allowedTools', bash ? 'Read,Edit,Write,Grep,Glob,Bash' : 'Read,Edit,Write,Grep,Glob',
      ...(model ? ['--model', model] : []),
      ...(effort ? ['--effort', effort] : []),
    ];
    const started = Date.now();
    const { stdout, code } = await new Promise<{ stdout: string; code: number | null }>((resolve, reject) => {
      const proc = spawn('claude', argv, { cwd: dir, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      proc.stdout.setEncoding('utf8').on('data', d => { out += d; });
      proc.stderr.resume();
      proc.on('error', reject);
      proc.on('close', code => resolve({ stdout: out, code }));
      proc.stdin.end(prompt);
    });
    const seconds = (Date.now() - started) / 1000;
    // One JSON object per line; warnings (a connector notice, say) are not.
    const events = stdout.split('\n').flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
    const j = events.findLast(e => e.type === 'result') ?? null;
    const actions: string[] = events
      .filter(e => e.type === 'assistant')
      .flatMap(e => (e.message?.content ?? []).filter((b: { type: string }) => b.type === 'tool_use'))
      .map((b: { name: string; input: Record<string, unknown> }) =>
        `${b.name}: ${String(b.input.command ?? b.input.pattern ?? b.input.file_path ?? JSON.stringify(b.input)).slice(0, 160)}`);
    const target = path.join(dir, pagePath(c, brief.targetLang));
    const output = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    const u = j?.usage ?? {};
    return {
      output,
      complete: code === 0 && j?.is_error === false,
      cost: j?.total_cost_usd ?? NaN,
      turns: j?.num_turns ?? 0,
      usage: { input: u.input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 },
      seconds,
      prompt,
      said: j?.result ?? '',
      actions,
      error: j?.is_error ? String(j?.result ?? 'error') : code !== 0 ? `claude exited ${code}: ${stdout.slice(0, 300)}` : undefined,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}
