/**
 * A published results file as a static site: an index with one row per case,
 * and a page per case with what changed, each run's before and after, its
 * checks, the translator's own notes and tool calls, and the full prompt.
 * Plain HTML and one stylesheet; links are relative, so the site works from
 * any path (it is published under /obelum/evals/).
 *
 *   npm run report -w evals                                   newest file in published/ → site/
 *   npm run report -w evals -- published/<file> --out <dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createPatch } from 'diff';
import type { Published, PublishedCase, PublishedRun } from './publish.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const { values, positionals } = parseArgs({
  args: process.argv.slice(2).filter(a => a !== '--'),
  options: { out: { type: 'string' } },
  allowPositionals: true,
});
const cwd = process.env.INIT_CWD ?? process.cwd();
const input = positionals[0]
  ? path.resolve(cwd, positionals[0])
  : (() => {
      const dir = here('../published');
      const newest = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().at(-1);
      if (!newest) throw new Error('No file in published/. Run npm run publish-results first.');
      return path.join(dir, newest);
    })();
const out = values.out ? path.resolve(cwd, values.out) : here('../site');
const data: Published = JSON.parse(fs.readFileSync(input, 'utf8'));

// ── helpers ───────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (id: string) => id.replace(/\//g, '--');
const money = (n: number) => (Number.isFinite(n) ? `$${n.toFixed(4)}` : '–');
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const NAMES: Record<string, string> = { en: 'English', sv: 'Swedish', de: 'German', no: 'Norwegian' };
const lang = (l: string) => NAMES[l] ?? l;

/** A unified diff as HTML, one line each, coloured by kind. */
function diffHtml(text: string): string {
  return `<pre class="diff">${text.split('\n').map(l => {
    const kind = l.startsWith('@@') ? 'h' : l.startsWith('+') ? 'p' : l.startsWith('-') ? 'm' : '';
    return `<span${kind ? ` class="${kind}"` : ''}>${esc(l) || ' '}</span>`;
  }).join('\n')}</pre>`;
}

/** Before → after of the target, as a diff with a few lines of context. */
function resultDiff(r: PublishedRun): string {
  if (r.output.replace(/\r\n/g, '\n') === r.before.replace(/\r\n/g, '\n')) return '';
  return createPatch('target', r.before, r.output, '', '', { context: 3 }).split('\n').slice(4).join('\n').trimEnd();
}

const mark = (r: PublishedRun) =>
  `<span class="mark ${r.pass ? 'ok' : 'bad'}" title="${esc(r.pass ? 'passed' : r.checks.filter(c => !c.ok).map(c => c.label).join('\n') || r.error || 'incomplete')}">${r.pass ? '✓' : '✗'}</span>`;

const page = (title: string, body: string, root: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><link rel="stylesheet" href="${root}style.css"></head>
<body><main>${body}</main></body></html>
`;

const GROUPS: Record<string, string> = {
  basic: 'One thing changed in a target shaped like the source.',
  structure: 'The target is shaped differently from the source: a section of its own, a split paragraph, merged list items, reordered sections, a table for a list.',
  locality: 'Finding the place: one change in a long page, blocks that read the same, scattered changes.',
  format: 'Front matter, MDX props, code blocks, tables, a moved section, a rewrap, CRLF line endings.',
  'multi-source': 'More than one language has changed (two siblings, siblings that disagree, a sibling the target never saw), or the target has edits of its own.',
  new: 'A target that does not exist yet.',
  big: 'Pages at real size, a few hundred lines, most of them repeated somewhere.',
  fix: 'The target fixed something itself, then another language changed the same line or sentence.',
  divergent: 'A real product homepage, with every product, partner, place and person name made up. Its Swedish version differs from the English on purpose: a streaming partner only Sweden promotes, payments first, a case study further down.',
};

// ── index ─────────────────────────────────────────────────────────────────

const runs = data.cases.flatMap(c => c.runs);
const passed = runs.filter(r => r.pass).length;
const totalCost = runs.reduce((a, r) => a + (Number.isFinite(r.cost) ? r.cost : 0), 0);
const byGroup = new Map<string, PublishedCase[]>();
for (const c of data.cases) {
  const g = c.id.split('/')[0];
  byGroup.set(g, [...(byGroup.get(g) ?? []), c]);
}

const index = `
<h1>Obelum translator evals</h1>
<p class="meta">${esc(data.model)} · effort ${esc(data.effort)} · ${esc(data.style)} brief · ${esc(data.approach)} approach ·
commit <a href="https://github.com/maxmart/obelum/tree/${esc(data.commit)}"><code>${esc(data.commit)}</code></a>${data.dirty ? ' (with uncommitted changes)' : ''} ·
${esc(data.date.slice(0, 10))}</p>
<p class="total"><strong>${passed} of ${runs.length} runs passed</strong> (${data.cases.length} cases × ${data.repeat}) ·
$${totalCost.toFixed(2)} in total, ${money(totalCost / runs.length)} per run · ${mean(runs.map(r => r.seconds)).toFixed(1)} s per run</p>

<section class="about">
<p>Each case is a page in two or three languages, all in sync. Then someone changes one language, and the
<a href="https://github.com/maxmart/obelum/tree/main/packages/translator-claude">translator</a> brings another
language up to date with an LLM. The result is checked with plain string tests (a text must or must not appear,
nothing outside given lines may change) written to pass for any reasonable wording. Every case has a hand-written
reference answer, which a test holds to every check.</p>
<p>This is a snapshot of ${data.repeat} runs per case, not a statistic. The checks test facts, not how good the
language is. Names of products, partners, places and people in the cases are made up, as are their prices.
Card, Klarna, Swish, PayPal and Apple Pay are real payment methods. The cases and the runner are in
<a href="https://github.com/maxmart/obelum/tree/main/evals"><code>evals/</code></a>.</p>
</section>
${[...byGroup].map(([g, cs]) => `
<h2>${esc(g)}</h2>
${GROUPS[g] ? `<p class="group">${esc(GROUPS[g])}</p>` : ''}
<table>
<thead><tr><th>case</th><th>what it tests</th><th>runs</th><th>$ / run</th><th>s / run</th></tr></thead>
<tbody>
${cs.map(c => `<tr class="${c.runs.every(r => r.pass) ? '' : 'failed'}">
<td><a href="cases/${slug(c.id)}.html">${esc(c.id.split('/').slice(1).join('/'))}</a></td>
<td>${esc(c.about)}</td>
<td class="marks">${c.runs.map(mark).join('')}</td>
<td class="num">${money(mean(c.runs.map(r => r.cost)))}</td>
<td class="num">${mean(c.runs.map(r => r.seconds)).toFixed(1)}</td>
</tr>`).join('\n')}
</tbody></table>`).join('\n')}
`;

// ── case pages ────────────────────────────────────────────────────────────

function runHtml(c: PublishedCase, r: PublishedRun): string {
  const d = resultDiff(r);
  const result = d
    ? diffHtml(d)
    : `<p class="unchanged">${c.expectUnchanged ? 'Left unchanged, which is the right answer here.' : 'Left unchanged.'}</p>`;
  return `
<details id="run-${r.rep + 1}" class="run ${r.pass ? 'ok' : 'bad'}"${r.pass ? '' : ' open'}>
<summary>${mark(r)} Run ${r.rep + 1} <span class="small">· ${r.edits} edit${r.edits === 1 ? '' : 's'} · ${r.turns} turn${r.turns === 1 ? '' : 's'} ·
${r.tokens.input.toLocaleString('en')} in / ${r.tokens.output.toLocaleString('en')} out tokens · ${money(r.cost)} · ${r.seconds.toFixed(1)} s</span></summary>
${r.complete ? '' : `<p class="error">Incomplete: the run was not saved${r.error ? `. ${esc(r.error)}` : '.'}</p>`}
<h4>Checks</h4>
<ul class="checks">${r.checks.map(ch => `<li class="${ch.ok ? 'ok' : 'bad'}">${ch.ok ? '✓' : '✗'} <code>${esc(ch.label)}</code></li>`).join('')}</ul>
<h4>${esc(lang(c.target))}, before → after</h4>
${result}
${(r.questions ?? []).length ? `<h4>Questions it raised</h4><ul class="questions">${(r.questions ?? []).map(q => `<li>${esc(q.question)}${q.options.length ? ` <span class="small">(options: ${q.options.map(esc).join(' · ')})</span>` : ''}<br><span class="small">${q.answer ? `answered: ${esc(q.answer)}` : `no one to answer; its guess: ${esc(q.guess)}`}</span></li>`).join('')}</ul>` : ''}
<h4>The translator's notes</h4>
<pre class="notes">${esc(r.reasoning.trim()) || '<em>(none)</em>'}</pre>
${r.actions.length ? `<h4>Tool calls</h4><ol class="actions">${r.actions.map(a => `<li><code>${esc(a)}</code></li>`).join('')}</ol>` : ''}
<details class="prompt"><summary>The full prompt</summary>
<h5>System</h5><pre>${esc(r.prompt.system)}</pre>
<h5>User</h5><pre>${esc(r.prompt.user)}</pre>
</details>
</details>`;
}

function casePage(c: PublishedCase): string {
  return `
<p class="back"><a href="../index.html">← all cases</a></p>
<h1>${esc(c.id)}</h1>
<p class="lead">${esc(c.about)}</p>
<p class="meta">${c.runs.map(mark).join('')} · target ${esc(lang(c.target))} · languages ${c.langs.map(lang).join(', ')}</p>
<h2>What the translator was told changed</h2>
${c.changes.map(ch => `<h3>${ch.own
    ? `${esc(lang(ch.lang))}'s own edits, not yet synced (to keep)`
    : ch.whole ? `${esc(lang(ch.lang))}, never seen by ${esc(lang(c.target))}: the whole page` : `${esc(lang(ch.lang))} changed`}</h3>
${ch.whole ? `<pre>${esc(ch.text)}</pre>` : diffHtml(ch.text)}`).join('\n')}
<h2>Runs</h2>
${c.runs.map(r => runHtml(c, r)).join('\n')}
`;
}

// ── write ─────────────────────────────────────────────────────────────────

const CSS = `
:root { --bg:#fbfbf9; --text:#1d1d1b; --muted:#6b6b66; --rule:#e2e1dc; --card:#fff; --ok:#1f7a3f; --bad:#b3261e; --add:#e6f4ea; --del:#fdecea; --hunk:#eef1f8; --link:#2457c5; }
@media (prefers-color-scheme: dark) { :root { --bg:#161615; --text:#e8e6e1; --muted:#9a988f; --rule:#33322f; --card:#1e1e1c; --ok:#5cc282; --bad:#f2817a; --add:#1d3324; --del:#3d1f1d; --hunk:#232838; --link:#8ab0ff; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
a { color: var(--link); }
h1 { font-size: 26px; margin: 8px 0 6px; } h2 { font-size: 19px; margin: 32px 0 6px; } h3 { font-size: 15px; margin: 18px 0 6px; }
h4 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 18px 0 6px; }
.meta, .small, .group, .back { color: var(--muted); } .lead { font-size: 16px; max-width: 75ch; }
.about { max-width: 80ch; border-left: 3px solid var(--rule); padding-left: 14px; margin: 18px 0; }
.total { font-size: 16px; }
table { width: 100%; border-collapse: collapse; background: var(--card); }
th, td { text-align: left; vertical-align: top; padding: 7px 10px; border-bottom: 1px solid var(--rule); }
th { font-size: 12px; color: var(--muted); font-weight: 600; } td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
td.marks { white-space: nowrap; } tr.failed td:first-child { border-left: 3px solid var(--bad); }
.mark { display: inline-block; width: 1.3em; text-align: center; font-weight: 700; } .mark.ok, li.ok { color: var(--ok); } .mark.bad, li.bad, .error { color: var(--bad); }
pre { background: var(--card); border: 1px solid var(--rule); border-radius: 6px; padding: 10px 12px; overflow-x: auto; font: 12.5px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace; white-space: pre; }
pre.notes { white-space: pre-wrap; }
.diff span { display: block; } .diff .p { background: var(--add); } .diff .m { background: var(--del); } .diff .h { background: var(--hunk); color: var(--muted); }
details.run { border: 1px solid var(--rule); border-radius: 8px; padding: 6px 14px; margin: 10px 0; background: var(--card); }
details.run.bad { border-color: var(--bad); }
details.run > summary { cursor: pointer; font-weight: 600; padding: 4px 0; }
details.prompt > summary { cursor: pointer; color: var(--muted); margin: 14px 0 6px; }
ul.checks, ol.actions { padding-left: 20px; } ul.checks { list-style: none; padding-left: 0; } code { font-size: 12.5px; }
.unchanged { color: var(--muted); font-style: italic; }
@media (max-width: 700px) { th:nth-child(2), td:nth-child(2) { display: none; } }
`;

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'cases'), { recursive: true });
fs.writeFileSync(path.join(out, 'style.css'), CSS.trim() + '\n');
fs.writeFileSync(path.join(out, 'index.html'), page(`Obelum translator evals · ${data.model}`, index, ''));
for (const c of data.cases) fs.writeFileSync(path.join(out, 'cases', `${slug(c.id)}.html`), page(`${c.id} · Obelum evals`, casePage(c), '../'));
console.log(`${data.cases.length} case pages + index → ${path.relative(process.cwd(), out) || '.'}`);
