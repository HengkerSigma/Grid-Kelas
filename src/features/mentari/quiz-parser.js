'use strict';

/**
 * Pure parser/mapper for the Mentari quiz detail response.
 * It does not fetch Mentari, write Grid Kelas data, or change review status.
 * Callers must explicitly establish response completeness before treating a
 * null per-student quiz as "not submitted".
 */
const COURSE_CODE_MAP = Object.freeze({
  '26TEL0004': 'KIM',
  '26PAM0007': 'WRG',
  '26PAM0008': 'IND',
  '26PAM0010': 'ENG',
  '26FTK0021': 'FIS',
  '26FTK0011': 'KAL',
  '26TEL0003': 'ELE',
  '26TEL0002': 'ALJ',
  '26TEL0001': 'PRO'
});
const QUIZ_TYPES = Object.freeze({ PRE_TEST: 'PRE_TEST', POST_TEST: 'POST_TEST' });
const STATUS = Object.freeze({
  SUBMITTED: 'submitted',
  NOT_SUBMITTED: 'not_submitted',
  UNKNOWN: 'unknown',
  UNMATCHED_STUDENT: 'unmatched_student',
  INVALID_ATTEMPT: 'invalid_attempt',
  INVALID_RESPONSE: 'invalid_response',
  UNKNOWN_COURSE: 'unknown_course',
  INVALID_SECTION: 'invalid_section',
  INVALID_ACTIVITY: 'invalid_activity'
});

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function timestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function courseCodeFromMentari(value) {
  const code = text(value);
  const match = /-(26(?:TEL|PAM|FTK)\d{4})$/.exec(code);
  return match ? COURSE_CODE_MAP[match[1]] || null : null;
}
function meetingFromSection(value) {
  const match = /^PERTEMUAN_(\d+)$/.exec(text(value));
  if (!match) return null;
  const meeting = Number(match[1]);
  return Number.isInteger(meeting) && meeting >= 1 ? meeting : null;
}
function normalizeStudentIndex(index) {
  const source = record(index) || {};
  const normalized = new Map();
  Object.keys(source).forEach(nim => {
    const studentNo = Number(source[nim]);
    if (/^[0-9]{6,20}$/.test(nim) && Number.isInteger(studentNo) && studentNo >= 1 && studentNo <= 32) {
      normalized.set(nim, studentNo);
    }
  });
  return normalized;
}

/**
 * @param {object} options
 * @param {object} options.response Mentari quiz detail JSON response.
 * @param {object} options.activity Original section activity metadata, including id and kode_template.
 * @param {object} options.studentIndex Trusted { NIM: GridKelasStudentNumber } lookup.
 * @param {boolean} [options.dataComplete=false] Explicit confirmation that data is the full roster.
 */
function mapMentariQuizResponse(options) {
  const input = record(options) || {};
  const response = record(input.response);
  const activity = record(input.activity);
  if (!response || !Array.isArray(response.data)) {
    return { ok: false, status: STATUS.INVALID_RESPONSE, records: [], task: null };
  }

  const activityType = text(activity && activity.kode_template).toUpperCase();
  if (!activity || !text(activity.id) || !Object.values(QUIZ_TYPES).includes(activityType)) {
    return { ok: false, status: STATUS.INVALID_ACTIVITY, records: [], task: null };
  }

  const courseCode = courseCodeFromMentari(response.kode_course);
  if (!courseCode) return { ok: false, status: STATUS.UNKNOWN_COURSE, records: [], task: null };
  const meetingNumber = meetingFromSection(response.kode_section);
  if (!meetingNumber) return { ok: false, status: STATUS.INVALID_SECTION, records: [], task: null };

  const studentIndex = normalizeStudentIndex(input.studentIndex);
  const dataComplete = input.dataComplete === true;
  const seenNims = new Set();
  const records = [];

  for (const value of response.data) {
    const student = record(value);
    if (!student) continue;
    const nim = text(student.nim);
    if (!nim || seenNims.has(nim)) continue;
    seenNims.add(nim);

    const studentNo = studentIndex.get(nim) || null;
    const attempt = record(student.quiz);
    if (!studentNo) {
      records.push({ nim, studentNo: null, status: STATUS.UNMATCHED_STUDENT });
      continue;
    }
    if (!attempt) {
      records.push({
        nim, studentNo,
        status: dataComplete ? STATUS.NOT_SUBMITTED : STATUS.UNKNOWN
      });
      continue;
    }

    const externalSubmissionId = text(attempt.id);
    const submittedAt = timestamp(attempt.end_at);
    if (!externalSubmissionId || submittedAt === null) {
      records.push({ nim, studentNo, status: STATUS.INVALID_ATTEMPT });
      continue;
    }

    const grade = attempt.grade;
    const gradeAt = timestamp(attempt.gradeAt);
    records.push({
      nim,
      studentNo,
      status: STATUS.SUBMITTED,
      externalSubmissionId,
      submittedAt,
      grade: typeof grade === 'number' && Number.isFinite(grade) ? grade : null,
      gradeAt
    });
  }

  const matched = records.filter(item => item.studentNo !== null).length;
  const submitted = records.filter(item => item.status === STATUS.SUBMITTED).length;
  const task = {
    externalActivityId: text(activity.id),
    externalCourseCode: text(response.kode_course),
    courseCode,
    meetingNumber,
    quizType: activityType,
    title: text(response.judul) || (activityType === QUIZ_TYPES.PRE_TEST ? 'Pre-test' : 'Post-test')
  };

  return {
    ok: true,
    status: dataComplete ? 'complete_response' : 'completeness_unverified',
    dataComplete,
    task,
    totals: {
      responseRows: response.data.length,
      uniqueStudents: records.length,
      matchedStudents: matched,
      submitted,
      notSubmitted: records.filter(item => item.status === STATUS.NOT_SUBMITTED).length,
      unknown: records.filter(item => item.status === STATUS.UNKNOWN).length,
      unmatchedStudents: records.filter(item => item.status === STATUS.UNMATCHED_STUDENT).length,
      invalidAttempts: records.filter(item => item.status === STATUS.INVALID_ATTEMPT).length
    },
    records
  };
}

module.exports = Object.freeze({
  COURSE_CODE_MAP, QUIZ_TYPES, STATUS, courseCodeFromMentari,
  meetingFromSection, mapMentariQuizResponse
});
