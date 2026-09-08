/**
 * A translator for Obelum, backed by Claude.
 *
 *   import { obelum } from '@obelum/core';
 *   import { claude } from '@obelum/translator-claude';
 *
 *   const content = await claude({ apiKey }).run(await session.brief('sv'));
 *   if (content) await session.sync('sv', content);
 *
 * It owns its own agent loop (claude/stream.ts) rather than sharing one with
 * anything else, so it can be used on its own. What it does not own is the
 * document: what changed comes from @obelum/core's brief, and saving the
 * result is the host's sync.
 */
export {
  claude,
  translateWithClaude,
  type ClaudeTranslator,
  type ClaudeTranslatorOptions,
  type RunOptions,
  type TranslationEvent,
  type DriveFn,
} from './claude.js';
export {
  driveClaudeAgent,
  applyTextEdit,
  type AgentStreamEvent,
  type ToolReply,
  type ClaudeAgentOptions,
} from './claude/stream.js';
export { claudeErrorMessage } from './claude/client.js';
