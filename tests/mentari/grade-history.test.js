'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {backfillLegacyStatusCounts} = require('../../src/features/mentari/grade-history.js');

test('backfills legacy activity and batch counts from staging without mutating source rows',()=>{
  const activities=[{external_activity_id:'quiz-a',total_rows:32},{external_activity_id:'quiz-b',total_rows:4}];
  const staged=[
    ...Array.from({length:10},()=>({external_activity_id:'quiz-a',result_status:'graded'})),
    ...Array.from({length:22},()=>({external_activity_id:'quiz-a',result_status:'no_record'})),
    {external_activity_id:'quiz-b',result_status:'graded'},
    {external_activity_id:'quiz-b',result_status:'unexpected'}
  ];
  const result=backfillLegacyStatusCounts(activities,staged);
  assert.deepEqual(result.activities.map(x=>({
    graded_rows:x.graded_rows,no_record_rows:x.no_record_rows,unresolved_rows:x.unresolved_rows,staged_rows:x.staged_rows
  })),[
    {graded_rows:10,no_record_rows:22,unresolved_rows:0,staged_rows:32},
    {graded_rows:1,no_record_rows:0,unresolved_rows:3,staged_rows:2}
  ]);
  assert.deepEqual(result.summary,{graded_rows:11,no_record_rows:22,unresolved_rows:3});
  assert.equal(Object.hasOwn(activities[0],'graded_rows'),false);
});

test('preserves explicit status counts already stored on a newer batch',()=>{
  const result=backfillLegacyStatusCounts([
    {external_activity_id:'quiz-a',total_rows:3,graded_rows:1,no_record_rows:1,unresolved_rows:1}
  ],[
    {external_activity_id:'quiz-a',result_status:'graded'},
    {external_activity_id:'quiz-a',result_status:'no_record'},
    {external_activity_id:'quiz-a',result_status:'graded'}
  ]);
  assert.deepEqual(result.activities[0],{
    external_activity_id:'quiz-a',total_rows:3,graded_rows:1,no_record_rows:1,unresolved_rows:1,staged_rows:3
  });
});
