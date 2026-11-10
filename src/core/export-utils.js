/**
 * Grid-Kelas pure export formatting helpers.
 *
 * Keep these functions independent from app state, the DOM, browser downloads,
 * and third-party export libraries so they can be tested with Node.js.
 */

function sanitizeFilenamePart(value) {
  return String(value || '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
}

/** Convert a matrix of values to the legacy Grid-Kelas CSV representation. */
function serializeCsv(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => (Array.isArray(row) ? row : [])
      .map(value => '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"')
      .join(','))
    .join('\\r\\n');
}

/** Estimate XLSX column widths using the first 100 rows, matching the app's export layout. */
function estimateColumnWidths(headers, data) {
  const sample = Array.isArray(data) ? data.slice(0, 100) : [];
  return (Array.isArray(headers) ? headers : []).map((header, index) => ({
    wch: Math.min(38, Math.max(12, ...sample.map(row => String(row && row[index] || '').length + 2)))
  }));
}

const exportUtils = Object.freeze({
  sanitizeFilenamePart,
  serializeCsv,
  estimateColumnWidths
});

if (typeof module === 'object' && module.exports) {
  module.exports = exportUtils;
}

if (typeof window !== 'undefined') {
  window.GridKelasExportUtils = exportUtils;
}
