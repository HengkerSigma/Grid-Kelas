// ==UserScript==
// @name         Grid Kelas - Mentari Collector v2
// @namespace    https://www.1else3.my.id/
// @version      2.2.0
// @description  Tangkap snapshot kuis Mentari dan sinkronkan ke preview Grid Kelas atas perintah admin.
// @match        https://mentari.unpam.ac.id/*
// @match        https://www.1else3.my.id/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @connect      www.1else3.my.id
// ==/UserScript==
(function (root) {
'use strict';
const DB='grid-kelas-mentari-collector', VERSION=1, CLASS_SIZE=32, SEMESTER='20261';
const PATCH='__gkMentariCollectorV2', ACT='activities', RES='results';
const MAP={'26TEL0004':'KIM','26PAM0007':'WRG','26PAM0008':'IND','26PAM0010':'ENG','26FTK0021':'FIS','26FTK0011':'KAL','26TEL0003':'ELE','26TEL0002':'ALJ','26TEL0001':'PRG'};
const TYPES=new Set(['PRE_TEST','POST_TEST']);
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:null;
const str=v=>typeof v==='string'?v.trim():'';
function courseCode(v){const m=/-(26(?:TEL|PAM|FTK)\d{4})$/.exec(str(v));return m?MAP[m[1]]||null:null;}
function meeting(v){const m=/^PERTEMUAN_(\d+)$/.exec(str(v));const n=m?Number(m[1]):0;return Number.isInteger(n)&&n>0?n:null;}
function iso(v){if(typeof v!=='string'||!v.trim())return null;const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString():null;}
function extractActivities(payload,courseCodeHint){
 const p=obj(payload), externalCode=str(p&&p.kode_course)||str(courseCodeHint), code=courseCode(externalCode);if(!code)return [];
 const out=[],seen=new Set();
 function walk(v,section){if(Array.isArray(v)){v.forEach(x=>walk(x,section));return;}
  const x=obj(v);if(!x)return;const sec=str(x.kode_section)||section||'',type=str(x.kode_template).toUpperCase(),id=str(x.id);
  const quiz=obj(x.quiz),quizId=quiz?str(quiz.id):'',activityId=id;
  const identity=quizId||activityId;
  if(identity&&TYPES.has(type)&&!seen.has(identity)){const m=meeting(sec);if(m){seen.add(identity);out.push({quiz_uuid:identity,activity_id:activityId,quiz_available:!!quiz,availability_status:quiz?'available':x.quiz===null?'not_open':'unknown',kode_course:externalCode,course_code:code,kode_section:sec,meeting_number:m,quiz_type:type,title:str(x.judul||x.title||x.nama)||(type==='PRE_TEST'?'Pre-test':'Post-test')});}}
  Object.values(x).forEach(y=>{if(Array.isArray(y)||obj(y))walk(y,sec);});
 }
 walk(p.data,'');return out;
}
function normalizeCapture(payload,meta){
 const p=obj(payload),a=obj(meta);if(!p||!Array.isArray(p.data)||!a||str(p.kode_course)!==a.kode_course||meeting(p.kode_section)!==a.meeting_number)return null;
 const seen=new Set(),results=[];let duplicate=false;
 for(const raw of p.data){const r=obj(raw),nim=r&&str(r.nim);if(!/^[0-9]{6,20}$/.test(nim))continue;if(seen.has(nim)){duplicate=true;continue;}seen.add(nim);
  const q=obj(r.quiz),g=q?q.grade:null,valid=g==null||(typeof g==='number'&&Number.isFinite(g)&&g>=0&&g<=100);
  results.push({nim,grade:valid&&typeof g==='number'?g:null,attempt_status:!q?'no_record':!valid?'invalid_grade':typeof g==='number'?'graded':'attempt_ungraded',start_at:q?iso(q.start_at):null,end_at:q?iso(q.end_at):null});
 }
 return {quiz_uuid:a.quiz_uuid,kode_course:a.kode_course,course_code:a.course_code,kode_section:a.kode_section,meeting_number:a.meeting_number,quiz_type:a.quiz_type,title:str(p.judul)||a.title,total_participants:results.length,expected_participants:CLASS_SIZE,data_complete:p.data.length===CLASS_SIZE&&results.length===CLASS_SIZE&&!duplicate,duplicate_nim_detected:duplicate,captured_at:new Date().toISOString(),results};
}
function resolveActivity(id,payload,activities){
 const list=Array.isArray(activities)?activities:[];
 const exact=list.find(item=>item&&item.quiz_uuid===id);if(exact)return {activity:exact,matchedBy:'uuid'};
 const p=obj(payload),code=str(p&&p.kode_course),section=str(p&&p.kode_section),title=str(p&&p.judul);
 if(!code||!section||!title)return {activity:null,matchedBy:null};
 const normalized=title.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const inferredType=/\bpre\s*test\b/.test(normalized)?'PRE_TEST':/\bpost\s*test\b/.test(normalized)?'POST_TEST':null;
 if(!inferredType)return {activity:null,matchedBy:null};
 const candidates=list.filter(item=>item&&str(item.kode_course)===code&&str(item.kode_section)===section&&item.quiz_type===inferredType);
 return candidates.length===1?{activity:candidates[0],matchedBy:'course-section-type'}:{activity:null,matchedBy:null};
}
function captureMismatch(payload,meta){
 const p=obj(payload),a=obj(meta);if(!p)return 'respons bukan objek JSON';
 if(!Array.isArray(p.data))return 'field data bukan array';
 if(!a)return 'metadata aktivitas tidak ditemukan';
 if(str(p.kode_course)!==a.kode_course)return 'kode_course respons berbeda dari metadata';
 if(meeting(p.kode_section)!==a.meeting_number)return 'kode_section respons berbeda dari metadata';
 return 'respons tidak dapat dinormalisasi';
}
function mergeActivityMetadata(previous,activity){const p=obj(previous)||{};return {...p,...activity,total_participants:p.total_participants??0,expected_participants:CLASS_SIZE,data_complete:p.data_complete===true,captured_at:p.captured_at||null};}
function buildExport(activities,results){
 const map=new Map((activities||[]).map(a=>[a.quiz_uuid,{...a,results:[]}]));
 (results||[]).forEach(r=>{const a=map.get(r.quiz_uuid);if(a)a.results.push({nim:r.nim,grade:r.grade,attempt_status:r.attempt_status,start_at:r.start_at,end_at:r.end_at});});
 const groups=new Map();
 map.forEach(a=>{if(!groups.has(a.course_code))groups.set(a.course_code,{kode_course:a.kode_course,course_code:a.course_code,nama:a.course_code,activities:[],activity_metadata:[]});
  if(a.quiz_available===false){groups.get(a.course_code).activity_metadata.push({activity_id:a.activity_id||a.quiz_uuid,kode_section:a.kode_section,meeting_number:a.meeting_number,quiz_type:a.quiz_type,title:a.title,availability_status:a.availability_status||'not_open'});return;}
  groups.get(a.course_code).activities.push({quiz_uuid:a.quiz_uuid,kode_section:a.kode_section,meeting_number:a.meeting_number,quiz_type:a.quiz_type,title:a.title,total_participants:a.total_participants||0,expected_participants:CLASS_SIZE,data_complete:a.data_complete===true,captured_at:a.captured_at||null,results:a.results.sort((x,y)=>x.nim.localeCompare(y.nim))});
 });
 return {schema_version:'1.0',source:'mentari_unpam',semester:SEMESTER,batch_id:root?.crypto?.randomUUID?.()||'batch-'+Date.now(),exported_at:new Date().toISOString(),courses:[...groups.values()].sort((a,b)=>a.course_code.localeCompare(b.course_code))};
}
const api={courseCode,meeting,extractActivities,normalizeCapture,resolveActivity,captureMismatch,buildExport,snapshotResultChanges,mergeActivityMetadata};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(!root||!root.document)return;
const page=typeof unsafeWindow!=='undefined'?unsafeWindow:root;if(page[PATCH])return;page[PATCH]=true;
let dbp,cache=new Map(),status;
function db(){if(dbp)return dbp;dbp=new Promise((ok,no)=>{const q=page.indexedDB.open(DB,VERSION);q.onupgradeneeded=()=>{const d=q.result;if(!d.objectStoreNames.contains(ACT))d.createObjectStore(ACT,{keyPath:'quiz_uuid'});if(!d.objectStoreNames.contains(RES))d.createObjectStore(RES,{keyPath:'key'});};q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});return dbp;}
function snapshotResultChanges(existing,capture){const quizUuid=str(capture&&capture.quiz_uuid),results=Array.isArray(capture&&capture.results)?capture.results:[];if(!quizUuid||!capture||capture.data_complete!==true)return {deleteKeys:[],putRows:[],skipped:true};const putRows=results.filter(r=>obj(r)&&/^[0-9]{6,20}$/.test(str(r.nim))).map(r=>({key:quizUuid+'::'+str(r.nim),quiz_uuid:quizUuid,nim:str(r.nim),grade:r.grade,attempt_status:r.attempt_status,start_at:r.start_at,end_at:r.end_at}));const currentKeys=new Set(putRows.map(r=>r.key));const deleteKeys=(existing||[]).filter(r=>r&&r.quiz_uuid===quizUuid&&!currentKeys.has(r.key)).map(r=>r.key);return {deleteKeys,putRows};}
function writeCapture(c){if(!c||c.data_complete!==true)return Promise.resolve(false);return db().then(d=>new Promise((ok,no)=>{const t=d.transaction([ACT,RES],'readwrite'),a={...c};delete a.results;const store=t.objectStore(RES),request=store.getAll();t.objectStore(ACT).put(a);request.onsuccess=()=>{const changes=snapshotResultChanges(request.result,c);changes.deleteKeys.forEach(key=>store.delete(key));changes.putRows.forEach(row=>store.put(row));};request.onerror=()=>{try{t.abort();}catch(_){}};t.oncomplete=()=>ok(true);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error);}));}
function read(name){return db().then(d=>new Promise((ok,no)=>{const q=d.transaction(name).objectStore(name).getAll();q.onsuccess=()=>ok(q.result||[]);q.onerror=()=>no(q.error);}));}
function clear(){return db().then(d=>new Promise((ok,no)=>{const t=d.transaction([ACT,RES],'readwrite');t.objectStore(ACT).clear();t.objectStore(RES).clear();t.oncomplete=ok;t.onerror=()=>no(t.error);}));}
function kind(url){try{const u=new URL(url,page.location.href);if(u.origin!==page.location.origin)return null;if(/^\/api\/user-course\/[^/]+\/?$/.test(u.pathname))return 'course';if(/^\/api\/quiz\/peserta\/[^/]+\/?$/.test(u.pathname))return 'quiz';}catch(_){}return null;}
async function handle(url,payload){try{const k=kind(url);if(k==='course'){const courseHint=decodeURIComponent(url.split('/').filter(Boolean).pop());for(const a of extractActivities(payload,courseHint)){cache.set(a.quiz_uuid,a);const d=await db();await new Promise((ok,no)=>{const t=d.transaction(ACT,'readwrite'),store=t.objectStore(ACT),request=store.get(a.quiz_uuid);request.onsuccess=()=>store.put(mergeActivityMetadata(request.result,a));request.onerror=()=>{try{t.abort();}catch(_){}};t.oncomplete=ok;t.onerror=()=>no(t.error);t.onabort=()=>no(t.error);});}await refresh('Metadata kuis terdeteksi');}
 else if(k==='quiz'){const id=decodeURIComponent(url.split('/').filter(Boolean).pop());let a=cache.get(id);const stored=await read(ACT);if(!a)a=stored.find(item=>item.quiz_uuid===id)||null;let matchedBy='uuid';if(!a){const resolved=resolveActivity(id,payload,stored);a=resolved.activity;matchedBy=resolved.matchedBy||'none';}if(!a){await refresh('Respons kuis diterima, tetapi metadata tidak cocok');return;}const c=normalizeCapture(payload,a);if(!c){await refresh('Respons kuis tidak cocok: '+captureMismatch(payload,a));return;}if(!c.data_complete){await refresh('Snapshot tidak lengkap ('+c.total_participants+'/'+CLASS_SIZE+'); data sebelumnya dipertahankan');return;}await writeCapture(c);if(matchedBy==='course-section-type')cache.set(id,a);await refresh('Snapshot lengkap tersimpan lokal ('+matchedBy+')');}
 }catch(_){await refresh('Gagal memproses; respons mentah tidak disimpan');}}
async function refresh(message){if(!status)return;try{const [a,r]=await Promise.all([read(ACT),read(RES)]);const complete=a.filter(x=>x&&x.data_complete===true&&x.captured_at).length;status.textContent=message+' | Aktivitas '+a.length+' | Snapshot lengkap '+complete+'/'+a.length+' | Rekaman '+r.length;}catch(_){status.textContent=message+' | IndexedDB tidak tersedia';}}
function hooks(){
 const f=page.fetch;if(typeof f==='function')page.fetch=function(){const args=arguments,p=f.apply(this,args);return p.then(res=>{try{const u=typeof args[0]==='string'?args[0]:args[0]?.url||'';if(kind(u))res.clone().json().then(x=>handle(u,x)).catch(()=>{});}catch(_){}return res;});};
 const X=page.XMLHttpRequest;if(X){const p=X.prototype,open=p.open,send=p.send;p.open=function(m,u){this.__gkCollectorUrl=String(u||'');return open.apply(this,arguments);};p.send=function(){this.addEventListener('load',function(){const u=this.__gkCollectorUrl;if(!kind(u))return;try{handle(u,this.responseType==='json'?this.response:JSON.parse(this.responseText));}catch(_){}},{once:true});return send.apply(this,arguments);};}
}
function ui(){const host=root.document.createElement('div');host.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483647';const s=host.attachShadow({mode:'open'});s.innerHTML='<style>.p{font:13px Arial;color:#172033;background:white;border:1px solid #ccd3dc;border-radius:12px;padding:12px;width:290px;box-shadow:0 5px 24px #0003;display:none}.p.open{display:block}button{border:0;border-radius:7px;padding:8px;margin:3px;background:#17324d;color:white;cursor:pointer}.toggle{background:#176b54}.status{background:#f1f5f9;padding:8px;border-radius:7px;overflow-wrap:anywhere}.muted{font:12px Arial;color:#566}</style><div class="p"><b>Mentari Collector v2</b><p class="muted">Hanya respons normal browser. Tidak ada request tambahan atau unggahan data.</p><div class="status">Memuat IndexedDB…</div><button class="export">Ekspor JSON</button><button class="refresh">Perbarui</button><button class="clear">Hapus data lokal</button><button class="close">Tutup</button><p class="muted">File berisi NIM dan nilai satu kelas. Simpan secara aman.</p></div><button class="toggle">Mentari Collector</button>';
 root.document.documentElement.appendChild(host);const p=s.querySelector('.p');status=s.querySelector('.status');s.querySelector('.toggle').onclick=()=>p.classList.toggle('open');s.querySelector('.close').onclick=()=>p.classList.remove('open');s.querySelector('.refresh').onclick=()=>refresh('Status diperbarui');
 s.querySelector('.export').onclick=async()=>{try{const [a,r]=await Promise.all([read(ACT),read(RES)]);const blob=new Blob([JSON.stringify(buildExport(a,r),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=root.document.createElement('a');link.href=url;link.download='mentari-collector-'+SEMESTER+'-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);refresh('JSON diekspor');}catch(_){refresh('Ekspor gagal');}};
 s.querySelector('.clear').onclick=async()=>{if(root.confirm('Hapus seluruh data Collector lokal? File yang sudah diekspor tidak ikut terhapus.')){await clear();cache.clear();refresh('Data lokal dihapus');}};refresh('Siap; buka halaman mata kuliah');
}
const GRID_ORIGIN='https://www.1else3.my.id';
const TICKET_KEY='gkMentariSyncTicketV1', RESULT_KEY='gkMentariSyncResultV1';
function gridBridge(){
  root.document.addEventListener('gk:mentari-sync-request',async()=>{
    try{
      const response=await page.fetch('/api/mentari/grades/sync/ticket',{method:'POST',credentials:'same-origin',headers:{'X-Requested-With':'gk'}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ticket)throw new Error(data.message||'Tidak dapat membuat tiket sinkronisasi.');
      GM_setValue(TICKET_KEY,{ticket:data.ticket,createdAt:Date.now()});
    }catch(error){root.document.dispatchEvent(new CustomEvent('gk:mentari-sync-status',{detail:{ok:false,message:error.message||'Gagal membuat tiket.'}}));}
  });
  GM_addValueChangeListener(RESULT_KEY,(_key,_old,value)=>{
    if(value)root.document.dispatchEvent(new CustomEvent('gk:mentari-sync-status',{detail:value}));
  });
}
function mentariBridge(){
  GM_addValueChangeListener(TICKET_KEY,async(_key,_old,value)=>{
    if(!value||!value.ticket||Date.now()-Number(value.createdAt||0)>5*60*1000)return;
    try{
      const [activities,results]=await Promise.all([read(ACT),read(RES)]);
      const payload=buildExport(activities,results);
      GM_xmlhttpRequest({
        method:'POST',url:GRID_ORIGIN+'/api/mentari/grades/sync/upload',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+value.ticket,'X-Requested-With':'gk'},
        data:JSON.stringify(payload),timeout:60000,
        onload(response){
          let data={};try{data=JSON.parse(response.responseText||'{}');}catch(_){}
          const result=response.status>=200&&response.status<300&&data.ok
            ?{ok:true,batchId:data.batchId,summary:data.summary,warnings:data.warnings||[],expiresAt:data.expiresAt,message:'Preview siap: '+Number(data.summary&&data.summary.activities||0)+' aktivitas, '+Number(data.summary&&data.summary.rows||0)+' baris.'}
            :{ok:false,message:data.message||((data.errors||[]).map(x=>x.code).join(', '))||'Server menolak snapshot ('+response.status+').'};
          GM_setValue(RESULT_KEY,Object.assign({at:Date.now()},result));
          GM_setValue(TICKET_KEY,null);
        },
        onerror(){GM_setValue(RESULT_KEY,{ok:false,at:Date.now(),message:'Koneksi ke Grid Kelas gagal.'});GM_setValue(TICKET_KEY,null);},
        ontimeout(){GM_setValue(RESULT_KEY,{ok:false,at:Date.now(),message:'Pengiriman melewati batas waktu.'});GM_setValue(TICKET_KEY,null);}
      });
    }catch(error){GM_setValue(RESULT_KEY,{ok:false,at:Date.now(),message:error.message||'Gagal membaca Collector lokal.'});GM_setValue(TICKET_KEY,null);}
  });
}
if(page.location.hostname==='www.1else3.my.id'){gridBridge();return;}
mentariBridge();
hooks();if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',ui,{once:true});else ui();
})(typeof window!=='undefined'?window:null);
