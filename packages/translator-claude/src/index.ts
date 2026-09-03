/**
 * A Translator for Obelum, backed by Claude.
 *
 *   import { runTranslation } from '@obelum/core';
 *   import { claude } from '@obelum/translator-claude';
 *
 *   await runTranslation(deps, claude({ apiKey }), { targetLang: 'sv' }, callbacks);
 *
 * It owns its own agent loop (claude/stream.ts) rather than sharing one with
 * anything else, so it can be used on its own. What it does not own is the
 * document, or the decision whether a result may be saved: those are the
 * runner's, in @obelum/core.
 */
export { claude, translateWithClaude, type ClaudeTranslatorOptions, type DriveFn } from './claude.js';
export {
  driveClaudeAgent,
  applyTextEdit,
  type AgentStreamEvent,
  type ToolReply,
  type ClaudeAgentOptions,
} from './claude/stream.js';
export { claudeErrorMessage } from './claude/client.js';
