'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hariRange, hariLabel, onDay, jamRange } = require('./utils');

test('parses a single weekday', () => {
  assert.deepEqual(hariRange({ hari: 'Senin' }), { a: 'Senin', b: '', i: 1, j: -1 });
  assert.equal(hariLabel({ hari: 'Senin' }), 'Senin');
  assert.equal(onDay({ hari: 'Senin' }, 'Senin'), true);
  assert.equal(onDay({ hari: 'Senin' }, 'Selasa'), false);
});

test('parses a weekday range from the legacy hari field', () => {
  const course = { hari: 'Senin - Jumat' };
  assert.deepEqual(hariRange(course), { a: 'Senin', b: 'Jumat', i: 1, j: 5 });
  assert.equal(hariLabel(course), 'Senin–Jumat');
  assert.equal(onDay(course, 'Rabu'), true);
  assert.equal(onDay(course, 'Minggu'), false);
});

test('supports weekday ranges that cross the week boundary', () => {
  const course = { hari: 'Jumat', hariSampai: 'Senin' };
  assert.equal(onDay(course, 'Sabtu'), true);
  assert.equal(onDay(course, 'Minggu'), true);
  assert.equal(onDay(course, 'Selasa'), false);
});

test('rejects invalid or non-increasing time ranges', () => {
  assert.equal(jamRange({ jam: '25:00-26:00' }), null);
  assert.equal(jamRange({ jam: '10:00-09:00' }), null);
  assert.equal(jamRange({ jam: 'jadwal belum ditentukan' }), null);
});

test('parses supported time separators and formats', () => {
  assert.deepEqual(jamRange({ jam: '08.00 - 10.30 WIB' }), { s: 480, e: 630 });
  assert.deepEqual(jamRange({ jam: '08:00 sampai 10:30' }), { s: 480, e: 630 });
});
