'use strict';

const MAIN_ADMIN_NO = 4;

function isMainAdmin(accountNo) {
  return Number(accountNo) === MAIN_ADMIN_NO;
}

function roleFor(accountNo, account) {
  if (isMainAdmin(accountNo)) return 'main_admin';
  return account && account.admin === true ? 'admin' : 'student';
}

function canChangeAdminRole(actorNo, targetNo) {
  return isMainAdmin(actorNo) && !isMainAdmin(targetNo);
}

module.exports = Object.freeze({
  MAIN_ADMIN_NO,
  isMainAdmin,
  roleFor,
  canChangeAdminRole
});
