/**
 * A second opinion from a model, for what string checks cannot see: whether
 * the new text says what the source says, reads naturally, and whether
 * anything the checks did not name was changed or lost. Optional (--judge),
 * and reported beside the checks rather than instead of them.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Brief } from '@obelum/core';
import type { Case } from './case.js';

export interface Verdict {
  pass: boolean;
  reason: string;
}

const VERDICT_TOOL = {
  name: 'verdict',
  description: 'Record whether the updated translation is acceptable.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      reason: { type: 'string' as const, description: 'One or two sentences: what is wrong, or why it is fine.' },
      pass: { type: 'boolean' as const },
    },
    required: ['reason', 'pass'],
  },
};

/** What the judge's calls cost, for the summary. */
export const judgeUsage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };

export async function judge(client: Anthropic, model: string, c: Case, brief: Brief, output: string): Promise<Verdict> {
  const changes = brief.langDiffs
    .map(d => (d.base === '' ? `### ${d.lang} (new to the target, whole file)\n${d.content}` : `### ${d.lang}\n${d.diff}`))
    .join('\n\n');
  const message = await client.messages.create({
    model,
    max_tokens: 8000,
    tools: [VERDICT_TOOL],
    // Current models refuse a forced tool_choice; the prompt asks for the call.
    tool_choice: { type: 'auto' },
    system: `You review translation updates. A document exists in several languages that are equal peers. Some languages changed; a translator updated the ${brief.targetLang} version to match. Judge only the update: the changes must be carried over faithfully and naturally, text the changes do not concern must be left as it was, and anything the ${brief.targetLang} version has of its own (local wording, extra sections, a different structure, localized details) must survive unless a change removed it. Do not fail it for choices a careful human translator could make. Give your answer by calling the verdict tool.`,
    messages: [{
      role: 'user',
      content: `What this case tests: ${c.about}

## ${brief.targetLang} before
${brief.targetContent || '(did not exist)'}

## What changed in the other languages
${changes}

## ${brief.targetLang} after the update
${output}`,
    }],
  });
  judgeUsage.input += message.usage.input_tokens;
  judgeUsage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
  judgeUsage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
  judgeUsage.output += message.usage.output_tokens;
  const call = message.content.find(b => b.type === 'tool_use');
  const input = (call?.type === 'tool_use' ? call.input : {}) as Partial<Verdict>;
  return { pass: input.pass === true, reason: input.reason ?? 'no verdict' };
}
