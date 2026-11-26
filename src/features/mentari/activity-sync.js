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
  if (template === 'FORUM' || text(source.tipe).toUpperCase() === 'FORUM') return TYPES.FORUM;
  if (template === 'QUESIONER' || template === 'QUESTIONNAIRE' || ['QUESIONER', 'QUESTIONNAIRE'].includes(text(source.tipe).toUpperCase())) return TYPES.QUESTIONNAIRE;
  const kind = text(source.tipe).toUpperCase();
  if (template === 'PRE_TEST' || (kind === 'QUIZ' && /pre[\s-]*test/.test(text(source.judul || source.title || source.nama).toLowerCase()))) return TYPES.PRE_TEST;
  if (template === 'POST_TEST' || (kind === 'QUIZ' && /post[\s-]*test/.test(text(source.judul || source.title || source.nama).toLowerCase()))) return TYPES.POST_TEST;
  if (template !== 'QUIZ' && kind !== 'QUIZ') return null;
  const title = text(source.judul || source.title || source.nama).toLowerCase();
  if (/pre[\s-]*test/.test(title)) return TYPES.PRE_TEST;
  if (/post[\s-]*test/.test(title)) return TYPES.POST_TEST;
  return null;
}
function collectActivities(coursePayload) {
  const course = record(coursePayload);
  if (!course || !Array.isArray(course.peserta) || !(Array.isArray(course.data) || record(course.data))) return [];
  const activities = [];
  const seen = new Set();
  const sections = Array.isArray(course.data) ? course.data : Object.entries(course.data).map(([kode_section, value]) => ({ ...record(value), kode_section }));
  for (const sectionValue of sections) {
    const section = record(sectionValue);
    const sectionCode = text(section && section.kode_section);
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
function buildActivityPreview(coursePayload, forumSnapshots) {
  const activities = collectActivities(coursePayload);
  const roster = rosterNims(coursePayload);
  const snapshots = Array.isArray(forumSnapshots) ? forumSnapshots : [];
  const previews = activities.map(activity => {
    if (activity.type !== TYPES.FORUM) {
      return {
        ...activity,
        dataComplete: false,
        participationStatus: STATUS.NOT_SUPPORTED,
        rosterCount: roster.length,
        participatedCount: 0,
        notStartedCount: 0,
        unknownCount: roster.length,
        participants: []
      };
    }
    const snapshot = snapshots.find(value => {
      const root = record(value);
      const topic = record(root && root.topic);
      return text(topic && topic.id_trx_course_sub_section) === activity.activityId;
    });
    const root = record(snapshot) || {};
    const topic = record(root.topic);
    const posts = Array.isArray(root.data) ? root.data : [];
    const complete = root.dataComplete === true;
    const counts = new Map();
    if (Array.isArray(root.directReplyCounts)) {
      for (const item of root.directReplyCounts) {
        const row = record(item), nim = text(row && row.nim), count = Number(row && row.count);
        if (/^[0-9]{6,20}$/.test(nim) && Number.isInteger(count) && count > 0) counts.set(nim, count);
      }
    } else {
      const direct = forumParser.collectDirectStudentReplies(topic, posts);
      for (const reply of direct) counts.set(reply.nim, (counts.get(reply.nim) || 0) + 1);
    }
    const participants = roster.map(nim => {
      const count = counts.get(nim) || 0;
      return {
        nim,
        directReplyCount: count,
        status: count > 0 ? STATUS.PARTICIPATED : complete ? STATUS.NOT_STARTED : STATUS.UNKNOWN
      };
    });
    return {
      ...activity,
      forumId: text(topic && topic.id) || null,
      dataComplete: complete,
      participationStatus: complete ? 'complete_snapshot' : 'partial_or_unverified',
      rosterCount: roster.length,
      participatedCount: participants.filter(student => student.status === STATUS.PARTICIPATED).length,
      notStartedCount: participants.filter(student => student.status === STATUS.NOT_STARTED).length,
      unknownCount: participants.filter(student => student.status === STATUS.UNKNOWN).length,
      participants
    };
  });
  return {
    schemaVersion: '1.0',
    courseCode: text(record(coursePayload) && record(coursePayload).kode_course),
    rosterCount: roster.length,
    activityCount: previews.length,
    activities: previews,
    privacy: {
      rawPostsStored: false,
      studentNamesStored: false,
      contactDetailsStored: false,
      contentEvaluated: false
    }
  };
}

module.exports = Object.freeze({ TYPES, STATUS, classify, collectActivities, rosterNims, buildActivityPreview });
