'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname,'../../tools/mentari/collector-v2.user.js'),'utf8');

test('Collector has safe fallback matching by course, section, and quiz type',()=>{
  assert.match(source,/function resolveActivity\(id,payload,activities\)/);
  assert.match(source,/item\.quiz_uuid===id/);
  assert.match(source,/str\(item\.kode_course\)===code&&str\(item\.kode_section\)===section&&item\.quiz_type===inferredType/);
  assert.match(source,/candidates\.length===1/);
});

test('Collector preserves participants without a quiz record as no_record',()=>{
  assert.match(source,/attempt_status:!q\?'no_record'/);
  assert.match(source,/p\.data\.length===32&&results\.length===32&&!duplicate/);
});

test('Collector reports a failed activity match instead of silently dropping the response',()=>{
  assert.match(source,/Respons kuis diterima, tetapi metadata tidak cocok/);
  assert.match(source,/Respons kuis tidak cocok:/);
});
