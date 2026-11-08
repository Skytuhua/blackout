import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConversationMenu, type ConversationMenuProps } from '../../../src/ui/conversation-menu';

const noop = () => {};
export const emptyProps: ConversationMenuProps = {
  conversations: [], selectedActorId: 'alex', reader: null, savedRuns: [], busy: false, notice: '', error: '', guidanceEnabled: true, speed: 1,
  onClose: noop, onSave: noop, onRefreshSaves: noop, onResumeSave: noop, onReplaySave: noop, onExportSave: noop,
  onOpenEntry: noop, onCloseEntry: noop, onReadEntries: noop, onExecuteProposal: noop, onGuidanceChange: noop,
  onSpeed: noop, onRestart: noop, onStartPractice: noop,
};
describe('controlled menu boundary', () => {
  it('exposes complete home choices and short host messages without a measurement reader', () => {
    const html = renderToStaticMarkup(<ConversationMenu {...emptyProps} notice="Save requested; awaiting storage." error="Storage blocked. Refresh to retry." />);
    for (const label of ['Save game', 'History', 'Saved games', 'Replay and results', 'How to play', 'Guidance', 'Game options', 'Save requested; awaiting storage.', 'Storage blocked. Refresh to retry.']) expect(html).toContain(label);
    expect(html).not.toContain('blackout-font-probe');
    expect(html).not.toContain('1 / 1');
  });
  it('does not mount host advanced replay content on home', () => {
    const html = renderToStaticMarkup(<ConversationMenu {...emptyProps} afterActionContent={<p>Advanced host evidence sentinel</p>} />);
    expect(html).not.toContain('Advanced host evidence sentinel');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
  });
  it('keeps pending host work visible on home without claiming a successful save', () => {
    const html = renderToStaticMarkup(<ConversationMenu {...emptyProps} busy />);
    expect(html).toContain('Working…');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('Game saved');
  });
  it('renders a missing controlled reader truthfully rather than substituting a message', () => {
    const html = renderToStaticMarkup(<ConversationMenu {...emptyProps} reader={{ actorId: 'missing-actor', entryId: 'missing-entry' }} />);
    expect(html).toContain('This entry is no longer available');
  });
});
