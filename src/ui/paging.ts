/** The caller measures actual rendered text. Never trim, truncate or elide a record. */
export function paginateText(text: string, fits: (candidate: string) => boolean): string[] {
  if (!text) return [''];
  const points = Array.from(text), pages: string[] = [];
  let start = 0;
  while (start < points.length) {
    let low = 1, high = points.length - start, best = 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (fits(points.slice(start, start + middle).join(''))) { best = middle; low = middle + 1; } else high = middle - 1;
    }
    pages.push(points.slice(start, start + best).join('')); start += best;
  }
  return pages;
}

export function replaceDraftPage(draft: string, start: number, end: number, replacement: string): string {
  const capacity = Math.max(0, 1600 - (draft.length - (end - start)));
  let inserted = replacement.slice(0, capacity);
  if (/[\uD800-\uDBFF]$/.test(inserted)) inserted = inserted.slice(0, -1);
  return draft.slice(0, start) + inserted + draft.slice(end);
}
