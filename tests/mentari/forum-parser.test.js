'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../../src/features/mentari/forum-parser.js');

const topic = { id: 'topic-1', kode_course: 'COURSE-1', id_trx_course_sub_section: 'section-1' };
function post(id, nim, level, parent, extra) {
  return Object.assign({
    id, nim, post_type: 'REPLY', reply_level: level, id_parent: parent,
    id_trx_course_sub_section: 'section-1', createdAt: '2026-11-10T03:00:00.000Z',
    konten: 'private body'
  }, extra || {});
}

test('counts only unique direct student replies to the selected topic', () => {
  const data = [
    post('p1', 'STUDENT-A', 1, 'topic-1'), post('p2', 'STUDENT-A', 2, 'p1'),
    post('p3', 'STUDENT-B', 1, 'topic-1'), post('p4', 'STUDENT-A', 1, 'topic-1'),
    post('p5', 'STUDENT-A', 1, 'topic-1'), post('p6', 'STUDENT-A', 1, 'topic-1'),
    post('p7', '', 1, 'topic-1', { id_dosen: 'LECTURER' }),
    post('p8', 'STUDENT-C', 1, 'other-topic'),
    post('p9', 'STUDENT-C', 1, 'topic-1', { id_trx_course_sub_section: 'other-section' })
  ];
  const replies = parser.collectDirectStudentReplies(topic, data.concat(data[0]));
  assert.equal(replies.length, 5);
  assert.deepEqual(replies.map(item => item.id), ['p1', 'p3', 'p4', 'p5', 'p6']);
});

test('nested replies are counted only when their parent chain reaches the topic', () => {
  const data = [
    post('direct-1', 'STUDENT-A', 1, 'topic-1'),
    post('nested-1', 'STUDENT-A', 2, 'direct-1'),
    post('nested-2', 'LECTURER', 2, 'nested-1'),
    post('unrelated', 'STUDENT-B', 2, 'some-other-post'),
    post('cycle-a', 'STUDENT-C', 2, 'cycle-b'),
    post('cycle-b', 'STUDENT-C', 2, 'cycle-a')
  ];
  const audit = parser.auditForumResponse({ topic, data, dataComplete: true });
  assert.equal(audit.totals.nestedReplies, 2);
});

test('direct-reply threshold is a structural result and still requires content review', () => {
  const data = Array.from({ length: 4 }, (_, index) => post('reply-' + index, 'STUDENT-A', 1, 'topic-1'));
  const audit = parser.auditForumResponse({
    topic, data, dataComplete: true,
    rule: { type: parser.RULE_TYPES.DIRECT_REPLIES, minimum: 4 }
  });
  assert.equal(audit.evaluations[0].status, parser.AUDIT_STATUS.COUNT_MET_NEEDS_REVIEW);
  assert.equal(audit.students[0].directPostCount, 4);
  assert.equal(Object.hasOwn(audit.students[0], 'konten'), false);
});

test('incomplete response never yields a below-minimum conclusion', () => {
  const audit = parser.auditForumResponse({
    topic, data: [post('reply-1', 'STUDENT-A', 1, 'topic-1')],
    rule: { type: parser.RULE_TYPES.DIRECT_REPLIES, minimum: 4 }
  });
  assert.equal(audit.dataComplete, false);
  assert.equal(audit.evaluations[0].status, parser.AUDIT_STATUS.DATA_INCOMPLETE);
});

test('15 direct posts cannot prove 15 separate forum chats', () => {
  const data = Array.from({ length: 15 }, (_, index) => post('question-' + index, 'STUDENT-Q', 1, 'topic-1'));
  const audit = parser.auditForumResponse({
    topic, data, dataComplete: true,
    rule: { type: parser.RULE_TYPES.DISTINCT_QUESTIONS, minimum: 15 }
  });
  assert.equal(audit.evaluations[0].count, 15);
  assert.equal(audit.evaluations[0].status, parser.AUDIT_STATUS.CHAT_SEPARATION_UNVERIFIED);
});

test('invalid rule is surfaced without guessing a threshold', () => {
  const audit = parser.auditForumResponse({
    topic, data: [], rule: { type: 'automatic_attendance', minimum: 0 }
  });
  assert.equal(audit.rule, null);
  assert.equal(audit.ruleStatus, parser.AUDIT_STATUS.INVALID_RULE);
});
