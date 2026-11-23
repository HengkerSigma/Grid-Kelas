'use strict';

const STATUS_KEYS = ['graded_rows','no_record_rows','unresolved_rows'];

function hasStatusCounts(value) {
  return value && STATUS_KEYS.every(key => Number.isFinite(Number(value[key])));
}

/**
 * Reconstruct status counts for legacy import batches from their staging rows.
 * This is read-only: it never updates batch or staging records.
 * Rows omitted from staging are unresolved because they were present in the
 * export's total_rows but were not accepted into staging.
 */
function backfillLegacyStatusCounts(sourceActivities, stagedRows) {
  const rowsByActivity = new Map();
  for (const row of (Array.isArray(stagedRows) ? stagedRows : [])) {
    const key = String(row && row.external_activity_id || '');
    const rows = rowsByActivity.get(key) || [];
    rows.push(row || {});
    rowsByActivity.set(key,rows);
  }

  const activities = (Array.isArray(sourceActivities) ? sourceActivities : []).map(activity => {
    const item = activity || {};
    const staged = rowsByActivity.get(String(item.external_activity_id || '')) || [];
    const counts = {graded_rows:0,no_record_rows:0,unresolved_rows:0};
    for (const row of staged) {
      if (row.result_status === 'graded') counts.graded_rows++;
      else if (row.result_status === 'no_record' || row.result_status === 'not_submitted') counts.no_record_rows++;
      else counts.unresolved_rows++;
    }
    const total = Number(item.total_rows);
    if (Number.isFinite(total)) counts.unresolved_rows += Math.max(0,total-staged.length);
    const resolved = hasStatusCounts(item) ? {
      graded_rows:Number(item.graded_rows),
      no_record_rows:Number(item.no_record_rows),
      unresolved_rows:Number(item.unresolved_rows)
    } : counts;
    return Object.assign({},item,{
      staged_rows:staged.length,
      graded_rows:resolved.graded_rows,
      no_record_rows:resolved.no_record_rows,
      unresolved_rows:resolved.unresolved_rows
    });
  });

  const summary = {graded_rows:0,no_record_rows:0,unresolved_rows:0};
  for (const activity of activities) {
    for (const key of STATUS_KEYS) summary[key] += Number(activity[key] || 0);
  }
  return {activities,summary};
}

module.exports = Object.freeze({STATUS_KEYS,hasStatusCounts,backfillLegacyStatusCounts});
