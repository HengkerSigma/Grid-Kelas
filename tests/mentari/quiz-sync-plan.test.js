'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMentariQuizSyncPlan, mergeMentariSubmission } = require('../../src/features/mentari/quiz-sync-plan.js');
const mapped = {
  ok: true, dataComplete: true,
  task: { externalActivityId: 'activity-pre', courseCode: 'FIS', meetingNumber: 15, quizType: 'PRE_TEST', title: 'Pretest' },
  records: [
    { status: 'submitted', studentNo: 1, externalSubmissionId: 'attempt-1', submittedAt: 1763000000000 },
    { status: 'submitted', studentNo: 2, externalSubmissionId: 'attempt-2', submittedAt: 1763000001000 },
    { status: 'unknown', studentNo: 3 }
  ]
};
test('creates a dry-run task draft keyed by activity ID, course, and meeting', () => {
  const plan = buildMentariQuizSyncPlan({ mapped, tasks: [], submissions: {} });
  assert.equal(plan.ok, true); assert.equal(plan.writesEnabled, false);
  assert.equal(plan.operations[0].type, 'create_task_draft');
  assert.equal(plan.operations[0].externalActivityId, 'activity-pre');
});
test('keeps Pre-test and Post-test distinct by external activity ID', () => {
  const tasks = [{ id: 'task-post', k: 'FIS', meeting_number: 15, mentariSync: { externalActivityId: 'activity-post' } }];
  assert.equal(buildMentariQuizSyncPlan({ mapped, tasks }).operations[0].type, 'create_task_draft');
});
test('refuses incomplete roster and ambiguous activity matches', () => {
  assert.equal(buildMentariQuizSyncPlan({ mapped: { ...mapped, dataComplete: false } }).status, 'incomplete_roster');
  const tasks = [1, 2].map(id => ({ id, k: 'FIS', meeting_number: 15, mentariSync: { externalActivityId: 'activity-pre' } }));
  assert.equal(buildMentariQuizSyncPlan({ mapped, tasks }).status, 'ambiguous_task_match');
});
test('preserves manual submissions instead of replacing them with Mentari', () => {
  const manual = { tautan: 'https://example.test/manual', catatan: 'manual', at: 1763000000000 };
  const result = mergeMentariSubmission(manual, { studentNo: 1, at: 1763000002000,
    mentariSync: { externalActivityId: 'activity-pre', externalSubmissionId: 'attempt-1' } });
  assert.equal(result.applied, false); assert.equal(result.reason, 'manual_submission_preserved');
  assert.equal(result.value, manual);
});
test('updates same-source Mentari submission and retains ancillary fields', () => {
  const result = mergeMentariSubmission({ at: 1763000000000, tautan: 'https://example.test/file',
    catatan: 'note', berkas: { id: 'file-1' },
    mentariSync: { externalActivityId: 'activity-pre', externalSubmissionId: 'old-attempt' } },
  { studentNo: 1, at: 1763000002000, mentariSync: { externalActivityId: 'activity-pre', externalSubmissionId: 'attempt-1' } });
  assert.equal(result.applied, true); assert.equal(result.value.at, 1763000002000);
  assert.equal(result.value.tautan, 'https://example.test/file'); assert.equal(result.value.berkas.id, 'file-1');
});
test('does not move a newer existing submission backwards', () => {
  const result = mergeMentariSubmission({ at: 1763000005000,
    mentariSync: { externalActivityId: 'activity-pre', externalSubmissionId: 'attempt-1' } },
  { studentNo: 1, at: 1763000002000, mentariSync: { externalActivityId: 'activity-pre', externalSubmissionId: 'attempt-1' } });
  assert.equal(result.applied, false); assert.equal(result.reason, 'newer_existing_submission_preserved');
});
