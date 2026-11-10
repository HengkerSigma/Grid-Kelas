'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./activity-model');

const { ACTIVITY_MODES: MODE } = model;

test('keeps the historical activity mode for existing course records', () => {
  assert.equal(model.legacyActivityMode('platform'), MODE.ONLINE);
  assert.equal(model.legacyActivityMode('ruangan'), MODE.TATAP_MUKA);
  assert.equal(model.resolveSessionActivityMode({}, 'platform'), MODE.ONLINE);
  assert.equal(model.resolveSessionActivityMode({}, 'ruangan'), MODE.TATAP_MUKA);
});

test('uses an explicit activity mode when a session has one', () => {
  assert.equal(model.resolveSessionActivityMode({ activity_mode: 'online' }, 'ruangan'), MODE.ONLINE);
  assert.equal(model.resolveSessionActivityMode({ activity_mode: 'tatap_muka' }, 'platform'), MODE.TATAP_MUKA);
  assert.equal(model.resolveSessionActivityMode({ activity_mode: 'unknown' }, 'ruangan'), MODE.TATAP_MUKA);
});

test('preserves legacy room attendance keys', () => {
  assert.equal(model.attendanceSessionKey('FIS', MODE.TATAP_MUKA, 14, MODE.TATAP_MUKA), 'FIS_14');
});

test('namespaces online room attendance independently from face-to-face attendance', () => {
  const online = model.attendanceSessionKey('FIS', MODE.ONLINE, 1, MODE.TATAP_MUKA);
  const onsite = model.attendanceSessionKey('FIS', MODE.TATAP_MUKA, 1, MODE.TATAP_MUKA);
  assert.equal(online, 'FIS_online_01');
  assert.equal(onsite, 'FIS_01');
  assert.notEqual(online, onsite);
});

test('preserves legacy platform attendance keys and namespaces an additional room activity', () => {
  assert.equal(model.attendanceSessionKey('ENG', MODE.ONLINE, 3, MODE.ONLINE), 'ENG_03');
  assert.equal(model.attendanceSessionKey('ENG', MODE.TATAP_MUKA, 3, MODE.ONLINE), 'ENG_tatap_muka_03');
});

test('normalizes an omitted mode using the supplied legacy mode', () => {
  assert.equal(model.normalizeActivityMode('', MODE.ONLINE), MODE.ONLINE);
  assert.equal(model.normalizeActivityMode(null, MODE.TATAP_MUKA), MODE.TATAP_MUKA);
});

test('rejects invalid course codes and meeting numbers', () => {
  assert.throws(() => model.attendanceSessionKey('F', MODE.ONLINE, 1), TypeError);
  assert.throws(() => model.attendanceSessionKey('FIS', MODE.ONLINE, 0), RangeError);
  assert.throws(() => model.attendanceSessionKey('FIS', MODE.ONLINE, 17), RangeError);
  assert.throws(() => model.attendanceSessionKey('FIS', MODE.ONLINE, 1.5), RangeError);
});
