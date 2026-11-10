/**
 * Grid-Kelas file display helpers.
 * Pure metadata helpers: no app state, DOM, storage, or network access.
 */
function fileSource(file, isValidId) {
  if (!file || typeof file !== 'object') return '';
  if (typeof file.url === 'string' && /^https:\/\//i.test(file.url)) return file.url;
  const id = String(file.id || '');
  return typeof isValidId === 'function' && isValidId(id) ? '/_blob/' + id : '';
}
function isImageMime(type) {
  return /^image\//i.test(String(type || ''));
}
const fileUtils = Object.freeze({ fileSource, isImageMime });
if (typeof module === 'object' && module.exports) module.exports = fileUtils;
if (typeof window !== 'undefined') window.GridKelasFileUtils = fileUtils;
