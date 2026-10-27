import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPlannerRequest, detectScheduleConflict, findDuplicateTitle, hasAvailabilityHint } from './planner';

test('habit request is routed to habit', () => {
  assert.equal(classifyPlannerRequest('Build a daily meditation habit this week'), 'habit');
});

test('goal request is routed to goal', () => {
  assert.equal(classifyPlannerRequest('Set a goal to learn Spanish by the end of the year'), 'goal');
});

test('milestone request is routed to milestone', () => {
  assert.equal(classifyPlannerRequest('Create a milestone checkpoint for my app launch plan'), 'milestone');
});

test('mixed request defaults to task and preserves task routing', () => {
  assert.equal(classifyPlannerRequest('Finish the product brief and send it tomorrow'), 'task');
});

test('schedule conflicts are detected deterministically', () => {
  const conflict = detectScheduleConflict({ dueDate: '2026-11-01', scheduledTime: '09:00' }, [
    { dueDate: '2026-11-01', scheduledTime: '09:30' },
  ]);
  assert.match(String(conflict ?? ''), /Conflict/i);
});

test('missing availability is flagged', () => {
  assert.equal(hasAvailabilityHint('Plan my week'), false);
});

test('duplicate prevention avoids repeated titles', () => {
  assert.equal(findDuplicateTitle('Morning walk', [{ title: 'morning walk' }, { title: 'Deep work' }]), true);
});
