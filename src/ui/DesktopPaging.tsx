import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { paginateText, replaceDraftPage } from './paging';

function useMeasuredPages(text: string, measure: RefObject<HTMLDivElement | null>, probe: RefObject<HTMLSpanElement | null>) {
  const [pages, setPages] = useState([text]);
  useLayoutEffect(() => {
    const element = measure.current; if (!element) return;
    const update = () => {
      if (!element.clientWidth || !element.clientHeight) return;
      const next = paginateText(text, candidate => { element.textContent = `${candidate}\u200b`; return element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth; });
      element.textContent = '';
      setPages(previous => previous.length === next.length && previous.every((p, i) => p === next[i]) ? previous : next);
    };
    update(); const observer = new ResizeObserver(update); observer.observe(element); if (probe.current) observer.observe(probe.current);
    document.fonts.addEventListener('loadingdone', update);
    return () => { observer.disconnect(); document.fonts.removeEventListener('loadingdone', update); };
  }, [text, measure, probe]);
  return pages;
}

export function PageControls({ page, count, onPage, label = 'Text' }: { page: number; count: number; onPage: (page: number) => void; label?: string }) {
  return <div className="blackout-page-controls" aria-label={`${label} pagination`}><button aria-label={`Previous ${label.toLowerCase()} page`} disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft size={18} /></button><span aria-live="polite">{page + 1} / {count}</span><button aria-label={`Next ${label.toLowerCase()} page`} disabled={page >= count - 1} onClick={() => onPage(page + 1)}><ChevronRight size={18} /></button></div>;
}

export function PagedText({ text, label = 'Text' }: { text: string; label?: string }) {
  const measure = useRef<HTMLDivElement>(null), probe = useRef<HTMLSpanElement>(null), [page, setPage] = useState(0), anchor = useRef(0);
  const pages = useMeasuredPages(text, measure, probe);
  const index = Math.min(page, pages.length - 1);
  useLayoutEffect(() => { let offset = 0, next = 0; for (; next < pages.length - 1 && offset + pages[next].length <= anchor.current; next++) offset += pages[next].length; setPage(next); }, [pages]);
  const navigate = (next: number) => { anchor.current = pages.slice(0, next).join('').length; setPage(next); };
  return <div className="blackout-paged-text" data-page-count={pages.length}>
    <div className="blackout-page-window"><div className="blackout-page-copy" aria-label={label} data-testid="page-copy">{pages[index]}</div><div ref={measure} className="blackout-page-copy blackout-measure" aria-hidden="true" /><span ref={probe} className="blackout-font-probe" aria-hidden="true">M</span></div>
    <PageControls page={index} count={pages.length} onPage={navigate} label={label} />
  </div>;
}

/** Each page edits one range of the same retained draft, including pasted long strings. */
export function DraftEditor({ draft, onDraft }: { draft: string; onDraft: (draft: string) => void }) {
  const measure = useRef<HTMLDivElement>(null), probe = useRef<HTMLSpanElement>(null), editor = useRef<HTMLTextAreaElement>(null), [page, setPage] = useState(0);
  const caret = useRef<number | null>(null), pages = useMeasuredPages(draft, measure, probe);
  const index = Math.min(page, pages.length - 1), start = pages.slice(0, index).join('').length, end = start + pages[index].length;
  useLayoutEffect(() => {
    if (caret.current === null || document.activeElement !== editor.current) return;
    let offset = 0, target = 0;
    for (; target < pages.length - 1 && offset + pages[target].length < caret.current; target++) offset += pages[target].length;
    if (target !== page) { setPage(target); return; }
    editor.current?.setSelectionRange(caret.current - offset, caret.current - offset); caret.current = null;
  }, [pages, page]);
  return <div className="blackout-draft" data-draft-length={draft.length}>
    <label htmlFor="blackout-message">Message · {draft.length} / 1600</label>
    <div className="blackout-editor-window"><textarea ref={editor} id="blackout-message" aria-label="Message" spellCheck={false} value={pages[index]} maxLength={1600 - (draft.length - pages[index].length)} onChange={event => { const next = replaceDraftPage(draft, start, end, event.target.value); caret.current = Math.min(next.length, start + event.target.selectionStart); onDraft(next); }} /><div ref={measure} className="blackout-editor-measure blackout-measure" aria-hidden="true" /><span ref={probe} className="blackout-font-probe" aria-hidden="true">M</span></div>
    <PageControls page={index} count={pages.length} onPage={setPage} label="Draft" />
  </div>;
}
