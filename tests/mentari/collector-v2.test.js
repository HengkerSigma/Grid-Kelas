'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeCapture,resolveActivity,captureMismatch} = require('../../tools/mentari/collector-v2.user.js');

const activity = {
  quiz_uuid:'activity-19-pre',
  kode_course:'20261-01ELSE003-26FTK0021',
  course_code:'FIS',
  kode_section:'PERTEMUAN_19',
  meeting_number:19,
  quiz_type:'PRE_TEST',
  title:'Pre-test'
};
const payload = {
  kode_course:activity.kode_course,
  kode_section:activity.kode_section,
  judul:'Pretest',
  data:Array.from({length:32},(_,i)=>({
    nim:String(261090100000+i),
    quiz:i<4?{grade:80,start_at:'2026-11-10T05:35:07.854Z',end_at:null}:null
  }))
};

test('normalizes a complete participant response including quiz:null entries',()=>{
  const capture=normalizeCapture(payload,activity);
  assert.equal(capture.total_participants,32);
  assert.equal(capture.data_complete,true);
  assert.equal(capture.results.filter(row=>row.attempt_status==='no_record').length,28);
  assert.equal(capture.results.filter(row=>row.attempt_status==='graded').length,4);
});

test('matches an endpoint response to a unique activity by course, section, and quiz type when UUID differs',()=>{
  const result=resolveActivity('endpoint-id-not-in-metadata',payload,[activity]);
  assert.equal(result.activity,activity);
  assert.equal(result.matchedBy,'course-section-type');
});

test('does not guess when metadata matching is ambiguous',()=>{
  const result=resolveActivity('unknown',payload,[activity,{...activity,quiz_uuid:'duplicate-activity'}]);
  assert.equal(result.activity,null);
});

test('reports metadata mismatch without storing response data',()=>{
  assert.equal(captureMismatch(payload,{...activity,kode_course:'different-course'}),'kode_course respons berbeda dari metadata');
});
