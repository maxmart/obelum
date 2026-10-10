/**
 * A translator backed by Claude.
 *
 * Obelum's document says what changed (the brief); this decides how to ask
 * a model to apply it, and whether the result is complete enough to hand
 * back. The brief arrives as data (target, per-language base, content and
 * diff) and goes out as two prompts and two tools: edit_file for targeted
 * changes, write_file for a new or rewritten document. Edits are applied
 * here, in the loop, so the model gets told when one did not land.
 *
 *   const content = await claude({ apiKey }).run(await session.brief('sv'));
 *   if (content) await session.sync('sv', content);
 */
import { unifiedDiff, type Brief, type LangDiff } from '@obelum/core';
import { Remediation, CONFIRM_UNCHANGED } from './remediation.js';
import { driveClaudeAgent, applyTextEdit, type ToolReply } from './claude/stream.js';

/** What talks to the model. The one seam an evaluation replaces: everything
 *  else — prompt building, the tool loop, the remediation rule — runs for real. */
export type DriveFn = typeof driveClaudeAgent;

export type DiffStyle = 'hunks' | 'inline' | 'diff';
export type Approach = 'batch' | 'check' | 'plan';

export interface ClaudeTranslatorOptions {
  apiKey: string;
  /** The host's rules, verbatim: a glossary, which parts of the format are
   *  code rather than content, house style. Appended to every prompt. */
  instructions?: string;
  /** Stands in for the real model: a recorded transcript, a probe that only
   *  captures the prompts. Defaults to driveClaudeAgent. */
  drive?: DriveFn;
  /** How a sibling's changes are shown. 'hunks' (the default): the file as
   *  the target last saw it, then a three-line-context diff. 'inline': the
   *  whole file once, as a diff with every line in it, so each change sits
   *  where it happens. 'diff': the three-line-context diff alone, without
   *  the file around it. The target's own changes are always hunks, since
   *  its current content is shown in full anyway, and a language the target
   *  has never seen is always shown whole. */
  diffStyle?: DiffStyle;
  /** How the model is asked to work. 'plan' (the default): first write out
   *  what each change means and every place in the target it concerns, then
   *  edit, and check each edit against the target around it, which the tool
   *  shows. 'check': the same without the written plan. 'batch': every edit
   *  in one response, each answered with a bare "applied". The evals put
   *  plan ahead on cases where the right answer needs understanding, and no
   *  dearer. */
  approach?: Approach;
  /** Answers the model's question when the documents cannot settle what to
   *  write: two languages contradict each other, or a change could mean two
   *  things for the target. A host with a person at hand (a terminal, an
   *  editor) asks them and resolves with the answer; null means no answer.
   *  Without it, every question is still a `question` event, for the host
   *  to log, and the model is told to leave that content as it is. */
  ask?: (question: Question) => Promise<string | null>;
}

export interface Question {
  question: string;
  /** The choices the model sees, if it saw any. */
  options: string[];
  /** What it would do if nobody answered. */
  guess: string;
}

export type TranslationEvent =
  | { type: 'thinking' }
  | { type: 'reasoning'; text: string }
  | { type: 'edit'; edit: { old_string: string; new_string: string } }
  | { type: 'error'; error: string }
  /** The model asked something the documents could not settle. `answer` is
   *  null when nobody answered: the question is then for a person to read
   *  later, and the content it is about was left as it was. */
  | ({ type: 'question'; answer: string | null } & Question)
  /** Always last. `complete` is false when the run stopped for any reason
   *  other than finishing cleanly — the result must not be saved then. */
  | { type: 'done'; finalContent: string; complete: boolean };

export interface RunOptions {
  /** Every event as it streams: for a log on screen. */
  onEvent?: (event: TranslationEvent) => void;
  /** Polled between events; a true return abandons the run. */
  isCancelled?: () => boolean;
}

export interface ClaudeTranslator {
  /** The finished translation, or null when the run did not complete: it
   *  was cancelled, the model stopped early, or an edit failed and was
   *  never put right. Null must not be saved; a partial translation stamped
   *  as synced would hide the loss forever. */
  run(brief: Brief, options?: RunOptions): Promise<string | null>;
  /** The same run as a stream of events, ending with `done`. */
  translate(brief: Brief): AsyncGenerator<TranslationEvent>;
}

export function claude(options: ClaudeTranslatorOptions): ClaudeTranslator {
  const translate = (brief: Brief) => translateWithClaude(brief, options);
  return {
    translate,
    async run(brief, { onEvent, isCancelled } = {}) {
      for await (const event of translate(brief)) {
        if (isCancelled?.()) return null;
        onEvent?.(event);
        if (event.type === 'done') return event.complete && event.finalContent ? event.finalContent : null;
      }
      return null;
    },
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

const ASK_TOOL = {
  name: 'ask',
  description:
    'Ask the person behind this update something the documents cannot settle: two languages say different things about the same fact, or a change could mean two different things for the target. Use it at most once, and only when the answer changes what you write. If no one can answer, the question is recorded for a person to read, and you leave the content it is about as it is.',
  input_schema: {
    type: 'object' as const,
    properties: {
      question: { type: 'string' as const, description: 'The question, with what it is about quoted from the documents' },
      options: { type: 'array' as const, items: { type: 'string' as const }, description: 'The choices you see, if any' },
      guess: { type: 'string' as const, description: 'What you would do if no one answered' },
    },
    required: ['question', 'guess'],
  },
};

/** A language the target never saw: no base, the whole file is the diff. */
const unseen = (d: { base: string }) => d.base === '';

/** Full sync: nothing the target has seen before, only current files to
 *  translate from. The brief's own signal for "never synced". */
function fullSyncContents(params: Brief) {
  const others = params.langDiffs.filter(d => d.lang !== params.targetLang);
  return others.length && others.every(unseen) ? others : [];
}

/** The whole file as one diff, without the hunk header: every line of base
 *  and content once, marked ' ', '-' or '+'. */
function inlineDiff(d: LangDiff): string {
  return unifiedDiff(d.base, d.content, undefined, Infinity).split('\n').slice(1).join('\n');
}

/** What the brief shows of each changed sibling, as the system prompt says it. */
const SHOWN: Record<DiffStyle, (target: string) => string> = {
  hunks: t => `For each language that changed, you have the content from when ${t} was last synced and a diff showing what changed since then.`,
  inline: t => `For each language that changed, you have its whole file as a diff against the version ${t} was last synced to: a line starting with a space is unchanged, "-" was removed, "+" was added.`,
  diff: t => `For each language that changed, you have a diff showing what changed since ${t} was last synced: a line starting with a space is unchanged context, "-" was removed, "+" was added. The rest of that file is not shown.`,
};

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
/** A language code as a name, for prose: sv → Swedish. The code itself when
 *  the runtime does not know it. */
function langName(code: string): string {
  try { return languageNames.of(code) ?? code; } catch { return code; }
}

function buildSystemPrompt(params: Brief, instructions: string | undefined, style: DiffStyle, approach: Approach = 'plan'): string {
  const { targetLang, langDiffs } = params;
  const fullSync = fullSyncContents(params);

  // The caller's instructions are law: appended to whichever prompt applies
  // so terminology and format rules stay consistent across documents and
  // across sync runs.
  const rulesSection = instructions
    ? `\n\nThe following rules and glossary are binding — follow them even where another translation would read naturally:\n\n${instructions}`
    : '';

  // Languages by name in prose (Swedish, not sv); the code once, since the
  // user message heads each file with it.
  const T = langName(targetLang);
  const named = (l: string) => `${langName(l)} (${l})`;

  // What is markup and how it is edited: the same whichever job this is.
  const markup = `Markup is not text. Component and attribute names, ids, front matter keys, file paths and URLs stay exactly as they are, except a link whose ${T} pages follow a convention of their own (a language prefix, a translated path): new links in ${T} follow that convention too. Text a reader sees is ${T}, written as a ${T} writer would put it, not word for word.`;
  const done = `When the ${T} file is right, say in a sentence or two what you changed and why. If nothing needs to change, make no edit at all, and say why not.`;
  // Whoever reads the notes reads them in English; left alone, a model
  // writing Swedish all day tends to plan and sum up in Swedish too.
  const notes = `Write your plan, your notes and your summary in English, whatever language the documents are in.`;
  // The escape hatch: a question instead of a guess, for what only a person
  // can settle. The bar is high: it must change what is written.
  const asking = `Some things the documents cannot settle: two languages say different things about the same fact, or a change could mean two different things for ${T}. Then do not guess. Call ask, once, with the question, the options you see, and what you would do if no one answered, and keep the content in question as it is unless you get an answer. Ask only when the answer changes what you write, never about wording or style.`;
  const check = `Each edit's result shows the ${T} file around it as it now reads. Look at it: if anything there is wrong, was missed, or now contradicts something elsewhere in the ${T} file, fix it with further edits.`;
  const tool = `Edit with edit_file: its old_string must appear exactly, once, in the ${T} file.`;
  const editing = {
    batch: `${tool} Make all your edits in one response. ${done}`,
    check: `${tool} Make the edits you are sure of together, in one response. ${check} ${done}`,
    plan: `Before you edit, write out briefly: for each change, what it says and why it was likely made; then every place in the ${T} file that it concerns, quoted, with whether that place needs an edit and why. Places the other language never mentions count too.

Then make the edits, together in one response. ${tool} ${check} ${done}`,
  }[approach];

  if (fullSync.length) {
    // Nothing to diff against: the target has never been brought up to date.
    const others = fullSync.map(c => named(c.lang)).join(', ');
    const job = params.targetContent.trim() === ''
      ? `The ${T} file does not exist yet. Write it whole, with a single write_file call: the same document as the others, with the same structure (headings at the same levels, the same components and front matter), and everything a reader sees in ${T}, as a ${T} writer would put it: currencies, dates and conventions included.`
      : `The ${T} file exists, and may differ from the others on purpose: its own wording, order, local details, sections only ${T} has. Make it say what the others say: add what it lacks, each where it fits in ${T}'s own order, and correct what contradicts them. Keep everything ${T} does its own way, its order above all: never rearrange what is there to follow the others. Edit the file where it stands, with edit_file; do not rewrite it with write_file.`;
    const opening = params.source !== undefined
      ? `You are bringing the ${named(targetLang)} translation of a document up to date. Its source is ${named(params.source)}; ${T} is translated from it. ${T} has never been brought up to date with it before, so there is no diff: you have its current content in full.`
      : `You are bringing the ${named(targetLang)} version of a document up to date with its other language versions (${others}). The languages are equal peers; none is the original. ${T} has never been brought up to date with them before, so there is no diff: you have their current content in full.`;
    return `${opening}

${job}

${markup}

${params.targetContent.trim() === '' ? `When you are done, say in a sentence or two what you wrote.` : `${asking}

${editing}`} ${notes}${rulesSection}`;
  }

  const changedLangs = langDiffs.map(d => d.lang);
  const others = changedLangs.filter(l => l !== targetLang);
  const targetChanged = changedLangs.includes(targetLang);

  // Single source: who the target is translated from, and that its own
  // differences are corrections and localizations made by hand.
  const opening = params.source !== undefined
    ? `You are keeping the ${named(targetLang)} translation of a document up to date. Its source is ${named(params.source)}: ${T} was translated from it, and has since been corrected and localized by hand. Since ${T} was last brought up to date, someone changed the ${langName(params.source)} page.`
    : `You are keeping the ${named(targetLang)} version of a document up to date with its other language versions. The languages are equal peers; none is the original. Since ${T} was last brought up to date, ${others.length ? `someone changed ${others.map(named).join(' and ')}` : `only ${T} itself has changed`}.`;

  return `${opening} ${SHOWN[style](T)}${targetChanged ? ` ${T} has been edited itself since then too; those edits are shown as well, and they are deliberate: keep them.` : ''}

Your job is not to translate the diff. It is to understand each change (what it says, and why it was likely made: a new fact, a correction, a rewording, a removal, a reordering) and then ask: if the person who made it had been editing the ${T} version instead, what would they have changed there? Make those changes.

The versions are not copies of each other. They may differ on purpose: wording, order, examples, local services and links, whole sections that only one language has. Keep all of that, except where a change is about it. It follows that:
- One change may need several edits in ${T}: everywhere ${T} says what changed, also where the other language never said it, so that ${T} does not contradict itself.
- A change may need no edit at all: when ${T} does not have the content it is about, or already says what the change says.
- A change to order or structure applies only where ${T} follows that order or structure.
- Something that only looks like the changed content, but is about something else, stays as it is.

${asking}

${markup}

${editing} ${notes}${rulesSection}`;
}

function buildUserMessage(params: Brief, style: DiffStyle): string {
  const { targetLang, targetContent, langDiffs } = params;
  const fullSync = fullSyncContents(params);

  if (fullSync.length) {
    // Full sync mode — no diff base
    const sections = fullSync
      .map(c => `## Current ${c.lang} content:\n${c.content}`)
      .join('\n\n');

    return `${sections}

## Current ${targetLang} content (this is what you'll edit):
${targetContent}

Bring the ${targetLang} version up to date with the versions above.`;
  }

  // Diff mode — show what changed in each language
  const sections = langDiffs.map(d => {
    if (d.lang === targetLang) {
      return `## Changes made to ${d.lang} (the file you're editing) since last sync:
${d.diff}`;
    }
    if (unseen(d)) {
      return `## Current ${d.lang} content (${targetLang} has never been synced to it):
${d.content}`;
    }
    if (style === 'inline') {
      return `## ${d.lang} since last sync, the whole file as a diff:
${inlineDiff(d)}`;
    }
    if (style === 'diff') {
      return `## Changes made to ${d.lang} since ${targetLang} last synced:
${d.diff}`;
    }
    return `## ${d.lang} content at time of last sync:
${d.base}

## Changes made to ${d.lang} since then:
${d.diff}`;
  }).join('\n\n');

  return `${sections}

## Current ${targetLang} content (this is what you'll edit):
${targetContent}

Update the ${targetLang} file.`;
}

/** The edited stretch of the file as it now reads, three lines either side,
 *  numbered: what the model gets back to check its edit against. */
function around(before: string, after: string, oldStr: string, newStr: string, context = 3): string {
  const lf = (s: string) => s.replace(/\r\n/g, '\n');
  const at = lf(before).indexOf(lf(oldStr));
  const start = at < 0 ? 0 : lf(before).slice(0, at).split('\n').length - 1;
  const span = lf(newStr).split('\n').length;
  const lines = lf(after).split('\n');
  const from = Math.max(0, start - context);
  const to = Math.min(lines.length, start + span + context);
  return lines.slice(from, to).map((l, i) => `${from + i + 1}\t${l}`).join('\n');
}

export async function* translateWithClaude(
  params: Brief,
  options: ClaudeTranslatorOptions,
): AsyncGenerator<TranslationEvent> {
  let currentContent = params.targetContent;
  // See Remediation: a failed edit means its change is missing from the
  // result, and only a success from a later turn answers it.
  const attempted = new Remediation();

  const approach = options.approach ?? 'plan';
  const driver = (options.drive ?? driveClaudeAgent)({
    apiKey: options.apiKey,
    system: buildSystemPrompt(params, options.instructions, options.diffStyle ?? 'hunks', approach),
    userMessage: buildUserMessage(params, options.diffStyle ?? 'hunks'),
    tools: [EDIT_FILE_TOOL, WRITE_FILE_TOOL, ASK_TOOL],
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
        if (ev.name === 'ask') {
          // Neither a success nor a failure: a question changes nothing in
          // the file. The loop waits for the answer between turns, so a
          // person can take their time.
          const question: Question = {
            question: String(ev.input.question ?? ''),
            options: Array.isArray(ev.input.options) ? ev.input.options.map(String) : [],
            guess: String(ev.input.guess ?? ''),
          };
          const answer = options.ask ? await options.ask(question) : null;
          yield { type: 'question', ...question, answer };
          reply = { content: answer
            ? `The answer: ${answer}`
            : 'No one can answer now. Your question is recorded for a person to read. Leave the content it is about as it is, make the rest of the edits, and name the open question in your summary.' };
        } else if (ev.name === 'write_file') {
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
          if (!result.ok && typeof old_string === 'string' && old_string === new_string) {
            // An edit that changes nothing loses nothing when it misses, so it
            // is no failure. A model that decided nothing needs to change
            // sometimes still calls edit_file with a placeholder; counting
            // that as a failed change threw away a correct "nothing to do".
            // It answers no earlier failure either: only a found text does
            // (the CONFIRM_UNCHANGED path, through result.ok above).
            reply = { content: 'That text is not in the file, and this edit would change nothing anyway. If nothing needs to change, make no edit at all.' };
          } else if (result.ok) {
            const before = currentContent;
            currentContent = result.content;
            attempted.succeeded(ev.turn);
            yield { type: 'edit', edit: { old_string, new_string } };
            reply = { content: approach === 'batch' ? 'Edit applied successfully.' : `Edit applied. Around it, the file now reads:\n${around(before, currentContent, old_string, new_string)}` };
          } else {
            attempted.failed(ev.turn);
            yield { type: 'error', error: `Edit failed: ${result.error}` };
            reply = { content: `${result.error} ${CONFIRM_UNCHANGED}`, isError: true };
          }
        } else {
          // An unknown tool was still an attempted change; treat it as a
          // failure that a later informed action must answer.
          attempted.failed(ev.turn);
          reply = { content: `Unknown tool: ${ev.name}. Use edit_file, write_file or ask.`, isError: true };
        }
        break;
      case 'stop':
        yield { type: 'done', finalContent: currentContent, complete: ev.reason === 'end_turn' && attempted.settled };
        return;
    }
  }
}
