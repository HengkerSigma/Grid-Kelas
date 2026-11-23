'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeImport,courseCode,meeting} = require('../../src/features/mentari/grade-import.js');
function sample() {
  return {schema_version:'1.0',source:'mentari_unpam',semester:'20261',batch_id:'batch-001',
    exported_at:'2026-11-23T01:00:00.000Z',courses:[{kode_course:'20261-01ELSE003-26FTK0011',
      activities:[{quiz_uuid:'quiz-a',kode_section:'PERTEMUAN_1',quiz_type:'PRE_TEST',
        data_complete:true,expected_participants:32,captured_at:'2026-11-23T01:00:00.000Z',
        results:Array.from({length:32},(_,i)=>({nim:String(100000+i),grade:i===0?0:75,attempt_status:'graded'}))}]}]};
}
function index() { return new Map(Array.from({length:32},(_,i)=>[String(100000+i),{key:'akun/'+String(i+1).padStart(2,'0')} ])); }
test('maps supported Mentari course and meeting codes',()=>{assert.equal(courseCode('20261-01ELSE003-26FTK0011'),'KAL');assert.equal(meeting('PERTEMUAN_16'),16);});
test('allows FIS through meeting 21 but keeps other courses capped at 16',()=>{
  const fis = sample();
  fis.courses[0].kode_course = '20261-01ELSE003-26FTK0021';
  fis.courses[0].activities[0].kode_section = 'PERTEMUAN_21';
  const accepted = normalizeImport(fis,index());
  assert.equal(accepted.ok,true);
  assert.equal(accepted.rows[0].meeting_number,21);

  const kal = sample();
  kal.courses[0].activities[0].kode_section = 'PERTEMUAN_17';
  const rejected = normalizeImport(kal,index());
  assert.ok(rejected.errors.some(x=>x.code==='E_ACTIVITY_INVALID'));
});
test('accepts complete 32-person import and preserves grade zero',()=>{const r=normalizeImport(sample(),index());assert.equal(r.ok,true);assert.equal(r.rows.length,32);assert.equal(r.rows[0].grade,0);});
test('rejects unknown NIM and invalid grade',()=>{const p=sample();p.courses[0].activities[0].results[0].nim='999999';p.courses[0].activities[0].results[1].grade=101;const r=normalizeImport(p,index());assert.equal(r.ok,false);assert.ok(r.errors.some(x=>x.code==='E_NIM_UNKNOWN'));assert.ok(r.errors.some(x=>x.code==='E_GRADE_INVALID'));});
test('partial export is warning and never declares missing students as no_record',()=>{const p=sample();p.courses[0].activities[0].data_complete=false;p.courses[0].activities[0].results=p.courses[0].activities[0].results.slice(0,2);const r=normalizeImport(p,index());assert.equal(r.ok,true);assert.ok(r.warnings.some(x=>x.code==='W_PARTIAL_EXPORT'));assert.equal(r.rows.length,2);});
test('rejects duplicate logical activity and duplicate NIM',()=>{const p=sample();p.courses[0].activities.push({...p.courses[0].activities[0],quiz_uuid:'quiz-b'});const r=normalizeImport(p,index());assert.ok(r.errors.some(x=>x.code==='E_BATCH_DUPLICATE'));});

test('attaches no-record warnings to activity and counts accepted rows per activity',()=>{
  const p=sample();
  p.courses[0].activities[0].results[0].attempt_status='no_record';
  p.courses[0].activities.push({...p.courses[0].activities[0],quiz_uuid:'quiz-b',kode_section:'PERTEMUAN_2',
    data_complete:false,results:p.courses[0].activities[0].results.slice(0,3)});
  const r=normalizeImport(p,index());
  assert.equal(r.ok,true);
  assert.equal(r.activities[0].accepted_rows,32);
  assert.equal(r.activities[1].accepted_rows,3);
  assert.ok(r.warnings.some(x=>x.code==='W_NO_RECORD'&&x.activity==='quiz-a'));
  assert.equal(r.summary.no_record_rows,1);
  assert.equal(r.summary.graded_rows,31);
  assert.equal(r.activities[0].no_record_rows,1);
});


test('exposes capture metadata so history can distinguish complete snapshots from missing captures',()=>{
  const p=sample();
  p.courses[0].activities[0].data_complete=false;
  p.courses[0].activities[0].captured_at=null;
  p.courses[0].activities[0].results=[];
  const r=normalizeImport(p,index());
  assert.equal(r.activities[0].data_complete,false);
  assert.equal(r.activities[0].captured_at,null);
  assert.equal(r.activities[0].total_rows,0);
});

test('reports graded, no-record, and unresolved grade counts separately',()=>{
  const p=sample();
  p.courses[0].activities[0].results[0].attempt_status='no_record';
  p.courses[0].activities[0].results[1].attempt_status='graded';
  p.courses[0].activities[0].results[1].grade=null;
  const r=normalizeImport(p,index());
  assert.equal(r.summary.graded_rows,30);
  assert.equal(r.summary.no_record_rows,1);
  assert.equal(r.summary.unresolved_rows,1);
  assert.ok(r.warnings.some(x=>x.code==='W_GRADE_MISSING'));
});
