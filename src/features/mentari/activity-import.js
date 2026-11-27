'use strict';
const COURSE_MAP=Object.freeze({'26FTK0011':'KAL','26FTK0021':'FIS','26PAM0007':'WRG','26PAM0008':'IND','26PAM0010':'ENG','26TEL0001':'PRG','26TEL0002':'ALJ','26TEL0003':'ELE','26TEL0004':'KIM'});
const TYPES=new Set(['PRE_TEST','POST_TEST','FORUM','QUESTIONNAIRE']),STATUSES=new Set(['participated','not_started','unknown']),NIM_RE=/^[0-9]{6,20}$/;
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v),str=v=>typeof v==='string'?v.trim():'';
function mapCourse(v){const m=/-(26(?:FTK|PAM|TEL)[0-9]{4})$/.exec(str(v));return m?COURSE_MAP[m[1]]||null:null;}
function normalizeImport(payload,accountIndex,now=Date.now()){
 const errors=[],warnings=[],activities=[];
 if(!obj(payload)||payload.schema_version!=='1.0'||payload.source!=='mentari_unpam')return{ok:false,errors:[{code:'E_SCHEMA_UNSUPPORTED'}],warnings,activities};
 if(payload.semester!=='20261')errors.push({code:'E_SEMESTER_MISMATCH'});
 const sync=obj(payload.activity_sync)?payload.activity_sync:null;
 if(!sync||sync.schemaVersion!=='1.0'||!Array.isArray(sync.courses)||!sync.courses.length)errors.push({code:'E_ACTIVITY_SYNC_MISSING'});
 const batchId=str(payload.batch_id);if(!batchId||batchId.length>120)errors.push({code:'E_BATCH_INVALID'});
 const accounts=accountIndex instanceof Map?accountIndex:new Map(),seenCourses=new Set(),seenActivities=new Set();
 for(const course of(sync&&Array.isArray(sync.courses)?sync.courses:[])){
  if(!obj(course)){errors.push({code:'E_COURSE_INVALID'});continue;}
  const mapped=mapCourse(course.kode_course),code=str(course.course_code);
  if(!mapped||mapped!==code||seenCourses.has(mapped)){errors.push({code:'E_COURSE_MISMATCH'});continue;}seenCourses.add(mapped);
  if(Number(course.rosterCount)!==32||!Array.isArray(course.activities)){errors.push({code:'E_ROSTER_INCOMPLETE',course:code});continue;}
  for(const activity of course.activities){
   if(!obj(activity)){errors.push({code:'E_ACTIVITY_INVALID',course:code});continue;}
   const id=str(activity.activityId),type=str(activity.type).toUpperCase(),meeting=Number(activity.meetingNumber),section=str(activity.sectionCode),max=mapped==='FIS'?21:16;
   if(!id||id.length>200||!TYPES.has(type)||!Number.isInteger(meeting)||meeting<1||meeting>max||section!=='PERTEMUAN_'+meeting||seenActivities.has(mapped+'|'+id)){errors.push({code:'E_ACTIVITY_INVALID',course:code});continue;}seenActivities.add(mapped+'|'+id);
   const rows=Array.isArray(activity.participants)?activity.participants:[];
   if(rows.length!==32){errors.push({code:'E_PARTICIPANTS_INCOMPLETE',activity:id});continue;}
   const seenNims=new Set(),participants=[];
   for(const row of rows){
    if(!obj(row)){errors.push({code:'E_PARTICIPANT_INVALID',activity:id});continue;}
    const nim=str(row.nim),status=str(row.status);
    if(!NIM_RE.test(nim)||seenNims.has(nim)||!STATUSES.has(status)){errors.push({code:'E_PARTICIPANT_INVALID',activity:id});continue;}seenNims.add(nim);
    const account=accounts.get(nim);if(!account||!/^akun\/(0[1-9]|[12][0-9]|3[0-2])$/.test(account.key||'')){errors.push({code:'E_NIM_UNKNOWN',activity:id});continue;}
    const reply= row.replyCount==null?0:Number(row.replyCount);
    if(!Number.isInteger(reply)||reply<0||reply>5000){errors.push({code:'E_REPLY_COUNT_INVALID',activity:id});continue;}
    if(status==='not_started'&&activity.dataComplete!==true){errors.push({code:'E_NOT_STARTED_UNVERIFIED',activity:id});continue;}
    participants.push({nim,account_key:account.key,status,reply_count:type==='FORUM'?reply:0,attempt_status:str(row.attemptStatus).slice(0,40)||null});
   }
   if(seenNims.size!==32||participants.length!==32){errors.push({code:'E_PARTICIPANTS_INCOMPLETE',activity:id});continue;}
   const counts={participated:participants.filter(x=>x.status==='participated').length,not_started:participants.filter(x=>x.status==='not_started').length,unknown:participants.filter(x=>x.status==='unknown').length};
   for(const key of Object.keys(counts)){const k=key==='not_started'?'notStartedCount':key+'Count';if(Number(activity[k])!==counts[key])errors.push({code:'E_STATUS_COUNT_MISMATCH',activity:id});}
   if(type==='FORUM'&&activity.dataComplete!==true)warnings.push({code:'W_FORUM_UNVERIFIED',activity:id});
   if(type==='QUESTIONNAIRE'&&activity.participationStatus==='not_supported')warnings.push({code:'W_QUESTIONNAIRE_UNSUPPORTED',activity:id});
   activities.push({external_activity_id:id,course_code:mapped,meeting_number:meeting,section_code:section,activity_type:type,title:str(activity.title).slice(0,160),forum_id:str(activity.forumId)||null,data_complete:activity.dataComplete===true,captured_at:sync.capturedAt||null,roster_count:32,participated_count:counts.participated,not_started_count:counts.not_started,unknown_count:counts.unknown,participants});
  }
 }
 if(!activities.length)errors.push({code:'E_NO_ACTIVITIES'});
 if(payload.exported_at&&Date.parse(payload.exported_at)&&now-Date.parse(payload.exported_at)>7*86400000)warnings.push({code:'W_OLD_CAPTURE'});
 return{ok:errors.length===0,batchId,semester:payload.semester,errors,warnings,activities,summary:{courses:seenCourses.size,activities:activities.length,participants:activities.reduce((n,a)=>n+a.participants.length,0),participated:activities.reduce((n,a)=>n+a.participated_count,0),not_started:activities.reduce((n,a)=>n+a.not_started_count,0),unknown:activities.reduce((n,a)=>n+a.unknown_count,0),errors:errors.length,warnings:warnings.length}};
}
module.exports=Object.freeze({COURSE_MAP,mapCourse,normalizeImport});
