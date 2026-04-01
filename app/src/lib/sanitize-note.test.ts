import { sanitizeNoteContent } from './sanitize-note';

describe('sanitizeNoteContent', () => {
  it('passes through clean text', () => {
    expect(sanitizeNoteContent('Hello world')).toBe('Hello world');
  });

  it('removes [cite_start] and [cite_end]', () => {
    expect(sanitizeNoteContent('Text [cite_start]ref[cite_end] more')).toBe('Text ref more');
  });

  it('removes [cite] and [/cite]', () => {
    expect(sanitizeNoteContent('A [cite]B[/cite] C')).toBe('A B C');
  });

  it('removes [cite: ...] with content', () => {
    expect(sanitizeNoteContent('See [cite: page 5] here')).toBe('See here');
  });

  it('removes [source: ...] with content', () => {
    expect(sanitizeNoteContent('See [source: doc.pdf] here')).toBe('See here');
  });

  it('removes [ref_start] and [ref_end]', () => {
    expect(sanitizeNoteContent('[ref_start]data[ref_end]')).toBe('data');
  });

  it('is case-insensitive', () => {
    expect(sanitizeNoteContent('[CITE_START][Cite_End]')).toBe('');
  });

  it('collapses double spaces', () => {
    expect(sanitizeNoteContent('word  word')).toBe('word word');
  });

  it('collapses excessive newlines to max 2', () => {
    expect(sanitizeNoteContent('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('trims whitespace', () => {
    expect(sanitizeNoteContent('  text  ')).toBe('text');
  });

  it('handles empty string', () => {
    expect(sanitizeNoteContent('')).toBe('');
  });

  it('handles combined artifacts', () => {
    const input = '[cite_start]Intro[cite_end] and [cite: p1] also [source: x] plus [ref_start]r[ref_end]';
    const result = sanitizeNoteContent(input);
    expect(result).not.toContain('[cite');
    expect(result).not.toContain('[source');
    expect(result).not.toContain('[ref');
    expect(result).toContain('Intro');
    expect(result).toContain('r');
  });
});
