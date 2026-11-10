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

/**
 * Resolve the meaning of existing, untyped sessions from the course's current
 * delivery configuration. Platform courses historically used online attendance;
 * room courses historically used face-to-face attendance.
 */
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

/**
 * Build the attendance-session document key.
 *
 * The activity matching the course's historical behavior keeps the existing
 * `${courseCode}_${NN}` key. The additional activity receives a namespaced key,
 * preventing online and face-to-face sessions with the same meeting number from
 * overwriting one another.
 */
function attendanceSessionKey(courseCode, activityMode, meetingNumber, legacyMode) {
  const identity = validateIdentity(courseCode, meetingNumber);
  const fallback = normalizeActivityMode(legacyMode);
  const mode = normalizeActivityMode(activityMode, fallback);
  const suffix = String(identity.meeting).padStart(2, '0');
  return mode === fallback
    ? identity.code + '_' + suffix
    : identity.code + '_' + mode + '_' + suffix;
}

/** Resolve an old session's activity mode without rewriting stored data. */
function resolveSessionActivityMode(session, courseKind) {
  const fallback = legacyActivityMode(courseKind);
  return normalizeActivityMode(session && session.activity_mode, fallback);
}

const activityModel = Object.freeze({
  ACTIVITY_MODES,
  MAX_MEETINGS,
  normalizeActivityMode,
  legacyActivityMode,
  attendanceSessionKey,
  resolveSessionActivityMode
});

if (typeof module === 'object' && module.exports) module.exports = activityModel;
if (typeof window !== 'undefined') window.GridKelasActivityModel = activityModel;
