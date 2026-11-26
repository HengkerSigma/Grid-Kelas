'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sync = require('../../src/features/mentari/activity-sync.js');

const roster = Array.from({ length: 3 }, (_, i) => ({ nim: '26109010000' + (i + 1), nama_mahasiswa: 'Private ' + i }));
const course = {
  kode_course: '20261-01ELSE003-26FTK0021',
  peserta: roster,
  data: {
    PERTEMUAN_2: { sub_section: [
      { id: 'quiz-pre', kode_template: 'QUIZ', judul: 'Pretest' },
      { id: 'forum-1', kode_template: 'FORUM', judul: 'Forum Diskusi' },
      { id: 'quiz-post', kode_template: 'QUIZ', judul: 'Post-test' },
      { id: 'questionnaire-1', kode_template: 'QUESIONER', judul: 'Kuesioner Akhir' },
      { id: 'assignment-1', kode_template: 'ASSIGNMENT', judul: 'Assignment' }
    ] }
  }
};
function post(id, nim, parent) {
  return { id, nim, post_type: 'REPLY', reply_level: 1, id_parent: parent, id_trx_course_sub_section: 'forum-1', konten: 'private' };
}
const topic = { id: 'forum-root', id_trx_course_sub_section: 'forum-1' };

test('discovers the four requested Mentari activity families and excludes assignments', () => {
  const activities = sync.collectActivities(course);
  assert.deepEqual(activities.map(item => item.type), [
    sync.TYPES.PRE_TEST, sync.TYPES.FORUM, sync.TYPES.POST_TEST, sync.TYPES.QUESTIONNAIRE
  ]);
  assert.equal(activities.length, 4);
});

test('incomplete forum snapshot preserves unknown status for absent roster members', () => {
  const preview = sync.buildActivityPreview(course, [{ topic, data: [post('p1', roster[0].nim, topic.id)] }]);
  const forum = preview.activities.find(item => item.type === sync.TYPES.FORUM);
  assert.equal(forum.participatedCount, 1);
  assert.equal(forum.notStartedCount, 0);
  assert.equal(forum.unknownCount, 2);
  assert.equal(forum.participants[1].status, sync.STATUS.UNKNOWN);
});

test('only an explicitly complete forum snapshot can mark absent students not started', () => {
  const preview = sync.buildActivityPreview(course, [{
    topic, data: [post('p1', roster[0].nim, topic.id)], dataComplete: true
  }]);
  const forum = preview.activities.find(item => item.type === sync.TYPES.FORUM);
  assert.equal(forum.participatedCount, 1);
  assert.equal(forum.notStartedCount, 2);
  assert.equal(forum.unknownCount, 0);
});

test('questionnaire is discovered but participation is explicitly unsupported', () => {
  const preview = sync.buildActivityPreview(course, []);
  const questionnaire = preview.activities.find(item => item.type === sync.TYPES.QUESTIONNAIRE);
  assert.equal(questionnaire.participationStatus, sync.STATUS.NOT_SUPPORTED);
  assert.equal(questionnaire.unknownCount, 3);
});

test('preview never copies student names, contact fields, or raw discussion content', () => {
  const preview = sync.buildActivityPreview(course, [{
    topic, data: [Object.assign(post('p1', roster[0].nim, topic.id), {
      mahasiswa: { nama_mahasiswa: 'Private Name', email: 'private@example.test', no_hp: '0812' }
    })]
  }]);
  const serialized = JSON.stringify(preview);
  assert.equal(serialized.includes('Private Name'), false);
  assert.equal(serialized.includes('private@example.test'), false);
  assert.equal(serialized.includes('private'), false);
  assert.equal(preview.privacy.rawPostsStored, false);
});

test('aggregated forum snapshots can be previewed without retaining raw posts', () => {
  const preview = sync.buildActivityPreview(course, [{
    topic, directReplyCounts: [{ nim: roster[0].nim, count: 3 }], dataComplete: false
  }]);
  const forum = preview.activities.find(item => item.type === sync.TYPES.FORUM);
  assert.equal(forum.participatedCount, 1);
  assert.equal(forum.unknownCount, 2);
  assert.equal(forum.notStartedCount, 0);
  assert.equal(forum.participants[0].directReplyCount, 3);
});

test('discovers activities from the array-shaped Mentari user-course payload', () => {
  const payload = {
    kode_course: course.kode_course,
    peserta: roster,
    data: [{
      kode_section: 'PERTEMUAN_1',
      sub_section: [
        { id: 'real-pre', tipe: 'QUIZ', kode_template: 'PRE_TEST', judul: 'Pretest' },
        { id: 'real-forum', tipe: 'FORUM', kode_template: 'FORUM', judul: 'Forum Diskusi' },
        { id: 'real-post', tipe: 'QUIZ', kode_template: 'POST_TEST', judul: 'Posttest' },
        { id: 'real-survey', tipe: 'QUESIONER', kode_template: 'QUESIONER', judul: 'Kuesioner Akhir' },
        { id: 'real-assignment', tipe: 'ASSIGNMENT', kode_template: 'ASSIGNMENT', judul: 'Assignment' }
      ]
    }]
  };
  const activities = sync.collectActivities(payload);
  assert.deepEqual(activities.map(item => item.type), [
    sync.TYPES.PRE_TEST, sync.TYPES.FORUM, sync.TYPES.POST_TEST, sync.TYPES.QUESTIONNAIRE
  ]);
  assert.equal(activities.every(item => item.sectionCode === 'PERTEMUAN_1'), true);
});
