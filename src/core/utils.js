/**
 * Grid-Kelas core utilities
 *
 * Pure helpers extracted from the legacy app.js IIFE.
 * Keep this file dependency-free: no DOM, app state, storage, or network access.
 *
 * Browser integration:
 * index.html loads this classic script before public/app.js. The app keeps its
 * existing local PAD/esc names as aliases to these exported helpers, preserving
 * its current call sites and IIFE scope.
 */

/**
 * Convert a value to a two-character, zero-padded string.
 * Matches the legacy PAD helper.
 * @param {unknown} value
 * @returns {string}
 */
function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * Escape HTML-sensitive characters in text.
 * Null and undefined become an empty string, matching the legacy esc helper.
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  return String(value == null ? '' : value).replace(/[&<>"']/g, character => entities[character]);
}

const SCHEDULE_WEEKDAYS = Object.freeze(['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']);

/**
 * Parse a course weekday or weekday range, including legacy "Senin-Jumat" values.
 * @param {{hari?: unknown, hariSampai?: unknown}} course
 */
function hariRange(course) {
  let a = String(course.hari || '').trim();
  let b = String(course.hariSampai || '').trim();
  const match = a.split(/\s*[-–—]\s*/);
  if (match.length === 2) {
    a = match[0];
    b = match[1];
  }
  const i = SCHEDULE_WEEKDAYS.indexOf(a);
  const j = b ? SCHEDULE_WEEKDAYS.indexOf(b) : -1;
  const validRange = i >= 0 && j >= 0 && j !== i;
  return { a, b: validRange ? b : '', i, j: validRange ? j : -1 };
}

/** Format a course weekday/range label. */
function hariLabel(course) {
  const range = hariRange(course);
  return range.b ? range.a + '–' + range.b : range.a;
}

/** Check whether a weekday belongs to a course's configured schedule. */
function onDay(course, dayName) {
  const range = hariRange(course);
  const dayIndex = SCHEDULE_WEEKDAYS.indexOf(dayName);
  if (range.j < 0) return range.a === dayName;
  return range.i <= range.j
    ? dayIndex >= range.i && dayIndex <= range.j
    : dayIndex >= range.i || dayIndex <= range.j;
}

/** Parse a course time range into minutes since midnight. */
function jamRange(course) {
  const match = /(\d{1,2})\s*[.:]\s*(\d{2})\s*(?:-|–|—|s\/d|sd|sampai)\s*(\d{1,2})\s*[.:]\s*(\d{2})/i.exec(String(course.jam || ''));
  if (!match || +match[1] > 23 || +match[3] > 23 || +match[2] > 59 || +match[4] > 59) return null;
  const start = +match[1] * 60 + +match[2];
  const end = +match[3] * 60 + +match[4];
  return end > start ? { s: start, e: end } : null;
}


/**
 * Calculate the calendar date for a semester meeting using an anchor meeting/date.
 * Date-only arithmetic is performed in UTC to avoid local timezone/DST drift.
 */
function meetingDate(anchorDate, anchorMeeting, meetingNumber) {
  const parts = String(anchorDate).split('-').map(Number);
  if (parts.length !== 3 || parts.some(value => !Number.isInteger(value))) {
    throw new TypeError('anchorDate must use YYYY-MM-DD format');
  }
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day - (Number(anchorMeeting) - Number(meetingNumber)) * 7));
  if (Number.isNaN(date.getTime())) throw new TypeError('Invalid semester meeting parameters');
  return date.toISOString().slice(0, 10);
}

/**
 * Determine the current semester meeting from a date-only string.
 * The result is clamped to the configured semester meeting range.
 */
function semesterMeetingNow(currentDate, anchorDate, anchorMeeting, totalMeetings) {
  const current = String(currentDate).split('-').map(Number);
  const anchor = String(anchorDate).split('-').map(Number);
  if (current.length !== 3 || anchor.length !== 3 ||
      current.concat(anchor).some(value => !Number.isInteger(value))) {
    throw new TypeError('Dates must use YYYY-MM-DD format');
  }
  const currentMs = Date.UTC(current[0], current[1] - 1, current[2]);
  const anchorMs = Date.UTC(anchor[0], anchor[1] - 1, anchor[2]);
  const weeks = Math.floor((currentMs - anchorMs) / 604800000);
  return Math.max(1, Math.min(Number(totalMeetings), Number(anchorMeeting) + weeks));
}

/** Return the academic phase label for a meeting number. */
function meetingPhase(meetingNumber) {
  const number = Number(meetingNumber);
  return number <= 7 ? 'Pra-UTS' : number === 8 ? 'UTS' : '';
}

const coreUtils = Object.freeze({
  pad2, escapeHtml, hariRange, hariLabel, onDay, jamRange,
  meetingDate, semesterMeetingNow, meetingPhase
});

if (typeof module === 'object' && module.exports) {
  module.exports = coreUtils;
}

if (typeof window !== 'undefined') {
  window.GridKelasCoreUtils = coreUtils;
}
