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

test('forum capture counts unique student replies across direct and nested levels and omits raw content and names',()=>{
 const capture=collector.normalizeForumCapture(Object.assign({},topic,{data:[
  post('p1','261090100001',1,'forum-topic'),
  post('p2','261090100001',2,'p1'),
  post('p3','',1,'forum-topic',{id_dosen:'lecturer'}),
  post('p4','261090100002',1,'other-topic')
 ]}));
 assert.deepEqual(capture.replyCounts,[{nim:'261090100001',count:2}]);
 assert.equal(capture.capturedReplyCount,2);
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


test('nested replies alone can complete the two-reply participation threshold',()=>{
 const snapshot=collector.normalizeForumCapture(Object.assign({},topic,{data:[
  post('root-reply','261090100001',1,'forum-topic'),
  post('nested-a','261090100002',2,'root-reply'),
  post('nested-b','261090100002',2,'root-reply')
 ]}));
 assert.deepEqual(snapshot.replyCounts,[{nim:'261090100001',count:1},{nim:'261090100002',count:2}]);
 const preview=collector.buildActivitySyncPreview([collector.collectCourseMetadata(course)],[snapshot]);
 const forum=preview.courses[0].activities.find(x=>x.type==='FORUM');
 assert.equal(forum.participatedCount,1);
 assert.equal(forum.unknownCount,1);
 assert.equal(forum.participants.find(x=>x.nim==='261090100002').status,'participated');
 assert.equal(forum.participants.find(x=>x.nim==='261090100002').replyCount,2);
});

test('forum participation requires at least two unique student replies and keeps absent students unknown',()=>{
 const roster=Array.from({length:32},(_,i)=>({nim:String(261090100100+i)}));
 const coursePayload={kode_course:course.kode_course,peserta:roster,data:course.data};
 const data=[];
 for(let i=0;i<29;i++){
  const nim=roster[i].nim;
  data.push(post('direct-'+i,nim,1,'forum-topic'));
  data.push(post('nested-'+i,nim,2,'direct-'+i));
 }
 const snapshot=collector.normalizeForumCapture(Object.assign({},topic,{data}));
 const preview=collector.buildActivitySyncPreview([collector.collectCourseMetadata(coursePayload)],[snapshot]);
 const forum=preview.courses[0].activities.find(x=>x.type==='FORUM');
 assert.equal(forum.minimumReplyCount,2);
 assert.equal(forum.participatedCount,29);
 assert.equal(forum.notStartedCount,0);
 assert.equal(forum.unknownCount,3);
 assert.equal(forum.dataComplete,false);
});

test('unwraps nested user-course envelopes and persists course metadata shape',()=>{
 const wrapped={data:{kode_course:course.kode_course,peserta:course.peserta,data:course.data}};
 const meta=collector.collectCourseMetadata(wrapped);
 assert.equal(meta.kode_course,course.kode_course);
 assert.equal(meta.rosterNims.length,2);
 assert.equal(meta.activities.length,2);
});

test('export includes course metadata and matching forum aggregates in activity_sync',()=>{
 const meta=collector.collectCourseMetadata(course);
 const snapshot=collector.normalizeForumCapture(Object.assign({},topic,{data:[
  post('p1','261090100001',1,'forum-topic'),
  post('p2','261090100001',1,'forum-topic')
 ]}));
 const exported=collector.buildExport([],[],[meta],[snapshot]);
 assert.equal(exported.activity_sync.courses.length,1);
 const forum=exported.activity_sync.courses[0].activities.find(item=>item.type==='FORUM');
 assert.equal(forum.activityId,'forum-section');
 assert.equal(forum.forumId,'forum-topic');
 assert.equal(forum.participatedCount,1);
 assert.equal(forum.minimumReplyCount,2);
 assert.equal(forum.participants.find(item=>item.nim==='261090100001').replyCount,2);
 assert.equal(exported.activity_sync.courses[0].kode_course,course.kode_course);
});
