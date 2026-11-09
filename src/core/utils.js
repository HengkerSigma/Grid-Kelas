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
  const match = a.split(/\\s*[-–—]\\s*/);
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
  const match = /(\\d{1,2})\\s*[.:]\\s*(\\d{2})\\s*(?:-|–|—|s\\/d|sd|sampai)\\s*(\\d{1,2})\\s*[.:]\\s*(\\d{2})/i.exec(String(course.jam || ''));
  if (!match || +match[1] > 23 || +match[3] > 23 || +match[2] > 59 || +match[4] > 59) return null;
  const start = +match[1] * 60 + +match[2];
  const end = +match[3] * 60 + +match[4];
  return end > start ? { s: start, e: end } : null;
}

const coreUtils = Object.freeze({ pad2, escapeHtml, hariRange, hariLabel, onDay, jamRange });

if (typeof module === 'object' && module.exports) {
  module.exports = coreUtils;
}

if (typeof window !== 'undefined') {
  window.GridKelasCoreUtils = coreUtils;
}
