import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FacilityMapProps } from '../../../src/shared/facility-map';
import { createFacilityMapFixture } from '../../../src/shared/facility-map-fixture';
import { FacilityMap } from '../../../src/game/facility-map';
import { createFacilityDemoProjector } from '../../../src/game/facility-demo-projection';
import { initialize } from '../../../src/sim/engine';
import { hotRestart } from '../../../src/content/scenarios/hot-restart';

const props = (patch: Partial<FacilityMapProps> = {}): FacilityMapProps => ({
  view: createFacilityMapFixture(), selectedRoomId: null, selectedAssetId: null, selectedActorId: 'alex',
  paused: false, speed: 1, reducedMotion: false, onSelectRoom: () => {}, onSelectAsset: () => {}, ...patch,
});

describe('public facility map', () => {
  it('shows six decorative rooms without adding selectable rooms or equipment', () => {
    const demo = createFacilityDemoProjector()(initialize(hotRestart, 'decorative-map').observe('player'));
    if (demo.status !== 'available') throw new Error(demo.reason);
    const html = renderToStaticMarkup(<FacilityMap {...props({ view: demo.view, selectedRoomId: null })} demo={demo} />);
    expect(html).not.toContain('class="fm-demo-room-label"');
    expect(html).toContain('Additional rooms are visual only and cannot be entered.');
    expect(demo.view.knownTopology.rooms).toHaveLength(1);
    expect(demo.view.knownTopology.connections).toHaveLength(0);
  });
  it('exposes overview and all seven known rooms as keyboard controls', () => {
    const html = renderToStaticMarkup(<FacilityMap {...props()} />);
    expect(html).toContain('Facility rooms');
    expect(html).toContain('Overview');
    for (const room of createFacilityMapFixture().knownTopology.rooms) expect(html).toContain(room.label);
    expect(html).toContain('<canvas');
  });
  it('names equipment only in its declared room and keeps remote Sam off the floor', () => {
    const html = renderToStaticMarkup(<FacilityMap {...props({ selectedRoomId: 'hall-a' })} />);
    for (let i = 1; i <= 8; i++) expect(html).toContain(`Rack A${i}`);
    expect(html).not.toContain('Rack B1');
    expect(html).toContain('Sam · remote');
    expect(html).not.toContain('cancel_task');
  });
  it('shows the explicit shared supply and truthful unknown equipment', () => {
    const html = renderToStaticMarkup(<FacilityMap {...props({ selectedRoomId: 'power-a' })} />);
    expect(html).toContain('Shared upstream utility / generator transfer');
    expect(html).toContain('UPS A');
    expect(html).toContain('Unknown');
    expect(html).not.toContain('fault');
  });
});
