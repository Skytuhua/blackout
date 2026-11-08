import type { ConversationEntry } from '../../shared/contracts';

/** Pages end at the newest entry; no retained entry is sliced or discarded. */
export function wholeEntryPages(entries: { id: string; height: number }[], available: number, gap: number): string[][] {
  const pages: string[][] = []; let page: string[] = [], used = 0;
  for (const entry of [...entries].reverse()) {
    const height = entry.height + (page.length ? gap : 0);
    if (page.length && used + height > available) { pages.unshift(page); page = []; used = 0; }
    used += entry.height + (page.length ? gap : 0); page.unshift(entry.id);
  }
  if (page.length) pages.unshift(page);
  return pages.length ? pages : [[]];
}

export function entryPresentation(entry: Pick<ConversationEntry, 'kind' | 'text' | 'summary' | 'sections'>, oversized = false) {
  const reader = oversized || entry.text.length > 260 || !!entry.sections?.length;
  return { reader, text: reader ? !oversized && entry.summary && entry.summary.length <= 260 ? entry.summary : entry.kind === 'report' ? 'A detailed report is available.' : 'A longer message is available.' : entry.text };
}
