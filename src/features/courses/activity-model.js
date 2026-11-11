'use strict';

/**
 * Course activity identity helpers.
 *
 * These helpers define a backward-compatible identity for attendance sessions
 * while a course can have both online and face-to-face activities.
 */
const ACTIVITY_MODES = Object.freeze({
  ONLINE: 'online',
  TATAP_MUKA: 'tatap_muka'
});
const MAX_MEETINGS = 16;
const COURSE_CODE_PATTERN = /^[A-Za-z0-9]{2,8}$/;

function normalizeActivityMode(value, legacyMode) {
  if (value === ACTIVITY_MODES.ONLINE || value === ACTIVITY_MODES.TATAP_MUKA) return value;
  return legacyMode === ACTIVITY_MODES.ONLINE
    ? ACTIVITY_MODES.ONLINE
    : ACTIVITY_MODES.TATAP_MUKA;
}
function legacyActivityMode(courseKind) {
  return courseKind === 'platform' ? ACTIVITY_MODES.ONLINE : ACTIVITY_MODES.TATAP_MUKA;
}
function validateIdentity(courseCode, meetingNumber) {
  const code = String(courseCode || '').trim();
  const meeting = Number(meetingNumber);
  if (!COURSE_CODE_PATTERN.test(code)) throw new TypeError('Kode mata kuliah tidak valid.');
  if (!Number.isInteger(meeting) || meeting < 1 || meeting > MAX_MEETINGS) {
    throw new RangeError('Nomor pertemuan harus antara 1 dan ' + MAX_MEETINGS + '.');
  }
  return { code, meeting };
}
function attendanceSessionKey(courseCode, activityMode, meetingNumber, legacyMode) {
  const identity = validateIdentity(courseCode, meetingNumber);
  const fallback = normalizeActivityMode(legacyMode);
  const mode = normalizeActivityMode(activityMode, fallback);
  const suffix = String(identity.meeting).padStart(2, '0');
  return mode === fallback
    ? identity.code + '_' + suffix
    : identity.code + '_' + mode + '_' + suffix;
}
/** Parse legacy and namespaced session IDs without guessing their course mode. */
function parseAttendanceSessionKey(value) {
  const match = /^([A-Za-z0-9]{2,8})_(?:(online|tatap_muka)_)?(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const meeting = Number(match[3]);
  if (meeting < 1 || meeting > MAX_MEETINGS) return null;
  return { courseCode: match[1], activityMode: match[2] || null, meetingNumber: meeting };
}
/** Resolve an old session's activity mode without rewriting stored data. */
function resolveSessionActivityMode(session, courseKind) {
  const fallback = legacyActivityMode(courseKind);
  return normalizeActivityMode(session && session.activity_mode, fallback);
}
const activityModel = Object.freeze({
  ACTIVITY_MODES, MAX_MEETINGS, normalizeActivityMode, legacyActivityMode,
  attendanceSessionKey, parseAttendanceSessionKey, resolveSessionActivityMode
});
if (typeof module === 'object' && module.exports) module.exports = activityModel;
if (typeof window !== 'undefined') window.GridKelasActivityModel = activityModel;
