'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const utils = require('./greeting-utils');

test('formats birthday and time-of-day greetings', () => {
  assert.equal(utils.greetingText('Ayu', '2006-11-10', { month: '11', day: '10', hour: '8', minute: '0' }).title, 'Selamat Ulang Tahun, Ayu! 🎂');
  assert.equal(utils.greetingText('Ayu', '', { month: '11', day: '10', hour: '4', minute: '0' }).title, 'Selamat Pagi, Ayu');
  assert.equal(utils.greetingText('Ayu', '', { month: '11', day: '10', hour: '12', minute: '0' }).title, 'Selamat Siang, Ayu');
  assert.equal(utils.greetingText('Ayu', '', { month: '11', day: '10', hour: '16', minute: '0' }).title, 'Selamat Sore, Ayu');
  assert.equal(utils.greetingText('Ayu', '', { month: '11', day: '10', hour: '19', minute: '0' }).title, 'Selamat Malam, Ayu');
});

test('checks presence with the existing TTL boundary', () => {
  const records = { a: { no: 2, lastSeen: 91000 }, b: { no: 3, lastSeen: 1000 } };
  assert.equal(utils.presenceOnline(records, 2, 100000, 90000), true);
  assert.equal(utils.presenceOnline(records, 3, 100000, 90000), false);
  assert.equal(utils.presenceOnline(records, 4, 100000, 90000), false);
});

test('counts online classmates but excludes the current user', () => {
  const records = { a: { no: 1, lastSeen: 99000 }, b: { no: 2, lastSeen: 99000 }, c: { no: 3, lastSeen: 1000 } };
  assert.equal(utils.countOnlineFriends(records, 1, 3, 100000, 90000), 1);
});

test('selects deterministic birthday messages and supports injected randomness', () => {
  assert.equal(utils.defaultBirthdayMessage('2026-11-10', 4), utils.defaultBirthdayMessage('2026-11-10', 4));
  assert.notEqual(utils.defaultBirthdayMessage('2026-11-10', 4), utils.defaultBirthdayMessage('2026-11-10', 5));
  assert.equal(utils.randomBirthdayMessage(() => 0), 'Semoga selalu sehat, bahagia, dan semua urusan kuliahmu dilancarkan!');
});
