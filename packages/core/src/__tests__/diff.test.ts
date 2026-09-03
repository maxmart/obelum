import { generateAnchoredDiff } from '../diff.js';

/**
 * A `dropLines` filter, of the kind a caller supplies.
 *
 * These tests used to import the CMS's, which is how the engine's own test
 * suite came to depend on the document layer it exists not to know about.
 * The whole point of the parameter is that the engine never learns what a
 * revision line looks like — so neither does this file.
 *
 * Written the way a caller would: `synced:` is a YAML block, so its indented
 * children go with it.
 */
function stripSyncMetadataLines(lines: string[]): string[] {
  const out: string[] = [];
  let inSyncedBlock = false;
  for (const line of lines) {
    if (/^synced:\s*/.test(line)) { inSyncedBlock = true; continue; }
    if (inSyncedBlock) {
      if (/^\s+\S/.test(line)) continue;
      inSyncedBlock = false;
    }
    if (/^rev:\s*/.test(line)) continue;
    out.push(line);
  }
  return out;
}

const page = (title: string, body: string) => `---
title: ${title}
rev: 3
synced:
  no: 2
  en: 1
---

<CmHero
  id="hero-1"
  title="${title}"
/>

<CmText id="text-1">
  ${body}
</CmText>
`;

describe('generateAnchoredDiff', () => {
  it('returns empty for identical content', () => {
    expect(generateAnchoredDiff(page('Hi', 'Body'), page('Hi', 'Body'))).toBe('');
  });

  it('returns empty when only lines the caller drops changed', () => {
    // The differ knows nothing about vector clocks; the caller passes the
    // filter. Translation supplies stripSyncMetadataLines so the model never
    // sees a rev bump and reports it as an edit.
    const before = page('Hi', 'Body');
    const after = before.replace('rev: 3', 'rev: 4').replace('no: 2', 'no: 3');
    expect(generateAnchoredDiff(before, after, stripSyncMetadataLines)).toBe('');
    // and without a filter it is a plain line diff, which is what it is
    expect(generateAnchoredDiff(before, after)).toContain('rev: 4');
  });

  it('anchors a change to the nearest id line above it', () => {
    const diff = generateAnchoredDiff(page('Hi', 'old body'), page('Hi', 'new body'));
    expect(diff).toContain('@@<CmText id="text-1">@@');
    expect(diff).toContain('-  old body');
    expect(diff).toContain('+  new body');
  });

  it('marks removed and added lines with -/+ and keeps context', () => {
    const diff = generateAnchoredDiff(page('Old title', 'Body'), page('New title', 'Body'));
    expect(diff).toContain('-title: Old title');
    expect(diff).toContain('+title: New title');
    // The changed attribute inside the hero anchors to the hero's id line.
    expect(diff).toContain('@@  id="hero-1"@@');
  });

  it('normalizes CRLF input so line endings never show up as changes', () => {
    const before = page('Hi', 'Body');
    const after = before.replace(/\n/g, '\r\n');
    expect(generateAnchoredDiff(before, after)).toBe('');
  });
});
