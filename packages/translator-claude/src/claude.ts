/**
 * A Translator backed by Claude.
 *
 * Obelum's runner decides what changed and whether a result may be saved;
 * this decides how to ask a model to apply it. The request arrives as data
 * (target, per-language base and diff, or full contents) and goes out as
 * two prompts and two tools: edit_file for targeted changes, write_file for
 * a new or rewritten document. Edits are applied here, in the loop, so the
 * model gets told when one did not land.
 */
import type { Translator, TranslationRequest, TranslationEvent } from '@obelum/core';
import { Remediation, CONFIRM_UNCHANGED } from './remediation.js';
import { driveClaudeAgent, applyTextEdit, type ToolReply } from './claude/stream.js';

/** What talks to the model. The one seam an evaluation replaces: everything
 *  else — prompt building, the tool loop, the remediation rule — runs for real. */
export type DriveFn = typeof driveClaudeAgent;

export interface ClaudeTranslatorOptions {
  apiKey: string;
  /** Stands in for the real model: a recorded transcript, a probe that only
   *  captures the prompts. Defaults to driveClaudeAgent. */
  drive?: DriveFn;
}

/** A Translator that asks Claude. Hand it to @obelum/core's runTranslation. */
export function claude(options: ClaudeTranslatorOptions): Translator {
  return {
    translate: request => translateWithClaude(request, options),
  };
}

const WRITE_FILE_TOOL = {
  name: 'write_file',
  description:
    'Replace the entire target language file with new content. Use this when the target file is empty (a new document) or when nearly all of it changes; use edit_file for targeted changes.',
  input_schema: {
    type: 'object' as const,
    properties: {
      content: {
        type: 'string' as const,
        description: 'The complete new file content',
      },
    },
    required: ['content'],
  },
};

const EDIT_FILE_TOOL = {
  name: 'edit_file',
  description:
    'Replace exact text in the target language file. The old_string must match exactly (including whitespace and indentation). If the text is not found, you\'ll get an error — try with different surrounding context.',
  input_schema: {
    type: 'object' as const,
    properties: {
      old_string: {
        type: 'string' as const,
        description: 'Exact text to find in the target file',
      },
      new_string: {
        type: 'string' as const,
        description: 'Replacement text',
      },
    },
    required: ['old_string', 'new_string'],
  },
};

function buildSystemPrompt(params: TranslationRequest): string {
  const { targetLang, langDiffs, fullSyncContents, instructions } = params;

  // The caller's instructions are law: appended to whichever prompt applies
  // so terminology and format rules stay consistent across documents and
  // across sync runs.
  const rulesSection = instructions
    ? `\n\nThe following rules and glossary are binding — follow them even where another translation would read naturally:\n\n${instructions}`
    : '';

  if (!langDiffs.length && fullSyncContents?.length) {
    // Full sync — no diff base available
    const otherLangs = fullSyncContents.map(c => c.lang).join(', ');
    const newFileNote = params.targetContent.trim() === ''
      ? `\n\nThe ${targetLang} file does not exist yet — it is empty. Create it with a SINGLE write_file call containing the complete translated file.`
      : '';
    return `You are syncing the ${targetLang} version of a document to match the other language versions (${otherLangs}).

All languages are equal peers — there is no "primary" language. You have the current content of each language version. Update the ${targetLang} version so it is consistent with the others.${newFileNote}

Use the edit_file tool to update the ${targetLang} file. Each edit must use exact string matching — the old_string must appear exactly in the ${targetLang} file. Use write_file instead when creating the file or rewriting nearly all of it.

IMPORTANT: Make ALL your edit_file calls in a SINGLE response. Do not make one edit per turn — batch all edits together.

Guidelines:
- Translate human-readable text. Do NOT change URLs, file paths, ids, or technical attributes.
- Preserve ids exactly as they are in the target file.
- If other versions have sections that ${targetLang} is missing, add them (translated).
- If ${targetLang} has sections that no other version has, remove them.
- If text already matches the meaning, leave it as is.
- Briefly explain what you changed and any decisions, but keep explanations concise.
- If no changes are needed, say so.${rulesSection}`;
  }

  const changedLangs = langDiffs.map(d => d.lang);
  const targetChanged = changedLangs.includes(targetLang);

  return `You are updating the ${targetLang} version of a document. Since the last sync, changes were made in: ${changedLangs.join(', ')}.

All languages are equal peers — there is no "primary" language. For each language that changed, you have the content from when ${targetLang} was last synced and a diff showing what changed since then.${targetChanged ? `\n\nNote: ${targetLang} itself also changed (e.g., a local fix). Preserve those changes while incorporating updates from other languages.` : ''}

Use the edit_file tool to apply equivalent changes to the ${targetLang} file. Each edit must use exact string matching — the old_string must appear exactly in the file.

IMPORTANT: Make ALL your edit_file calls in a SINGLE response. Do not make one edit per turn — batch all edits together.

Guidelines:
- Translate human-readable text. Do NOT change URLs, file paths, ids, or technical attributes.
- Preserve ids exactly as they are in the target file.
- If a change is purely structural/formatting (not content), apply the same structural change.
- If another language added or removed sections, make equivalent additions/removals.
${targetChanged ? `- Changes already made to ${targetLang} should be kept — do not revert them.\n` : ''}- Briefly explain what you changed and any decisions, but keep explanations concise.
- If no changes are needed, say so.${rulesSection}`;
}

function buildUserMessage(params: TranslationRequest): string {
  const { targetLang, targetContent, langDiffs, fullSyncContents, dropLines } = params;
  /** Bookkeeping is not translatable content; keep it out of what Claude sees. */
  const shown = (content: string) => dropLines(content.split('\n')).join('\n');

  if (!langDiffs.length && fullSyncContents?.length) {
    // Full sync mode — no diff base
    const sections = fullSyncContents
      .map(c => `## Current ${c.lang} content:\n${shown(c.content)}`)
      .join('\n\n');

    return `${sections}

## Current ${targetLang} content (this is what you'll edit):
${shown(targetContent)}

Update the ${targetLang} version to be consistent with the other language versions above.`;
  }

  // Diff mode — show what changed in each language
  const sections = langDiffs.map(d => {
    if (d.lang === targetLang) {
      return `## Changes made to ${d.lang} (the file you're editing) since last sync:
${d.diff}`;
    }
    return `## ${d.lang} content at time of last sync:
${shown(d.base)}

## Changes made to ${d.lang} since then:
${d.diff}`;
  }).join('\n\n');

  return `${sections}

## Current ${targetLang} content (this is what you'll edit):
${shown(targetContent)}

Apply the equivalent changes to the ${targetLang} file.`;
}

export async function* translateWithClaude(
  params: TranslationRequest,
  options: ClaudeTranslatorOptions,
): AsyncGenerator<TranslationEvent> {
  let currentContent = params.targetContent;
  // See Remediation: a failed edit means its change is missing from the
  // result, and only a success from a later turn answers it.
  const attempted = new Remediation();

  const driver = (options.drive ?? driveClaudeAgent)({
    apiKey: options.apiKey,
    system: buildSystemPrompt(params),
    userMessage: buildUserMessage(params),
    tools: [EDIT_FILE_TOOL, WRITE_FILE_TOOL],
    effort: 'medium',
    maxTurns: 25,
  });

  let reply: ToolReply | undefined;
  while (true) {
    const { value: ev, done } = await driver.next(reply);
    reply = undefined;
    if (done) break;

    switch (ev.type) {
      case 'thinking':
        yield { type: 'thinking' };
        break;
      case 'text':
        yield { type: 'reasoning', text: ev.text };
        break;
      case 'error':
        yield { type: 'error', error: ev.error };
        break;
      case 'tool_use':
        if (ev.name === 'write_file') {
          if (typeof ev.input.content !== 'string') {
            attempted.failed(ev.turn);
            reply = { content: 'write_file needs a `content` string.', isError: true };
            break;
          }
          currentContent = ev.input.content;
          attempted.succeeded(ev.turn);
          yield { type: 'edit', edit: { old_string: '(entire file)', new_string: currentContent } };
          reply = { content: 'File written.' };
        } else if (ev.name === 'edit_file') {
          const old_string = ev.input.old_string as string;
          const new_string = ev.input.new_string as string;
          const result = applyTextEdit(currentContent, old_string, new_string);
          if (result.ok) {
            currentContent = result.content;
            attempted.succeeded(ev.turn);
            yield { type: 'edit', edit: { old_string, new_string } };
            reply = { content: 'Edit applied successfully.' };
          } else {
            attempted.failed(ev.turn);
            yield { type: 'error', error: `Edit failed: ${result.error}` };
            reply = { content: `${result.error} ${CONFIRM_UNCHANGED}`, isError: true };
          }
        } else {
          // An unknown tool was still an attempted change; treat it as a
          // failure that a later informed action must answer.
          attempted.failed(ev.turn);
          reply = { content: `Unknown tool: ${ev.name}. Use edit_file or write_file.`, isError: true };
        }
        break;
      case 'stop':
        yield { type: 'done', finalContent: currentContent, complete: ev.reason === 'end_turn' && attempted.settled };
        return;
    }
  }
}
