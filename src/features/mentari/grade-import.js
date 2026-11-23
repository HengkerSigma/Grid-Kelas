'use strict';

const COURSE_MAP = Object.freeze({
  '26FTK0011':'KAL','26FTK0021':'FIS','26PAM0007':'WRG','26PAM0008':'IND',
  '26PAM0010':'ENG','26TEL0001':'PRG','26TEL0002':'ALJ','26TEL0003':'ELE','26TEL0004':'KIM'
});
const TYPES = new Set(['PRE_TEST','POST_TEST']);
const NIM_RE = /^[0-9]{6,20}$/;
const ACCOUNT_RE = /^akun\/(0[1-9]|[12][0-9]|3[0-2])$/;
const obj = v => v && typeof v === 'object' && !Array.isArray(v);
const str = v => typeof v === 'string' ? v.trim() : '';
function courseCode(v) {
  const m = /-(26(?:FTK|PAM|TEL)[0-9]{4})$/.exec(str(v));
  return m ? COURSE_MAP[m[1]] || null : null;
}
function meeting(v, mappedCourse) {
  const m = /^PERTEMUAN_([1-9]|1[0-9]|2[01])$/.exec(str(v));
  const n = m ? Number(m[1]) : null;
  const max = mappedCourse === 'FIS' ? 21 : 16;
  return n && n <= max ? n : null;
}
function normalizeImport(payload, accountIndex, now = Date.now()) {
  const errors = [], warnings = [], rows = [], activities = [];
  if (!obj(payload)) return {ok:false,errors:[{code:'E_FILE_INVALID'}],warnings,rows,activities};
  if (payload.schema_version !== '1.0' || payload.source !== 'mentari_unpam')
    errors.push({code:'E_SCHEMA_UNSUPPORTED'});
  if (payload.semester !== '20261') errors.push({code:'E_SEMESTER_MISMATCH'});
  if (!Array.isArray(payload.courses) || !payload.courses.length) errors.push({code:'E_FILE_INVALID'});
  const accounts = accountIndex instanceof Map ? accountIndex : new Map();
  const batchId = str(payload.batch_id);
  if (!batchId || batchId.length > 120) errors.push({code:'E_FILE_INVALID'});
  const seenActivity = new Set(), seenRows = new Set();
  for (const course of (Array.isArray(payload.courses) ? payload.courses : [])) {
    if (!obj(course)) { errors.push({code:'E_COURSE_UNKNOWN'}); continue; }
    const mappedCourse = courseCode(course.kode_course || course.course_code);
    if (!mappedCourse) { errors.push({code:'E_COURSE_UNKNOWN'}); continue; }
    for (const activity of (Array.isArray(course.activities) ? course.activities : [])) {
      if (!obj(activity)) { errors.push({code:'E_ACTIVITY_INVALID'}); continue; }
      const uuid = str(activity.quiz_uuid), meet = meeting(activity.kode_section, mappedCourse), type = str(activity.quiz_type).toUpperCase();
      if (!uuid || uuid.length > 200 || !meet || !TYPES.has(type)) { errors.push({code:'E_ACTIVITY_INVALID'}); continue; }
      const akey = [mappedCourse,meet,type].join('|');
      if (seenActivity.has(akey)) { errors.push({code:'E_BATCH_DUPLICATE'}); continue; }
      seenActivity.add(akey);
      const results = Array.isArray(activity.results) ? activity.results : [];
      if (activity.data_complete !== true) warnings.push({code:'W_PARTIAL_EXPORT',activity:uuid});
      if (activity.expected_participants !== undefined && Number(activity.expected_participants) !== 32)
        errors.push({code:'E_COUNT_MISMATCH'});
      if (activity.data_complete === true && (results.length !== 32 || new Set(results.map(x=>str(x&&x.nim))).size !== 32))
        errors.push({code:'E_COUNT_MISMATCH'});
      const seenNim = new Set();
      const activityStartRows = rows.length;
      for (const result of results) {
        if (!obj(result) || !NIM_RE.test(str(result.nim))) { errors.push({code:'E_NIM_UNKNOWN'}); continue; }
        const nim = str(result.nim);
        if (seenNim.has(nim)) { errors.push({code:'E_NIM_DUPLICATE'}); continue; }
        seenNim.add(nim);
        const account = accounts.get(nim);
        if (!account || !ACCOUNT_RE.test(account.key || '')) { errors.push({code:'E_NIM_UNKNOWN'}); continue; }
        const status = str(result.attempt_status);
        const grade = result.grade;
        if (grade !== null && (typeof grade !== 'number' || !Number.isFinite(grade) || grade < 0 || grade > 100)) {
          errors.push({code:'E_GRADE_INVALID'}); continue;
        }
        if (status === 'invalid_grade') { errors.push({code:'E_GRADE_INVALID'}); continue; }
        if (status === 'no_record' || status === 'not_submitted') {
          warnings.push({code:'W_NO_RECORD',activity:uuid});
          rows.push({account_key:account.key,nim,course_code:mappedCourse,meeting_number:meet,
            quiz_type:type,external_activity_id:uuid,title:str(activity.title),grade:null,result_status:'no_record',
            captured_at:activity.captured_at || null});
          continue;
        }
        if (grade === null) { warnings.push({code:'W_NO_RECORD'}); continue; }
        const key = [uuid,nim].join('|');
        if (seenRows.has(key)) { errors.push({code:'E_BATCH_DUPLICATE'}); continue; }
        seenRows.add(key);
        rows.push({account_key:account.key,nim,course_code:mappedCourse,meeting_number:meet,
          quiz_type:type,external_activity_id:uuid,title:str(activity.title),grade,result_status:'graded',
          captured_at:activity.captured_at || null});
      }
      activities.push({external_activity_id:uuid,course_code:mappedCourse,meeting_number:meet,
        quiz_type:type,total_rows:results.length,accepted_rows:rows.length-activityStartRows});
    }
  }
  if (payload.exported_at && Number.isFinite(Date.parse(payload.exported_at)) &&
      now - Date.parse(payload.exported_at) > 7*86400000) warnings.push({code:'W_OLD_CAPTURE'});
  return {ok:errors.length===0, batchId, semester:payload.semester, errors, warnings, rows, activities,
    summary:{activities:activities.length,rows:rows.length,errors:errors.length,warnings:warnings.length}};
}
module.exports = Object.freeze({COURSE_MAP,courseCode,meeting,normalizeImport});
