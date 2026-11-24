'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const c=require('../../tools/mentari/collector-v2.user.js');
test('maps supported course suffixes only',()=>{assert.equal(c.courseCode('20261-01ELSE003-26FTK0021'),'FIS');assert.equal(c.courseCode('20261-PKKMB2026-UNPAM0001'),null);});
test('extracts only nested PRE_TEST and POST_TEST metadata',()=>{const a=c.extractActivities({kode_course:'20261-01ELSE003-26FTK0021',data:[{kode_section:'PERTEMUAN_1',sub_section:[{id:'p',kode_template:'PRE_TEST'},{id:'q',kode_template:'POST_TEST'},{id:'t',kode_template:'ASSIGNMENT'}]}]});assert.equal(a.length,2);assert.equal(a[0].meeting_number,1);});
test('keeps grade zero and excludes names and email',()=>{const a={quiz_uuid:'q1',kode_course:'course',course_code:'FIS',kode_section:'PERTEMUAN_1',meeting_number:1,quiz_type:'PRE_TEST',title:'Pre'};const x=c.normalizeCapture({kode_course:'course',kode_section:'PERTEMUAN_1',data:[{nim:'1234567890',nama_mahasiswa:'Rahasia',email:'secret@test',quiz:{grade:0,end_at:'2026-11-01T00:00:00Z'}},{nim:'1234567891',quiz:null}]},a);assert.equal(x.results[0].grade,0);assert.equal(x.results[1].attempt_status,'no_record');assert.equal(JSON.stringify(x).includes('Rahasia'),false);assert.equal(JSON.stringify(x).includes('secret@test'),false);});
test('requires 32 unique valid NIM rows for completeness',()=>{const a={quiz_uuid:'q1',kode_course:'course',course_code:'FIS',kode_section:'PERTEMUAN_1',meeting_number:1,quiz_type:'PRE_TEST',title:'Pre'};const data=Array.from({length:32},(_,i)=>({nim:String(1234567890+i),quiz:{grade:80}}));assert.equal(c.normalizeCapture({kode_course:'course',kode_section:'PERTEMUAN_1',data},a).data_complete,true);data[31]=data[0];const x=c.normalizeCapture({kode_course:'course',kode_section:'PERTEMUAN_1',data},a);assert.equal(x.data_complete,false);assert.equal(x.duplicate_nim_detected,true);});
test('export uses schema v1 and omits internal database keys',()=>{const x=c.buildExport([{quiz_uuid:'q',kode_course:'c',course_code:'FIS',kode_section:'PERTEMUAN_1',meeting_number:1,quiz_type:'PRE_TEST',title:'Pre',total_participants:1,data_complete:true}],[{key:'internal',quiz_uuid:'q',nim:'1234567890',grade:90,attempt_status:'graded'}]);assert.equal(x.schema_version,'1.0');assert.equal(x.courses[0].activities[0].results[0].grade,90);assert.equal(Object.hasOwn(x.courses[0].activities[0].results[0],'key'),false);});
test('replaces a quiz snapshot without retaining stale NIM rows',()=>{const existing=[{key:'q1::111111',quiz_uuid:'q1',nim:'111111'},{key:'q1::222222',quiz_uuid:'q1',nim:'222222'},{key:'q2::333333',quiz_uuid:'q2',nim:'333333'}];const capture={quiz_uuid:'q1',data_complete:true,results:[{nim:'111111',grade:90,attempt_status:'graded',start_at:null,end_at:null},{nim:'444444',grade:80,attempt_status:'graded',start_at:null,end_at:null}]};const changes=c.snapshotResultChanges(existing,capture);assert.deepEqual(changes.deleteKeys,['q1::222222']);assert.deepEqual(changes.putRows.map(r=>r.key),['q1::111111','q1::444444']);assert.equal(changes.putRows.some(r=>r.quiz_uuid==='q2'),false);});

test('does not replace stored results when a snapshot is incomplete',()=>{const existing=[{key:'q1::111111',quiz_uuid:'q1',nim:'111111'},{key:'q1::222222',quiz_uuid:'q1',nim:'222222'}];const capture={quiz_uuid:'q1',data_complete:false,results:[{nim:'111111',grade:90}]};const changes=c.snapshotResultChanges(existing,capture);assert.deepEqual(changes.deleteKeys,[]);assert.deepEqual(changes.putRows,[]);assert.equal(changes.skipped,true);});
test('preserves last complete activity metadata when course metadata is refreshed',()=>{const previous={total_participants:32,expected_participants:32,data_complete:true,captured_at:'2026-11-23T01:00:00.000Z'};const next=c.mergeActivityMetadata(previous,{quiz_uuid:'q1',title:'Post-test'});assert.equal(next.data_complete,true);assert.equal(next.total_participants,32);assert.equal(next.captured_at,previous.captured_at);assert.equal(next.title,'Post-test');});

test('declares the two-origin Grid Kelas sync bridge without sharing Mentari credentials',()=>{const fs=require('node:fs');const source=fs.readFileSync(require.resolve('../../tools/mentari/collector-v2.user.js'),'utf8');assert.ok(source.includes('@match        https://www.1else3.my.id/*'));assert.ok(source.includes('GM_addValueChangeListener'));assert.ok(source.includes('/api/mentari/grades/sync/upload'));assert.ok(source.includes("'Authorization':'Bearer '"));});

test('captures activities with quiz null as metadata without treating them as importable quizzes',()=>{
  const a=c.extractActivities({kode_course:'20261-01ELSE003-26FTK0021',data:[
    {id:'activity-p19',kode_section:'PERTEMUAN_19',kode_template:'PRE_TEST',judul:'Pretest',quiz:null},
    {id:'quiz-p18',kode_section:'PERTEMUAN_18',kode_template:'PRE_TEST',judul:'Pretest',quiz:{id:'quiz-p18-uuid'}}
  ]});
  assert.equal(a.length,2);
  assert.equal(a[0].activity_id,'activity-p19');
  assert.equal(a[0].quiz_available,false);
  assert.equal(a[0].availability_status,'not_open');
  assert.equal(a[1].quiz_uuid,'quiz-p18');
  assert.equal(a[1].quiz_available,true);
});
test('exports not-open activities separately from grade-importable quizzes',()=>{
  const x=c.buildExport([
    {quiz_uuid:'activity-p19',activity_id:'activity-p19',quiz_available:false,availability_status:'not_open',kode_course:'c',course_code:'FIS',kode_section:'PERTEMUAN_19',meeting_number:19,quiz_type:'PRE_TEST',title:'Pretest'},
    {quiz_uuid:'quiz-p18',quiz_available:true,kode_course:'c',course_code:'FIS',kode_section:'PERTEMUAN_18',meeting_number:18,quiz_type:'PRE_TEST',title:'Pretest'}
  ],[]);
  assert.equal(x.courses[0].activities.length,1);
  assert.equal(x.courses[0].activity_metadata.length,1);
  assert.equal(x.courses[0].activity_metadata[0].availability_status,'not_open');
});
