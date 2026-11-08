import { describe, expect, it } from 'vitest';
import { entryPresentation, wholeEntryPages } from '../../../src/ui/conversation/history';

describe('whole conversation history', () => {
  it('retains every whole entry beyond the old eight-message window', () => {
    const ids = Array.from({ length: 21 }, (_, index) => `entry-${index}`);
    const pages = wholeEntryPages(ids.map(id => ({ id, height: 60 })), 190, 8);
    expect(pages.flat()).toEqual(ids);
    expect(pages.at(-1)).toEqual(ids.slice(-2));
    expect(pages.every(page => page.length <= 2)).toBe(true);
  });
  it('keeps oversized entries reachable and handles an empty thread', () => {
    expect(wholeEntryPages([{ id: 'report', height: 900 }, { id: 'reply', height: 30 }], 100, 8)).toEqual([['report'], ['reply']]);
    expect(wholeEntryPages([], 0, 8)).toEqual([[]]);
  });
  it('keeps ordinary replies complete and offers full oversized text without truncation', () => {
    const short = 'The controls are repaired. Cooling is recovering.';
    expect(entryPresentation({ kind: 'live', text: short })).toEqual({ text: short, reader: false });
    const text = 'Report detail. '.repeat(100);
    expect(entryPresentation({ kind: 'report', text, summary: short })).toEqual({ text: short, reader: true });
    expect(entryPresentation({ kind: 'fallback', text })).toEqual({ text: 'A longer message is available.', reader: true });
  });
});
