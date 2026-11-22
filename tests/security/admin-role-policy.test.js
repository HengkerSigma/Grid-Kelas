'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../src/security/admin-role-policy.js');

test('account No. 4 is always the main admin regardless of stored admin flag', () => {
  assert.equal(policy.roleFor(4, { admin: false }), 'main_admin');
  assert.equal(policy.roleFor(4, null), 'main_admin');
  assert.equal(policy.isMainAdmin('04'), true);
});

test('ordinary admin and student roles follow the stored account flag', () => {
  assert.equal(policy.roleFor(5, { admin: true }), 'admin');
  assert.equal(policy.roleFor(6, { admin: false }), 'student');
  assert.equal(policy.roleFor(7, null), 'student');
});

test('only the main admin may change ordinary admin roles', () => {
  assert.equal(policy.canChangeAdminRole(4, 5), true);
  assert.equal(policy.canChangeAdminRole(5, 6), false);
  assert.equal(policy.canChangeAdminRole(6, 5), false);
});

test('the main admin role cannot be changed through account role management', () => {
  assert.equal(policy.canChangeAdminRole(4, 4), false);
  assert.equal(policy.canChangeAdminRole(5, 4), false);
});
