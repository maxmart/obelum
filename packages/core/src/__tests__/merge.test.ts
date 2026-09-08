import { merge3 } from '../merge.js';

describe('merge3', () => {
  it('takes theirs when ours is the base', () => {
    expect(merge3('a\nb\n', 'a\nb\n', 'a\nB\n')).toEqual({ clean: true, content: 'a\nB\n' });
  });

  it('keeps ours when theirs did not change, or made the same change', () => {
    expect(merge3('a\nX\n', 'a\nb\n', 'a\nb\n')).toEqual({ clean: true, content: 'a\nX\n' });
    expect(merge3('a\nX\n', 'a\nb\n', 'a\nX\n')).toEqual({ clean: true, content: 'a\nX\n' });
  });

  it('merges changes to different regions', () => {
    expect(merge3('a\nb\nc\nd\ne\n', 'a\nb\nc\nd\ne\nf\n', 'a\nB\nc\nd\ne\nf\n'))
      .toEqual({ clean: true, content: 'a\nB\nc\nd\ne\n' });
  });

  it('refuses overlapping changes as a whole', () => {
    expect(merge3('a\nb\nc\n', 'a\nb\nc\nd\n', 'a\nb\nc\nD\n')).toEqual({ clean: false });
  });

  it('treats an empty base as the birth of the file', () => {
    expect(merge3('', '', 'new\n')).toEqual({ clean: true, content: 'new\n' });
  });
});
