'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fileSource, isImageMime } = require('./file-utils');
const validId = id => /^[0-9a-f]{32}$/.test(id);

test('uses an HTTPS attachment URL when available', () => {
  const file = { id: 'a'.repeat(32), url: 'https://cdn.example.test/photo.png' };
  assert.equal(fileSource(file, validId), file.url);
});
test('falls back to the private blob route for a valid ID', () => {
  assert.equal(fileSource({ id: 'a'.repeat(32), url: 'http://unsafe.example.test/file' }, validId), '/_blob/' + 'a'.repeat(32));
});
test('rejects missing files and invalid IDs without a safe URL', () => {
  assert.equal(fileSource(null, validId), '');
  assert.equal(fileSource({ id: '../private' }, validId), '');
  assert.equal(fileSource({ id: 'a'.repeat(32) }, null), '');
});
test('recognizes image MIME types case-insensitively', () => {
  assert.equal(isImageMime('image/jpeg'), true);
  assert.equal(isImageMime('IMAGE/WEBP'), true);
  assert.equal(isImageMime('application/pdf'), false);
  assert.equal(isImageMime(''), false);
});
