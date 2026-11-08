import { expect, it } from 'vitest';
import { fallbackCopy } from '../../../src/ui/conversation/fallback-copy';
import { publicTaskProgress } from '../../../src/game/public-task-ui';
import { initialize } from '../../../src/sim/engine';
import { hotRestart } from '../../../src/content/scenarios/hot-restart';
import { request } from '../../sim/mission-policy';
import { withConversationAssignments, createConversations } from '../../../src/shared/conversations';

it('does not infer timeout, credit exhaustion or character workload from broad fallback reasons', () => {
  expect(fallbackCopy('canceled_or_expired')).not.toContain('too long');
  expect(fallbackCopy('provider_quota')).not.toContain('usage limit was reached');
  expect(fallbackCopy('provider_busy')).not.toContain('I’m busy');
});
it.each(['queued', 'blocked'] as const)('does not describe a %s task as active work', status => {
  const engine = initialize(hotRestart, 'waiting-copy'); engine.applyCommand(request(engine, 'inspect', 'controller', { technicianId: 'alex' }));
  const view = engine.observe('player'); view.tasks[0].status = status;
  expect(publicTaskProgress(view, 'alex')?.phase).toBe(status === 'queued' ? 'Waiting to start' : 'Blocked');
  expect(withConversationAssignments(createConversations(), view)[0].assignment.label).toBe(status === 'queued' ? 'Waiting to start' : 'Task blocked');
});
