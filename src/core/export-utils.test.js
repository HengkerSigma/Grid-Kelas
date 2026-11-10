'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeFilenamePart,
  serializeCsv,
  estimateColumnWidths
} = require('./export-utils');

test('sanitizes filename parts without changing safe characters', () => {
  assert.equal(sanitizeFilenamePart('ALJ-01'), 'ALJ-01');
  assert.equal(sanitizeFilenamePart('Fisika Dasar / 1'), 'Fisika-Dasar-1');
  assert.equal(sanitizeFilenamePart('---'), '');
  assert.equal(sanitizeFilenamePart(null), '');
});

test('serializes CSV values with quoting, escaping, and empty null values', () => {
  const csv = serializeCsv([
    ['Nama', 'Catatan'],
    ['Ana', 'mengatakan "halo"'],
    [null, 0]
  ]);

  const expected = '"Nama","Catatan"' + '\\r\\n' +
    '"Ana","mengatakan ""halo"""' + '\\r\\n' +
    '"","0"';
  assert.equal(csv, expected);
});

test('estimates XLSX widths with the existing minimum and maximum bounds', () => {
  assert.deepEqual(
    estimateColumnWidths(['Nama', 'Catatan'], [
      ['A', 'Catatan panjang'],
      ['Nama yang lebih panjang', 'x']
    ]),
    [{ wch: 25 }, { wch: 17 }]
  );
  assert.deepEqual(estimateColumnWidths(['A'], [['x'.repeat(80)]]), [{ wch: 38 }]);
  assert.deepEqual(estimateColumnWidths(['A'], []), [{ wch: 12 }]);
});
