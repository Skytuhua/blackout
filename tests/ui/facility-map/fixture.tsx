import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import type { FacilityMapProps } from '../../../src/shared/facility-map';
import { createFacilityMapFixture } from '../../../src/shared/facility-map-fixture';
import { FacilityMap } from '../../../src/game/facility-map';
import './fixture.css';

type Event = { name: string; value: string | null };
declare global {
  interface Window {
    facilityFixture: { patch: (patch: Partial<FacilityMapProps>) => void; props: FacilityMapProps; events: Event[]; mount: (value: boolean) => void; control: (value: boolean) => void; travel: () => void };
  }
}
function Fixture() {
  const [data, setData] = useState<Partial<FacilityMapProps>>({ view: createFacilityMapFixture() });
  const [mounted, setMounted] = useState(true), [controlled, setControlled] = useState(true);
  const events = window.facilityFixture?.events ?? [];
  const props: FacilityMapProps = {
    view: createFacilityMapFixture(), selectedRoomId: null, selectedAssetId: null, selectedActorId: 'alex', paused: false, speed: 1, reducedMotion: false,
    onSelectRoom: value => { events.push({ name: 'room', value }); if (controlled) setData(previous => ({ ...previous, selectedRoomId: value })); },
    onSelectAsset: value => { events.push({ name: 'asset', value }); if (controlled) setData(previous => ({ ...previous, selectedAssetId: value })); },
    ...data,
  };
  window.facilityFixture = {
    patch: patch => setData(previous => ({ ...previous, ...patch })), props, events, mount: setMounted, control: setControlled,
    travel: () => {
      const view = createFacilityMapFixture();
      view.crew[0].taskId = 'accepted-inspection';
      view.tasks.push({ id: 'accepted-inspection', actorId: 'alex', targetId: 'rack-a-7', action: 'inspect', status: 'traveling', startedAt: 20, arrivalAt: 31, completesAt: 41, progress: 0, path: [{ x: 4, y: 16 }, { x: 15, y: 16 }], reason: null });
      setData(previous => ({ ...previous, view }));
    },
  };
  return <main className="fixture-host">
    <header>Synthetic facility map development data · no engine or mission acceptance</header>
    <div className="fixture-stage">{mounted && <FacilityMap {...props} />}</div>
    <aside>Reserved host sidebar space</aside>
    <footer>Reserved host progress and nearby-equipment space</footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
