'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../../src/features/mentari/quiz-parser.js');

const activity = { id: 'activity-pre-1', kode_template: 'PRE_TEST' };
const response = {
  kode_course: '20261-01ELSE003-26FTK0021',
  kode_section: 'PERTEMUAN_15',
  judul: 'Pretest',
  quiz: { id: 'session-id', end_at: '2026-11-13T02:00:00.000Z' },
  data: [
    { nim: '1234567890', quiz: { id: 'attempt-1', end_at: '2026-11-13T01:45:00.000Z', grade: 100, gradeAt: null } },
    { nim: '1234567891', quiz: null },
    { nim: '1234567892', quiz: { id: 'attempt-2', end_at: '2026-11-13T01:50:00.000Z', grade: 80 } }
  ]
};
const studentIndex = { '1234567890': 1, '1234567891': 2, '1234567892': 3 };

test('maps Mentari course suffixes to Grid Kelas course codes', () => {
  assert.equal(parser.courseCodeFromMentari('20261-01ELSE003-26FTK0021'), 'FIS');
  assert.equal(parser.courseCodeFromMentari('20261-01ELSE003-26TEL0004'), 'KIM');
  assert.equal(parser.courseCodeFromMentari('20261-01ELSE003-26PAM0010'), 'ENG');
  assert.equal(parser.courseCodeFromMentari('20261-01ELSE003-26TEL0001'), 'PRG');
  assert.equal(parser.courseCodeFromMentari('unknown'), null);
});

test('uses PERTEMUAN_N, not activity order or sort number', () => {
  assert.equal(parser.meetingFromSection('PERTEMUAN_15'), 15);
  assert.equal(parser.meetingFromSection('GENERAL'), null);
  assert.equal(parser.meetingFromSection('PERTEMUAN_0'), null);
});

test('maps per-student attempts and uses each attempt end_at for Time Tower', () => {
  const result = parser.mapMentariQuizResponse({ response, activity, studentIndex, dataComplete: true });
  assert.equal(result.ok, true);
  assert.equal(result.task.courseCode, 'FIS');
  assert.equal(result.task.meetingNumber, 15);
  assert.equal(result.task.quizType, 'PRE_TEST');
  assert.equal(result.records[0].status, parser.STATUS.SUBMITTED);
  assert.equal(result.records[0].externalSubmissionId, 'attempt-1');
  assert.equal(result.records[0].submittedAt, Date.parse('2026-11-13T01:45:00.000Z'));
  assert.equal(result.records[0].grade, 100);
  assert.equal(result.records[1].status, parser.STATUS.NOT_SUBMITTED);
  assert.equal(result.records[2].submittedAt, Date.parse('2026-11-13T01:50:00.000Z'));
});

test('null quiz remains unknown unless the caller confirms a complete roster', () => {
  const result = parser.mapMentariQuizResponse({ response, activity, studentIndex });
  assert.equal(result.dataComplete, false);
  assert.equal(result.records[1].status, parser.STATUS.UNKNOWN);
  assert.equal(result.totals.notSubmitted, 0);
});

test('does not use the top-level quiz timestamp as a student submission time', () => {
  const changed = Object.assign({}, response, {
    quiz: { id: 'root-session', end_at: '2026-11-13T02:00:00.000Z' },
    data: [{ nim: '1234567890', quiz: null }]
  });
  const result = parser.mapMentariQuizResponse({ response: changed, activity, studentIndex, dataComplete: true });
  assert.equal(result.records[0].status, parser.STATUS.NOT_SUBMITTED);
  assert.equal(Object.hasOwn(result.records[0], 'submittedAt'), false);
});

test('rejects missing or untrusted quiz activity metadata', () => {
  const result = parser.mapMentariQuizResponse({ response, activity: { id: 'a', kode_template: 'QUIZ' }, studentIndex });
  assert.equal(result.ok, false);
  assert.equal(result.status, parser.STATUS.INVALID_ACTIVITY);
});

test('reports unmatched students and malformed attempts without guessing', () => {
  const changed = Object.assign({}, response, {
    data: [
      { nim: '1234567899', quiz: { id: 'attempt-x', end_at: '2026-11-13T01:00:00Z' } },
      { nim: '1234567890', quiz: { id: 'attempt-bad', end_at: 'not-a-date' } }
    ]
  });
  const result = parser.mapMentariQuizResponse({ response: changed, activity, studentIndex });
  assert.equal(result.records[0].status, parser.STATUS.UNMATCHED_STUDENT);
  assert.equal(result.records[1].status, parser.STATUS.INVALID_ATTEMPT);
});

test('does not leak names, email addresses, or response content into mapped records', () => {
  const changed = Object.assign({}, response, {
    data: [{ nim: '1234567890', nama_mahasiswa: 'Private Name', alamat_email: 'private@example.test', quiz: response.data[0].quiz }]
  });
  const result = parser.mapMentariQuizResponse({ response: changed, activity, studentIndex });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('Private Name'), false);
  assert.equal(serialized.includes('private@example.test'), false);
  assert.equal(serialized.includes('konten'), false);
});

test('deduplicates repeated roster rows by NIM', () => {
  const changed = Object.assign({}, response, { data: [response.data[0], response.data[0]] });
  const result = parser.mapMentariQuizResponse({ response: changed, activity, studentIndex });
  assert.equal(result.records.length, 1);
});
