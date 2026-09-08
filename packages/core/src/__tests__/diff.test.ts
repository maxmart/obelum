import { unifiedDiff, gitAnchor } from '../diff.js';

describe('unifiedDiff', () => {
  it('is empty when nothing changed', () => {
    expect(unifiedDiff('a\n', 'a\n')).toBe('');
  });

  it('matches git\'s hunk ranges and default funcname header', () => {
    const before = 'Pricing (no)\nline A\nline B\nline C\n';
    expect(unifiedDiff(before, before.replace('line B', 'line B!'))).toBe(
      '@@ -1,4 +1,4 @@\n Pricing (no)\n line A\n-line B\n+line B!\n line C');
    expect(unifiedDiff(before, before + 'Vipps\n')).toBe(
      '@@ -2,3 +2,4 @@ Pricing (no)\n line A\n line B\n line C\n+Vipps');
    expect(unifiedDiff('', 'a\nb\n')).toBe('@@ -0,0 +1,2 @@\n+a\n+b');
  });

  it('splits distant changes into hunks with three lines of context', () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n') + '\n';
    const after = before.replace('l2\n', 'L2\n').replace('l17\n', 'L17\n');
    expect(unifiedDiff(before, after)).toBe([
      '@@ -1,6 +1,6 @@', ' l0', ' l1', '-l2', '+L2', ' l3', ' l4', ' l5',
      '@@ -15,6 +15,6 @@ l13', ' l14', ' l15', ' l16', '-l17', '+L17', ' l18', ' l19',
    ].join('\n'));
  });

  it('marks a missing trailing newline the way git does', () => {
    expect(unifiedDiff('PNGv1', 'PNGv2')).toBe(
      '@@ -1 +1 @@\n-PNGv1\n\\ No newline at end of file\n+PNGv2\n\\ No newline at end of file');
  });

  it('names the hunk after the nearest anchor line strictly above it', () => {
    const before = '<A id="top">\n  x\n  <B id="mid">\n  y\n  z\n';
    const mdx = (line: string) => line.trimStart().startsWith('<');
    // The hunk starts at old line 2 ("x"): "<B" is inside it, so "<A" is the anchor.
    expect(unifiedDiff(before, before.replace('z', 'Z'), mdx)).toBe(
      '@@ -2,4 +2,4 @@ <A id="top">\n   x\n   <B id="mid">\n   y\n-  z\n+  Z');
    // No anchor above: no header text.
    expect(unifiedDiff('  a\n  b\n', '  a\n  B\n', mdx)).toBe('@@ -1,2 +1,2 @@\n   a\n-  b\n+  B');
  });

  it('gitAnchor is a line starting with a letter, _ or $', () => {
    expect(['fn a', '_x', '$y'].every(gitAnchor)).toBe(true);
    expect(['  indented', '<tag>', '', '1'].some(gitAnchor)).toBe(false);
  });
});
