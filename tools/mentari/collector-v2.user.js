// ==UserScript==
// @name         Grid Kelas - Mentari Collector v2
// @namespace    https://www.1else3.my.id/
// @version      2.3.7
// @description  Tangkap metadata aktivitas, rekap forum, dan snapshot kuis Mentari.
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
const DB='grid-kelas-mentari-collector', VERSION=2, CLASS_SIZE=32, SEMESTER='20261';
const PATCH='__gkMentariCollectorV2', ACT='activities', RES='results', COURSES='course_meta', FORUMS='forum_activity';
const MAP={'26TEL0004':'KIM','26PAM0007':'WRG','26PAM0008':'IND','26PAM0010':'ENG','26FTK0021':'FIS','26FTK0011':'KAL','26TEL0003':'ELE','26TEL0002':'ALJ','26TEL0001':'PRG'};
const TYPES=new Set(['PRE_TEST','POST_TEST']);
const FORUM_MIN_REPLIES=2;
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:null;
const str=v=>typeof v==='string'?v.trim():'';
function unwrapCoursePayload(payload,courseCodeHint){
 const root=obj(payload);if(!root)return null;
 const queue=[{value:root,depth:0}],seen=new Set();
 while(queue.length){
  const current=queue.shift(),value=obj(current.value);
  if(!value||seen.has(value)||current.depth>5)continue;seen.add(value);
  if(Array.isArray(value.peserta)&&(Array.isArray(value.data)||obj(value.data))&&(str(value.kode_course)||str(courseCodeHint)))return value;
  for(const key of ['data','result','payload','response','course']){
   const nested=value[key];if(obj(nested))queue.push({value:nested,depth:current.depth+1});
  }
 }
 return null;
}
function courseCode(v){const m=/-(26(?:TEL|PAM|FTK)\d{4})$/.exec(str(v));return m?MAP[m[1]]||null:null;}
function meeting(v){const m=/^PERTEMUAN_(\d+)$/.exec(str(v));const n=m?Number(m[1]):0;return Number.isInteger(n)&&n>0?n:null;}
function iso(v){if(typeof v!=='string'||!v.trim())return null;const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString():null;}
function extractActivities(payload,courseCodeHint){
 const p=unwrapCoursePayload(payload,courseCodeHint)||obj(payload), externalCode=str(p&&p.kode_course)||str(courseCodeHint), code=courseCode(externalCode);if(!p||!code)return [];
 const out=[],seen=new Set();
 function walk(v,section){if(Array.isArray(v)){v.forEach(x=>walk(x,section));return;}
  const x=obj(v);if(!x)return;const sec=str(x.kode_section)||section||'',type=str(x.kode_template).toUpperCase(),id=str(x.id);
  const quiz=obj(x.quiz),quizId=quiz?str(quiz.id):'',activityId=id,title=str(x.judul||x.title||x.nama),normalizedTitle=title.toLowerCase();
  let normalizedType=TYPES.has(type)?type:null;
  if(!normalizedType&&(type==='QUIZ'||str(x.tipe).toUpperCase()==='QUIZ')){
   if(/pre[\s-]*test/.test(normalizedTitle))normalizedType='PRE_TEST';
   else if(/post[\s-]*test/.test(normalizedTitle))normalizedType='POST_TEST';
  }
  const identity=quizId||activityId,quizAvailable=quiz?true:x.quiz===null?false:null;
  if(identity&&normalizedType&&!seen.has(identity)){const m=meeting(sec);if(m){seen.add(identity);out.push({quiz_uuid:identity,activity_id:activityId,quiz_available:quizAvailable,availability_status:quiz?'available':x.quiz===null?'not_open':'unknown',kode_course:externalCode,course_code:code,kode_section:sec,meeting_number:m,quiz_type:normalizedType,title:title||(normalizedType==='PRE_TEST'?'Pre-test':'Post-test')});}}
  Object.values(x).forEach(y=>{if(Array.isArray(y)||obj(y))walk(y,sec);});
 }
 walk(p.data,'');return out;
}
function collectCourseMetadata(payload,courseCodeHint){
 const p=unwrapCoursePayload(payload,courseCodeHint)||obj(payload),externalCode=str(p&&p.kode_course)||str(courseCodeHint);
 if(!p||!Array.isArray(p.peserta)||!(Array.isArray(p.data)||obj(p.data))||!externalCode)return null;
 const rosterNims=Array.from(new Set(p.peserta.map(x=>str(obj(x)&&x.nim)).filter(n=>/^[0-9]{6,20}$/.test(n)))).sort();
 const activities=[];
 const sections=Array.isArray(p.data)?p.data:Object.entries(p.data).map(([kode_section,value])=>Object.assign({kode_section},obj(value)||{}));
 for(const sectionValue of sections){
  const section=obj(sectionValue),sectionCode=str(section&&section.kode_section),m=meeting(sectionCode);if(!section||!m||!Array.isArray(section.sub_section))continue;
  for(const raw of section.sub_section){
   const item=obj(raw);if(!item)continue;
   const template=str(item.kode_template).toUpperCase(),kind=str(item.tipe).toUpperCase(),title=str(item.judul||item.title||item.nama),normalized=title.toLowerCase();
   let type=null;
   if(template==='FORUM'||kind==='FORUM')type='FORUM';
   else if(template==='QUESIONER'||template==='QUESTIONNAIRE'||kind==='QUESIONER'||kind==='QUESTIONNAIRE')type='QUESTIONNAIRE';
   else if(template==='PRE_TEST'||((template==='QUIZ'||kind==='QUIZ')&&/pre[\s-]*test/.test(normalized)))type='PRE_TEST';
   else if(template==='POST_TEST'||((template==='QUIZ'||kind==='QUIZ')&&/post[\s-]*test/.test(normalized)))type='POST_TEST';
   const activityId=str(item.id);if(!type||!activityId)continue;
   activities.push({activityId,sectionCode,meetingNumber:m,title:title||type,type});
  }
 }
 return {kode_course:externalCode,course_code:courseCode(externalCode)||externalCode,rosterNims,activities,updatedAt:new Date().toISOString()};
}
function normalizeForumCapture(payload){
 const p=obj(payload),sectionId=str(p&&p.id_trx_course_sub_section),forumId=str(p&&p.id),course=str(p&&p.kode_course);
 if(!p||!sectionId||!forumId||!course||!Array.isArray(p.data))return null;
 const posts=p.data.map(obj).filter(Boolean),byId=new Map();
 for(const post of posts){const id=str(post.id);if(id&&!byId.has(id))byId.set(id,post);}
 const belongsToTopic=post=>{
  let parentId=str(post.id_parent);const visited=new Set();
  while(parentId&&!visited.has(parentId)){
   if(parentId===forumId)return true;
   visited.add(parentId);
   const parent=byId.get(parentId);if(!parent)return false;
   const parentSection=str(parent.id_trx_course_sub_section);
   if(parentSection&&parentSection!==sectionId)return false;
   if(str(parent.post_type).toUpperCase()!=='REPLY')return false;
   parentId=str(parent.id_parent);
  }
  return false;
 };
 const counts=new Map(),seen=new Set();
 for(const post of posts){
  const id=str(post.id),nim=str(post.nim)||str(obj(post.mahasiswa)&&post.mahasiswa.nim),level=Number(post.reply_level);
  if(!id||seen.has(id)||!/^[0-9]{6,20}$/.test(nim)||!Number.isInteger(level)||level<1)continue;
  if(str(post.post_type).toUpperCase()!=='REPLY')continue;
  const postSection=str(post.id_trx_course_sub_section);
  if(postSection&&postSection!==sectionId)continue;
  if(!belongsToTopic(post))continue;
  seen.add(id);counts.set(nim,(counts.get(nim)||0)+1);
 }
 return {sectionId,courseCode:course,forumId,replyCounts:Array.from(counts,([nim,count])=>({nim,count})).sort((a,b)=>a.nim.localeCompare(b.nim)),receivedPostCount:p.data.length,capturedReplyCount:seen.size,dataComplete:true,capturedAt:new Date().toISOString()};
}
function buildActivitySyncPreview(courseMetas,forumSnapshots,quizActivities,quizResults){
 const snapshots=Array.isArray(forumSnapshots)?forumSnapshots:[],quizMeta=Array.isArray(quizActivities)?quizActivities:[],quizRows=Array.isArray(quizResults)?quizResults:[];
 return {schemaVersion:'1.0',capturedAt:new Date().toISOString(),courses:(Array.isArray(courseMetas)?courseMetas:[]).map(meta=>{
  const roster=Array.isArray(meta.rosterNims)?meta.rosterNims:[],activities=(Array.isArray(meta.activities)?meta.activities:[]).map(activity=>{
   if(activity.type==='PRE_TEST'||activity.type==='POST_TEST'){
    const saved=quizMeta.find(item=>item&&item.kode_course===meta.kode_course&&item.kode_section===activity.sectionCode&&item.quiz_type===activity.type&&(item.activity_id===activity.activityId||item.quiz_uuid===activity.activityId));
    const rows=saved?quizRows.filter(row=>row&&row.quiz_uuid===saved.quiz_uuid):[],byNim=new Map(rows.map(row=>[row.nim,row]));
    const complete=Boolean(saved&&saved.data_complete===true&&saved.total_participants===roster.length&&roster.length>0&&roster.every(nim=>byNim.has(nim)));
    const participants=roster.map(nim=>{
     const row=byNim.get(nim),attempt=row&&row.attempt_status;
     const attempted=attempt==='graded'||attempt==='attempt_ungraded'||attempt==='invalid_grade';
     const status=attempted?'participated':complete&&attempt==='no_record'?'not_started':'unknown';
     return {nim,status,attemptStatus:attempt||null};
    });
    const participatedCount=participants.filter(item=>item.status==='participated').length,notStartedCount=participants.filter(item=>item.status==='not_started').length;
    return {...activity,activityId:activity.activityId,dataComplete:complete,participationStatus:complete?'complete':participatedCount?'partial_or_unverified':'not_captured',rosterCount:roster.length,participatedCount,notStartedCount,unknownCount:participants.filter(item=>item.status==='unknown').length,participants};
   }
   if(activity.type!=='FORUM'){const participants=roster.map(nim=>({nim,status:'unknown',attemptStatus:null,replyCount:0}));return {...activity,participationStatus:'not_supported',dataComplete:false,rosterCount:roster.length,participatedCount:0,notStartedCount:0,unknownCount:roster.length,participants};}
   const snapshot=snapshots.find(item=>item&&item.sectionId===activity.activityId&&item.courseCode===meta.kode_course);
   const storedCounts=snapshot&&Array.isArray(snapshot.replyCounts)?snapshot.replyCounts:snapshot&&Array.isArray(snapshot.directReplyCounts)?snapshot.directReplyCounts:[];
   const countMap=new Map(storedCounts.map(item=>[item.nim,Number(item.count)||0]));
   const complete=Boolean(snapshot&&snapshot.dataComplete===true);
   const participants=roster.map(nim=>{const replyCount=countMap.get(nim)||0;return {nim,replyCount,status:replyCount>=FORUM_MIN_REPLIES?'participated':complete?'not_started':'unknown'};});
   return {...activity,forumId:snapshot&&snapshot.forumId||null,minimumReplyCount:FORUM_MIN_REPLIES,dataComplete:complete,participationStatus:complete?'complete':'not_captured',rosterCount:roster.length,participatedCount:participants.filter(x=>x.status==='participated').length,notStartedCount:participants.filter(x=>x.status==='not_started').length,unknownCount:participants.filter(x=>x.status==='unknown').length,participants};
  });
  return {kode_course:meta.kode_course,course_code:meta.course_code,rosterCount:roster.length,activityCount:activities.length,activities};
 })};
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
function mergeActivityMetadata(previous,activity){const p=obj(previous)||{},unknownAvailability=activity.quiz_available==null;return {...p,...activity,quiz_uuid:unknownAvailability&&p.quiz_uuid?p.quiz_uuid:activity.quiz_uuid,quiz_available:unknownAvailability?(typeof p.quiz_available==='boolean'?p.quiz_available:null):activity.quiz_available,availability_status:activity.availability_status==='unknown'&&p.availability_status==='available'?'available':activity.availability_status,total_participants:p.total_participants??0,expected_participants:CLASS_SIZE,data_complete:p.data_complete===true,captured_at:p.captured_at||null};}
function buildExport(activities,results,courseMetas,forumSnapshots){
 const map=new Map((activities||[]).map(a=>[a.quiz_uuid,{...a,results:[]}]));
 (results||[]).forEach(r=>{const a=map.get(r.quiz_uuid);if(a)a.results.push({nim:r.nim,grade:r.grade,attempt_status:r.attempt_status,start_at:r.start_at,end_at:r.end_at});});
 const groups=new Map();
 map.forEach(a=>{if(!groups.has(a.course_code))groups.set(a.course_code,{kode_course:a.kode_course,course_code:a.course_code,nama:a.course_code,activities:[],activity_metadata:[]});
  if(a.quiz_available===false||(a.quiz_available==null&&a.data_complete!==true)){groups.get(a.course_code).activity_metadata.push({activity_id:a.activity_id||a.quiz_uuid,kode_section:a.kode_section,meeting_number:a.meeting_number,quiz_type:a.quiz_type,title:a.title,availability_status:a.availability_status||'not_open'});return;}
  groups.get(a.course_code).activities.push({quiz_uuid:a.quiz_uuid,kode_section:a.kode_section,meeting_number:a.meeting_number,quiz_type:a.quiz_type,title:a.title,total_participants:a.total_participants||0,expected_participants:CLASS_SIZE,data_complete:a.data_complete===true,captured_at:a.captured_at||null,results:a.results.sort((x,y)=>x.nim.localeCompare(y.nim))});
 });
 return {schema_version:'1.0',source:'mentari_unpam',semester:SEMESTER,batch_id:root?.crypto?.randomUUID?.()||'batch-'+Date.now(),exported_at:new Date().toISOString(),courses:[...groups.values()].sort((a,b)=>a.course_code.localeCompare(b.course_code)),activity_sync:buildActivitySyncPreview(courseMetas,forumSnapshots,activities,results)};
}
const api={courseCode,meeting,extractActivities,collectCourseMetadata,normalizeForumCapture,buildActivitySyncPreview,normalizeCapture,resolveActivity,captureMismatch,buildExport,snapshotResultChanges,mergeActivityMetadata};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(!root||!root.document)return;
const page=typeof unsafeWindow!=='undefined'?unsafeWindow:root;if(page[PATCH])return;page[PATCH]=true;
let dbp,cache=new Map(),status;
function db(){if(dbp)return dbp;dbp=new Promise((ok,no)=>{const q=page.indexedDB.open(DB,VERSION);q.onupgradeneeded=()=>{const d=q.result;if(!d.objectStoreNames.contains(ACT))d.createObjectStore(ACT,{keyPath:'quiz_uuid'});if(!d.objectStoreNames.contains(RES))d.createObjectStore(RES,{keyPath:'key'});if(!d.objectStoreNames.contains(COURSES))d.createObjectStore(COURSES,{keyPath:'kode_course'});if(!d.objectStoreNames.contains(FORUMS))d.createObjectStore(FORUMS,{keyPath:'sectionId'});};q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});return dbp;}
function snapshotResultChanges(existing,capture){const quizUuid=str(capture&&capture.quiz_uuid),results=Array.isArray(capture&&capture.results)?capture.results:[];if(!quizUuid||!capture||capture.data_complete!==true)return {deleteKeys:[],putRows:[],skipped:true};const putRows=results.filter(r=>obj(r)&&/^[0-9]{6,20}$/.test(str(r.nim))).map(r=>({key:quizUuid+'::'+str(r.nim),quiz_uuid:quizUuid,nim:str(r.nim),grade:r.grade,attempt_status:r.attempt_status,start_at:r.start_at,end_at:r.end_at}));const currentKeys=new Set(putRows.map(r=>r.key));const deleteKeys=(existing||[]).filter(r=>r&&r.quiz_uuid===quizUuid&&!currentKeys.has(r.key)).map(r=>r.key);return {deleteKeys,putRows};}
function writeCapture(c){if(!c||c.data_complete!==true)return Promise.resolve(false);return db().then(d=>new Promise((ok,no)=>{const t=d.transaction([ACT,RES],'readwrite'),a={...c};delete a.results;const store=t.objectStore(RES),request=store.getAll();t.objectStore(ACT).put(a);request.onsuccess=()=>{const changes=snapshotResultChanges(request.result,c);changes.deleteKeys.forEach(key=>store.delete(key));changes.putRows.forEach(row=>store.put(row));};request.onerror=()=>{try{t.abort();}catch(_){}};t.oncomplete=()=>ok(true);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error);}));}
function read(name){return db().then(d=>new Promise((ok,no)=>{const q=d.transaction(name).objectStore(name).getAll();q.onsuccess=()=>ok(q.result||[]);q.onerror=()=>no(q.error);}));}
function clear(){return db().then(d=>new Promise((ok,no)=>{const t=d.transaction([ACT,RES,COURSES,FORUMS],'readwrite');t.objectStore(ACT).clear();t.objectStore(RES).clear();t.objectStore(COURSES).clear();t.objectStore(FORUMS).clear();t.oncomplete=ok;t.onerror=()=>no(t.error);}));}
function kind(url){try{const u=new URL(url,page.location.href);if(u.origin!==page.location.origin)return null;if(/^\/api\/user-course\/[^/]+\/?$/.test(u.pathname))return 'course';if(/^\/api\/quiz\/peserta\/[^/]+\/?$/.test(u.pathname))return 'quiz';if(/^\/api\/forum\/reply\/[^/]+\/?$/.test(u.pathname))return 'forum';}catch(_){}return null;}
async function handle(url,payload){
 try{
  const k=kind(url);
  if(k==='course'){
   const courseHint=decodeURIComponent(url.split('/').filter(Boolean).pop());
   for(const a of extractActivities(payload,courseHint)){
    const stored=await read(ACT);
    let previous=stored.find(item=>item&&item.quiz_uuid===a.quiz_uuid)||null;
    if(!previous&&a.quiz_available===null){
     const matches=stored.filter(item=>item&&item.kode_course===a.kode_course&&item.kode_section===a.kode_section&&item.quiz_type===a.quiz_type);
     if(matches.length===1)previous=matches[0];
    }
    const merged=mergeActivityMetadata(previous,a);cache.set(merged.quiz_uuid,merged);
    const d=await db();await new Promise((ok,no)=>{const t=d.transaction(ACT,'readwrite');t.objectStore(ACT).put(merged);t.oncomplete=ok;t.onerror=()=>no(t.error);t.onabort=()=>no(t.error);});
   }
   const meta=collectCourseMetadata(payload,courseHint);
   if(meta){const d=await db();await new Promise((ok,no)=>{const t=d.transaction(COURSES,'readwrite');t.objectStore(COURSES).put(meta);t.oncomplete=ok;t.onerror=()=>no(t.error);t.onabort=()=>no(t.error);});}
   await refresh('Metadata aktivitas terdeteksi');
  }else if(k==='forum'){
   const snapshot=normalizeForumCapture(payload);
   if(!snapshot){await refresh('Respons forum tidak cocok');return;}
   const d=await db();await new Promise((ok,no)=>{const t=d.transaction(FORUMS,'readwrite');t.objectStore(FORUMS).put(snapshot);t.oncomplete=ok;t.onerror=()=>no(t.error);t.onabort=()=>no(t.error);});
   await refresh('Rekap Forum Diskusi diperbarui');
  }else if(k==='quiz'){
   const id=decodeURIComponent(url.split('/').filter(Boolean).pop());let a=cache.get(id);
   const stored=await read(ACT);if(!a)a=stored.find(item=>item.quiz_uuid===id)||null;
   let matchedBy='uuid';if(!a){const resolved=resolveActivity(id,payload,stored);a=resolved.activity;matchedBy=resolved.matchedBy||'none';}
   if(!a){await refresh('Respons kuis diterima, tetapi metadata tidak cocok');return;}
   const capture=normalizeCapture(payload,a);
   if(!capture){await refresh('Respons kuis tidak cocok: '+captureMismatch(payload,a));return;}
   if(!capture.data_complete){await refresh('Snapshot tidak lengkap ('+capture.total_participants+'/'+CLASS_SIZE+'); data sebelumnya dipertahankan');return;}
   await writeCapture(capture);if(matchedBy==='course-section-type')cache.set(id,a);
   await refresh('Snapshot lengkap tersimpan lokal ('+matchedBy+')');
  }
 }catch(_){await refresh('Gagal memproses; respons mentah tidak disimpan');}
}
async function refresh(message){if(!status)return;try{const [a,r,cm,f]=await Promise.all([read(ACT),read(RES),read(COURSES),read(FORUMS)]);const complete=a.filter(x=>x&&x.data_complete===true&&x.captured_at).length;status.textContent=message+' | Mata kuliah '+cm.length+' | Kuis '+a.length+' | Snapshot lengkap '+complete+'/'+a.length+' | Forum '+f.length+' | Rekaman '+r.length;}catch(_){status.textContent=message+' | IndexedDB tidak tersedia';}}
function hooks(){
 const f=page.fetch;if(typeof f==='function')page.fetch=function(){const args=arguments,p=f.apply(this,args);return p.then(res=>{try{const u=typeof args[0]==='string'?args[0]:args[0]?.url||'';if(kind(u))res.clone().json().then(x=>handle(u,x)).catch(()=>{});}catch(_){}return res;});};
 const X=page.XMLHttpRequest;if(X){const p=X.prototype,open=p.open,send=p.send;p.open=function(m,u){this.__gkCollectorUrl=String(u||'');return open.apply(this,arguments);};p.send=function(){this.addEventListener('load',function(){const u=this.__gkCollectorUrl;if(!kind(u))return;try{handle(u,this.responseType==='json'?this.response:JSON.parse(this.responseText));}catch(_){}},{once:true});return send.apply(this,arguments);};}
}
function ui(){const host=root.document.createElement('div');host.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483647';const s=host.attachShadow({mode:'open'});s.innerHTML='<style>.p{font:13px Arial;color:#172033;background:white;border:1px solid #ccd3dc;border-radius:12px;padding:12px;width:290px;box-shadow:0 5px 24px #0003;display:none}.p.open{display:block}button{border:0;border-radius:7px;padding:8px;margin:3px;background:#17324d;color:white;cursor:pointer}.toggle{background:#176b54}.status{background:#f1f5f9;padding:8px;border-radius:7px;overflow-wrap:anywhere}.muted{font:12px Arial;color:#566}</style><div class="p"><b>Mentari Collector v2</b><p class="muted">Hanya respons normal browser. Rekap forum disimpan tanpa isi postingan atau nama.</p><div class="status">Memuat IndexedDB…</div><button class="export">Ekspor JSON</button><button class="refresh">Perbarui</button><button class="clear">Hapus data lokal</button><button class="close">Tutup</button><p class="muted">File berisi NIM, nilai, dan hitungan balasan forum. Simpan secara aman.</p></div><button class="toggle">Mentari Collector</button>';
 root.document.documentElement.appendChild(host);const p=s.querySelector('.p');status=s.querySelector('.status');s.querySelector('.toggle').onclick=()=>p.classList.toggle('open');s.querySelector('.close').onclick=()=>p.classList.remove('open');s.querySelector('.refresh').onclick=()=>refresh('Status diperbarui');
 s.querySelector('.export').onclick=async()=>{try{const [a,r,cm,fs]=await Promise.all([read(ACT),read(RES),read(COURSES),read(FORUMS)]);const blob=new Blob([JSON.stringify(buildExport(a,r,cm,fs),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=root.document.createElement('a');link.href=url;link.download='mentari-collector-'+SEMESTER+'-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);refresh('JSON diekspor');}catch(_){refresh('Ekspor gagal');}};
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
      const [activities,results,courseMetas,forumSnapshots]=await Promise.all([read(ACT),read(RES),read(COURSES),read(FORUMS)]);
      const payload=buildExport(activities,results,courseMetas,forumSnapshots);
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
