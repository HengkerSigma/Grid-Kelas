'use strict';

/**
 * Read-only structural parser for Mentari discussion forum responses.
 *
 * This module deliberately does not fetch Mentari data, persist records, decide
 * attendance, or judge whether a post is relevant. Callers must explicitly
 * confirm that the supplied response is complete before evaluating thresholds.
 */
const POST_TYPES = Object.freeze({ TOPIC: 'TOPIC', REPLY: 'REPLY' });
const RULE_TYPES = Object.freeze({ DIRECT_REPLIES: 'direct_replies', DISTINCT_QUESTIONS: 'distinct_questions' });
const AUDIT_STATUS = Object.freeze({
  DATA_INCOMPLETE: 'data_incomplete',
  BELOW_MINIMUM: 'below_minimum',
  COUNT_MET_NEEDS_REVIEW: 'count_met_needs_review',
  CHAT_SEPARATION_UNVERIFIED: 'chat_separation_unverified',
  INVALID_RULE: 'invalid_rule'
});

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function asLevel(value) {
  const level = Number(value);
  return Number.isInteger(level) && level >= 0 ? level : null;
}
function normalizeRule(rule) {
  const source = asRecord(rule);
  if (!source) return null;
  const type = asText(source.type);
  const minimum = Number(source.minimum);
  if (!Object.values(RULE_TYPES).includes(type) || !Number.isInteger(minimum) || minimum < 1) return null;
  return {
    type,
    minimum,
    requireSeparateChats: type === RULE_TYPES.DISTINCT_QUESTIONS ? source.requireSeparateChats !== false : false
  };
}

/**
 * Return unique student posts that directly reply to the supplied topic.
 * Nested replies, lecturer posts, posts for another parent, and malformed posts
 * are excluded. Post bodies and student contact details are never copied.
 */
function collectDirectStudentReplies(topic, posts) {
  const root = asRecord(topic);
  if (!root || !asText(root.id) || !Array.isArray(posts)) return [];
  const topicId = asText(root.id);
  const sectionId = asText(root.id_trx_course_sub_section);
  const seen = new Set();
  const replies = [];
  for (const value of posts) {
    const post = asRecord(value);
    if (!post) continue;
    const id = asText(post.id);
    const nim = asText(post.nim) || asText(asRecord(post.mahasiswa) && post.mahasiswa.nim);
    const level = asLevel(post.reply_level);
    if (!id || seen.has(id) || !nim) continue;
    if (asText(post.post_type).toUpperCase() !== POST_TYPES.REPLY) continue;
    if (level !== 1 || asText(post.id_parent) !== topicId) continue;
    const postSectionId = asText(post.id_trx_course_sub_section);
    if (sectionId && postSectionId && sectionId !== postSectionId) continue;
    seen.add(id);
    replies.push({ id, nim, createdAt: asText(post.createdAt) || null, parentId: topicId });
  }
  return replies;
}

function summarizeNestedReplies(topic, posts) {
  const root = asRecord(topic);
  if (!root || !asText(root.id) || !Array.isArray(posts)) return 0;
  const topicId = asText(root.id);
  const sectionId = asText(root.id_trx_course_sub_section);
  const byId = new Map();
  for (const value of posts) {
    const post = asRecord(value);
    const id = asText(post && post.id);
    if (id && !byId.has(id)) byId.set(id, post);
  }
  const isTopicDescendant = post => {
    let parentId = asText(post.id_parent);
    const visited = new Set();
    while (parentId && !visited.has(parentId)) {
      if (parentId === topicId) return true;
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) return false;
      parentId = asText(parent.id_parent);
    }
    return false;
  };
  const seen = new Set();
  let count = 0;
  for (const value of posts) {
    const post = asRecord(value);
    if (!post) continue;
    const id = asText(post.id);
    const level = asLevel(post.reply_level);
    const postSectionId = asText(post.id_trx_course_sub_section);
    if (!id || seen.has(id) || asText(post.post_type).toUpperCase() !== POST_TYPES.REPLY) continue;
    if (level === null || level < 2) continue;
    if (sectionId && postSectionId && sectionId !== postSectionId) continue;
    if (!isTopicDescendant(post)) continue;
    seen.add(id);
    count++;
  }
  return count;
}

function evaluateStudent(count, rule, dataComplete) {
  if (!dataComplete) return AUDIT_STATUS.DATA_INCOMPLETE;
  if (!rule) return null;
  if (count < rule.minimum) return AUDIT_STATUS.BELOW_MINIMUM;
  if (rule.type === RULE_TYPES.DISTINCT_QUESTIONS && rule.requireSeparateChats) {
    return AUDIT_STATUS.CHAT_SEPARATION_UNVERIFIED;
  }
  return AUDIT_STATUS.COUNT_MET_NEEDS_REVIEW;
}

/**
 * Build a privacy-minimized audit summary for one forum topic.
 * dataComplete must be explicitly true; false is the safe default because the
 * observed Mentari response contains no pagination/completeness metadata.
 */
function auditForumResponse(options) {
  const input = asRecord(options) || {};
  const topic = asRecord(input.topic);
  const posts = Array.isArray(input.data) ? input.data : [];
  const dataComplete = input.dataComplete === true;
  const rule = normalizeRule(input.rule);
  const directReplies = collectDirectStudentReplies(topic, posts);
  const perStudent = new Map();
  for (const reply of directReplies) {
    let student = perStudent.get(reply.nim);
    if (!student) {
      student = { nim: reply.nim, directPostCount: 0, firstSubmittedAt: null, lastSubmittedAt: null };
      perStudent.set(reply.nim, student);
    }
    student.directPostCount++;
    if (reply.createdAt) {
      if (!student.firstSubmittedAt || reply.createdAt < student.firstSubmittedAt) student.firstSubmittedAt = reply.createdAt;
      if (!student.lastSubmittedAt || reply.createdAt > student.lastSubmittedAt) student.lastSubmittedAt = reply.createdAt;
    }
  }
  const students = Array.from(perStudent.values()).sort((a, b) => a.nim.localeCompare(b.nim));
  const evaluations = students.map(student => ({
    nim: student.nim,
    count: student.directPostCount,
    status: rule ? evaluateStudent(student.directPostCount, rule, dataComplete) : null
  }));
  const uniquePostIds = new Set(posts.map(post => asText(asRecord(post) && post.id)).filter(Boolean));
  return {
    topicId: asText(topic && topic.id) || null,
    courseCode: asText(topic && topic.kode_course) || null,
    sectionId: asText(topic && topic.id_trx_course_sub_section) || null,
    dataComplete,
    rule,
    totals: {
      receivedPosts: posts.length,
      uniquePostIds: uniquePostIds.size,
      directStudentPosts: directReplies.length,
      nestedReplies: summarizeNestedReplies(topic, posts),
      students: students.length
    },
    students,
    evaluations,
    ruleStatus: input.rule && !rule ? AUDIT_STATUS.INVALID_RULE : null,
    limitations: [
      'Kelengkapan data tidak dapat disimpulkan dari jumlah item; dataComplete harus dikonfirmasi pemanggil.',
      'Jumlah postingan tidak membuktikan relevansi isi atau penerimaan dosen.',
      'Identitas chat terpisah belum terverifikasi pada payload yang diamati.'
    ]
  };
}

const forumParser = Object.freeze({
  POST_TYPES, RULE_TYPES, AUDIT_STATUS, collectDirectStudentReplies, auditForumResponse
});
if (typeof module === 'object' && module.exports) module.exports = forumParser;
if (typeof window !== 'undefined') window.GridKelasMentariForumParser = forumParser;
