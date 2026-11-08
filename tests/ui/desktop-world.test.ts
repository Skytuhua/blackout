import { describe, expect, it } from 'vitest';
import { hotRestart } from '../../src/content/scenarios/hot-restart';
import { alarmFixture } from '../../src/shared/fixtures';
import { Commander, fitWorld, moveCrewIntent, routePosition } from '../../src/game/desktop-world';

describe('desktop presentation boundaries', () => {
  it('fits integer pixels against both dimensions', () => {
    expect(fitWorld(976, 592)).toEqual({ scale: 3, width: 960, height: 576 });
    expect(fitWorld(1600, 590)).toEqual({ scale: 3, width: 960, height: 576 });
    expect(fitWorld(1616, 952).scale).toBe(4);
  });
  it('moves cardinally at two tiles per second and stops at public walls', () => {
    const commander = new Commander(hotRestart.topology);
    commander.hold('e'); commander.advance(.5, 1);
    expect(commander.position).toEqual({ x: 11, y: 6 });
    commander.hold('s'); commander.advance(.5, 1);
    expect(commander.position).toEqual({ x: 12, y: 6 });
    commander.clear(); commander.hold('s'); commander.advance(2, 1);
    expect(commander.position).toEqual({ x: 12, y: 6 }); // wall row seven
    commander.clear(); commander.advance(2, 4);
    expect(commander.position).toEqual({ x: 12, y: 6 });
  });
  it('cannot cross equipment or a wall on a long frame', () => {
    const commander = new Commander(hotRestart.topology, { x: 9, y: 6 });
    commander.hold('n'); commander.advance(10, 4);
    expect(commander.position).toEqual({ x: 9, y: 4 });
  });
  it('emits only an offered player movement for an idle field technician', () => {
    const view = { ...alarmFixture, knownTopology: hotRestart.topology, crew: hotRestart.crew, affordances: [{ action: 'move_crew' as const, targetId: 'alex', enabled: true, reason: null, technicianIds: [], travelSeconds: null, workSeconds: 0 }] };
    expect(moveCrewIntent(view, 'alex', { x: 10, y: 6 })).toEqual({ action: 'move_crew', targetId: 'alex', atSimTime: 75, args: { destination: { x: 10, y: 6 } } });
    expect(moveCrewIntent({ ...view, crew: view.crew.map(c => c.id === 'alex' ? { ...c, taskId: 'busy' } : c) }, 'alex', { x: 10, y: 6 })).toBeNull();
    expect(moveCrewIntent(view, 'sam', { x: 10, y: 6 })).toBeNull();
    expect(moveCrewIntent(view, 'alex', { x: 2, y: 2 })).toBeNull();
    expect(moveCrewIntent({ ...view, affordances: [] }, 'alex', { x: 10, y: 6 })).toBeNull();
    expect(moveCrewIntent({ ...view, mission: { ...view.mission, status: 'success' } }, 'alex', { x: 10, y: 6 })).toBeNull();
  });
  it('interpolates the accepted route around corners, by taskId only', () => {
    const task = { id: 'accepted', actorId: 'alex', targetId: 'cooling-1', action: 'inspect' as const, status: 'traveling' as const, startedAt: 10, arrivalAt: 14, completesAt: 44, progress: 0, reason: null, path: [{ x: 3, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 6 }] };
    const crew = { ...hotRestart.crew[0], taskId: 'accepted' };
    expect(routePosition(crew, task, 12, hotRestart.topology)).toEqual({ x: 4.5, y: 5 });
    expect(routePosition(crew, task, 14, hotRestart.topology)).toEqual({ x: 5, y: 6 });
    expect(routePosition({ ...crew, taskId: null }, task, 12, hotRestart.topology)).toEqual({ x: 3, y: 5 });
    expect(routePosition(crew, { ...task, path: [{ x: 3, y: 5 }, { x: 5, y: 6 }] }, 12, hotRestart.topology)).toEqual({ x: 3, y: 5 });
  });
});
