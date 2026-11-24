'use strict';

const forumParser = require('./forum-parser.js');
const TYPES = Object.freeze({
  PRE_TEST: 'PRE_TEST',
  POST_TEST: 'POST_TEST',
  FORUM: 'FORUM',
  QUESTIONNAIRE: 'QUESTIONNAIRE'
});
const STATUS = Object.freeze({
  PARTICIPATED: 'participated',
  NOT_STARTED: 'not_started',
  UNKNOWN: 'unknown',
  NOT_SUPPORTED: 'not_supported'
});

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function classify(item) {
  const source = record(item) || {};
  const template = text(source.kode_template).toUpperCase();
  if (template === 'FORUM') return TYPES.FORUM;
  if (template === 'QUESIONER' || template === 'QUESTIONNAIRE') return TYPES.QUESTIONNAIRE;
  if (template !== 'QUIZ') return null;
  const title = text(source.judul || source.title || source.nama).toLowerCase();
  if (/pre[\s-]*test/.test(title)) return TYPES.PRE_TEST;
  if (/post[\s-]*test/.test(title)) return TYPES.POST_TEST;
  return null;
}
function collectActivities(coursePayload) {
  const course = record(coursePayload);
  if (!course || !Array.isArray(course.peserta) || !record(course.data)) return [];
  const activities = [];
  const seen = new Set();
  for (const [sectionCode, sectionValue] of Object.entries(course.data)) {
    const section = record(sectionValue);
    const meetingMatch = /^PERTEMUAN_(\d+)$/.exec(sectionCode);
    if (!section || !meetingMatch || !Array.isArray(section.sub_section)) continue;
    for (const raw of section.sub_section) {
      const item = record(raw);
      const type = classify(item);
      const id = text(item && item.id);
      if (!item || !type || !id || seen.has(id)) continue;
      seen.add(id);
      activities.push({
        activityId: id,
        courseCode: text(course.kode_course),
        meetingNumber: Number(meetingMatch[1]),
        sectionCode,
        title: text(item.judul || item.title || item.nama) || type,
        type,
        participationSupported: type === TYPES.FORUM
      });
    }
  }
  return activities;
}
function rosterNims(coursePayload) {
  const course = record(coursePayload) || {};
  const seen = new Set();
  for (const value of Array.isArray(course.peserta) ? course.peserta : []) {
    const nim = text(record(value) && record(value).nim);
    if (/^[0-9]{6,20}$/.test(nim)) seen.add(nim);
  }
  return Array.from(seen).sort();
}

/**
 * Build a privacy-minimized, read-only activity preview.
 * A missing or incomplete forum snapshot never labels absent students as not started.
 * Only a verified complete snapshot (dataComplete === true) permits that label.
 */
function buildActivityPreview(coursePayload, forumSnapshots, quizSnapshots) {
  const activities = collectActivities(coursePayload), roster = rosterNims(coursePayload);
  const forums = Array.isArray(forumSnapshots) ? forumSnapshots : [];
  const quizzes = Array.isArray(quizSnapshots) ? quizSnapshots : [];
  const previews = activities.map(activity => {
    if (activity.type === TYPES.FORUM) {
      const snapshot = forums.find(value => { const root = record(value), topic = record(root && root.topic); return text(topic && topic.id_trx_course_sub_section) === activity.activityId; });
      const root = record(snapshot) || {}, topic = record(root.topic), posts = Array.isArray(root.data) ? root.data : [];
      const complete = root.dataComplete === true, direct = forumParser.collectDirectStudentReplies(topic, posts), counts = new Map();
      for (const reply of direct) counts.set(reply.nim, (counts.get(reply.nim) || 0) + 1);
      const participants = roster.map(nim => { const count = counts.get(nim) || 0; return { nim, directReplyCount: count, status: count ? STATUS.PARTICIPATED : complete ? STATUS.NOT_STARTED : STATUS.UNKNOWN }; });
      return { ...activity, forumId: text(topic && topic.id) || null, dataComplete: complete,
        participationStatus: complete ? 'complete_snapshot' : 'partial_or_unverified', rosterCount: roster.length,
        participatedCount: participants.filter(x => x.status === STATUS.PARTICIPATED).length,
        notStartedCount: participants.filter(x => x.status === STATUS.NOT_STARTED).length,
        unknownCount: participants.filter(x => x.status === STATUS.UNKNOWN).length, participants };
    }
    if (activity.type === TYPES.PRE_TEST || activity.type === TYPES.POST_TEST) {
      const snapshot = quizzes.find(value => { const item = record(value) || {}; return text(item.activity_id) === activity.activityId || text(item.quiz_uuid) === activity.activityId; });
      const item = record(snapshot) || {}, complete = item.data_complete === true, results = Array.isArray(item.results) ? item.results : [], byNim = new Map();
      for (const row of results) { const result = record(row), nim = text(result && result.nim); if (/^[0-9]{6,20}$/.test(nim) && !byNim.has(nim)) byNim.set(nim, result); }
      const participants = roster.map(nim => { const result = byNim.get(nim), attempt = text(result && result.attempt_status), participated = attempt === 'graded' || attempt === 'attempt_ungraded';
        return { nim, attemptStatus: attempt || null, status: participated ? STATUS.PARTICIPATED : complete && attempt === 'no_record' ? STATUS.NOT_STARTED : STATUS.UNKNOWN }; });
      return { ...activity, dataComplete: complete, participationStatus: complete ? 'complete_snapshot' : 'partial_or_unverified', rosterCount: roster.length,
        participatedCount: participants.filter(x => x.status === STATUS.PARTICIPATED).length,
        notStartedCount: participants.filter(x => x.status === STATUS.NOT_STARTED).length,
        unknownCount: participants.filter(x => x.status === STATUS.UNKNOWN).length, participants };
    }
    return { ...activity, dataComplete: false, participationStatus: STATUS.NOT_SUPPORTED, rosterCount: roster.length,
      participatedCount: 0, notStartedCount: 0, unknownCount: roster.length, participants: [] };
  });
  return { schemaVersion: '1.0', courseCode: text(record(coursePayload) && record(coursePayload).kode_course), rosterCount: roster.length,
    activityCount: previews.length, activities: previews, privacy: { rawPostsStored: false, studentNamesStored: false, contactDetailsStored: false, contentEvaluated: false } };
}
module.exports = Object.freeze({ TYPES, STATUS, classify, collectActivities, rosterNims, buildActivityPreview });
