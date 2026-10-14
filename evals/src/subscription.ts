/**
 * The translator's conversation, sent through Claude Code instead of the API,
 * so that a run is billed to the Claude subscription Claude Code is logged in
 * with instead of to ANTHROPIC_API_KEY.
 *
 * A DriveFn like driveClaudeAgent: the same system prompt (it replaces Claude
 * Code's own), the same user message, and the translator's own tools, offered
 * through an in-process MCP server whose handlers hand each call back to the
 * translator and wait for its reply. Claude Code's built-in tools, settings,
 * skills, plugins and CLAUDE.md files are all left out.
 *
 * What still differs from the API: the model sees the tools as
 * mcp__obelum__<name>, Claude Code frames the conversation in its own way,
 * and the cost is Claude Code's list-price estimate.
 *
 * Claude Code reaches the API through a local forwarder that passes every
 * request on to api.anthropic.com unchanged. Talking to Anthropic's host
 * directly, Claude Code turns on features of its own (tool search, an advisor
 * tool, a served model catalogue, its own dispatch); with them, one case
 * passed 1 to 3 times in 10 where the API passes 10 in 10, and Claude Code's
 * captured request replayed over the API passed 10 in 10. Through the
 * forwarder it passed 12 in 12.
 *
 * A run stops as soon as the subscription's limit is reached or extra usage
 * would be billed, and every run after it ends at once with that error.
 */
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import { createSdkMcpServer, query, tool, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { DriveFn, ToolReply } from '@obelum/translator-claude';

type Schema = { properties?: Record<string, { type: string; description?: string; items?: { type: string } }>; required?: string[] };

/** The translator's JSON schemas are flat: strings, numbers, string lists. */
function shapeOf(schema: Schema): Record<string, z.ZodType> {
  const required = new Set(schema.required ?? []);
  return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, p]) => {
    let t: z.ZodType = p.type === 'number' ? z.number() : p.type === 'array' ? z.array(z.string()) : p.type === 'boolean' ? z.boolean() : z.string();
    if (p.description) t = t.describe(p.description);
    return [key, required.has(key) ? t : t.optional()];
  }));
}

/** A queue the generator waits on. */
function channel<T>() {
  const items: T[] = [];
  let wake: (() => void) | null = null;
  return {
    push(item: T) { items.push(item); wake?.(); wake = null; },
    async next(): Promise<T> {
      while (!items.length) await new Promise<void>(r => (wake = r));
      return items.shift()!;
    },
  };
}

type Item =
  | { kind: 'message'; message: SDKMessage }
  | { kind: 'call'; name: string; input: Record<string, unknown>; answer: (reply: ToolReply) => void }
  | { kind: 'end'; error?: string };

export interface SubscriptionTotals {
  input: number; cacheWrite: number; cacheRead: number; output: number;
  turns: number;
  /** Claude Code's estimate at list prices. */
  cost: number;
}

/** The forwarder's address, started on first use and shared by every run. */
let forwarder: Promise<string> | null = null;
function forward(): Promise<string> {
  forwarder ??= new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const up = https.request({ host: 'api.anthropic.com', path: req.url, method: req.method, headers: { ...req.headers, host: 'api.anthropic.com' } }, r => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      });
      up.on('error', err => { res.writeHead(502); res.end(String(err)); });
      req.pipe(up);
    });
    server.listen(0, '127.0.0.1', () => {
      server.unref();
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
  return forwarder;
}

/** Set once a limit is reached; every later run ends with it. */
let stopped: string | null = null;

export function subscriptionDrive(onTotals: (t: SubscriptionTotals) => void): DriveFn {
  return async function* (opts) {
    if (stopped) {
      yield { type: 'error', error: stopped };
      yield { type: 'stop', reason: 'error' };
      return;
    }
    const queue = channel<Item>();
    const server = createSdkMcpServer({
      name: 'obelum',
      alwaysLoad: true,
      tools: opts.tools.map(t => tool(t.name, t.description ?? '', shapeOf(t.input_schema as Schema), input =>
        new Promise(resolve => queue.push({
          kind: 'call', name: t.name, input: input as Record<string, unknown>,
          answer: reply => resolve({ content: [{ type: 'text', text: reply.content }], isError: reply.isError }),
        })))),
    });
    // Billed to the login only when no key reaches Claude Code.
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    env.ANTHROPIC_BASE_URL = await forward();
    const abort = new AbortController();
    const q = query({
      prompt: opts.userMessage,
      options: {
        systemPrompt: opts.system,
        model: opts.model ?? 'claude-sonnet-5-5',
        thinking: { type: 'adaptive' },
        ...(opts.effort ? { effort: opts.effort } : {}),
        maxTurns: opts.maxTurns,
        tools: [],
        mcpServers: { obelum: server },
        allowedTools: opts.tools.map(t => `mcp__obelum__${t.name}`),
        permissionMode: 'dontAsk',
        settingSources: [],
        strictMcpConfig: true,
        skills: [],
        persistSession: false,
        verbatimPrompts: true,
        cwd: os.tmpdir(),
        env,
        abortController: abort,
      },
    });
    void (async () => {
      try {
        for await (const message of q) queue.push({ kind: 'message', message });
        queue.push({ kind: 'end' });
      } catch (err) {
        queue.push({ kind: 'end', error: String(err) });
      }
    })();

    const turns = new Set<string>();
    let calls = 0;
    try {
      while (true) {
        const item = await queue.next();
        if (item.kind === 'end') {
          if (item.error) yield { type: 'error', error: item.error };
          yield { type: 'stop', reason: 'error' };
          return;
        }
        if (item.kind === 'call') {
          const reply: ToolReply | undefined = yield { type: 'tool_use', id: `call_${++calls}`, name: item.name, input: item.input, turn: turns.size };
          item.answer(reply ?? { content: '' });
          continue;
        }
        const m = item.message;
        if (m.type === 'system' && m.subtype === 'init' && m.apiKeySource !== 'none' && m.apiKeySource !== 'oauth') {
          stopped = `Claude Code would bill ${m.apiKeySource}, not the subscription; log in with claude /login and unset any key.`;
          yield { type: 'error', error: stopped };
          yield { type: 'stop', reason: 'error' };
          return;
        }
        if (m.type === 'rate_limit_event') {
          const info = m.rate_limit_info;
          if (info.status === 'rejected' || info.isUsingOverage || info.overageInUse) {
            const resets = info.resetsAt ? `; it resets ${new Date(info.resetsAt * 1000).toLocaleString()}` : '';
            stopped = `Subscription limit reached (${info.rateLimitType ?? 'unknown'})${resets}. The run stops here instead of using extra usage.`;
            yield { type: 'error', error: stopped };
            yield { type: 'stop', reason: 'error' };
            return;
          }
        }
        if (m.type === 'assistant' && !m.parent_tool_use_id) {
          if (m.error) yield { type: 'error', error: `Claude Code: ${m.error}` };
          turns.add(m.message.id);
          for (const block of m.message.content) {
            if (block.type === 'thinking') yield { type: 'thinking' };
            else if (block.type === 'text' && block.text) yield { type: 'text', text: block.text };
          }
        }
        if (m.type === 'result') {
          const u = m.usage;
          onTotals({
            input: u.input_tokens, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, output: u.output_tokens,
            turns: turns.size, cost: m.total_cost_usd,
          });
          if (m.subtype === 'success') yield { type: 'stop', reason: 'end_turn' };
          else {
            yield { type: 'error', error: `Claude Code: ${m.subtype}${'errors' in m && m.errors.length ? `: ${m.errors.join('; ')}` : ''}` };
            yield { type: 'stop', reason: m.subtype === 'error_max_turns' ? 'max_turns' : 'error' };
          }
          return;
        }
      }
    } finally {
      abort.abort();
    }
  };
}
