'use strict';

const { STATUS } = require('./quiz-parser.js');

function validMappedResult(mapped) {
  return !!(mapped && mapped.ok === true && mapped.task &&
    typeof mapped.task.externalActivityId === 'string' && mapped.task.externalActivityId &&
    typeof mapped.task.courseCode === 'string' && Number.isInteger(mapped.task.meetingNumber) &&
    Array.isArray(mapped.records));
}
function sameActivity(task, mappedTask) {
  return !!(task && task.mentariSync &&
    task.mentariSync.externalActivityId === mappedTask.externalActivityId &&
    task.k === mappedTask.courseCode && Number(task.meeting_number) === mappedTask.meetingNumber);
}

/** Build a read-only plan. No database writes are performed. */
function buildMentariQuizSyncPlan(options) {
  const input = options && typeof options === 'object' ? options : {};
  const mapped = input.mapped;
  if (!validMappedResult(mapped)) return { ok: false, status: 'invalid_mapping', operations: [] };
  if (mapped.dataComplete !== true) return { ok: false, status: 'incomplete_roster', operations: [] };
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const matches = tasks.filter(task => sameActivity(task, mapped.task));
  if (matches.length > 1) return { ok: false, status: 'ambiguous_task_match', operations: [] };
  const taskOperation = matches.length === 1
    ? { type: 'update_task_metadata', taskId: matches[0].id, externalActivityId: mapped.task.externalActivityId }
    : { type: 'create_task_draft', courseCode: mapped.task.courseCode,
        meetingNumber: mapped.task.meetingNumber, title: mapped.task.title,
        quizType: mapped.task.quizType, externalActivityId: mapped.task.externalActivityId };
  const operations = [taskOperation];
  const submissions = input.submissions && typeof input.submissions === 'object' ? input.submissions : {};
  for (const item of mapped.records) {
    if (item.status !== STATUS.SUBMITTED) continue;
    const current = submissions[String(item.studentNo)];
    if (current && !current.mentariSync) {
      operations.push({ type: 'preserve_existing_submission', studentNo: item.studentNo });
      continue;
    }
    if (current && current.mentariSync &&
        current.mentariSync.externalActivityId === mapped.task.externalActivityId &&
        current.mentariSync.externalSubmissionId === item.externalSubmissionId &&
        Number(current.at) >= item.submittedAt) {
      operations.push({ type: 'noop_existing_attempt', studentNo: item.studentNo });
      continue;
    }
    operations.push({
      type: current ? 'update_mentari_submission' : 'create_mentari_submission',
      studentNo: item.studentNo, at: item.submittedAt,
      mentariSync: { externalActivityId: mapped.task.externalActivityId,
        externalSubmissionId: item.externalSubmissionId, source: 'mentari' }
    });
  }
  return {
    ok: true, status: 'dry_run', writesEnabled: false,
    task: { courseCode: mapped.task.courseCode, meetingNumber: mapped.task.meetingNumber,
      quizType: mapped.task.quizType, externalActivityId: mapped.task.externalActivityId },
    preserveReviewMetadata: true, operations
  };
}

/** Merge one student's submission; never modifies the separate __review property. */
function mergeMentariSubmission(existing, incoming) {
  const current = existing && typeof existing === 'object' ? existing : null;
  if (!incoming || !Number.isInteger(incoming.studentNo) || !Number.isFinite(incoming.at) ||
      !incoming.mentariSync || !incoming.mentariSync.externalActivityId ||
      !incoming.mentariSync.externalSubmissionId) return { applied: false, reason: 'invalid_incoming' };
  if (current && !current.mentariSync)
    return { applied: false, reason: 'manual_submission_preserved', value: current };
  if (current && Number(current.at) > incoming.at)
    return { applied: false, reason: 'newer_existing_submission_preserved', value: current };
  return { applied: true, value: {
    ...(current || {}), tautan: current && current.tautan || '',
    catatan: current && current.catatan || '', berkas: current && current.berkas || null,
    at: incoming.at, mentariSync: { ...incoming.mentariSync }
  }};
}
module.exports = Object.freeze({ buildMentariQuizSyncPlan, mergeMentariSubmission });
