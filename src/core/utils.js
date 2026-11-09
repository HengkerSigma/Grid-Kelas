/**
 * Grid-Kelas core utilities
 *
 * Pure helpers extracted from the legacy app.js IIFE.
 * Keep this file dependency-free: no DOM, app state, storage, or network access.
 *
 * Integration note:
 * app.js remains the runtime entry point for this phase. The legacy PAD/esc
 * declarations are intentionally left untouched until a separate, explicitly
 * tested bridge is introduced; this avoids changing script order or scope here.
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

const coreUtils = Object.freeze({ pad2, escapeHtml });

if (typeof module === 'object' && module.exports) {
  module.exports = coreUtils;
}

if (typeof window !== 'undefined') {
  window.GridKelasCoreUtils = coreUtils;
}
