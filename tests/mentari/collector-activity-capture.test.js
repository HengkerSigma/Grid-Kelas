'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const collector = require('../../tools/mentari/collector-v2.user.js');

const course = {
 kode_course:'20261-01ELSE003-26FTK0021',
 peserta:[{nim:'261090100001',nama_mahasiswa:'Private A'},{nim:'261090100002',nama_mahasiswa:'Private B'}],
 data:{PERTEMUAN_2:{sub_section:[
  {id:'forum-section',kode_template:'FORUM',judul:'Forum Diskusi'},
  {id:'quiz-pre',kode_template:'QUIZ',judul:'Pretest'},
  {id:'assignment',kode_template:'ASSIGNMENT',judul:'Assignment'}
 ]}}
};
const topic={id:'forum-topic',id_trx_course_sub_section:'forum-section',kode_course:course.kode_course};
function post(id,nim,level,parent,extra){return Object.assign({id,nim,post_type:'REPLY',reply_level:level,id_parent:parent,id_trx_course_sub_section:'forum-section',konten:'secret body'},extra||{});}

test('course metadata keeps only roster NIMs and the four supported activity families',()=>{
 const meta=collector.collectCourseMetadata(course);
 assert.equal(meta.rosterNims.length,2);
 assert.equal(meta.activities.length,2);
 assert.equal(JSON.stringify(meta).includes('Private A'),false);
 assert.equal(meta.activities.some(x=>x.type==='ASSIGNMENT'),false);
});

test('forum capture counts direct student replies only and omits raw content and names',()=>{
 const capture=collector.normalizeForumCapture(Object.assign({},topic,{data:[
  post('p1','261090100001',1,'forum-topic'),
  post('p2','261090100001',2,'p1'),
  post('p3','',1,'forum-topic',{id_dosen:'lecturer'}),
  post('p4','261090100002',1,'other-topic')
 ]}));
 assert.deepEqual(capture.directReplyCounts,[{nim:'261090100001',count:1}]);
 assert.equal(capture.dataComplete,false);
 assert.equal(JSON.stringify(capture).includes('secret body'),false);
 assert.equal(JSON.stringify(capture).includes('Private'),false);
});

test('forum preview marks absent roster students unknown, never not started',()=>{
 const meta=collector.collectCourseMetadata(course);
 const snapshot=collector.normalizeForumCapture(Object.assign({},topic,{data:[post('p1','261090100001',1,'forum-topic')]}));
 const preview=collector.buildActivitySyncPreview([meta],[snapshot]);
 const forum=preview.courses[0].activities.find(x=>x.type==='FORUM');
 assert.equal(forum.participatedCount,1);
 assert.equal(forum.unknownCount,1);
 assert.equal(forum.notStartedCount,0);
});
