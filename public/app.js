(function(){
'use strict';
const N=32,PERT=16,LBL={H:'Hadir',I:'Izin',S:'Sakit',A:'Alpa',K:'Kelas Berjalan'};
const $=id=>document.getElementById(id);
const PAD=n=>String(n).padStart(2,'0');
const ESC={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>ESC[c]);
const okImg=u=>typeof u==='string'&&(/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(u)||/^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/media\/[0-9a-f]{32}(?:\?v=\d+)?$/.test(u));
const okUrl=u=>/^https?:\/\//i.test(u||'');
const DRIVE_HOSTS=['drive.google.com','docs.google.com','drive.usercontent.google.com'];
let superLicenseDriveUrl='';
const driveOf=k=>{const d=S.dr[k];return d&&okDrive(d.url)?d.url:'';};
const okDrive=u=>{try{const x=new URL(String(u||'').trim());return x.protocol==='https:'&&DRIVE_HOSTS.indexOf(x.hostname)>=0;}catch(e){return false;}};
/* Mata kuliah bertipe platform: doc platform/<k> berisi link khusus tempat absen diisi (hanya terlihat setelah masuk). */
const okHttps=u=>{try{return new URL(String(u||'').trim()).protocol==='https:';}catch(e){return false;}};
const platConfigOf=k=>S.pl[k]&&S.pl[k].enabled!==false?S.pl[k]:null;
const platOf=(k,meeting)=>{const d=platConfigOf(k),n=Number(meeting||defaultPert(k)),mapped=d&&d.links&&d.links[n],legacy=d&&Number(d.meeting_number||0)===n?d.url:'';const u=mapped||legacy;return u&&okHttps(u)?String(u).trim():'';};
const isPlatformCourse=c=>!!(c&&c.k&&platConfigOf(c.k));
const okId=i=>/^[0-9a-f]{32}$/.test(i||'');
const colr=c=>/^#[0-9a-f]{6}$/i.test(c||'')?c:'#6b6b80';
const SIL='<svg class="sil" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="34" r="18"/><path d="M12 100c2-27 18-42 38-42s36 15 38 42z"/></svg>';
const FLAG=(function(){let r='';for(let y=0;y<3;y++)for(let x=0;x<4;x++)if((x+y)%2===0)r+='<rect x="'+(6+x*4)+'" y="'+(3+y*4)+'" width="4" height="4" fill="#111"/>';return '<svg class="flag" viewBox="0 0 24 24" role="img" aria-label="Admin"><title>Admin</title><path d="M4.5 2v20" stroke="#8a8a99" stroke-width="2" stroke-linecap="round"/><rect x="6" y="3" width="16" height="12" fill="#fff" stroke="#8a8a99" stroke-width="1"/>'+r+'</svg>';})();
const HARI=['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
const HARI_ALL=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']; // urutan Date.getDay()
// Tugas yang sudah melewati tenggat langsung dipindahkan dari daftar aktif ke History.
/* Jadwal boleh satu hari atau rentang (Senin–Jumat). Data lama berupa teks "Senin-Jumat" juga dikenali. */
function hariRange(c){
  let a=String(c.hari||'').trim(),b=String(c.hariSampai||'').trim();
  const m=a.split(/\s*[-–—]\s*/);if(m.length===2){a=m[0];b=m[1];}
  const i=HARI_ALL.indexOf(a),j=b?HARI_ALL.indexOf(b):-1,ok=i>=0&&j>=0&&j!==i;
  return{a:a,b:ok?b:'',i:i,j:ok?j:-1};
}
const hariLabel=c=>{const r=hariRange(c);return r.b?r.a+'–'+r.b:r.a;};
function onDay(c,dayN){
  const r=hariRange(c),k=HARI_ALL.indexOf(dayN);
  if(r.j<0)return r.a===dayN;
  return r.i<=r.j?(k>=r.i&&k<=r.j):(k>=r.i||k<=r.j);
}
/* Jam kuliah ditulis bebas ("08:00-10:30", "08.00 - 10.30 WIB"). Bila tidak terbaca, dianggap berlangsung sepanjang hari jadwal. */
function jamRange(c){
  const m=/(\d{1,2})\s*[.:]\s*(\d{2})\s*(?:-|–|—|s\/d|sd|sampai)\s*(\d{1,2})\s*[.:]\s*(\d{2})/i.exec(String(c.jam||''));
  if(!m||+m[1]>23||+m[3]>23||+m[2]>59||+m[4]>59)return null;
  const s=+m[1]*60+ +m[2],e=+m[3]*60+ +m[4];
  return e>s?{s:s,e:e}:null;
}
function inSession(c,now){
  now=now||new Date();
  if(!onDay(c,jakartaWeekday(now)))return false;
  const r=jamRange(c);
  if(!r)return true;
  const p=jakartaParts(now),t=Number(p.hour)*60+Number(p.minute);
  return t>=r.s&&t<r.e;
}
const VIEWS=['beranda','mahasiswa','mata-kuliah','pengelola'];

let db=null,user=null,AS=null,uid=null,isAdmin=false,canWrite=true,dbState='loading';
let AUTH=null; // diisi db.js saat berjalan lewat server.js: login diperiksa server
let ownerMode=false,view='beranda',annDel=null,ANN_EDIT=null,tkDel=null,berDel=null,fails=0,lockUntil=0;
const PEND={ser:null,dok:null,archive:null,seminar:null};
const S={st:{},co:{},md:{},se:{},tu:{},an:{},ak:{},be:{},ca:{},dr:{},pl:{},cu:{},cs:{},pc:{},pr:{}};
let CONSTRUCTOR_EDIT_ID=null,CONSTRUCTOR_CREATE_COURSE=null,CONSTRUCTOR_COURSE_OPEN={},CU_EDIT=null,ADMIN_SECTION='',ADMIN_MAIN_TAB='academic',ADMIN_NOTIFY_TAB='tasks',PLATFORM_FORM_COURSE='',PLATFORM_FORM_MEETING=0,ATTENDANCE_SESSION_DELETE=null,TEAM_RADIO_INDEX=0,TEAM_RADIO_TOUCH_X=null,COURSE_SUBTAB='grand-prix',STUDENT_SUBTAB='line-up',CONSTRUCTOR_SUBTAB='list',OVERVIEW_SUBTAB='overview',defaultConstructorSeedPromise=null;
const loaded={st:false,co:false,cs:false};
const DR={};
let ME=null,D=null,raf=0,toastT=0,stripFocusedNo=null,PROFILE_EDITING=false,presenceTimer=null;

const dlg=$('dlg'),box=$('dbox');
const isAd=no=>!!(S.ak[PAD(no)]&&S.ak[PAD(no)].admin===true);
const adm=()=>(isAdmin&&ownerMode)||(ME!=null&&isAd(ME));
const dv=(k,def)=>DR[k]!==undefined?DR[k]:def;

const APP_TZ='Asia/Jakarta',SEMESTER_ANCHOR_MEETING=9,SEMESTER_ANCHOR_DATE='2026-10-31';
function jakartaParts(date){const p=new Intl.DateTimeFormat('en-GB',{timeZone:APP_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date||new Date());const o={};p.forEach(x=>{if(x.type!=='literal')o[x.type]=x.value;});return o;}
function today(){const p=jakartaParts();return p.year+'-'+p.month+'-'+p.day;}
function jakartaWeekday(date){return new Intl.DateTimeFormat('id-ID',{timeZone:APP_TZ,weekday:'long'}).format(date||new Date());}
function formatDateTime(ms){try{return new Intl.DateTimeFormat('id-ID',{timeZone:APP_TZ,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(ms));}catch(e){return '';}}
function fmtDate(s){if(!s)return '';const p=String(s).split('-');if(p.length!==3)return esc(s);try{return new Intl.DateTimeFormat('id-ID',{timeZone:APP_TZ,day:'numeric',month:'short',year:'numeric'}).format(new Date(Date.UTC(+p[0],+p[1]-1,+p[2],12)));}catch(e){return esc(s);}}
function fmtTime(ms){try{return new Intl.DateTimeFormat('id-ID',{timeZone:APP_TZ,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(ms));}catch(e){return '';}}
function meetingDate(n){const p=SEMESTER_ANCHOR_DATE.split('-').map(Number),d=new Date(Date.UTC(p[0],p[1]-1,p[2]-(SEMESTER_ANCHOR_MEETING-Number(n))*7));return d.toISOString().slice(0,10);}
function attendanceIsPast(meeting,se,courseCode){
 const date=se&&se.tanggal?se.tanggal:meetingDate(meeting);return !!date&&date<today();}
function attendanceMissingStatus(meeting,se,student,courseCode){
 const k=courseCode||(se&&se.k),n=Number(meeting),active=k?defaultPert(k):0,hasSession=!!(se&&Object.keys(se).length);
 if(se&&se.closed)return 'Absensi ditutup pengelola';
 if(!hasSession){
  // Tautan platform saja tidak membuka absensi; sesi harus benar-benar tersedia.
  if(k&&n<active)return 'Data absensi tidak tersedia';
  if(attendanceIsPast(n,se,k))return 'Absensi sudah terlewat';
  return 'Absensi belum dibuka';
 }
 if(attendanceIsPast(n,se,k))return 'Absensi sudah terlewat';
 return student?'Belum mengisi':'Belum diisi';
}
function greetingText(name,birthday){const p=jakartaParts(),minutes=Number(p.hour)*60+Number(p.minute),n=esc(name||'Mahasiswa');if(birthday&&/^\d{4}-\d{2}-\d{2}$/.test(birthday)&&birthday.slice(5)===p.month+'-'+p.day)return{title:'Selamat Ulang Tahun, '+n+'! 🎂',subtitle:'Semoga tahun ini penuh pencapaian dan hal baik. Have a great lap!'};if(minutes>=240&&minutes<=600)return{title:'Selamat Pagi, '+n,subtitle:'Semangat menjalani hari!'};if(minutes>=601&&minutes<=899)return{title:'Selamat Siang, '+n,subtitle:'Bagaimana hari ini?'};if(minutes>=900&&minutes<=1079)return{title:'Selamat Sore, '+n,subtitle:'Bagaimana hari ini?'};if(minutes>=1080&&minutes<=1319)return{title:'Selamat Malam, '+n,subtitle:'Kerja bagus hari ini, jangan lupa istirahat, ya!'};return{title:'Selamat Malam, '+n,subtitle:'Ini waktunya istirahat!'};}
function semesterMeetingNow(){const p=today().split('-').map(Number),a=SEMESTER_ANCHOR_DATE.split('-').map(Number),weeks=Math.floor((Date.UTC(p[0],p[1]-1,p[2])-Date.UTC(a[0],a[1]-1,a[2]))/604800000);return Math.max(1,Math.min(PERT,SEMESTER_ANCHOR_MEETING+weeks));}
function meetingPhase(n){return Number(n)<=7?'Pra-UTS':Number(n)===8?'UTS':'';}
function updateLiveClock(){const el=$('liveClock');if(!el)return;const now=new Date();el.dateTime=now.toISOString();el.textContent=new Intl.DateTimeFormat('id-ID',{timeZone:APP_TZ,weekday:'short',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now)+' WIB';}
const photo=key=>{const m=S.md[key],src=m&&(m.url||m.data);return src&&((m.url&&/^https:\/\//.test(src))||okImg(src))?'<img src="'+esc(src)+'" alt="">':SIL;};
const stu=n=>S.st[PAD(n)]||null;
const nameOf=n=>{const s=stu(n);return s?((s.depan||'')+' '+(s.belakang||'')).trim():'Mahasiswa '+n;};
const nicknameOf=s=>{if(!s)return'Mahasiswa';const code=String(s.kode||'').trim().toLocaleUpperCase();const full=((s.depan||'')+' '+(s.belakang||'')).trim();if(code.length===3){const word=full.split(/\s+/).find(part=>part.toLocaleUpperCase().includes(code));if(word)return word;}return String(s.depan||full||'Mahasiswa').trim();};
const courseList=()=>Object.values(S.co).sort((a,b)=>(a.urut||0)-(b.urut||0));
const dn=c=>Array.isArray(c.dosen)?(c.dosen[0]||''):(c.dosen||'');
const isLocked=t=>{if(t&&t.closed===true)return true;const d=dayDiff(t&&t.tenggat);return d!==null&&d<0;};
const taskList=()=>Object.keys(S.tu).map(id=>Object.assign({id:id},S.tu[id])).filter(t=>!isLocked(t)).sort((a,b)=>(a.tenggat||'9999').localeCompare(b.tenggat||'9999'));
const cname=k=>S.co[k]?S.co[k].nama:k;

function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true;},4200);}
const ERRMAP={unauthenticated:'Sesi berakhir. Silakan masuk lagi.',too_large:'Berkas terlalu besar. Maksimal 20 MB.',unsupported_type:'Format belum didukung. Kirim foto (JPG, PNG, WebP) atau PDF.',quota_or_state:'Penyimpanan berkas penuh. Hubungi pengelola.',rate_limited:'Terlalu sering. Coba lagi sebentar lagi.',not_granted:'Akun ini belum boleh mengunggah berkas.',invalid_argument:'Perubahan ditolak server. Periksa izin akun atau format data yang dikirim.'};
let pendingRuns=0,busyButtons=[];
let TOUR_DEMO_ACTIVE=false,TOUR_DEMO_SNAPSHOT=null;
function loadingLabel(msg){
  const s=String(msg||'').toLowerCase();
  if(s.includes('constructor'))return s.includes('dibuat')?'Sedang membuat Constructor…':'Sedang memperbarui anggota Constructor…';
  if(s.includes('absen')||s.includes('forum'))return 'Sedang menyimpan absensi…';
  if(s.includes('tugas'))return 'Sedang mengumpulkan tugas…';
  if(s.includes('sertifikat'))return 'Sedang menyimpan sertifikat…';
  if(s.includes('berkas')||s.includes('foto')||s.includes('gambar')||s.includes('bukti'))return 'Sedang mengunggah berkas…';
  if(s.includes('password'))return 'Sedang memperbarui password…';
  return 'Sedang menyimpan perubahan…';
}
function showLoading(msg){
  const el=$('globalLoading');if(!el)return;
  $('loadingText').textContent=loadingLabel(msg);
  el.hidden=false;
  if(typeof dlg!=='undefined'&&dlg)dlg.inert=true;
  if(!el.open){
    if(!el.dataset.preventCancel){
      el.addEventListener('cancel',e=>e.preventDefault());
      el.dataset.preventCancel='true';
    }
    if(typeof el.showModal==='function')el.showModal();
    else el.setAttribute('open','');
  }
  el.setAttribute('aria-busy','true');
}
function hideLoading(){
  const el=$('globalLoading');if(!el)return;
  if(el.open&&typeof el.close==='function')el.close();
  else el.removeAttribute('open');
  el.hidden=true;el.setAttribute('aria-busy','false');
  if(typeof dlg!=='undefined'&&dlg)dlg.inert=false;
}
async function run(fn,okMsg){
  if(TOUR_DEMO_ACTIVE){toast('Mode tutorial: perubahan data dinonaktifkan.');return false;}
  pendingRuns++;
  if(pendingRuns===1){
    busyButtons=Array.from(document.querySelectorAll('button[data-act]')).map(b=>({el:b,disabled:b.disabled}));
    busyButtons.forEach(x=>{x.el.disabled=true;x.el.classList.add('is-busy');});
  }
  showLoading(okMsg);
  try{await fn();if(okMsg)toast(okMsg);return true;}
  catch(e){console.error(e);toast((e&&ERRMAP[e.code])||(e&&e.message&&!e.code?e.message:'Gagal menyimpan. Coba lagi.'));return false;}
  finally{
    pendingRuns=Math.max(0,pendingRuns-1);
    if(!pendingRuns){busyButtons.forEach(x=>{x.el.disabled=x.disabled;x.el.classList.remove('is-busy');});busyButtons=[];hideLoading();}
  }
}

/* ---------- statistics ---------- */
function stats(no){
  const by={},tot={h:0,t:0};
  // Mahasiswa memakai rekap agregat dari /api/sektor karena detail status
  // kehadiran mahasiswa lain memang tidak dikirim lewat koleksi sessions.
  if(SK&&SK.courses){
    Object.keys(SK.courses).forEach(k=>{
      const r=SK.courses[k]||{},t=Number(r.t)||0,h=Number((r.h||{})[no])||0;
      by[k]={h:h,t:t};tot.h+=h;tot.t+=t;
    });
    return{by:by,tot:tot};
  }
  Object.values(S.se).forEach(se=>{
    const p=se.present||{};
    if(!(se.rec===true||Object.values(p).some(Boolean)))return;
    const b=by[se.k]||(by[se.k]={h:0,t:0});
    b.t++;tot.t++;
    if(p[no]==='H'||p[no]==='K'){b.h++;tot.h++;}
  });
  return{by:by,tot:tot};
}
function tugasStat(no){let a=0,b=0;(TOUR_DEMO_ACTIVE?Object.keys(S.tu).map(id=>Object.assign({id:id},S.tu[id])):taskList()).forEach(t=>{b++;if(t.subs&&t.subs[no])a++;});return{a:a,b:b};}
const pct=(h,t)=>t?Math.round(h/t*100):null;
function fileHtml(f,sm){
  if(!f||!okId(f.id))return '';
  const img=/^image\//.test(f.type||'');
  return '<a class="fl'+(sm?' sm':'')+'" href="/_blob/'+f.id+'" target="_blank" rel="noopener noreferrer">'+(img&&!sm?'<img class="thumb" src="/_blob/'+f.id+'" alt="">':'')+'<span>'+esc(f.name||'Berkas')+'</span></a>';
}

/* ---------- strip, students, courses ---------- */
function fb(no){return isAd(no)?'<span class="fbadge" title="Admin">'+FLAG+'</span>':'';}
function focusOwnStrip(behavior){
  const r=$('rail'),own=r&&r.querySelector('.rs.me-highlight');
  if(!r||!own)return;
  const railRect=r.getBoundingClientRect(),ownRect=own.getBoundingClientRect();
  const target=r.scrollLeft+ownRect.left-railRect.left-(r.clientWidth-own.offsetWidth)/2;
  const max=Math.max(0,r.scrollWidth-r.clientWidth);
  r.scrollTo({left:Math.max(0,Math.min(max,target)),behavior:behavior||'auto'});
}
function presenceOnline(no){const p=S.pr&&S.pr[PAD(no)];return !!(p&&Number(p.lastSeen)>0&&Date.now()-Number(p.lastSeen)<120000);}
function writePresence(){if(!ME||!db||(!AUTH&&!uid))return;db.doc('presence/'+PAD(ME)).set({no:Number(ME),lastSeen:Date.now()}).catch(e=>console.warn('Presence tidak dapat diperbarui:',e));}
function startPresence(){if(presenceTimer){clearInterval(presenceTimer);presenceTimer=null;}if(!ME||!db||(!AUTH&&!uid))return;writePresence();presenceTimer=setInterval(writePresence,30000);}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')writePresence();});
function renderStrip(){
  let h='';
  for(let n=1;n<=N;n++){
    const s=stu(n);
    h+='<button type="button" class="rs'+(Number(ME)===n?' me-highlight':'')+(presenceOnline(n)?' is-online':'')+'" role="listitem" data-act="open-student" data-no="'+n+'"'+(Number(ME)===n?' aria-current="true"':'')+' aria-label="'+esc(nameOf(n))+', absen '+n+(isAd(n)?', admin':'')+(presenceOnline(n)?', aktif':'')+'"><span class="sw"><span class="sav">'+photo('s'+PAD(n))+'</span>'+fb(n)+'</span><span class="rl"><b>'+n+'</b> '+esc(s?s.kode:'')+'</span></button>';
  }
  const r=$('rail'),x=r.scrollLeft,ownNo=Number(ME)||null;
  r.innerHTML=h;
  if(ownNo){
    if(stripFocusedNo!==ownNo){focusOwnStrip('smooth');stripFocusedNo=ownNo;}
    else r.scrollLeft=x;
  }else{stripFocusedNo=null;r.scrollLeft=x;}
}
window.addEventListener('resize',()=>{if(ME)focusOwnStrip('auto');});
function renderStudents(){
  const note=$('snote');
  if(dbState==='none'){note.hidden=false;note.textContent='Data kelas tidak bisa dimuat di tampilan ini. Buka halaman dengan akun yang punya akses.';}
  else if(dbState==='err'){note.hidden=false;note.textContent='Data kelas gagal dimuat. Muat ulang halaman.';}
  else if(loaded.st&&!Object.keys(S.st).length){note.hidden=false;note.textContent='Belum ada data mahasiswa.';}
  else note.hidden=true;
  let h='';
  for(let n=1;n<=N;n++){
    const s=stu(n),showMeta=true;
    let meta='';
    if(showMeta){const a=stats(n).tot,p=pct(a.h,a.t),t=tugasStat(n);meta='<span class="smeta"><span>Kehadiran '+(p==null?'—':p+'%')+'</span><span>Tugas '+t.a+'/'+t.b+'</span></span>';}
    h+='<li><button type="button" class="scard'+(s?'':' skel')+(Number(ME)===n?' me-highlight':'')+(presenceOnline(n)?' is-online':'')+'" data-act="open-student" data-no="'+n+'"'+(Number(ME)===n?' aria-current="true"':'')+'><span class="sph">'+photo('s'+PAD(n))+'<span class="sno">'+n+'</span>'+(presenceOnline(n)?'<span class="online-dot" title="Sedang aktif" aria-label="Sedang aktif"></span>':'')+fb(n)+'</span>'+
      '<span class="snm"><span class="f">'+(s?esc(s.depan):'&nbsp;')+'</span><b>'+(s?esc(s.belakang):'&nbsp;')+'</b></span>'+meta+'</button></li>';
  }
  $('sgrid').innerHTML=h;
  $('sgrid').setAttribute('aria-busy',String(!loaded.st));
}
function aktifCount(k){let c=0;Object.values(S.tu).forEach(t=>{if(t.k===k&&!isLocked(t))c++;});return c;}
function dosenHtml(c){
  const nm=dn(c).trim();if(!nm)return '';
  const p=nm.split(/\s+/);let txt;
  if(p.length>1){const last=p.pop();txt=esc(p.join(' '))+' <b>'+esc(last)+'</b>';}else txt='<b>'+esc(nm)+'</b>';
  return '<li><span class="dav">'+photo('d_'+c.k)+'</span><span>'+txt+'</span></li>';
}
function renderCourses(){
  const host=$('cgrid');
  if(COURSE_SUBTAB==='history'){
    if(!ME&&!adm()){host.innerHTML='<li class="history-empty"><b>Riwayat tugas mata kuliah</b><p class="s">Masuk sebagai mahasiswa untuk melihat riwayat tugas setiap mata kuliah.</p></li>';host.setAttribute('aria-busy',String(!loaded.co));return;}
    const history=Object.keys(S.tu).map(id=>Object.assign({id:id},S.tu[id])).filter(isLocked).sort((x,y)=>(y.tenggat||'').localeCompare(x.tenggat||''));
    if(!history.length){host.innerHTML='<li class="history-empty">Belum ada tugas yang lewat tenggat atau ditutup pengelola. Nikmati dulu track yang masih berjalan!</li>';host.setAttribute('aria-busy',String(!loaded.co));return;}
    const byCourse=new Map();history.forEach(t=>{if(!byCourse.has(t.k))byCourse.set(t.k,[]);byCourse.get(t.k).push(t);});
    host.innerHTML=Array.from(byCourse.entries()).map(([k,tasks])=>'<li class="history-course-group"><section class="panel"><div class="history-course-heading"><span class="constructor-kicker">MATA KULIAH</span><h3 class="ph3">'+esc(cname(k))+'</h3><span class="chip">'+tasks.length+' tugas</span></div><div class="history-course-list">'+tasks.map(t=>{
      if(t.mode==='group'){const g=ME?myConstructor(ME,t.k):null,sub=g&&t.groupSubs?t.groupSubs[g.id]:null,ids=constructorGroups(t.k).map(x=>x.id),count=Object.keys(t.groupSubs||{}).filter(id=>ids.includes(id)).length,total=ids.length,status=ME?(sub?'<span class="chip done">Sudah selesai</span>':'<span class="chip late">Belum selesai</span>'):'<span class="chip late">Tenggat lewat</span>';return '<article class="tcard history-item"><div class="history-top"><div><span class="history-course">KELOMPOK</span><h3>'+esc(t.judul)+'</h3></div><span class="chip late">'+(t.closed?'Ditutup pengelola':'Lewat · '+fmtDate(t.tenggat))+'</span></div>'+(t.deskripsi?'<p>'+esc(t.deskripsi)+'</p>':'')+'<div class="history-bottom">'+status+'<span class="s">'+count+'/'+total+' Constructor mengumpulkan</span>'+(ME||adm()?'<button type="button" class="btn sm" data-act="open-group-hasil" data-id="'+esc(t.id)+'">Time Tower</button>':'')+'</div></article>';}
      const mine=ME&&t.subs?t.subs[ME]:null,count=Object.keys(t.subs||{}).filter(no=>/^(?:[1-9]|[12]\d|3[0-2])$/.test(no)).length,status=ME?(mine?'<span class="chip done">Sudah dikumpulkan</span>':'<span class="chip late">Belum dikumpulkan</span>'):'<span class="chip late">Tenggat lewat</span>';
      return '<article class="tcard history-item"><div class="history-top"><h3>'+esc(t.judul)+'</h3><span class="chip late">'+(t.closed?'Ditutup pengelola':'Lewat · '+fmtDate(t.tenggat))+'</span></div>'+(t.deskripsi?'<p>'+esc(t.deskripsi)+'</p>':'')+'<div class="history-bottom">'+status+'<span class="s">'+count+'/'+N+' mahasiswa mengumpulkan</span>'+(ME||adm()?'<button type="button" class="btn sm" data-act="open-hasil" data-id="'+esc(t.id)+'">Time Tower</button>':'')+'</div></article>';
    }).join('')+'</div></section></li>').join('');
    host.setAttribute('aria-busy',String(!loaded.co));return;
  }
  const list=courseList();
  if(!list.length){
    let h='';for(let i=0;i<4;i++)h+='<li class="course skel">'+(dbState==='none'?'Data tidak tersedia':(loaded.co?'Belum ada mata kuliah':'Memuat mata kuliah'))+'</li>';
    $('cgrid').innerHTML=h;return;
  }
  let h='';
  list.forEach(c=>{
    const logo=S.md['c_'+c.k],ak=aktifCount(c.k);
    h+='<li class="course" style="--tc:'+colr(c.warna)+'">'+
      '<div class="ctop"><h3>'+esc(c.nama)+'</h3><span class="badge" aria-hidden="true">'+esc(c.k)+'</span></div>'+
      '<ul class="dosen">'+dosenHtml(c)+'</ul>'+
      '<p class="jadwal">'+esc(c.sks)+' SKS · '+esc(hariLabel(c))+' '+esc(c.jam)+' · '+esc(c.ruang)+'</p>'+
      '<button type="button" class="pic" data-act="open-course" data-k="'+esc(c.k)+'" aria-label="Buka absen dan tugas '+esc(c.nama)+'">'+
      (logo&&okImg(logo.data)?'<img class="logo" src="'+logo.data+'" alt="">':'<span class="ph" aria-hidden="true">'+esc(c.k)+'</span>')+
      (ak?'<span class="aktif">'+ak+' tugas aktif</span>':'')+
      '<span class="cta">Absen &amp; Tugas<i>&#8250;</i></span></button></li>';
  });
  $('cgrid').innerHTML=h;
  $('cgrid').setAttribute('aria-busy',String(!loaded.co));
}

const CONSTRUCTOR_COLORS=[
  {id:'red',name:'Racing Red',value:'#e10600'},
  {id:'blue',name:'Electric Blue',value:'#1769ff'},
  {id:'cyan',name:'Aqua',value:'#087e8b'},
  {id:'orange',name:'Papaya Orange',value:'#f07818'},
  {id:'yellow',name:'Championship Gold',value:'#b58a16'},
  {id:'green',name:'British Green',value:'#26734d'},
  {id:'purple',name:'Purple',value:'#6546a5'},
  {id:'pink',name:'Magenta',value:'#a83e78'},
  {id:'silver',name:'Titanium',value:'#68717f'},
  {id:'black',name:'Carbon Black',value:'#34343d'}
];
function constructorColor(id){return (CONSTRUCTOR_COLORS.find(c=>c.id===id)||CONSTRUCTOR_COLORS[0]).value;}
function constructorGroups(courseCode){return Object.keys(S.cs).map(id=>Object.assign({id:id},S.cs[id])).filter(g=>!courseCode||g.courseCode===courseCode).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'id'));}
function myConstructor(no,courseCode){if(!no)return null;return constructorGroups(courseCode).find(g=>Number(g.principal)===Number(no)||(Array.isArray(g.members)&&g.members.map(Number).includes(Number(no))))||null;}
function groupTaskCard(t,g,sub,principal){
  const id=t.id,locked=isLocked(t),done=!!(sub&&sub.at),late=locked,open=D.subOpen===id;
  let h='<article class="tcard group-task-card"><div class="row2" style="justify-content:space-between"><h3>'+esc(t.judul)+'</h3><span class="chip">'+(done?'Sudah selesai':late?(t.closed?'Ditutup pengelola':'Lewat tenggat'):'Tugas kelompok')+'</span></div>'+
    '<p class="s">'+esc(cname(t.k))+' · '+(t.tenggat?'Tenggat '+fmtDate(t.tenggat):'Tanpa tenggat')+'</p>'+
    (t.deskripsi?'<p>'+esc(t.deskripsi)+'</p>':'');
  if(!g)h+='<p class="empty">Kamu belum terdaftar dalam Constructor.</p>';
  else h+='<p class="s">Constructor: <b>'+esc(g.name||'Kelompok')+'</b> · Team Principal: '+esc(g.principal?nameOf(g.principal):'Belum ditetapkan')+'</p>';
  if(done)h+='<p class="tdone"><b>&#10003; Sudah selesai untuk seluruh anggota kelompok.</b><br><span class="s">Dikumpulkan '+fmtTime(sub.at)+'</span></p>';
  else if(locked)h+='<p class="s"><span class="dnfb">'+(t.closed?'DITUTUP':'DNF')+'</span> '+(t.closed?'Tugas ditutup pengelola.':'Tenggat sudah lewat dan belum dikumpulkan.')+'</p>';
  else if(g&&principal&&canWrite){
    h+='<div class="row2"><button type="button" class="btn sm pri" data-act="tsub-group-open" data-id="'+esc(id)+'">'+(open?'Tutup form':'Kumpulkan sebagai Team Principal')+'</button></div>';
    if(open){
      const mode=smodeOf(id,sub),pf=(D.pending&&D.pending[id])||(sub&&sub.berkas&&sub.berkas.id?sub.berkas:null);
      h+='<div class="tform"><div><div class="lbl" style="margin-bottom:8px">Cara mengumpulkan</div><div class="row2" role="group" aria-label="Cara mengumpulkan"><button type="button" class="btn sm" data-act="smode" data-id="'+esc(id)+'" data-m="file" aria-pressed="'+(mode==='file')+'"'+(AS?'':' disabled')+'>Unggah file</button><button type="button" class="btn sm" data-act="smode" data-id="'+esc(id)+'" data-m="link" aria-pressed="'+(mode==='link')+'">Tautan (Drive dll.)</button></div></div>';
      if(mode==='file')h+='<div class="field"><span class="lbl">Berkas tugas kelompok</span><div class="row2"><label class="btn sm pickfile">'+(pf?'Ganti berkas':'Pilih berkas')+'<input type="file" accept="image/*,application/pdf" data-file="tugas" data-id="'+esc(id)+'"></label><span class="s">'+(pf?esc(pf.name):'Belum ada berkas dipilih')+'</span></div></div>';
      else h+='<div class="field"><label for="sl-'+esc(id)+'">Tautan pengumpulan kelompok</label><input id="sl-'+esc(id)+'" data-dr="sl-'+esc(id)+'" type="url" inputmode="url" placeholder="https://drive.google.com/…" value="'+esc(dv('sl-'+id,sub&&sub.tautan||''))+'"></div>';
      h+='<div class="field"><label for="sc-'+esc(id)+'">Catatan (opsional)</label><textarea id="sc-'+esc(id)+'" data-dr="sc-'+esc(id)+'" maxlength="500">'+esc(dv('sc-'+id,sub&&sub.catatan||''))+'</textarea></div><div class="row2"><button type="button" class="btn pri" data-act="tsub-group" data-id="'+esc(id)+'" data-gid="'+esc(g.id)+'">Kirim tugas kelompok</button><button type="button" class="btn" data-act="tsub-group-open" data-id="'+esc(id)+'">Batal</button></div></div>';
    }
  }else if(g)h+='<p class="s">Menunggu Team Principal mengumpulkan tugas ini.</p>';
  return h+'</article>';
}
function groupTowerData(id){
  const t=S.tu[id];if(!t)return null;
  const src=(HS_GROUP&&HS_GROUP[id])||Object.keys(t.groupSubs||{}).reduce((o,gid)=>{o[gid]=t.groupSubs[gid]&&t.groupSubs[gid].at;return o;},{});
  const groups=constructorGroups(t.k),done=[],rest=[];
  groups.forEach(g=>{const at=+src[g.id];if(at>0){const principal=Number(g.principal)||null;done.push({id:g.id,name:g.name||g.id,principal:principal,at:at});}else rest.push(g);});
  done.sort((a,b)=>a.at-b.at||a.name.localeCompare(b.name,'id'));
  const lead=done.length?done[0].at:0;
  done.forEach((x,i)=>{x.pos=i+1;x.gap=x.at-lead;x.int=i?x.at-done[i-1].at:0;});
  return{t:t,done:done,rest:rest,locked:isLocked(t)};
}
function groupTowerHtml(r){
  if(!r)return '<p class="empty">Klasemen belum tersedia.</p>';
  if(!r.done.length&&!r.rest.length)return '<p class="empty">Belum ada Constructor yang terdaftar.</p>';
  const missing=r.locked?'DNF':'NO TIME';
  let h='<ul class="pleg"><li><b>Interval</b> · selisih waktu dari kelompok di atasnya</li><li><b>Gap ke P1</b> · selisih waktu terhadap P1</li></ul><div class="tblw"><table class="sx tower"><thead><tr><th class="num">POS</th><th>CONSTRUCTOR</th><th>TEAM PRINCIPAL</th><th class="num">WAKTU</th><th class="num">INTERVAL</th><th class="num">GAP KE P1</th></tr></thead><tbody>';
  r.done.forEach(x=>{h+='<tr><td class="num"><b>P'+x.pos+'</b></td><td><b>'+esc(x.name)+'</b></td><td>'+esc(x.principal?nameOf(x.principal):'—')+'</td><td class="num">'+fmtDT(x.at)+'</td><td class="num">'+fmtGap(x.int)+'</td><td class="num">'+fmtGap(x.gap)+'</td></tr>';});
  r.rest.forEach((g,i)=>{const principal=Number(g.principal)||null;h+='<tr><td class="num"><b>P'+(r.done.length+i+1)+'</b></td><td><b>'+esc(g.name||g.id)+'</b></td><td>'+esc(principal?nameOf(principal):'—')+'</td><td class="num"><span class="dnfb">'+missing+'</span></td><td class="num"><span class="dnfb">'+missing+'</span></td><td class="num"><span class="dnfb">'+missing+'</span></td></tr>';});
  return h+'</tbody></table></div>';
}
async function ensureDefaultConstructors(){
 if(TOUR_DEMO_ACTIVE)return;
 if(!adm()||!db||!loaded.co||!loaded.cs||defaultConstructorSeedPromise)return;
 defaultConstructorSeedPromise=(async()=>{
  for(const c of courseList()){
   let count=constructorGroups(c.k).length;
   for(let slot=1;slot<=6&&count<6;slot++){
    const id='DEF_'+c.k+'_'+PAD(slot),ref=db.doc('constructors/'+id);
    if(S.cs[id]&&S.cs[id].courseCode===c.k)continue;
    const snap=await ref.get();
    if(snap.exists)continue;
    await ref.set({courseCode:c.k,name:'Constructor '+slot,members:[],principal:null,createdAt:Date.now(),isDefault:true});
    count++;
   }
  }
 })().catch(e=>{console.error('Gagal membuat Constructor default:',e);}).finally(()=>{defaultConstructorSeedPromise=null;});
 await defaultConstructorSeedPromise;
}
function renderConstructor(){
 const host=$('constructorPanel');if(!host)return;host.className='constructor-grid';
 const courses=courseList(),isAdmin=adm();
 if(isAdmin&&loaded.co&&loaded.cs)ensureDefaultConstructors();
 let h='<div class="constructor-subtabs" role="tablist" aria-label="Bagian Constructor"><button type="button" class="student-subtab" data-act="constructor-subtab" data-tab="list" aria-selected="'+(CONSTRUCTOR_SUBTAB==='list')+'">CONSTRUCTOR LINE-UP</button><span class="course-subtab-sep">-</span><button type="button" class="student-subtab" data-act="constructor-subtab" data-tab="standings" aria-selected="'+(CONSTRUCTOR_SUBTAB==='standings')+'">KLASEMEN KONSTRUKTOR</button></div>';
 h+='<p class="s constructor-intro">'+(CONSTRUCTOR_SUBTAB==='standings'?'Lihat posisi tiap Constructor berdasarkan waktu pengumpulan tugas kelompok.':'Lihat pembagian tim di setiap mata kuliah. Buka detailnya untuk cek anggota dan Team Principal.')+'</p>';
 if(!ME&&!isAdmin){h+='<div class="constructor-empty"><b>Area Constructor</b><p class="s">Masuk sebagai mahasiswa untuk melihat Constructor Line-Up dan klasemen tim kelas.</p></div>';host.innerHTML=h;return;}
 if(CONSTRUCTOR_SUBTAB==='standings'){
  const tasks=Object.keys(S.tu).map(id=>Object.assign({id:id},S.tu[id])).filter(t=>t.mode==='group').sort((a,b)=>(a.tenggat||'9999').localeCompare(b.tenggat||'9999'));
  if(!tasks.length)h+='<div class="constructor-empty">Belum ada tugas kelompok untuk ditampilkan.</div>';
  tasks.forEach(t=>{const r=groupTowerData(t.id);h+='<article class="tcard constructor-standing"><div class="row2" style="justify-content:space-between"><div><span class="s">'+esc(cname(t.k))+'</span><h3>'+esc(t.judul)+'</h3></div><span class="chip">'+(r?r.done.length:0)+'/'+constructorGroups(t.k).length+' selesai</span></div>'+(t.tenggat?'<p class="s">Tenggat '+fmtDate(t.tenggat)+'</p>':'')+groupTowerHtml(r)+'</article>';});
  host.innerHTML=h;return;
 }
 if(!courses.length){h+='<div class="constructor-empty">Data mata kuliah belum tersedia.</div>';host.innerHTML=h;return;}
 courses.forEach(c=>{
  const groups=constructorGroups(c.k);
  h+='<section class="panel constructor-course" data-course="'+esc(c.k)+'"><div class="row2" style="justify-content:space-between;align-items:center"><div><span class="constructor-kicker">MATA KULIAH</span><h3 class="ph3">'+esc(c.nama)+'</h3><p class="s">'+groups.length+' Constructor terdaftar</p></div>';
  if(isAdmin)h+='<button type="button" class="btn pri" data-act="constructor-create" data-course="'+esc(c.k)+'">+ Tambah Constructor</button>';
  h+='</div>';
  if(isAdmin&&CONSTRUCTOR_CREATE_COURSE===c.k)h+='<div class="row2 constructor-create"><input id="constructor-new-name" type="text" maxlength="80" placeholder="Nama Constructor"><button type="button" class="btn pri" data-act="constructor-create-save" data-course="'+esc(c.k)+'">Simpan</button><button type="button" class="btn" data-act="constructor-create-cancel">Batal</button></div>';
  const courseOpen=!!CONSTRUCTOR_COURSE_OPEN[c.k];
  h+='<div class="constructor-list-toolbar"><span class="s">'+(groups.length?'Daftar '+groups.length+' Constructor':'Belum ada Constructor')+'</span><button type="button" class="btn sm" data-act="constructor-course-toggle" data-course="'+esc(c.k)+'" aria-expanded="'+courseOpen+'">'+(courseOpen?'Tutup daftar':'Lihat selengkapnya')+'</button></div>';
  if(courseOpen){
  if(!groups.length)h+='<p class="constructor-empty">Belum ada Constructor untuk mata kuliah ini.</p>';
  groups.forEach((g,index)=>{
   const members=Array.isArray(g.members)?g.members.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=N):[];
   const principalNo=Number(g.principal)||null,displayMembers=principalNo?[principalNo,...members.filter(n=>n!==principalNo)]:members;
   // Mahasiswa yang sudah tergabung di Constructor lain pada mata kuliah ini tidak ditampilkan.
   // Anggota kelompok yang sedang diedit tetap dipertahankan agar pilihan lama tidak hilang.
   const occupiedInCourse=new Set();
   groups.forEach(other=>{
    if(other.id===g.id)return;
    const op=Number(other.principal)||null;
    if(op)occupiedInCourse.add(op);
    (Array.isArray(other.members)?other.members:[]).forEach(x=>{const n=Number(x);if(Number.isInteger(n)&&n>=1&&n<=N)occupiedInCourse.add(n);});
   });
   const isTeamPrincipal=ME!=null&&principalNo!==null&&principalNo===Number(ME)&&!members.includes(Number(ME));
   const canEdit=isAdmin||isTeamPrincipal,editing=CONSTRUCTOR_EDIT_ID===g.id&&canEdit;
   const colorId=CONSTRUCTOR_COLORS.some(c=>c.id===g.color)?g.color:CONSTRUCTOR_COLORS[index%CONSTRUCTOR_COLORS.length].id;
   h+='<article class="constructor-card" style="--tc:'+constructorColor(colorId)+'"><div class="constructor-head"><div><span class="constructor-kicker">CONSTRUCTOR</span><h3>'+esc(g.name||'Kelompok tanpa nama')+'</h3><p class="constructor-principal">'+(principalNo?'TEAM PRINCIPAL · '+esc(nameOf(principalNo)):'TEAM PRINCIPAL · Belum ditetapkan')+'</p></div><span class="constructor-count">'+displayMembers.length+' anggota</span></div><div class="constructor-members">';
   h+=displayMembers.length?displayMembers.map(n=>'<div class="constructor-member'+(Number(ME)===n?' me-highlight':'')+'"><span class="constructor-avatar">'+photo('s'+PAD(n))+'</span><span><b>'+n+'. '+esc(nameOf(n))+'</b><small>'+esc((stu(n)||{}).kode||'')+'</small></span></div>').join(''):'<p class="empty">Belum ada anggota kelompok.</p>';
   h+='</div>';
   if(canEdit&&!editing)h+='<div class="constructor-actions"><button type="button" class="btn pri" data-act="constructor-edit" data-id="'+esc(g.id)+'">Atur kelompok</button>'+(isAdmin?'<button type="button" class="btn" data-act="constructor-delete" data-id="'+esc(g.id)+'">Hapus kelompok</button>':'')+'</div>';
   if(editing){
    h+='<div class="constructor-editor">';
    if(isAdmin){h+='<label class="constructor-field">Team Principal<select data-constructor-principal="'+esc(g.id)+'"><option value="">Belum ditetapkan</option>';
     for(let n=1;n<=N;n++)if(n===principalNo||!occupiedInCourse.has(n))h+='<option value="'+n+'"'+(n===principalNo?' selected':'')+'>'+n+'. '+esc(nameOf(n))+'</option>';
     h+='</select></label>';}
    h+='<label class="constructor-field">Nama Constructor<input class="constructor-name" data-constructor-name="'+esc(g.id)+'" maxlength="80" value="'+esc(g.name||'')+'"></label><label class="constructor-field">Warna kartu Constructor<select data-constructor-color="'+esc(g.id)+'">'+CONSTRUCTOR_COLORS.map(c=>'<option value="'+c.id+'"'+(c.id===colorId?' selected':'')+'>'+c.name+'</option>').join('')+'</select></label><p class="s">Pilih mahasiswa yang menjadi anggota kelompok ini.</p><div class="constructor-members edit">';
    for(let n=1;n<=N;n++)if(n!==principalNo&&(members.includes(n)||!occupiedInCourse.has(n)))h+='<label class="constructor-member'+(Number(ME)===n?' me-highlight':'')+'"><input type="checkbox" data-constructor-member="'+esc(g.id)+'" value="'+n+'"'+(members.includes(n)?' checked':'')+'><span class="constructor-avatar">'+photo('s'+PAD(n))+'</span><span><b>'+n+'. '+esc(nameOf(n))+'</b><small>'+esc((stu(n)||{}).kode||'')+'</small></span></label>';
    h+='</div><div class="constructor-actions"><button type="button" class="btn pri" data-act="constructor-save" data-id="'+esc(g.id)+'">Simpan perubahan</button><button type="button" class="btn" data-act="constructor-edit-cancel" data-id="'+esc(g.id)+'">Batal</button>'+(isAdmin?'<button type="button" class="btn" data-act="constructor-delete" data-id="'+esc(g.id)+'">Hapus kelompok</button>':'')+'</div></div>';
   }
   h+='</article>';
  });
  }
  h+='</section>';
 });
 host.innerHTML=h;
}

/* ---------- header, views ---------- */
function toggleMobileNav(force){
  const top=$('top'),trigger=document.querySelector('[data-mobile-nav-toggle]');
  if(!top||!trigger)return;
  const open=typeof force==='boolean'?force:!top.classList.contains('mobile-nav-open');
  top.classList.toggle('mobile-nav-open',open);
  trigger.setAttribute('aria-expanded',String(open));
}
function renderHeader(){
  const lb=$('loginBtn'),chip=$('meChip'),na=$('navAdmin');
  const navToggle=document.querySelector('[data-mobile-nav-toggle]');
  if(navToggle)navToggle.setAttribute('aria-expanded',String($('top').classList.contains('mobile-nav-open')));
  lb.textContent=ME?('No. '+ME):'Masuk / Daftar';
  chip.innerHTML=ME?photo('s'+PAD(ME)):SIL;
  chip.classList.toggle('adm',adm());
  chip.setAttribute('aria-label',ME?('Akun '+nameOf(ME)):'Masuk atau daftar');
  na.hidden=!adm();
  if(view==='pengelola'&&!adm())setView('beranda');
  document.querySelectorAll('.nl[data-view]').forEach(b=>{if(b.dataset.view===view)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');});
}
function setOverviewSubtab(tab){
  OVERVIEW_SUBTAB=tab==='exhibition'?'exhibition':'overview';
  const overview=$('homePanel'),exhibition=$('exhibitionPanel');
  if(overview)overview.hidden=OVERVIEW_SUBTAB!=='overview';
  if(exhibition)exhibition.hidden=OVERVIEW_SUBTAB!=='exhibition';
  const lede=$('homeLede');if(lede)lede.textContent=OVERVIEW_SUBTAB==='exhibition'?'Ruang sertifikat, dokumentasi kelas, dan agenda seminar akademik.':'Ringkasan tugas, absensi, dan pengumuman kelas.';
  document.querySelectorAll('#overviewSubtabs [data-act="overview-subtab"]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===OVERVIEW_SUBTAB)));
}
function setView(v,scroll){
  if(VIEWS.indexOf(v)<0||(v==='pengelola'&&!adm()))v='beranda';
  view=v;
  if(v==='beranda')setOverviewSubtab('overview');
  toggleMobileNav(false);
  VIEWS.forEach(x=>{$('v-'+x).hidden=x!==v;});
  document.querySelectorAll('.nl[data-view]').forEach(b=>{if(b.dataset.view===v)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');});
  if(scroll)window.scrollTo(0,0);
}

/* ---------- Pit Tugas & Sektor Absensi ---------- */
const FLAGNAME={r:'merah',y:'kuning',g:'hijau'};
const flagSvg=c=>'<svg class="pflag '+c+'" viewBox="0 0 16 16" role="img" aria-label="Bendera '+FLAGNAME[c]+'"><path d="M3 1.5v13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M3.8 2.2h9l-2.2 3.4 2.2 3.4h-9z" fill="currentColor" stroke="rgba(0,0,0,.35)" stroke-width=".6" stroke-linejoin="round"/></svg>';
function dayDiff(s){
  const p=String(s||'').split('-');if(p.length!==3)return null;
  const n=today().split('-').map(Number),a=Date.UTC(+p[0],+p[1]-1,+p[2]),b=Date.UTC(n[0],n[1]-1,n[2]);
  return Math.round((a-b)/86400000);
}
function flagOf(t){const d=dayDiff(t.tenggat);return d===null?'g':d<1?'r':d<3?'y':'g';} // merah <1 hari (hari ini/lewat), kuning <3 hari, hijau selebihnya
function dueText(t){
  const d=dayDiff(t.tenggat);
  if(d===null)return 'Tanpa tenggat';
  if(d<0)return 'Lewat '+(-d)+' hari · '+fmtDate(t.tenggat);
  if(d===0)return 'Hari ini · '+fmtDate(t.tenggat);
  if(d===1)return 'Besok · '+fmtDate(t.tenggat);
  return d+' hari lagi · '+fmtDate(t.tenggat);
}
function pitData(no){
  const all=Object.keys(S.tu).map(id=>Object.assign({id:id},S.tu[id])).filter(t=>t.mode!=='group').map(t=>({t:t,done:!!(t.subs&&t.subs[no])}));
  const done=all.filter(x=>x.done),dnf=all.filter(x=>!x.done&&isLocked(x.t)),open=all.filter(x=>!x.done&&!isLocked(x.t));
  const n={r:0,y:0,g:0};open.forEach(x=>{n[flagOf(x.t)]++;});
  return{open:open,done:done,dnf:dnf,a:done.length,b:all.length,n:n};
}
function missingOf(no){
  const td=today(),m=[];
  Object.values(S.se).forEach(se=>{if(se.tanggal&&se.tanggal<=td&&!(se.present&&se.present[no]))m.push(se);});
  return m.sort((x,y)=>(x.tanggal||'').localeCompare(y.tanggal||''));
}
/* Jumlah hadir tiap mahasiswa per mata kuliah. Dari server (/api/sektor) agar semua mahasiswa terhitung;
 * tanpa server, dihitung dari data yang terlihat. */
let SK=null,skTimer=null;
function loadSektor(){
  if(TOUR_DEMO_ACTIVE||!ME||!AUTH||!AUTH.sektor)return;
  clearTimeout(skTimer);
  skTimer=setTimeout(async()=>{try{const data=await AUTH.sektor();if(TOUR_DEMO_ACTIVE)return;SK=data;refreshAll();}catch(e){/* tetap pakai data lokal */}},400);
}
function sektorRaw(){
  if(SK&&SK.courses)return SK.courses;
  const out={};
  Object.values(S.se).forEach(se=>{
    const p=se.present||{};
    if(!(se.rec===true||Object.values(p).some(Boolean)))return;
    const c=out[se.k]||(out[se.k]={t:0,h:{}});
    c.t++;Object.keys(p).forEach(n=>{if(p[n]==='H'||p[n]==='K')c.h[n]=(c.h[n]||0)+1;});
  });
  return out;
}
/* Peringkat utama tetap berdasarkan persentase kehadiran keseluruhan; warna tiap sektor berdiri sendiri. */
function sektorData(){
  const raw=sektorRaw(),cl=courseList().map(c=>c.k);
  let tt=0;cl.forEach(k=>{tt+=(raw[k]&&raw[k].t)||0;});
  const rows=[];
  for(let no=1;no<=N;no++){
    let h=0;const cells={};
    cl.forEach(k=>{const r=raw[k]||{t:0,h:{}},hh=r.h[no]||0;h+=hh;cells[k]={h:hh,t:r.t,p:r.t?Math.round(hh/r.t*100):null,c:null,rk:null};});
    rows.push({no:no,h:h,t:tt,p:tt?h/tt:0,cells:cells,rank:0});
  }
  rows.sort((x,y)=>y.p-x.p||x.no-y.no);
  rows.forEach((r,i)=>{r.rank=i+1;});
  cl.forEach(k=>{
    if(!((raw[k]&&raw[k].t)||0))return;
    rows.slice().sort((x,y)=>y.cells[k].h-x.cells[k].h||x.rank-y.rank).forEach((r,i)=>{r.cells[k].c=i<5?'p':i<15?'g':'y';r.cells[k].rk=i+1;});
  });
  const byNo={};rows.forEach(r=>{byNo[r.no]=r;});
  return{rows:rows,cl:cl,t:tt,byNo:byNo};
}
const SXNAME={p:'Sektor ungu',g:'Sektor hijau',y:'Sektor kuning'};
function sxStrip(row,cl){return '<span class="sxm" aria-hidden="true">'+cl.map(k=>'<i class="sxc '+(row.cells[k].c||'n')+'"></i>').join('')+'</span>';}
function attendanceDelta(sx,no){
  const row=sx&&sx.byNo[no];if(!row||row.rank<=1)return null;
  const ahead=sx.rows[row.rank-2],gap=Math.max(0,(ahead.p-row.p)*100);
  return{ahead:ahead,points:gap,label:gap<0.05?'0 pp':gap.toFixed(1)+' pp'};
}
function sectorPerformance(sx,no){
  const row=sx&&sx.byNo[no];if(!row)return[];
  return sx.cl.map(k=>({k:k,name:cname(k),cell:row.cells[k]}))
    .filter(x=>x.cell&&x.cell.t>0)
    .sort((a,b)=>b.cell.p-a.cell.p||a.k.localeCompare(b.k));
}
function tireSvg(type){
  const colors={soft:'#e10600',medium:'#d6a300',hard:'#737b87'},c=colors[type]||colors.hard;
  return '<svg class="tire-icon '+type+'" viewBox="0 0 32 32" role="img" aria-label="Ban '+type+'"><circle cx="16" cy="16" r="13" fill="'+c+'" stroke="currentColor" stroke-width="1.1"/><circle cx="16" cy="16" r="8.2" fill="#171a20" stroke="#c9cdd4" stroke-width="1"/><circle cx="16" cy="16" r="3.3" fill="'+c+'" stroke="#e8e9eb" stroke-width=".8"/><path d="M16 2.8v3.2M16 26v3.2M2.8 16H6M26 16h3.2M6.7 6.7 9 9M23 23l2.3 2.3M25.3 6.7 23 9M9 23l-2.3 2.3" stroke="#f4f5f7" stroke-width="1.2" stroke-linecap="round"/></svg>';
}
function constructorCompound(t){
  const d=dayDiff(t&&t.tenggat);
  return d!==null&&d<1?'soft':d!==null&&d<3?'medium':'hard';
}
function homeTiles(no){
  const pit=pitData(no),sx=sektorData(),r=sx.byNo[no],miss=missingOf(no);
  const groupTasks=Object.keys(S.tu).map(id=>Object.assign({id:id},S.tu[id])).filter(t=>t.mode==='group');
  const mineGroupTasks=groupTasks.map(t=>({t:t,g:myConstructor(no,t.k)})).filter(x=>x.g);
  const groupDone=mineGroupTasks.filter(x=>!!(x.t.groupSubs&&x.t.groupSubs[x.g.id]&&x.t.groupSubs[x.g.id].at)).length;
  const groupDnf=mineGroupTasks.filter(x=>isLocked(x.t)&&!(x.t.groupSubs&&x.t.groupSubs[x.g.id]&&x.t.groupSubs[x.g.id].at)).length;
  const groupOpen=mineGroupTasks.filter(x=>!isLocked(x.t)&&!(x.t.groupSubs&&x.t.groupSubs[x.g.id]&&x.t.groupSubs[x.g.id].at));
  const groupTotal=mineGroupTasks.length,tires={soft:0,medium:0,hard:0};
  groupOpen.forEach(x=>tires[constructorCompound(x.t)]++);
  const pp=[];if(pit.open.length)pp.push(pit.open.length+' belum dikumpulkan');if(pit.dnf.length)pp.push(pit.dnf.length+' DNF');
  const hasIndividual=pit.b>0,hasConstructor=groupTotal>0;
  const pitSummary=pit.b?(pp.length?pp.join(' · '):'Semua tugas individu selesai'):'';
  const groupSummary=groupTotal?groupDone+' dari '+groupTotal+' tugas Constructor selesai'+(groupDnf?' · '+groupDnf+' DNF':''):'';
  const hubSummary=!hasIndividual&&!hasConstructor?'Belum ada tugas individu atau Constructor':!hasIndividual?'Belum ada tugas individu':!hasConstructor?'Belum ada tugas Constructor':pitSummary+' · '+groupSummary;
  const flags=(pit.open.length||pit.dnf.length)?'<span class="pflags">'+['r','y','g'].filter(c=>pit.n[c]).map(c=>'<span class="pfl">'+flagSvg(c)+pit.n[c]+'</span>').join('')+(pit.dnf.length?'<span class="pfl pdnf"><span class="dnfb">DNF</span>'+pit.dnf.length+'</span>':'')+'</span>':'';
  const paddock=(groupOpen.length||groupDnf)?'<span class="pflags paddock-tires">'+['soft','medium','hard'].filter(c=>tires[c]).map(c=>'<span class="pfl">'+tireSvg(c)+tires[c]+'</span>').join('')+(groupDnf?'<span class="pfl pdnf"><span class="dnfb">DNF</span>'+groupDnf+'</span>':'')+'</span>':'';
  return '<div class="tiles">'+
    '<button type="button" class="tile tilebtn tile-hub'+((pit.open.length||pit.dnf.length||groupOpen.length||groupDnf)?' task-alert':'')+'" data-act="open-pit" aria-haspopup="dialog"><div class="v hub-task-value">Individu '+pit.a+'/'+pit.b+' - '+groupDone+'/'+groupTotal+' Constructor</div><div class="l">Hub Tugas</div><div class="d">'+hubSummary+'</div>'+flags+paddock+'<span class="more">Buka Hub Tugas &rsaquo;</span></button>'+
    '<button type="button" class="tile tilebtn'+(miss.length?' warn2':'')+'" data-act="open-sektor" aria-haspopup="dialog"><div class="v">'+(sx.t?Math.round(r.p*100)+'%':'—')+'</div><div class="l">Sektor Absensi</div>'+
      '<div class="d">'+(sx.t?'Peringkat '+r.rank+' dari '+N:'Belum ada absensi tercatat')+(miss.length?' · '+miss.length+' absen belum diisi':'')+'</div>'+(sx.t?sxStrip(r,sx.cl):'')+'<span class="more">Lihat sektor &rsaquo;</span></button></div>';
}

/* ---------- Grid Class Rookie Lap · tutorial pengguna ---------- */
/* ---------- data simulasi khusus tutorial (tidak pernah ditulis ke database) ---------- */
function tourDateOffset(days){
  const p=jakartaParts(),d=new Date(Date.UTC(+p.year,+p.month-1,+p.day-days,12));
  return d.toISOString().slice(0,10);
}
function beginTourDemo(){
  if(TOUR_DEMO_ACTIVE)return;
  const course=courseList()[0];
  if(!course)return;
  const me=Number(ME)||1,others=Array.from({length:N},(_,i)=>i+1).filter(n=>n!==me);
  const first=others[0]||((me%N)+1),second=others[1]||((me+1)%N+1),third=others[2]||((me+2)%N+1);
  const now=Date.now(),earlyAt=now-7200000,challengerAt=now-3600000;
  const groups=[
    {id:'TOUR_TEAM_1',courseCode:course.k,name:'Apex Racing',members:[me,first],principal:me,createdAt:now},
    {id:'TOUR_TEAM_2',courseCode:course.k,name:'Velocity GP',members:[second,third],principal:second,createdAt:now},
    {id:'TOUR_TEAM_3',courseCode:course.k,name:'Quantum Motorsport',members:[...others.slice(3,5)],principal:others[3]||third,createdAt:now}
  ];
  const taskDate=tourDateOffset(2);
  const tasks={
    TOUR_EARLY_BIRD:{k:course.k,judul:'Tugas Percontohan · Early Bird',tenggat:taskDate,deskripsi:'Data simulasi tutorial untuk memperlihatkan posisi P1.',link:'',mode:'individual',subs:{[me]:{at:earlyAt},[first]:{at:earlyAt+90000},[second]:{at:earlyAt+180000}},groupSubs:{},dibuat:now-86400000},
    TOUR_CHALLENGER:{k:course.k,judul:'Tugas Percontohan · Challenger',tenggat:taskDate,deskripsi:'Data simulasi tutorial untuk memperlihatkan posisi P2.',link:'',mode:'individual',subs:{[first]:{at:challengerAt-60000},[me]:{at:challengerAt}},groupSubs:{},dibuat:now-86400000},
    TOUR_DNF:{k:course.k,judul:'Tugas Percontohan · DNF',tenggat:taskDate,deskripsi:'Tugas contoh yang tidak dikumpulkan oleh mahasiswa ini.',link:'',mode:'individual',subs:{[first]:{at:now-1800000},[second]:{at:now-900000}},groupSubs:{},dibuat:now-86400000},
    TOUR_GROUP:{k:course.k,judul:'Tugas Constructor Percontohan',tenggat:taskDate,deskripsi:'Data simulasi Time Tower Constructor.',link:'',mode:'group',subs:{},groupSubs:{TOUR_TEAM_2:{at:now-2400000}},dibuat:now-86400000}
  };
  const present1={},present2={};
  present1[me]='H';present2[me]='H';
  others.slice(0,4).forEach((n,i)=>{present1[n]=i<2?'H':'A';present2[n]=i===0?'H':'A';});
  const sessions={
    [course.k+'_08']:{k:course.k,n:8,tanggal:tourDateOffset(14),topik:'Pertemuan percontohan 8',rec:true,present:present1,bukti:{}},
    [course.k+'_09']:{k:course.k,n:9,tanggal:tourDateOffset(7),topik:'Pertemuan percontohan 9',rec:true,present:present2,bukti:{}}
  };
  const h={};h[me]=2;others.forEach((n,i)=>{h[n]=i===0?2:i<4?1:0;});
  TOUR_DEMO_SNAPSHOT={
    tu:S.tu,se:S.se,cs:S.cs,hs:HS,hsGroup:HS_GROUP,sk:SK,
    live:{}
  };
  TOUR_DEMO_ACTIVE=true;
  S.tu=tasks;
  S.se=sessions;
  const kept={};Object.keys(S.cs).forEach(id=>{if(S.cs[id].courseCode!==course.k)kept[id]=S.cs[id];});
  groups.forEach(g=>{kept[g.id]=g;});
  S.cs=kept;
  HS={
    TOUR_EARLY_BIRD:{[me]:earlyAt,[first]:earlyAt+90000,[second]:earlyAt+180000},
    TOUR_CHALLENGER:{[first]:challengerAt-60000,[me]:challengerAt},
    TOUR_DNF:{[first]:now-1800000,[second]:now-900000},
    TOUR_GROUP:{}
  };
  HS_GROUP={TOUR_GROUP:{TOUR_TEAM_2:now-2400000}};
  SK={courses:{}};SK.courses[course.k]={t:2,h:h};
  refreshAll();
}
function endTourDemo(){
  if(!TOUR_DEMO_ACTIVE||!TOUR_DEMO_SNAPSHOT)return;
  const snap=TOUR_DEMO_SNAPSHOT;
  S.tu=snap.live.tu||snap.tu;
  S.se=snap.live.se||snap.se;
  S.cs=snap.live.cs||snap.cs;
  HS=snap.hs;HS_GROUP=snap.hsGroup;SK=snap.sk;
  TOUR_DEMO_ACTIVE=false;TOUR_DEMO_SNAPSHOT=null;
  refreshAll();
  loadSektor();loadHasil(true);
}
const TOUR_SAFE_ACTIONS=new Set(['overview-subtab','student-subtab','constructor-subtab','constructor-course-toggle','course-subtab','open-student','open-hasil','open-group-hasil','open-pit','hub-task-tab','pit-history-toggle','open-sektor','tab','close','profile-save']);

var GRID_TOUR_STARTED=false;
var GRID_TOUR_HELP_VISIBLE=true;
var GRID_DRIVER_PROMISE=null;
function tourKey(){return 'gk_tour_v2_'+ME;}
function tourDone(){try{return localStorage.getItem(tourKey())==='done';}catch(e){return false;}}
function loadGridDriver(){
  if(!window.driver)window.driver={};
  if(!window.driver.js)window.driver.js={};
  if(typeof window.driver.js.driver!=='function'){
    window.driver.js.driver=function(options){
      let index=0,layer=null,spot=null,pop=null;
      const steps=options.steps||[];
      let reposition=null,mutationObserver=null;
      const cleanup=()=>{if(reposition){window.removeEventListener('scroll',reposition,true);window.removeEventListener('resize',reposition);reposition=null;}if(mutationObserver){mutationObserver.disconnect();mutationObserver=null;}if(layer)layer.remove();layer=spot=pop=null;};
      const destroy=()=>{cleanup();if(typeof options.onDestroyed==='function')options.onDestroyed();};
      const render=()=>{
        cleanup();
        if(index>=steps.length){destroy();return;}
        GRID_TOUR_HELP_VISIBLE=index===steps.length-1;
        renderTourHelp();
        const step=steps[index];
        let target=typeof step.element==='function'?step.element():(typeof step.element==='string'?document.querySelector(step.element):step.element);
        if(!target&&index===0)target=document.querySelector('.top');
        if(!target){setTimeout(render,120);return;}
        target.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
        layer=document.createElement('div');layer.className='gk-native-tour-layer';
        spot=document.createElement('div');spot.className='gk-native-tour-spot';
        pop=document.createElement('section');pop.className='gk-native-tour-pop';
        const p=step.popover||{},pad=4;
        pop.innerHTML='<div class="gk-native-tour-kicker">GRID KELAS · ROOKIE LAP</div><div class="gk-native-tour-count">'+(index+1)+' / '+steps.length+'</div><h3></h3><p></p><div class="gk-native-tour-hint">↗ COBA KLIK FITUR YANG DISOROT — TUTORIAL TETAP TERBUKA</div><div class="gk-native-tour-actions"><button type="button" data-tour="close">Tutup</button><span></span><button type="button" data-tour="prev">Kembali</button><button type="button" data-tour="next"></button></div>';
        pop.querySelector('h3').textContent=p.title||'';pop.querySelector('p').textContent=p.description||'';
        pop.querySelector('[data-tour="prev"]').disabled=index===0;
        pop.querySelector('[data-tour="next"]').textContent=index===steps.length-1?'Selesai':'Lanjutkan';
        const place=()=>{
          if(typeof step.element==='function')target=step.element();
          else if(typeof step.element==='string')target=document.querySelector(step.element);
          if(!target||!target.isConnected){target=document.querySelector('.top');if(!target)return;}
          const r=target.getBoundingClientRect();
          const left=Math.max(4,Math.min(window.innerWidth-4,r.left-pad));
          const top=Math.max(4,Math.min(window.innerHeight-4,r.top-pad));
          spot.style.left=left+'px';spot.style.top=top+'px';
          spot.style.width=Math.max(0,Math.min(window.innerWidth-4,r.right+pad)-left)+'px';
          spot.style.height=Math.max(0,Math.min(window.innerHeight-4,r.bottom+pad)-top)+'px';
          const mobile=window.innerWidth<=600;
          const w=mobile?Math.max(0,window.innerWidth-20):Math.min(380,window.innerWidth-28);
          pop.style.width=w+'px';
          if(mobile){
            pop.style.maxHeight='min(36vh,300px)';
            pop.style.overflowY='auto';
            const preferTop=r.top>window.innerHeight/2;
            pop.style.top=(preferTop?10:Math.max(10,window.innerHeight-pop.offsetHeight-10))+'px';
            pop.style.left='10px';
          }else{
            pop.style.maxHeight='';
            pop.style.overflowY='';
            let popTop=p.side==='top'?r.top-pop.offsetHeight-14:r.bottom+14;
            if(popTop<12||popTop+pop.offsetHeight>window.innerHeight-12)popTop=Math.max(12,Math.min(window.innerHeight-pop.offsetHeight-12,r.top-pop.offsetHeight-14));
            pop.style.top=popTop+'px';
            pop.style.left=Math.max(14,Math.min(window.innerWidth-w-14,r.left+(r.width-w)/2))+'px';
          }
        };
        layer.appendChild(spot);layer.appendChild(pop);
        if(typeof step.onHighlighted==='function')requestAnimationFrame(()=>step.onHighlighted());
        const tourHost=dlg&&dlg.open?dlg:document.body;
        tourHost.appendChild(layer);
        reposition=place;
        window.addEventListener('scroll',reposition,true);
        window.addEventListener('resize',reposition);
        if(dlg&&dlg.open){mutationObserver=new MutationObserver(()=>requestAnimationFrame(place));mutationObserver.observe(dlg,{childList:true,subtree:true});}
        if(index===0&&window.innerWidth<=600&&target.classList.contains('nav')){
          const nav=target,far=Math.max(0,nav.scrollWidth-nav.clientWidth);
          if(far>8){setTimeout(()=>nav.scrollTo({left:far,behavior:'smooth'}),180);setTimeout(()=>nav.scrollTo({left:0,behavior:'smooth'}),1050);}
        }
        requestAnimationFrame(place);
        setTimeout(place,350);
        pop.querySelector('[data-tour="close"]').onclick=destroy;
        pop.querySelector('[data-tour="prev"]').onclick=()=>{
          if(index===0)return;
          const previousIndex=index-1;
          if(dlg&&dlg.open)dlg.close();
          const showStudentCard=(tab)=>{
            setView('mahasiswa',true);
            const line=document.querySelector('#v-mahasiswa [data-act="student-subtab"][data-tab="line-up"]');
            if(line)line.click();
            const card=document.querySelector('#v-mahasiswa #sgrid .scard.me-highlight');
            if(card)card.click();
            setTimeout(()=>{const t=document.querySelector('#dlg [data-course-tab="'+tab+'"]');if(t)t.click();},0);
          };
          if(previousIndex===0){setView('beranda',true);}
          else if(previousIndex===1||previousIndex===2||previousIndex===3){setView('mahasiswa',true);const b=document.querySelector('#v-mahasiswa [data-act="student-subtab"][data-tab="line-up"]');if(b)b.click();}
          else if(previousIndex===4){showStudentCard('overview');}
          else if(previousIndex===5){showStudentCard('hasil');}
          else if(previousIndex===6){showStudentCard('achievement');}
          else if(previousIndex>=7&&previousIndex<=10){
            setView('mahasiswa',true);
            const b=document.querySelector('#v-mahasiswa [data-act="student-subtab"][data-tab="constructor"]');if(b)b.click();
            CONSTRUCTOR_SUBTAB=previousIndex>=10?'standings':'list';renderConstructor();
          }else if(previousIndex>=11&&previousIndex<=13){
            setView('mata-kuliah',true);
            const tab=previousIndex===13?'history':'grand-prix';
            const b=document.querySelector('#v-mata-kuliah [data-act="course-subtab"][data-tab="'+tab+'"]');if(b)b.click();
          }else if(previousIndex===14){setView('beranda',true);}
          else if(previousIndex===15||previousIndex===16){
            setView('beranda',true);
            const b=document.querySelector('#home [data-act="open-pit"]');if(b)b.click();
            setTimeout(()=>{const tab=previousIndex===15?'group':'individual',t=document.querySelector('#dlg [data-act="hub-task-tab"][data-tab="'+tab+'"]');if(t)t.click();},0);
          }else if(previousIndex===17){setView('beranda',true);}
          else if(previousIndex===18){
            setView('beranda',true);
            const b=document.querySelector('#home [data-act="open-sektor"]');if(b)b.click();
          }else{setView('beranda',true);}
          index=previousIndex;render();
        };
        pop.querySelector('[data-tour="next"]').onclick=()=>{
          if(index===steps.length-1){destroy();return;}
          const nextHandler=step.onNextClick||p.onNextClick;
          if(typeof nextHandler==='function')nextHandler();else{index++;render();}
        };
      };
      return {drive:()=>{index=0;render();},moveNext:()=>{index++;render();},movePrevious:()=>{index=Math.max(0,index-1);render();},destroy};
    };
  }
  return Promise.resolve(true);
}
function renderTourHelp(){
  let b=document.getElementById('gkTourHelp');
  if(!b){
    b=document.createElement('button');b.id='gkTourHelp';b.type='button';b.className='gk-tour-help';
    b.setAttribute('aria-label','Buka tutorial Grid Kelas');b.title='Buka tutorial Grid Kelas';b.textContent='?';
    const openTour=e=>{
      if(e){e.preventDefault();e.stopPropagation();}
      if(!ME){
        let note=document.getElementById('gkTourHelpNotice');
        if(!note){note=document.createElement('div');note.id='gkTourHelpNotice';note.className='gk-tour-help-notice';document.documentElement.appendChild(note);}
        note.textContent='Masuk untuk melihat tutorial lengkapnya.';
        clearTimeout(note._hideTimer);note._hideTimer=setTimeout(()=>note.remove(),5000);
        return;
      }
      if(GRID_TOUR_STARTED)return;
      b.disabled=true;b.textContent='…';
      Promise.resolve(launchGridClassTour(true)).then(ok=>{
        b.disabled=false;b.textContent='?';
        if(!ok){
          let note=document.getElementById('gkTourHelpNotice');
          if(!note){note=document.createElement('div');note.id='gkTourHelpNotice';note.className='gk-tour-help-notice';document.documentElement.appendChild(note);}
          note.textContent='Tutorial belum terbuka. Muat ulang halaman, lalu coba lagi.';
          clearTimeout(note._hideTimer);note._hideTimer=setTimeout(()=>note.remove(),5000);
        }
      }).catch(()=>{
        b.disabled=false;b.textContent='?';
      });
    };
    b.addEventListener('pointerdown',openTour,true);
    b.addEventListener('click',openTour,true);
    document.documentElement.appendChild(b);
  }else if(b.parentElement!==document.documentElement){
    document.documentElement.appendChild(b);
  }
  b.hidden=GRID_TOUR_STARTED&&!GRID_TOUR_HELP_VISIBLE;
}
function showTourPrompt(){
  if(!ME||tourDone()||document.getElementById('gkTourPrompt')){renderTourHelp();return;}
  renderTourHelp();
  const wrap=document.createElement('div');wrap.id='gkTourPrompt';wrap.className='gk-tour-prompt';
  wrap.innerHTML='<section class="gk-tour-card" role="dialog" aria-modal="true" aria-labelledby="gkTourTitle"><div class="gk-tour-kicker">GRID KELAS · ROOKIE BRIEFING</div><div class="gk-tour-mark" aria-hidden="true">?</div><h2 id="gkTourTitle">Perlu Tutorial?</h2><p>Kenali fitur Grid Kelas sebelum memulai. Ikuti briefing singkat untuk melihat navigasi, tugas, absensi, mata kuliah, dan fitur lainnya.</p><div class="gk-tour-error" role="alert" hidden></div><div class="gk-tour-actions"><button type="button" class="gk-tour-skip">Skip</button><button type="button" class="gk-tour-start">Tutorial <span aria-hidden="true">›</span></button></div><small>BRIEFING WAJIB? TIDAK · KAMU BISA MEMBUKANYA LAGI KAPAN SAJA</small></section>';
  document.body.appendChild(wrap);
  wrap.querySelector('.gk-tour-skip').addEventListener('click',()=>{
    try{localStorage.setItem(tourKey(),'done');}catch(e){}
    wrap.remove();renderTourHelp();
  });
  wrap.querySelector('.gk-tour-start').addEventListener('click',async()=>{
    const btn=wrap.querySelector('.gk-tour-start'),err=wrap.querySelector('.gk-tour-error');
    btn.disabled=true;btn.textContent='MEMUAT TUTORIAL...';err.hidden=true;
    const ok=await launchGridClassTour(false);
    if(ok)wrap.remove();
    else{btn.disabled=false;btn.innerHTML='Coba Lagi <span aria-hidden="true">›</span>';err.hidden=false;err.textContent='Tutorial belum dapat dimuat. Periksa koneksi internet atau pemblokir CDN, lalu coba lagi.';}
  });
}
function startGridClassTour(){
  if(!ME)return;
  renderTourHelp();
  if(tourDone())return;
  showTourPrompt();
}
async function launchGridClassTour(force){
  if(GRID_TOUR_STARTED||!ME)return false;
  if(!force&&tourDone()){renderTourHelp();return false;}
  await loadGridDriver();
  if(GRID_TOUR_STARTED)return false;
  if(!loaded.co||!courseList().length){toast('Data mata kuliah masih dimuat. Coba buka tutorial beberapa saat lagi.');return false;}
  beginTourDemo();
  const mobileTour=window.matchMedia('(max-width: 600px)').matches;
  const mobileNavStep=(target,label)=>mobileTour?[{
    element:()=>{toggleMobileNav(true);return document.querySelector('.nl[data-view="'+target+'"]');},
    popover:{title:'NAVIGASI · '+label.toUpperCase(),description:'Tekan tombol F untuk membuka navigasi, lalu ketuk tab '+label+'. Setelah halaman terbuka, navigasi akan tertutup otomatis agar tutorial bisa dilanjutkan.',side:'bottom',align:'center'},
    onNextClick:()=>{const b=document.querySelector('.nl[data-view="'+target+'"]');if(b)b.click();toggleMobileNav(false);setTimeout(()=>{toggleMobileNav(false);d.moveNext();},220);}
  }]:[];
  const d=window.driver.js.driver({
    animate:true,showProgress:true,showButtons:['previous','next','close'],
    nextBtnText:'Lanjutkan',prevBtnText:'Kembali',doneBtnText:'Mulai balapan',
    progressText:'{{current}} / {{total}}',allowClose:true,overlayColor:'rgba(4,8,16,.82)',
    stagePadding:7,stageRadius:12,popoverClass:'gk-race-tour',
    steps:[
      {element:()=>mobileTour?document.querySelector('#top .brand'):document.querySelector('#mainNav'),popover:{title:'01 · PIT WALL NAVIGATION',description:mobileTour?'Tekan tombol F untuk membuka navigasi, lalu pilih tab Mahasiswa. Navigasi akan tertutup setelah halaman terbuka.':'Gunakan navigasi untuk berpindah antara Beranda, Mahasiswa, dan Mata Kuliah'+(adm()?', serta Pengelola.':'.'),side:'bottom',align:'center',onNextClick:()=>{if(mobileTour){toggleMobileNav(true);setTimeout(()=>d.moveNext(),180);}else{setView('mahasiswa',true);const b=document.querySelector('#v-mahasiswa [data-act="student-subtab"][data-tab="line-up"]');if(b)b.click();setTimeout(()=>d.moveNext(),420);}}}}, 
      ...mobileNavStep('mahasiswa','Mahasiswa'),
      {element:'#v-mahasiswa .student-subtabs [data-tab="line-up"]',popover:{title:'02 · LINE-UP',description:'LINE-UP menampilkan grid kartu seluruh mahasiswa. Kartu milikmu diberi sorotan khusus. Pilih kartu tersebut untuk membuka profil, statistik, hasil tugas, dan achievement.',side:'bottom',align:'start'},
       onNextClick:()=>{d.moveNext();}},
      {element:'#rail',popover:{title:'03 · SLIDER GRID',description:'Inilah Slider Grid nomor absen 1–32. Perhatikan barisannya bergeser ke kiri dan ke kanan untuk melihat daftar mahasiswa. Kamu juga bisa menggesernya dengan tombol panah.',side:'bottom',align:'center',onNextClick:()=>{d.moveNext();}},
        onHighlighted:()=>{const rail=document.querySelector('#rail');if(rail){const start=rail.scrollLeft,max=Math.max(0,rail.scrollWidth-rail.clientWidth);const right=Math.min(max,start+240),left=Math.max(0,start-180);rail.scrollTo({left:right,behavior:'smooth'});setTimeout(()=>rail.scrollTo({left,behavior:'smooth'}),720);setTimeout(()=>rail.scrollTo({left:start,behavior:'smooth'}),1440);}}},
      {element:'#v-mahasiswa #sgrid .scard.me-highlight',popover:{title:'03 · PERSONAL CARD',description:'Ini kartu mahasiswa milikmu. Buka kartu untuk melihat profil dan rekap performa akademikmu.',side:'top',align:'center'},
       onNextClick:()=>{if(!dlg.open){const b=document.querySelector('#v-mahasiswa #sgrid .scard.me-highlight');if(b)b.click();}setTimeout(()=>d.moveNext(),180);}},
      {element:'#dlg .student-profile-editor',popover:{title:'04 · DRIVER PROFILE',description:'Sebelum lanjut, yuk, update profilmu sebentar. Isi tanggal lahir dan nomor WhatsApp, lalu tekan Simpan profil. Data ini hanya dapat dilihat olehmu dan pengelola.',side:'bottom',align:'center'},
       onNextClick:()=>{const input=document.querySelector('#profile-dob');if(input)input.focus();d.moveNext();}},
      {element:'#dlg .student-overview',popover:{title:'05 · PERSONAL TELEMETRY',description:'Ringkasan performa akademik pribadimu: persentase kehadiran, jumlah tugas yang sudah dikumpulkan, dan pencapaian Early Bird.',side:'top',align:'center'},
       onNextClick:()=>{const b=document.querySelector('#dlg [data-course-tab="hasil"]');if(b)b.click();setTimeout(()=>d.moveNext(),140);}},
      {element:'#dlg [data-course-tab="hasil"]',popover:{title:'05 · RESULT',description:'Tab Hasil menampilkan riwayat pengumpulan tugas beserta posisi atau peringkat yang kamu raih.',side:'bottom',align:'center'},
       onNextClick:()=>{const b=document.querySelector('#dlg [data-course-tab="achievement"]');if(b)b.click();setTimeout(()=>d.moveNext(),140);}},
      {element:'#dlg [data-course-tab="achievement"]',popover:{title:'06 · ACHIEVEMENTS',description:'Lihat pencapaian Early Bird, Challenger, dan Pole Position yang berhasil kamu raih selama perkuliahan.',side:'bottom',align:'center'},
       onNextClick:()=>{if(dlg.open)dlg.close();CONSTRUCTOR_SUBTAB='list';const first=courseList()[0];if(first)CONSTRUCTOR_COURSE_OPEN[first.k]=true;if(mobileTour){const b=document.querySelector('#v-mahasiswa [data-act="student-subtab"][data-tab="constructor"]');if(b)b.click();setTimeout(()=>d.moveNext(),160);}else{setView('mahasiswa',true);const b=document.querySelector('#v-mahasiswa [data-act="student-subtab"][data-tab="constructor"]');if(b)b.click();setTimeout(()=>d.moveNext(),160);}}}, 

      {element:'#v-mahasiswa .student-subtabs [data-tab="constructor"]',popover:{title:'07 · CONSTRUCTOR',description:'Ketuk tab CONSTRUCTOR untuk melihat susunan tim per mata kuliah dan klasemen Constructor.',side:'bottom',align:'start'},
       onNextClick:()=>{CONSTRUCTOR_SUBTAB='list';renderConstructor();setTimeout(()=>d.moveNext(),140);}},
      {element:'#constructorPanel .constructor-subtabs [data-tab="list"]',popover:{title:'08 · CONSTRUCTOR LINE-UP',description:'Tab ini membuka daftar Constructor per mata kuliah. Setiap tim memiliki anggota dan Team Principal yang mengatur pengumpulan tugas kelompok.',side:'bottom',align:'start'},
       onNextClick:()=>{const first=document.querySelector('#constructorPanel .constructor-course');if(first)first.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>d.moveNext(),180);}},
      {element:'#constructorPanel .constructor-course',popover:{title:'09 · CONSTRUCTOR LINE-UP',description:'Setiap panel mewakili satu mata kuliah. Buka daftar Constructor untuk melihat susunan anggota, Team Principal, dan detail tim.',side:'top',align:'center'},
       onNextClick:()=>{CONSTRUCTOR_SUBTAB='standings';renderConstructor();setTimeout(()=>d.moveNext(),150);}},
      {element:'#constructorPanel .constructor-subtabs [data-tab="standings"]',popover:{title:'10 · KLASEMEN CONSTRUCTOR',description:'Klasemen Constructor membandingkan posisi tim berdasarkan waktu pengumpulan tugas kelompok. Gunakan bagian ini untuk melihat tim yang sudah menyelesaikan tugas dan urutan hasilnya.',side:'bottom',align:'start'},
       onNextClick:()=>{const b=document.querySelector('#constructorPanel .constructor-subtabs [data-tab="standings"]');if(b)b.click();setTimeout(()=>d.moveNext(),220);}},
      {element:()=>document.querySelector('#constructorPanel .constructor-standing .tower')||document.querySelector('#constructorPanel .constructor-standing')||document.querySelector('#constructorPanel .constructor-empty'),popover:{title:'11 · CONSTRUCTOR TIME TOWER',description:'Inilah Time Tower Constructor. Urutan P1, P2, dan seterusnya ditentukan oleh waktu pengumpulan tugas kelompok. Kolom WAKTU menunjukkan waktu submit, INTERVAL menunjukkan selisih dengan Constructor di atasnya, dan GAP KE P1 menunjukkan selisih dari posisi pertama. Tim yang belum mengumpulkan akan tampil sebagai NO TIME atau DNF setelah tenggat.',side:'top',align:'center'},
       onNextClick:()=>{if(mobileTour){toggleMobileNav(true);setTimeout(()=>d.moveNext(),140);}else{setView('mata-kuliah',true);setTimeout(()=>d.moveNext(),140);}}}, 
      ...mobileNavStep('mata-kuliah','Mata Kuliah'),
      {element:'#v-mata-kuliah .course-subtabs',popover:{title:'12 · GRAND PRIX & HISTORY',description:'GRAND PRIX berisi kartu mata kuliah aktif. HISTORY menyimpan tugas yang melewati tenggat atau ditutup pengelola. Pilih tab untuk mengganti tampilan.',side:'bottom',align:'start'},
       onNextClick:()=>{const b=document.querySelector('#v-mata-kuliah [data-act="course-subtab"][data-tab="grand-prix"]');if(b)b.click();setTimeout(()=>d.moveNext(),120);}},
      {element:'#cgrid .course',popover:{title:'13 · GRAND PRIX',description:'Setiap kartu mewakili satu mata kuliah. Buka kartu untuk melihat informasi perkuliahan, absensi, materi, dan tugas yang terhubung dengan mata kuliah tersebut.',side:'top',align:'center'},
       onNextClick:()=>{const b=document.querySelector('#v-mata-kuliah [data-act="course-subtab"][data-tab="history"]');if(b)b.click();setTimeout(()=>d.moveNext(),160);}},
      {element:()=>document.querySelector('#cgrid .history-item .tcard')||document.querySelector('#cgrid .history-empty')||document.querySelector('#cgrid'),popover:{title:'14 · HISTORY & TIME TOWER',description:'HISTORY menyimpan tugas yang sudah melewati tenggat. Setiap kartu arsip dibatasi oleh kotak yang sama dengan kontennya. Tekan Time Tower untuk melihat rekap pengumpulan dan posisi mahasiswa atau Constructor.',side:'top',align:'center'},
       onNextClick:()=>{const b=document.querySelector('#cgrid .history-item [data-act="open-hasil"],#cgrid .history-item [data-act="open-group-hasil"]');if(b)b.click();else setView('beranda',true);setTimeout(()=>d.moveNext(),180);}},
      {element:()=>document.querySelector('#dlg .tower')||document.querySelector('#dlg .db')||document.querySelector('#cgrid .history-empty'),popover:{title:'14A · TIME TOWER PERCONTOHAN',description:'Ini Time Tower dari tugas percontohan yang sudah masuk History. Urutan P1, P2, dan seterusnya mengikuti waktu pengumpulan. Mahasiswa yang tidak mengumpulkan setelah tenggat akan tercatat DNF. Tutup tugas aktif dari mode pengelola untuk menjadikannya arsip contoh.',side:'top',align:'center'},onNextClick:()=>{if(dlg.open)dlg.close();if(mobileTour){toggleMobileNav(false);setTimeout(()=>d.moveNext(),120);}else{setView('beranda',true);setTimeout(()=>d.moveNext(),120);}}},
      ...mobileNavStep('beranda','Beranda'),
      {element:'#home .tiles',popover:{title:'15 · TELEMETRY HUB',description:'Hub Tugas merangkum tugas individu dan Constructor. Sektor Absensi menunjukkan progres kehadiran dan posisi sektormu di kelas.',side:'bottom',align:'center'},
       onNextClick:()=>{const b=document.querySelector('#home [data-act="open-pit"]');if(b)b.click();setTimeout(()=>d.moveNext(),180);}},
      {element:'#dlg [data-act="hub-task-tab"][data-tab="individual"]',popover:{title:'16 · PIT TUGAS',description:'PIT TUGAS adalah jalur pengumpulan individu. Di sini kamu bisa melihat tugas yang perlu dikerjakan, yang sudah terkumpul, dan tugas yang berstatus DNF.',side:'top',align:'center'},
       onNextClick:()=>{const b=document.querySelector('#dlg [data-act="hub-task-tab"][data-tab="group"]');if(b)b.click();setTimeout(()=>d.moveNext(),150);}},
      {element:'#dlg [data-act="hub-task-tab"][data-tab="group"]',popover:{title:'17 · PADDOCK CONSTRUCTOR',description:'PADDOCK CONSTRUCTOR merangkum tugas kelompok dari Constructor tempatmu terdaftar. Team Principal bertanggung jawab mengirim pengumpulan untuk tim.',side:'top',align:'center'},
       onNextClick:()=>{if(dlg.open)dlg.close();setView('beranda',true);setTimeout(()=>d.moveNext(),140);}},
      {element:'#home [data-act="open-sektor"]',popover:{title:'18 · SECTOR CLASSIFICATION',description:'Sektor Absensi memperlihatkan persentase kehadiran, peringkat kelas, dan warna sektor berdasarkan posisi kehadiranmu.',side:'top',align:'center'},
       onNextClick:()=>{const b=document.querySelector('#home [data-act="open-sektor"]');if(b)b.click();setTimeout(()=>d.moveNext(),160);}},
      {element:'#dlg .sector-overview',popover:{title:'19 · ABSENCE SECTOR',description:'Di tampilan sektor, bandingkan posisi dan progres absensi setiap mahasiswa. Warna sektor membantu membaca peringkat kehadiran.',side:'top',align:'center'},
       onNextClick:()=>{if(dlg.open)dlg.close();if(mobileTour){toggleMobileNav(true);setTimeout(()=>d.moveNext(),120);}else{setView('beranda',true);setTimeout(()=>d.moveNext(),120);}}}, 
      {element:'#home .schedule-panel',popover:{title:'20 · SCHEDULE',description:'Jadwal hari ini menampilkan kelas dan jam perkuliahan. Gunakan tombol Isi Absen saat sesi dibuka, atau buka riwayat absensi untuk mengecek catatan sebelumnya.',side:'top',align:'center'}},
      {element:'#home .team-radio',popover:{title:'21 · TEAM RADIO',description:'Pengumuman dan kabar penting kelas disiarkan di sini. Geser atau gunakan kontrol navigasi untuk melihat transmisi lainnya.',side:'top',align:'center'},onNextClick:()=>{setView('beranda',true);setTimeout(()=>d.moveNext(),140);}},
      {element:'#overviewSubtabs [data-tab="exhibition"]',popover:{title:'22 · EXHIBITION',description:'Exhibition berada tepat di samping heading Overview. Buka tab ini untuk melihat sertifikat, dokumentasi kelas, dan agenda seminar akademik tanpa meninggalkan halaman Overview.',side:'bottom',align:'start'},onNextClick:()=>{setOverviewSubtab('exhibition');setTimeout(()=>d.moveNext(),140);}},
      {element:'#exhibitionPanel #superLicensePanel',popover:{title:'23 · SUPER LICENSE',description:'Simpan sertifikat pentingmu di Super License. Kamu juga dapat membuka folder Google Drive kelas jika tersedia.',side:'top',align:'center'}},
      {element:'#exhibitionPanel #classArchivePanel',popover:{title:'24 · CLASS ARCHIVE',description:'Class Archive menjadi galeri dokumentasi kegiatan kelas. Lihat momen yang sudah dibagikan dan tambahkan dokumentasi jika akunmu memiliki izin.',side:'top',align:'center'}},
      {element:()=>document.querySelector('#classArchivePanel .archive-social')||document.querySelector('#classArchivePanel .gal .gi')||document.querySelector('#classArchivePanel'),popover:{title:'24A · REACTION & COMMENT',description:'Pilih foto yang sudah ada, lalu berikan reaction singkat seperti 👍 ❤️ 😂 🔥. Kamu juga bisa menulis komentar pada kolom di bawah reaction dan tekan Kirim untuk membagikan tanggapanmu.',side:'top',align:'center'}},
      {element:'#exhibitionPanel #paddockClubPanel',popover:{title:'25 · PADDOCK CLUB',description:'Pusat daftar seminar untuk mencari kegiatan yang menyediakan poin KAK. Periksa poster dan tekan Daftar untuk membuka tautan pendaftaran seminar.',side:'top',align:'center'}},
      {element:'#gkTourHelp',popover:{title:'26 · PIT ASSISTANCE',description:'Tombol ? ini adalah bantuan kapan saja. Tekan untuk membuka tutorial Grid Kelas kembali jika kamu membutuhkan panduan.',side:'top',align:'center'}}
    ],

    onDestroyed:()=>{try{localStorage.setItem(tourKey(),'done');}catch(e){}GRID_TOUR_STARTED=false;GRID_TOUR_HELP_VISIBLE=true;endTourDemo();renderTourHelp();}
  });
  GRID_TOUR_STARTED=true;
  GRID_TOUR_HELP_VISIBLE=false;
  renderTourHelp();
  d.drive();
  return true;
}

function dlgHead(kind,title,sub,col){
  return '<div class="dh" style="--tc:'+col+'"><button type="button" class="x" data-act="close" aria-label="Tutup">&times;</button><div class="dk">'+kind+'</div><h2 id="dtitle">'+title+'</h2>'+(sub?'<p class="jadwal">'+sub+'</p>':'')+'</div>';
}
const hasilBtn=t=>'<button type="button" class="btn sm" data-act="open-hasil" data-id="'+esc(t.id)+'">Lihat hasil</button>';
function pitDlg(){
  if(!ME)return '<div class="db"><button type="button" class="btn" data-act="close">Tutup</button><p class="empty">Masuk dulu untuk membuka Hub Tugas.</p></div>';
  const tab=D.taskTab==='group'?'group':'individual';
  const groupTasks=Object.keys(S.tu).map(id=>Object.assign({id:id},S.tu[id])).filter(t=>t.mode==='group').sort((a,b)=>(a.tenggat||'9999').localeCompare(b.tenggat||'9999'));
  const individual=pitData(ME);
  let h='<div class="dh" style="--tc:#e10600"><button type="button" class="x" data-act="close" aria-label="Tutup">&times;</button><div class="dk">HUB TUGAS</div></div>';
  h+='<div class="db"><div class="constructor-subtabs hub-task-tabs" role="tablist" aria-label="Kategori tugas"><button type="button" class="student-subtab" data-act="hub-task-tab" data-tab="individual" aria-selected="'+(tab==='individual')+'">PIT TUGAS · INDIVIDU</button><span class="course-subtab-sep">-</span><button type="button" class="student-subtab" data-act="hub-task-tab" data-tab="group" aria-selected="'+(tab==='group')+'">PADDOCK CONSTRUCTOR · KELOMPOK</button></div>';
  if(tab==='individual'){
    if(individual.open.length||individual.dnf.length)h+='<ul class="pleg"><li>'+flagSvg('r')+'Kurang dari 1 hari</li><li>'+flagSvg('y')+'Kurang dari 3 hari</li><li>'+flagSvg('g')+'3 hari atau lebih</li><li><span class="dnfb">DNF</span>Lewat tenggat, tidak terselesaikan</li></ul>';
    if(individual.open.length)h+='<ul class="plist">'+individual.open.map(x=>{const f=flagOf(x.t);return '<li class="pit-it f-'+f+'">'+flagSvg(f)+'<div><b>'+esc(x.t.judul)+'</b><span class="s">'+esc(cname(x.t.k))+' · '+dueText(x.t)+'</span></div><span class="pact"><button type="button" class="btn sm'+(f==='r'?' pri':'')+'" data-act="open-course" data-k="'+esc(x.t.k)+'" data-tab="tugas">Kumpulkan</button>'+hasilBtn(x.t)+'</span></li>';}).join('')+'</ul>';
    else h+='<p class="empty">Tidak ada tugas individu yang sedang menunggu pengumpulan.</p>';
    if(individual.dnf.length)h+='<h3 class="ph3" style="margin-top:16px">DNF · Tidak terselesaikan</h3><ul class="plist">'+individual.dnf.map(x=>'<li class="pit-it dnf"><span class="dnfb">DNF</span><div><b>'+esc(x.t.judul)+'</b><span class="s">'+esc(cname(x.t.k))+' · '+dueText(x.t)+'</span></div><span class="pact">'+hasilBtn(x.t)+'</span></li>').join('')+'</ul>';
    if(individual.done.length)h+='<h3 class="ph3" style="margin-top:16px">Sudah dikumpulkan</h3><ul class="plist">'+individual.done.map(x=>'<li class="pit-it done"><span class="pck">&#10003;</span><div><b>'+esc(x.t.judul)+'</b><span class="s">'+esc(cname(x.t.k))+' · '+dueText(x.t)+'</span></div><span class="pact"><button type="button" class="btn sm" data-act="open-course" data-k="'+esc(x.t.k)+'" data-tab="tugas">Lihat</button>'+hasilBtn(x.t)+'</span></li>').join('')+'</ul>';
  }else{
    h+='<p class="s hub-task-explainer">Tugas Constructor dikumpulkan oleh masing-masing Team Principal.</p>';
    const mineTasks=groupTasks.map(t=>({t:t,g:myConstructor(ME,t.k)})).filter(x=>x.g);
    if(mineTasks.length){
      const active=mineTasks.filter(x=>!isLocked(x.t)&&!(x.t.groupSubs&&x.t.groupSubs[x.g.id]&&x.t.groupSubs[x.g.id].at));
      const done=mineTasks.filter(x=>x.t.groupSubs&&x.t.groupSubs[x.g.id]&&x.t.groupSubs[x.g.id].at);
      const late=mineTasks.filter(x=>isLocked(x.t)&&!(x.t.groupSubs&&x.t.groupSubs[x.g.id]&&x.t.groupSubs[x.g.id].at));
      const renderGroup=(items,status)=>items.map(({t,g})=>{const sub=t.groupSubs&&t.groupSubs[g.id],principal=Number(g.principal)===Number(ME),compound=constructorCompound(t),itemClass=status==='active'?'tire-'+compound:status;const marker=status==='done'?'<span class="pck">&#10003;</span>':status==='dnf'?'<span class="dnfb">DNF</span>':tireSvg(compound);return '<li class="pit-it '+itemClass+'">'+marker+'<div><b>'+esc(t.judul)+'</b><span class="s">'+esc(cname(t.k))+' · '+(t.tenggat?dueText(t):'Tanpa tenggat')+' · '+esc(g.name||'Constructor')+'</span><span class="s">'+(status==='done'?'Dikumpulkan '+fmtTime(sub.at):status==='dnf'?'Tenggat lewat':principal?'Siap dikumpulkan oleh Team Principal':'Menunggu Team Principal')+'</span></div><span class="pact"><button type="button" class="btn sm" data-act="open-course" data-k="'+esc(t.k)+'" data-tab="tugas">'+(status==='done'?'Lihat':'Buka tugas')+'</button>'+(status==='done'?'<button type="button" class="btn sm" data-act="open-group-hasil" data-id="'+esc(t.id)+'">Lihat hasil</button>':'')+'</span></li>';}).join('');
      if(active.length||late.length)h+='<ul class="pleg tire-legend" aria-label="Legenda waktu tugas"><li title="Kurang dari 1 hari">'+tireSvg('soft')+'<span>Kurang dari 1 hari</span></li><li title="Kurang dari 3 hari">'+tireSvg('medium')+'<span>Kurang dari 3 hari</span></li><li title="3 hari atau lebih">'+tireSvg('hard')+'<span>3 hari atau lebih</span></li></ul>';
      if(active.length)h+='<h3 class="ph3">Tugas aktif</h3><ul class="plist">'+renderGroup(active,'active')+'</ul>';
      if(done.length)h+='<h3 class="ph3" style="margin-top:16px">Sudah dikumpulkan</h3><ul class="plist">'+renderGroup(done,'done')+'</ul>';
      if(late.length)h+='<h3 class="ph3" style="margin-top:16px">DNF · Tidak terselesaikan</h3><ul class="plist">'+renderGroup(late,'dnf')+'</ul>';
    }else h+='<p class="empty">Tidak ada tugas Constructor yang sedang menunggu pengumpulan.</p>';
  }
  return h+'</div>';
}
/* ---------- Hasil tugas: podium + time tower ---------- */
/* Waktu kumpul semua mahasiswa dari server (/api/hasil: hanya waktu, tanpa tautan/berkas). Tanpa server, dari data yang terlihat. */
let HS=null,HS_GROUP=null,hsTimer=null;
function loadHasil(now){
  if(TOUR_DEMO_ACTIVE||!(ME||adm())||!AUTH||!AUTH.hasil)return;
  clearTimeout(hsTimer);
  hsTimer=setTimeout(async()=>{try{const r=await AUTH.hasil();HS=r&&r.tugas||null;HS_GROUP=r&&r.groupTugas||null;if(D&&(D.kind==='hasil'||D.kind==='group-hasil'||D.kind==='student'||D.kind==='pit'))renderDialog(true);if(STUDENT_SUBTAB==='constructor'&&CONSTRUCTOR_SUBTAB==='standings')renderConstructor();}catch(e){/* tetap pakai data lokal */}},now?0:400);
}
function fmtDT(ms){try{return new Intl.DateTimeFormat('id-ID',{timeZone:APP_TZ,weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(ms));}catch(e){return '';}}
function fmtGap(ms){
  const s=Math.max(0,Math.round(ms/1000)),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);
  return '+'+(d?d+' hr ':'')+PAD(h)+':'+PAD(m)+':'+PAD(s%60);
}
/* Peringkat tugas: urut menurut waktu pengumpulan terakhir (terawal = P1). Interval = selisih dengan peringkat di depan, gap = selisih dengan leader.
 * Yang belum mengumpulkan: DNF/OUT bila tenggat sudah lewat, selain itu BELUM. */
function hasilData(id){
  const t=S.tu[id];if(!t)return null;
  const src=(HS&&HS[id])||Object.keys(t.subs||{}).reduce((o,no)=>{o[no]=t.subs[no]&&t.subs[no].at;return o;},{});
  const lk=isLocked(t),done=[],rest=[];
  for(let no=1;no<=N;no++){const at=+src[no];if(at>0)done.push({no:no,at:at});else rest.push({no:no,st:lk?'DNF':'BELUM'});}
  done.sort((a,b)=>a.at-b.at||a.no-b.no);
  const lead=done.length?done[0].at:0;
  done.forEach((r,i)=>{r.pos=i+1;r.gap=r.at-lead;r.int=i?r.at-done[i-1].at:0;});
  return{t:t,done:done,rest:rest,locked:lk};
}
const codeOf=no=>{const s=stu(no);return s&&s.kode?esc(String(s.kode).slice(0,3)):'';};
function podiumHtml(r){
  const top=r.done.slice(0,3);
  if(!top.length)return '<p class="empty">Belum ada yang mengumpulkan. Jadilah P1!</p>';
  return '<div class="podium" role="list" aria-label="Podium tiga tercepat">'+[1,0,2].map(i=>{
    const x=top[i];
    if(!x)return '<div class="pod p'+(i+1)+' none" role="listitem"><div class="pb"><span class="pn">P'+(i+1)+'</span></div></div>';
    return '<div class="pod p'+(i+1)+(x.no===ME?' me':'')+'" role="listitem"><span class="pav">'+photo('s'+PAD(x.no))+'</span>'+
      '<b class="pnm">'+esc(nameOf(x.no))+'</b><span class="pcd">No. '+x.no+(codeOf(x.no)?' · '+codeOf(x.no):'')+'</span>'+
      '<span class="ptm">'+fmtDT(x.at)+'</span><span class="pgp">'+(i?fmtGap(x.gap):'LEADER')+'</span>'+
      '<div class="pb"><span class="pn">P'+(i+1)+'</span></div></div>';
  }).join('')+'</div>';
}
function towerHtml(r,full){
  // Arsip tugas menampilkan seluruh posisi dari P1; tugas aktif memakai podium untuk P1-P3.
  const rows=full?r.done:r.done.slice(3);
  if(!rows.length&&!r.rest.length)return '';

  // Gunakan kode mahasiswa yang tersimpan; fallback ke 3 huruf nama depan.
  const initialOf=no=>{
    const saved=codeOf(no);
    if(saved)return saved;
    const n=nameOf(no).trim().split(/\s+/).filter(Boolean);
    return esc((n[0]||'').slice(0,3).toUpperCase());
  };

  // Belum tenggat: NO TIME. Tenggat lewat: DNF.
  const missingStatus=r.locked?'DNF':'NO TIME';

  let h='<h3 class="ph3" style="margin:6px 0 0">Time Tower</h3>'+
    '<ul class="pleg"><li><b>Interval</b> · selisih waktu dari posisi di atasnya</li><li><b>Gap ke P1</b> · selisih waktu dari posisi pertama</li></ul>'+
    '<div class="tblw"><table class="sx tower"><thead><tr>'+
    '<th class="num">POS</th><th class="num">ABSEN</th><th>INISIAL</th>'+
    '<th class="num">INTERVAL</th><th class="num">GAP KE P1</th>'+
    '</tr></thead><tbody>';

  // Baris yang sudah mengumpulkan, peringkat P4 dan seterusnya.
  rows.forEach(x=>{
    h+='<tr'+(x.no===ME?' class="sxme"':'')+'>'+
      '<td class="num"><b>P'+x.pos+'</b></td>'+
      '<td class="num">'+x.no+'</td>'+
      '<td class="tinitial">'+initialOf(x.no)+'</td>'+
      '<td class="num">'+fmtGap(x.int)+'</td>'+
      '<td class="num">'+fmtGap(x.gap)+'</td></tr>';
  });

  // Mahasiswa yang belum mengumpulkan tetap mendapat posisi lanjutan.
  r.rest.forEach((x,i)=>{
    const pos=r.done.length+i+1;
    h+='<tr'+(x.no===ME?' class="sxme"':'')+'>'+
      '<td class="num"><b>P'+pos+'</b></td>'+
      '<td class="num">'+x.no+'</td>'+
      '<td class="tinitial">'+initialOf(x.no)+'</td>'+
      '<td class="num"><span class="dnfb">'+missingStatus+'</span></td>'+
      '<td class="num"><span class="dnfb">'+missingStatus+'</span></td></tr>';
  });

  return h+'</tbody></table></div>';
}
function recapFilesDlg(){
  if(!adm())return '<div class="db"><button type="button" class="btn" data-act="close">Tutup</button><p class="empty">Daftar berkas hanya dapat dilihat pengelola.</p></div>';
  const no=Number(D.key),kind=D.fileKind==='dok'?'dok':'ser',label=kind==='ser'?'Sertifikat':'Dokumentasi';
  if(!Number.isInteger(no)||no<1||no>N)return '<div class="db"><button type="button" class="btn" data-act="close">Tutup</button><p class="empty">Mahasiswa tidak ditemukan.</p></div>';
  const files=Object.keys(S.be).map(id=>Object.assign({id:id},S.be[id]))
    .filter(x=>Number(x.no)===no&&x.jenis===kind)
    .sort((a,b)=>(b.at||0)-(a.at||0));
  let h=dlgHead('REKAP MAHASISWA',label+' · '+esc(nameOf(no)),'No. '+no+' · '+files.length+' berkas','#e10600');
  h+='<div class="db"><div class="row2"><button type="button" class="btn sm" data-act="close">&lsaquo; Kembali ke rekap</button></div>';
  if(!files.length)h+='<p class="empty">Belum ada '+label.toLowerCase()+' yang tersimpan.</p>';
  else h+='<div class="history-course-list">'+files.map(x=>{
    const file=x.file&&okId(x.file.id)?'<a class="btn sm" href="/_blob/'+x.file.id+'" target="_blank" rel="noopener noreferrer">Buka berkas</a>':'<span class="s">Berkas tidak tersedia</span>';
    return '<article class="tcard history-item"><div class="history-top"><div><span class="history-course">'+label.toUpperCase()+'</span><h3>'+esc(x.judul||label)+'</h3></div><span class="chip">'+(x.file&&x.file.type?esc(x.file.type):'Berkas')+'</span></div><div class="history-bottom"><span class="s">'+fmtTime(x.at)+'</span>'+file+'</div></article>';
  }).join('')+'</div>';
  return h+'</div>';
}
function groupHasilDlg(){
  if(!ME&&!adm())return '<div class="db"><button type="button" class="btn" data-act="close">Tutup</button><p class="empty">Masuk dulu untuk melihat Klasemen Konstruktor.</p></div>';
  const r=groupTowerData(D.key);
  if(!r)return '<div class="db"><button type="button" class="btn" data-act="close">Tutup</button><p class="empty">Tugas kelompok tidak ditemukan.</p></div>';
  const done=r.done.length,total=constructorGroups(r.t.k).length;
  return dlgHead('KLASEMEN KONSTRUKTOR',esc(r.t.judul),esc(cname(r.t.k))+' · '+done+' dari '+total+' Constructor sudah mengumpulkan','#e10600')+'<div class="db"><div class="row2"><button type="button" class="btn sm" data-act="open-pit">&lsaquo; Pit Tugas</button></div>'+groupTowerHtml(r)+'</div>';
}
function hasilDlg(){
  if(!ME&&!adm())return '<div class="db"><button type="button" class="btn" data-act="close">Tutup</button><p class="empty">Masuk dulu untuk melihat hasil tugas.</p></div>';
  const r=hasilData(D.key);
  if(!r)return '<div class="db"><button type="button" class="btn" data-act="close">Tutup</button><p class="empty">Tugas tidak ditemukan atau sudah dihapus.</p></div>';
  const t=r.t;
  const archived=r.locked;
  let h=dlgHead(archived?'TIME TOWER':'HASIL TUGAS',esc(t.judul),esc(cname(t.k))+' · '+dueText(t)+' · '+r.done.length+' dari '+N+' sudah mengumpulkan','#e10600');
  h+='<div class="db">'+(ME?'<div class="row2"><button type="button" class="btn sm" data-act="open-pit">&lsaquo; Pit Tugas</button></div>':'')+(archived?towerHtml(r,true):podiumHtml(r)+towerHtml(r))+'</div>';
  return h;
}
function sektorDlg(){
  if(!ME)return '<div class="db"><button type="button" class="btn" data-act="close">Tutup</button><p class="empty">Masuk dulu untuk melihat Sektor Absensi.</p></div>';
  const sx=sektorData(),me=sx.byNo[ME],miss=missingOf(ME);
  let h=dlgHead('SEKTOR ABSENSI',sx.t?'Anda peringkat '+me.rank+' dari '+N+' · '+Math.round(me.p*100)+'%':'Belum ada absensi tercatat','Setiap mata kuliah adalah satu sektor. Diurutkan menurut kehadiran keseluruhan.','#7b2ff7');
  h+='<div class="db sector-dialog-content"><ul class="pleg"><li><i class="sxc p"></i>Sektor ungu · 5 teratas</li><li><i class="sxc g"></i>Sektor hijau · 10 berikutnya</li><li><i class="sxc y"></i>Sektor kuning · sisanya</li></ul>';
  h+='<div class="sector-overview">';
  if(sx.t){
    h+='<div class="tblw sector-table-scroll" tabindex="0" role="region" aria-label="Tabel sektor absensi. Geser ke samping untuk melihat semua kolom, termasuk delta dan performa mata kuliah."><table class="sx"><thead><tr><th class="num">#</th><th>Mahasiswa</th><th class="num">Total</th><th class="num" title="Selisih persentase dengan mahasiswa tepat di atas">Delta</th>'+sx.cl.map(k=>'<th class="num" title="'+esc(cname(k))+'">'+esc(k)+'</th>').join('')+'</tr></thead><tbody>';
    sx.rows.forEach(r=>{
      const delta=attendanceDelta(sx,r.no);
      h+='<tr'+(r.no===ME?' class="sxme"':'')+'><td class="num">'+r.rank+'</td><td class="sxn"><b>'+r.no+'</b> '+esc(nameOf(r.no))+'</td><td class="num"><b>'+Math.round(r.p*100)+'%</b></td><td class="num sx-delta" title="'+(delta?'Selisih dengan P'+delta.ahead.rank:'Peringkat pertama')+'">'+(delta?delta.label:'—')+'</td>'+
        sx.cl.map(k=>{const c=r.cells[k];return '<td class="num">'+(c.c?'<span class="sxc '+c.c+' big" title="'+SXNAME[c.c]+' · peringkat '+c.rk+' di '+esc(k)+'"><span class="sxsr">'+SXNAME[c.c]+', </span>'+c.p+'%</span>':'<span class="sxc n big">—</span>')+'</td>';}).join('')+'</tr>';
    });
    h+='</tbody></table></div>';
  }else h+='<p class="empty">Belum ada pertemuan yang diisi absennya.</p>';
  h+='</div>';
  if(sx.t){
    const performance=sectorPerformance(sx,ME),best=performance[0],weak=performance[performance.length-1];
    h+='<section class="sector-performance"><div><span class="constructor-kicker">SECTOR PERFORMANCE</span><h3 class="ph3">Performa sektor kamu</h3><p class="s">Mata kuliah dengan persentase kehadiran terbaik dan terendah.</p></div>';
    if(best)h+='<div class="sector-performance-grid"><article class="sector-performance-card best"><small>TERBAIK · '+esc(best.k)+'</small><b>'+best.cell.p+'%</b><span>'+esc(best.name)+'</span></article>';
    if(weak&&weak.k!==(best&&best.k))h+='<article class="sector-performance-card focus"><small>PERLU PERHATIAN · '+esc(weak.k)+'</small><b>'+weak.cell.p+'%</b><span>'+esc(weak.name)+'</span></article>';
    else if(best)h+='<article class="sector-performance-card focus"><small>SEKTOR LAINNYA</small><b>—</b><span>Belum ada mata kuliah lain untuk dibandingkan</span></article>';
    h+='</div></section>';
  }
  h+='<h3 class="ph3" style="margin-top:6px">Absen belum diisi</h3>';
  h+=miss.length?'<ul class="plist">'+miss.slice(0,12).map(se=>'<li class="pit-it"><div><b>'+esc(cname(se.k))+' · Pertemuan '+se.n+'</b><span class="s">'+fmtDate(se.tanggal)+(se.topik?' · '+esc(se.topik):'')+'</span></div><button type="button" class="btn sm" data-act="open-course" data-k="'+esc(se.k)+'" data-tab="absen" data-pert="'+se.n+'">Isi absen</button></li>').join('')+'</ul>':'<p class="empty">Tidak ada absen yang tertinggal.</p>';
  return h+'</div>';
}

let DEFAULT_PASSWORD_ALERT_SHOWN=false;
function showDefaultPasswordAlert(){
  if(DEFAULT_PASSWORD_ALERT_SHOWN||!ME)return;
  const account=S.ak&&S.ak[PAD(ME)];
  if(!account||account.hash)return;
  DEFAULT_PASSWORD_ALERT_SHOWN=true;
  let alert=document.getElementById('gkDefaultPasswordAlert');
  if(!alert){
    alert=document.createElement('dialog');
    alert.id='gkDefaultPasswordAlert';
    alert.className='gk-password-alert';
    alert.setAttribute('aria-labelledby','gkDefaultPasswordTitle');
    alert.innerHTML='<div class="gk-password-alert-card"><div class="gk-password-alert-mark" aria-hidden="true">!</div><div class="gk-password-alert-kicker">GRID KELAS · KEAMANAN AKUN</div><h2 id="gkDefaultPasswordTitle">Password masih bawaan</h2><p>Password kamu masih bawaan, mau diganti sekarang biar lebih aman?</p><div class="gk-password-alert-actions"><button type="button" class="btn" data-password-alert="later">Nanti</button><button type="button" class="btn pri" data-password-alert="change">Ganti</button></div></div>';
    document.body.appendChild(alert);
    alert.addEventListener('click',e=>{
      const action=e.target.closest('[data-password-alert]');
      if(!action)return;
      const choice=action.dataset.passwordAlert;
      if(alert.open)alert.close();
      if(choice==='change')openLogin(ME);
    });
    alert.addEventListener('cancel',e=>{e.preventDefault();if(alert.open)alert.close();});
  }
  if(!alert.open&&typeof alert.showModal==='function')alert.showModal();
}
function renderHomeSkeleton(){
  const block='<span class="sk-line"></span>';
  $('homeLede').textContent='Lihat info kelas dan update terbaru. Yuk, cek dulu sebelum mulai!';
  // Skeleton mengikuti susunan Overview tamu (panel sambutan + Team Radio),
  // bukan layout mahasiswa yang jauh lebih tinggi dan kemudian menyusut saat data siap.
  $('home').innerHTML=
    '<div class="home-skeleton home-skeleton-guest" aria-hidden="true">'+
      '<section class="panel sk-home-welcome"><div class="sk-home-copy">'+block+block+'</div></section>'+
      '<section class="panel sk-home-panel" style="min-height:260px">'+block+block+block+'</section>'+
    '</div>';
}
function renderHome(force){
  if(dbState==='loading'&&!loaded.st&&!loaded.co){renderHomeSkeleton();return;}
  const a0=document.activeElement;
  if(!force&&a0&&$('home').contains(a0)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a0.tagName))return;
  const td=today(),dayN=jakartaWeekday();
  const tasks=taskList();
  const anns=Object.keys(S.an).map(id=>Object.assign({id:id},S.an[id])).sort((a,b)=>(b.at||0)-(a.at||0)).slice(0,8);
  const cl=courseList(),sched=cl.filter(c=>onDay(c,dayN));
  let h='';
  if(ME){
    const st=stats(ME),a=st.tot,p=pct(a.h,a.t),ts=tugasStat(ME),belum=ts.b-ts.a;
    const missing=[];
    Object.values(S.se).forEach(se=>{if(se.tanggal&&se.tanggal<=td&&!(se.present&&se.present[ME]))missing.push(se);});
    missing.sort((a2,b2)=>(a2.tanggal||'').localeCompare(b2.tanggal||''));
    const s0=stu(ME),ak=S.ak[PAD(ME)];
    $('homeLede').textContent='Cek jadwal, tugas, dan kabar terbaru kelasmu di sini.';
    const greeting=greetingText(nicknameOf(s0),ak&&ak.tanggalLahir);
    h+='<div class="greet"><span class="gav">'+photo('s'+PAD(ME))+'</span><div><div class="kk">NO. '+ME+(s0&&s0.kode?' · '+esc(s0.kode):'')+'</div><div class="gname"><span class="greeting-title">'+greeting.title+(isAd(ME)?' '+FLAG:'')+'</span><span class="greeting-subtitle">'+greeting.subtitle+'</span></div></div></div>';
    h+=homeTiles(ME);
    const left=[],right=[];
    left.push(schedPanel(sched,dayN));
    right.push(teamRadioPanel(anns));
    h+='<div class="cols"><div class="col">'+left.join('')+'</div><div class="col">'+right.join('')+'</div></div>';

  }else if(adm()){
    $('homeLede').textContent='Mode pengelola aktif.';
    h+='<div class="panel welcome"><p>Mode pengelola aktif. Buka tab Pengelola untuk membuat pengumuman, mengelola akun, dan melihat rekap. Masuk sebagai mahasiswa untuk mencoba tampilan pribadi.</p><div class="row2"><button type="button" class="btn pri" data-view="pengelola">Buka Pengelola</button><button type="button" class="btn" data-act="open-login">Masuk</button></div></div>';
    const act=tasks.filter(t=>!t.tenggat||t.tenggat>=td);
    let li='';
    act.slice(0,6).forEach(t=>{li+='<li class="it"><div><b>'+esc(t.judul)+'</b><span class="s">'+esc(cname(t.k))+' · '+(t.tenggat?'Tenggat '+fmtDate(t.tenggat):'Tanpa tenggat')+'</span></div></li>';});
    h+='<div class="cols"><div class="col"><div class="panel"><h3 class="ph3">Tugas aktif kelas</h3><p class="s">Daftar tugas yang masih berjalan dan perlu dipantau.</p>'+(li?'<ul>'+li+'</ul>':'<p class="empty">Belum ada tugas aktif.</p>')+'</div>'+schedPanel(sched,dayN)+'</div><div class="col">'+teamRadioPanel(anns)+'</div></div>';

  }else{
    $('homeLede').textContent='Lihat info kelas dan update terbaru. Yuk, cek dulu sebelum mulai!';
    h+='<div class="panel welcome"><p>Masuk dengan nomor absen, NIM, dan password untuk mengisi absen, mengumpulkan tugas, serta menyimpan sertifikat dan dokumentasi.</p><button type="button" class="btn pri" data-act="open-login">Masuk / Daftar</button></div>'+teamRadioPanel(anns);
  }
  $('home').innerHTML=h;
  if(ME)showDefaultPasswordAlert();
  if(OVERVIEW_SUBTAB==='exhibition')$('homeLede').textContent='Ruang sertifikat, dokumentasi kelas, dan agenda seminar akademik.';
}
function superLicensePanel(){
  const mine=Object.keys(S.be).map(id=>Object.assign({id:id},S.be[id]))
    .filter(x=>x.no===ME&&['ser','dok'].includes(x.jenis)).sort((a,b)=>(b.at||0)-(a.at||0));
  let h='<div class="panel" id="superLicensePanel"><h3 class="ph3">Super License</h3>'+
    '<p class="s" style="margin-bottom:12px">Simpan sertifikat dan dokumentasi pribadi dalam satu tempat. Unggah foto atau PDF, lalu buka kembali kapan pun dibutuhkan.</p>';
  if(ME&&AS){
    h+='<div class="stack" style="margin-bottom:16px"><div class="field"><label for="ser-jenis">Jenis berkas</label><select id="ser-jenis" data-dr="ser-jenis"><option value="ser"'+(dv('ser-jenis','ser')==='ser'?' selected':'')+'>Sertifikat</option><option value="dok"'+(dv('ser-jenis','ser')==='dok'?' selected':'')+'>Dokumentasi</option></select></div>'+
      '<div class="field"><label for="ser-judul">Nama sertifikat atau dokumen</label>'+
      '<input id="ser-judul" data-dr="ser-judul" type="text" maxlength="100" value="'+esc(dv('ser-judul',''))+'" placeholder="Contoh: Sertifikat Workshop atau Dokumentasi Praktikum"></div>'+
      '<div class="row2"><label class="btn sm pickfile">'+((PEND.ser||PEND.dok)?'Ganti berkas':'Pilih Sertifikat atau Dokumen')+
      '<input type="file" accept="image/*,application/pdf" data-file="ser"></label><span class="s">'+((PEND.ser||PEND.dok)?esc((PEND.ser||PEND.dok).name||'Berkas siap'):'Foto atau PDF, maksimal 20 MB')+'</span></div>'+
      '<div class="row2"><button type="button" class="btn pri" data-act="ber-save" data-j="ser">Simpan ke Super License</button>'+
      (superLicenseDriveUrl?'<a class="btn" href="'+esc(superLicenseDriveUrl)+'" target="_blank" rel="noopener noreferrer">Simpan ke Google Drive <span aria-hidden="true">&#8599;</span></a>':'')+'</div>'+
      (superLicenseDriveUrl?'<span class="s">Google Drive tetap tersedia sebagai penyimpanan tambahan.</span>':'<span class="s">Berkas yang diunggah tersimpan secara privat di Super License.</span>')+'</div>';
  }else h+='<p class="empty">Masuk sebagai mahasiswa untuk melihat dan menambahkan sertifikat atau dokumentasi pribadi.</p>';
  if(!mine.length)return h+'<p class="empty">Belum ada sertifikat atau dokumen.</p></div>';
  h+='<ul>';
  mine.forEach(x=>{
    const kind=x.jenis==='dok'?'Dokumentasi':'Sertifikat';
    const status='Tersimpan privat di Super License';
    const del=berDel===x.id
      ?'<span class="row2"><button type="button" class="btn sm pri" data-act="ber-del-yes" data-id="'+esc(x.id)+'">Hapus</button><button type="button" class="btn sm" data-act="ber-del-no">Batal</button></span>'
      :'<button type="button" class="btn sm" data-act="ber-del" data-id="'+esc(x.id)+'">Hapus dari daftar</button>';
    h+='<li class="it"><div><b>'+esc(x.judul||kind)+'</b><span class="chip">'+kind+'</span>'+fileHtml(x.file,true)+
      '<span class="s">'+fmtTime(x.at)+' · '+esc(status)+'</span>'+
      '</div>'+del+'</li>';
  });
  return h+'</ul></div>';
}
function classArchivePanel(){
  const canEdit=adm()||(ME!=null&&S.ak[PAD(ME)]&&S.ak[PAD(ME)].archiveEdit===true);
  const rows=Object.keys(S.ca).map(id=>Object.assign({id:id},S.ca[id])).sort((a,b)=>(b.at||0)-(a.at||0));
  let h='<div class="panel" id="classArchivePanel"><div class="row2" style="justify-content:space-between;align-items:center"><div><h3 class="ph3">Class Archive</h3>'+
    '<p class="s">Tempat menyimpan momen dan keseruan kegiatan kelas. Lihat-lihat atau tambahkan foto kalau punya izin.</p></div><span class="chip">'+rows.length+' foto</span></div>';
  if(canEdit&&ME&&AS){
    h+='<div class="stack" style="margin:12px 0 16px"><div class="field"><label for="archive-judul">Judul dokumentasi</label>'+
      '<input id="archive-judul" data-dr="archive-judul" type="text" maxlength="100" value="'+esc(dv('archive-judul',''))+'" placeholder="Contoh: Praktikum instalasi listrik"></div>'+
      '<div class="field"><label for="archive-caption">Keterangan (opsional)</label><textarea id="archive-caption" data-dr="archive-caption" maxlength="300" placeholder="Ceritakan momen kegiatan kelas">'+esc(dv('archive-caption',''))+'</textarea></div>'+
      '<div class="row2"><label class="btn sm pickfile">'+(PEND.archive?'Ganti foto':'Pilih foto')+
      '<input type="file" accept="image/jpeg,image/png,image/webp" data-file="archive"></label><span class="s">'+(PEND.archive?'Foto siap diunggah':'Foto JPG, PNG, atau WebP')+'</span></div>'+
      '<div class="row2"><button type="button" class="btn pri" data-act="archive-save">Tambahkan ke Class Archive</button></div></div>';
  }
  if(!rows.length)return h+'<p class="empty">Belum ada dokumentasi kelas.</p></div>';
  h+='<ul class="gal">';
  rows.forEach(x=>{
    const m=x.photoKey&&S.md[x.photoKey],url=m&&(m.url||m.data)&&((m.url&&/^https:\/\//.test(m.url))||okImg(m.data))?(m.url||m.data):'';
    h+='<li class="gi">'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer"><img src="'+esc(url)+'" alt="'+esc(x.judul||'Dokumentasi kelas')+'" loading="lazy"></a>':'<div class="gf"><span class="s">Foto tidak tersedia</span></div>')+
      '<div class="gc"><b>'+esc(x.judul||'Dokumentasi kelas')+'</b>'+
      (x.caption?'<span>'+esc(x.caption)+'</span>':'')+
      '<span class="s">'+fmtTime(x.at)+(x.no?' · '+esc(nameOf(x.no)):'')+'</span>'+
      '<div class="archive-social"><div class="archive-reactions">'+['👍','❤️','😂','🔥'].map(emoji=>{const count=Object.values(x.reactions||{}).filter(v=>v===emoji).length,active=ME&&x.reactions&&x.reactions[String(ME)]===emoji;return '<button type="button" class="archive-reaction'+(active?' active':'')+'" data-act="archive-react" data-id="'+esc(x.id)+'" data-emoji="'+emoji+'"'+(!ME?' disabled title="Masuk untuk memberi reaction"':'')+' aria-pressed="'+!!active+'">'+emoji+' <span>'+count+'</span></button>';}).join('')+'</div>'+
      '<div class="archive-comments">'+(Array.isArray(x.comments)&&x.comments.length?'<div class="archive-comment-list">'+x.comments.slice(-5).map(comment=>'<p><b>'+esc(nameOf(comment.no))+'</b> '+esc(comment.text)+' <small>'+fmtTime(comment.at)+'</small></p>').join('')+'</div>':'<span class="s">Belum ada komentar.</span>')+
      (ME?'<div class="archive-comment-form"><input type="text" maxlength="280" id="archive-comment-'+esc(x.id)+'" placeholder="Tulis komentar singkat..." aria-label="Komentar Class Archive"><button type="button" class="btn sm" data-act="archive-comment" data-id="'+esc(x.id)+'">Kirim</button></div>':'<span class="s">Masuk untuk ikut berkomentar.</span>')+'</div></div>'+
      (adm()?'<button type="button" class="btn sm" data-act="archive-del" data-id="'+esc(x.id)+'">Hapus</button>':'')+
      '</div></li>';
  });
  return h+'</ul></div>';
}
function renderExhibition(){
  const host=$('exhibition');if(!host)return;
  const seminars=Object.keys(S.pc).map(id=>Object.assign({id:id},S.pc[id])).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  let h='<div class="exhibition-sections"><section class="exhibition-section">'+superLicensePanel()+'</section><section class="exhibition-section">'+classArchivePanel()+'</section></div>';
  h+='<section class="panel paddock-club" id="paddockClubPanel"><div class="paddock-club-head"><div><h2 class="ph3">Paddock Club</h2><p class="s">Pusat informasi seminar dan kegiatan akademik untuk membantu mengumpulkan poin KAK sebagai salah satu persiapan syarat sidang proposal skripsi.</p></div><span class="chip">'+seminars.length+' seminar</span></div>';
  if(!seminars.length)h+='<div class="seminar-empty"><b>Belum ada seminar yang ditambahkan.</b><span class="s">Informasi seminar akan ditampilkan di sini setelah dipublikasikan pengelola.</span></div>';
  else{h+='<div class="seminar-list">';seminars.forEach(x=>{const poster=x.poster||{},src=poster.url||(poster.id?('/_blob/'+poster.id):'');h+='<article class="seminar-card"><div class="seminar-poster">'+(src?'<img src="'+esc(src)+'" alt="Poster '+esc(x.title||'seminar')+'" loading="lazy">':'<div class="seminar-poster-empty">POSTER<br>SEMINAR</div>')+'</div><div class="seminar-info"><span class="constructor-kicker">PADDOCK CLUB · SEMINAR</span><h3>'+esc(x.title||'Seminar tanpa judul')+'</h3><div class="seminar-actions">'+(okHttps(x.registrationUrl)?'<a class="btn pri" href="'+esc(x.registrationUrl)+'" target="_blank" rel="noopener noreferrer">Daftar <span aria-hidden="true">&#8599;</span></a>':'<span class="s">Link pendaftaran belum tersedia.</span>')+(adm()?'<button type="button" class="btn sm" data-act="seminar-del" data-id="'+esc(x.id)+'">Hapus</button>':'')+'</div></div></article>';});h+='</div>';}
  h+='</section>';host.innerHTML=h;
}

function schedPanel(sched,dayN){
  const ordered=sched.slice().sort((a,b)=>{
    const ar=jamRange(a),br=jamRange(b),as=ar?ar.s:Infinity,bs=br?br.s:Infinity;
    return as-bs;
  });
  let li='';
  ordered.forEach(c=>{li+='<li class="it"><div><b>'+esc(c.nama)+'</b><span class="s">'+(hariRange(c).b?esc(hariLabel(c))+' · ':'')+esc(c.jam)+' · '+esc(c.ruang)+'</span></div><div class="schedule-actions">'+absenBtn(c)+(ME?'<button type="button" class="btn sm" data-act="attendance-history" data-k="'+esc(c.k)+'">Lihat Riwayat Absensi</button>':'')+'</div></li>';});
  const needsAttendance=!!ME&&sched.some(c=>inSession(c)&&!(S.se[c.k+'_'+PAD(defaultPert(c.k))]&&S.se[c.k+'_'+PAD(defaultPert(c.k))].present&&S.se[c.k+'_'+PAD(defaultPert(c.k))].present[ME]));
  return '<div class="panel schedule-panel'+(needsAttendance?' attendance-alert':'')+'"><h3 class="ph3">Jadwal hari ini · '+dayN+'</h3>'+(li?'<ul>'+li+'</ul>':'<p class="empty">'+(dayN==='Minggu'?'Tidak ada kuliah hari ini, selamat bersantai.':'Tidak ada kuliah hari ini.')+'</p>')+'</div>';
}
function annPanel(anns){
  let a='';
  anns.forEach(x=>{a+='<div class="ann"><b>'+esc(x.judul)+'</b>'+(x.isi?'<p>'+esc(x.isi)+'</p>':'')+'<span class="s">'+fmtTime(x.at)+(x.k?' · '+esc(cname(x.k)):'')+'</span></div>';});
  return '<div class="panel"><h3 class="ph3">Pengumuman</h3><p class="s">Info penting kelas, langsung dari Team Radio.</p>'+(a||'<p class="empty">Belum ada pengumuman.</p>')+'</div>';
}

/* Team Radio: pengumuman kelas ditampilkan satu per satu seperti transmisi radio tim F1. */
function teamRadioPanel(anns){
  const total=anns.length;
  if(!total)return '<section class="team-radio radio-tone-0" aria-label="Team Radio"><div class="tr-top"><span class="tr-kicker"><svg class="tr-mark" viewBox="0 0 64 30" aria-hidden="true"><path d="M14 0H64L59 9H9Z"/><path d="M8 11H52L47 20H3Z"/><path d="M0 22H28L24 30H0Z"/></svg> TEAM RADIO</span><span class="tr-signal"><i></i> NO SIGNAL</span></div><div class="tr-empty"><span class="tr-wave" aria-hidden="true">'+[8,14,6,19,11,16,7,13,5,17,9,14,6,11,4,15].map((n,i)=>'<i style="--h:'+n+'px;--i:'+i+'"></i>').join('')+'</span><b>Belum ada transmisi</b><span>Pengumuman kelas akan muncul di frekuensi ini.</span></div></section>';
  TEAM_RADIO_INDEX=((TEAM_RADIO_INDEX%total)+total)%total;
  const x=anns[TEAM_RADIO_INDEX],tone=TEAM_RADIO_INDEX%5;
  const bars=[9,17,12,23,14,29,18,11,25,16,31,13,22,10,27,16,8,24,13,30,18,11,26,15,21,9,28,14,19,12,25,8];
  const wave=bars.map((n,i)=>'<i style="--h:'+n+'px;--i:'+i+'"></i>').join('');
  const dots=anns.map((item,i)=>'<button type="button" class="tr-dot'+(i===TEAM_RADIO_INDEX?' active':'')+'" data-act="team-radio-go" data-index="'+i+'" aria-label="Buka pengumuman '+(i+1)+'" aria-current="'+(i===TEAM_RADIO_INDEX?'true':'false')+'"></button>').join('');
  return '<section class="team-radio radio-tone-'+tone+'" aria-label="Team Radio">'+
    '<div class="tr-noise" aria-hidden="true"></div>'+
    '<div class="tr-top"><span class="tr-kicker"><svg class="tr-mark" viewBox="0 0 64 30" aria-hidden="true"><path d="M14 0H64L59 9H9Z"/><path d="M8 11H52L47 20H3Z"/><path d="M0 22H28L24 30H0Z"/></svg> TEAM RADIO</span></div>'+
    '<div class="tr-main" aria-live="polite"><div class="tr-meta"><span class="tr-channel">'+esc(!x.k||x.k==='general'?'GENERAL':cname(x.k))+'</span><span class="tr-time">'+fmtTime(x.at)+'</span></div>'+
    '<h3 class="tr-title">'+esc(x.judul)+'</h3>'+(x.isi?'<p class="tr-message">'+esc(x.isi)+'</p>':'')+
    '<div class="tr-wave-row"><span class="tr-wave" aria-hidden="true">'+wave+'</span></div></div>'+
    '<div class="tr-bottom"><span class="tr-counter">MESSAGE&nbsp; '+String(TEAM_RADIO_INDEX+1).padStart(2,'0')+' <span>/</span> '+String(total).padStart(2,'0')+'</span>'+
    '<div class="tr-dots" aria-label="Pilih pengumuman">'+dots+'</div>'+
    '<div class="tr-controls"><button type="button" class="tr-nav" data-act="team-radio-prev" aria-label="Pengumuman sebelumnya"'+(total<2?' disabled':'')+'>&#8592;</button><button type="button" class="tr-nav" data-act="team-radio-next" aria-label="Pengumuman berikutnya"'+(total<2?' disabled':'')+'>&#8594;</button></div></div></section>';
}

function buildWhatsAppTemplate(){
  const category=($('wa-category')||{}).value||'tasks',course=($('wa-course')||{}).value||'all';
  const meeting=Number(($('wa-meeting')||{}).value)||1,date=($('wa-date')||{}).value||today();
  const combine=!!(($('wa-combine')||{}).checked),selected=course==='all'?null:[course];
  const lines=['\u{1F4FB} *01ELSE003 | Team Radio*',''];
  const includeTasks=category==='tasks'||(combine&&category==='attendance');
  const includeAttendance=category==='attendance'||(combine&&category==='tasks');
  let taskCount=0,attendanceCount=0,seminarCount=0;
  if(includeTasks){
    const rows=Object.keys(S.cu).map(id=>Object.assign({id:id},S.cu[id])).filter(x=>x.task_title&&(!selected||selected.includes(x.course_code))).sort((a,b)=>String(a.deadline||'9999').localeCompare(String(b.deadline||'9999')));
    taskCount=rows.length;
    lines.push('\u{1F3C1} *PEMBARUAN TUGAS*');
    if(rows.length===1){
      const x=rows[0];
      lines.push('\u{1F4DA} Mata kuliah: *'+cname(x.course_code)+'*','\u{1F4DD} Tugas: *'+x.task_title+'*');
      if(x.meeting_number)lines.push('\u{1F522} Pertemuan: *'+x.meeting_number+'*');
      if(x.deadline)lines.push('\u{1F4C5} Tenggat: *'+fmtDate(x.deadline)+'*');
    }else if(rows.length>1){
      lines.push('Ada beberapa tugas baru yang perlu kamu perhatikan!','');
      rows.forEach(x=>{
        lines.push('\u{1F4DA} *'+cname(x.course_code)+'*','• *'+x.task_title+'*');
        if(x.meeting_number)lines.push('  Pertemuan: *'+x.meeting_number+'*');
        if(x.deadline)lines.push('  Tenggat: *'+fmtDate(x.deadline)+'*');
      });
    }else lines.push('Belum ada pembaruan tugas untuk pilihan ini.');
    lines.push('');
  }
  if(includeAttendance){
    const rows=[];(selected||Object.keys(S.pl)).forEach(k=>{
      const d=S.pl[k]||{};if(d.enabled===false)return;
      const url=(d.links||{})[meeting]||((Number(d.meeting_number)===meeting)?d.url:'');
      if(okHttps(url))rows.push({course:k,url:url});
    });
    attendanceCount=rows.length;
    lines.push('\u{1F6A6} *ABSEN DIBUKA*');
    if(rows.length===1){
      lines.push('\u{1F4DA} Mata kuliah: *'+cname(rows[0].course)+'*','\u{1F522} Pertemuan: *'+meeting+'*','\u{1F4C5} Jadwal: *'+fmtDate(date)+'*');
    }else if(rows.length>1){
      rows.forEach(x=>lines.push('\u{1F4DA} *'+cname(x.course)+'* · Pertemuan *'+meeting+'*'));
    }else lines.push('Belum ada tautan absensi untuk pilihan ini.');
    lines.push('');
  }
  if(category==='seminar'){
    const rows=Object.keys(S.pc).map(id=>S.pc[id]).filter(x=>!x.createdAt||new Date(x.createdAt).toISOString().slice(0,10)===date).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    seminarCount=rows.length;
    lines.push('\u{1F393} *SEMINAR TERSEDIA*');
    if(rows.length)rows.forEach(x=>lines.push('• *'+(x.title||'Seminar')+'*'));
    else lines.push('Belum ada seminar pada tanggal yang dipilih.');
    lines.push('');
  }
  let cta='Periksa pembaruan terbaru di Grid-Kelas agar tidak ada informasi penting yang terlewat.';
  if(taskCount&&attendanceCount)cta='Periksa tugas yang diperbarui dan segera selesaikan absensimu!';
  else if(taskCount)cta=taskCount===1?'Segera periksa instruksi dan selesaikan tugasmu sebelum tenggat berakhir!':'Atur strategi pengerjaanmu dan pastikan tidak ada tenggat yang terlewat!';
  else if(attendanceCount)cta='Segera buka forum dan selesaikan absensimu sesuai jadwal!';
  else if(seminarCount)cta='Lihat informasi seminar dan manfaatkan kesempatan untuk mendaftar!';
  lines.push('\u{1F3CE}\u{FE0F} '+cta,'','\u{1F449} *BUKA GRID-KELAS*',location.origin);
  return lines.join('\n').trim();
}
function renderAdmin(force=false){
  if(!adm()){$('admin').innerHTML='';return;}
  const a0=document.activeElement;
  if(!force&&a0&&$('v-pengelola').contains(a0)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a0.tagName))return;
  const td=today(),cl=courseList(),tasks=taskList();
  let totH=0,totT=0;
  const perC=cl.map(c=>{
    let terisi=0,h=0,cells=0;
    Object.values(S.se).forEach(se=>{if(se.k!==c.k)return;const p=se.present||{};if(!Object.values(p).some(Boolean))return;terisi++;for(let i=1;i<=N;i++){if(p[i]==='H'||p[i]==='K')h++;}});
    cells=terisi*N;totH+=h;totT+=cells;
    const tk=tasks.filter(t=>t.k===c.k);let subs=0;tk.forEach(t=>{subs+=Object.keys(t.subs||{}).length;});
    return{c:c,terisi:terisi,pa:pct(h,cells),nt:tk.length,pp:pct(subs,tk.length*N)};
  });
  const aktif=tasks.filter(t=>!t.tenggat||t.tenggat>=td).length;
  let nAdm=0,nReq=0;for(let n=1;n<=N;n++){if(isAd(n))nAdm++;const k=S.ak[PAD(n)];if(k&&k.resetReq)nReq++;}
  let h='<div class="tiles">'+
    '<div class="tile"><div class="v">'+Object.keys(S.st).length+'</div><div class="l">Mahasiswa</div><div class="d">'+nAdm+' admin</div></div>'+
    '<div class="tile"><div class="v">'+cl.length+'</div><div class="l">Mata kuliah</div></div>'+
    '<div class="tile"><div class="v">'+aktif+'</div><div class="l">Tugas aktif</div><div class="d">'+tasks.length+' tugas seluruhnya</div></div>'+
    '<div class="tile'+(nReq?' warn':'')+'"><div class="v">'+nReq+'</div><div class="l">Minta reset password</div></div>'+
    '<div class="tile"><div class="v">'+(pct(totH,totT)==null?'—':pct(totH,totT)+'%')+'</div><div class="l">Kehadiran kelas</div></div></div>';
  if(!PLATFORM_FORM_COURSE&&cl.length)PLATFORM_FORM_COURSE=cl[0].k;
  h+='<div class="student-subtabs admin-main-tabs" role="tablist" aria-label="Bagian pengelola">'+
    '<button type="button" class="student-subtab" data-act="admin-main-tab" data-tab="academic" role="tab" aria-selected="'+(ADMIN_MAIN_TAB==='academic')+'">AKADEMIK</button>'+
    '<span class="course-subtab-sep" aria-hidden="true">-</span>'+
    '<button type="button" class="student-subtab" data-act="admin-main-tab" data-tab="students" role="tab" aria-selected="'+(ADMIN_MAIN_TAB==='students')+'">MAHASISWA</button></div><div id="admin-academic"'+(ADMIN_MAIN_TAB==='academic'?'':' hidden')+'><section class="panel notification-center" id="notification-update-center"><div class="notification-center-head"><div><span class="constructor-kicker">TEAM RADIO · ADMIN CONTROL</span><h3 class="ph3">Notification Update Center</h3><p class="s">Pusat pengelolaan pembaruan tugas, tautan absensi, dan seminar. Pengiriman WhatsApp dilakukan manual oleh pengelola.</p></div></div>'+
    '<div class="notification-tabs" role="tablist" aria-label="Jenis pembaruan">'+
    '<button type="button" class="notification-tab" data-act="notify-tab" data-tab="tasks" aria-selected="'+(ADMIN_NOTIFY_TAB==='tasks')+'">Tugas &amp; Mata Kuliah</button>'+
    '<button type="button" class="notification-tab" data-act="notify-tab" data-tab="attendance" aria-selected="'+(ADMIN_NOTIFY_TAB==='attendance')+'">Absensi</button>'+
    '<button type="button" class="notification-tab" data-act="notify-tab" data-tab="seminar" aria-selected="'+(ADMIN_NOTIFY_TAB==='seminar')+'">Seminar</button></div>';
  const anns=Object.keys(S.an).map(id=>Object.assign({id:id},S.an[id])).sort((a,b)=>(b.at||0)-(a.at||0));
  const annEdit=ANN_EDIT&&S.an[ANN_EDIT]?Object.assign({id:ANN_EDIT},S.an[ANN_EDIT]):null;
  let al='';
  anns.forEach(x=>{
    al+='<div class="ann"><div class="row2" style="justify-content:space-between;flex-wrap:nowrap"><b>'+esc(x.judul)+'</b>'+
      (annDel===x.id?'<span class="row2" style="flex-wrap:nowrap"><button type="button" class="btn sm pri" data-act="ann-del-yes" data-id="'+esc(x.id)+'">Hapus</button><button type="button" class="btn sm" data-act="ann-del-no">Batal</button></span>':'<span class="row2" style="flex-wrap:nowrap"><button type="button" class="btn sm" data-act="ann-edit" data-id="'+esc(x.id)+'">Edit</button><button type="button" class="btn sm" data-act="ann-del" data-id="'+esc(x.id)+'">Hapus</button></span>')+'</div>'+
      (x.isi?'<p>'+esc(x.isi)+'</p>':'')+'<span class="s">'+fmtTime(x.at)+(x.k?' · '+esc(cname(x.k)):' · Semua mata kuliah')+'</span></div>';
  });
  const updates=Object.keys(S.cu).map(id=>Object.assign({id:id},S.cu[id])).sort((a,b)=>a.course_code.localeCompare(b.course_code)||a.meeting_number-b.meeting_number);
  const edit=CU_EDIT&&S.cu[CU_EDIT]?Object.assign({id:CU_EDIT},S.cu[CU_EDIT]):null;
  const linkedTask=edit?S.tu[edit.id]||null:null;
  const updRows=updates.map(u=>'<tr><td>'+esc(cname(u.course_code))+'</td><td class="num">'+u.meeting_number+'</td><td>'+esc(u.task_title||'—')+'</td><td>'+(u.task_url?'<a href="'+esc(u.task_url)+'" target="_blank" rel="noopener">Materi/soal</a>':'—')+'</td><td>'+(u.submission_url?'<a href="'+esc(u.submission_url)+'" target="_blank" rel="noopener">Pengumpulan</a>':'—')+'</td><td><button class="btn sm" data-act="cu-edit" data-id="'+esc(u.id)+'">Edit</button> <button class="btn sm" data-act="cu-del" data-id="'+esc(u.id)+'">Hapus</button></td></tr>').join('');;
  let tk='';
  tasks.slice().sort((x,y)=>(y.tenggat||'9999').localeCompare(x.tenggat||'9999')).forEach(t=>{
    const cnt=Object.keys(t.subs||{}).length,lk=isLocked(t);
    tk+='<li class="it"><div><b>'+esc(t.judul)+(lk?' <span class="dnfb">DNF</span>':'')+'</b><span class="s">'+esc(cname(t.k))+' · '+dueText(t)+' · '+cnt+'/'+N+' terkumpul'+'</span></div>'+
      (tkDel===t.id?'<span class="row2" style="flex-wrap:nowrap"><button type="button" class="btn sm pri" data-act="tk-del-yes" data-id="'+esc(t.id)+'">Hapus</button><button type="button" class="btn sm" data-act="tk-del-no">Batal</button></span>':'<button type="button" class="btn sm" data-act="tk-del" data-id="'+esc(t.id)+'">Hapus</button>')+'</li>';
  });
  const taskPanel=tk?'<div class="task-management-inline"><h4 class="ph3">Daftar tugas aktif</h4><p class="s">Kelola tugas yang sudah diterbitkan. Tugas yang melewati tenggat tetap tersimpan di History.</p><ul>'+tk+'</ul></div>':'<div class="task-management-inline"><h4 class="ph3">Daftar tugas aktif</h4><p class="empty">Belum ada tugas aktif.</p></div>';
  if(ADMIN_NOTIFY_TAB==='tasks'){
  h+='<div class="panel" id="course-update-panel"><h3 class="ph3">Pembaruan mata kuliah</h3><button type="button" class="btn sm admin-back-top" data-act="admin-top">↑ Kembali ke atas</button><p class="s">Kelola informasi pertemuan, materi, tugas, dan tenggat. Pengaturan tautan absensi tersedia di subtab Absensi.</p>'+
    '<div class="cu-form"><div class="field"><label for="cu-course">Mata kuliah</label><select id="cu-course">'+cl.map(c=>'<option value="'+esc(c.k)+'"'+((edit?edit.course_code:cl[0]&&cl[0].k)===c.k?' selected':'')+'>'+esc(c.nama)+'</option>').join('')+'</select></div>'+
    '<div class="field"><label for="cu-meeting">Pertemuan ke-</label><input id="cu-meeting" type="number" min="1" max="'+PERT+'" value="'+(edit?edit.meeting_number:1)+'"></div>'+
    '<div class="field"><label for="cu-title">Judul tugas (opsional)</label><input id="cu-title" maxlength="120" placeholder="Contoh: Tugas pertemuan 3" value="'+esc(edit&&edit.task_title||'')+'"></div>'+
    '<div class="field"><label for="cu-mode">Jenis tugas</label><select id="cu-mode"><option value="individual"'+((linkedTask&&linkedTask.mode==='group')?'':' selected')+'>Individu</option><option value="group"'+((linkedTask&&linkedTask.mode==='group')?' selected':'')+'>Kelompok</option></select></div>'+
    '<div class="field"><label for="cu-task">Link tugas / materi / soal</label><input id="cu-task" type="url" placeholder="https://..." value="'+esc(edit&&edit.task_url||'')+'"></div>'+
    '<div class="field"><label for="cu-submit">Link pengumpulan</label><input id="cu-submit" type="url" placeholder="https://..." value="'+esc(edit&&edit.submission_url||'')+'"></div>'+
    '<div class="field"><label for="cu-deadline">Batas waktu pengumpulan</label><input id="cu-deadline" type="date" value="'+esc(edit&&edit.deadline||'')+'"></div>'+
    '<div class="field" style="grid-column:1/-1"><label for="cu-desc">Petunjuk tugas</label><textarea id="cu-desc" maxlength="1000" placeholder="Jelaskan instruksi dan apa yang harus dikumpulkan">'+esc(linkedTask&&linkedTask.deskripsi||'')+'</textarea></div>'+
    '<div class="row2"><button type="button" class="btn pri" data-act="cu-save"'+(cl.length?'':' disabled')+'>'+(edit?'Simpan perubahan':'Simpan pembaruan')+'</button>'+(edit?'<button type="button" class="btn" data-act="cu-cancel">Batal edit</button>':'')+'</div></div>'+
    '<div class="tblw"><table><thead><tr><th>Mata kuliah</th><th>Pertemuan</th><th>Tugas</th><th>Link materi/soal</th><th>Pengumpulan</th><th>Aksi</th></tr></thead><tbody>'+(updRows||'<tr><td colspan="6" class="empty">Belum ada pembaruan.</td></tr>')+'</tbody></table></div>'+taskPanel+'</div>';
  }
  const attendanceRows=Object.keys(S.se).map(id=>Object.assign({id:id},S.se[id])).filter(x=>x.k&&Number(x.n)>0).sort((a,b)=>String(b.tanggal||'').localeCompare(String(a.tanggal||''))||String(a.k).localeCompare(String(b.k))||Number(b.n)-Number(a.n));
  const attendanceList=attendanceRows.map(x=>{
    const n=Number(x.n),k=x.k,id=x.id,course=cl.find(c=>c.k===k),present=x.present||{},proof=x.bukti||{};
    const count=Object.values(present).filter(Boolean).length,proofCount=Object.values(proof).filter(v=>v&&v.id).length;
    const pending=ATTENDANCE_SESSION_DELETE===id;
    return '<li class="it"><div><b>'+esc(course?course.nama:cname(k))+' · Pertemuan '+n+'</b><span class="s">'+(x.tanggal?fmtDate(x.tanggal):'Tanggal belum diatur')+' · '+count+' status kehadiran · '+proofCount+' bukti</span></div>'+
      (pending?'<span class="row2" style="flex-wrap:nowrap"><button type="button" class="btn sm pri" data-act="attendance-session-delete-confirm" data-k="'+esc(k)+'" data-n="'+n+'">Hapus</button><button type="button" class="btn sm" data-act="attendance-session-delete-cancel">Batal</button></span>':'<button type="button" class="btn sm" data-act="attendance-session-delete" data-k="'+esc(k)+'" data-n="'+n+'">Hapus</button>')+'</li>';
  }).join('');
  const attendancePanel='<div class="task-management-inline"><h4 class="ph3">Daftar absensi aktif</h4><p class="s">Kelola sesi absensi yang tersimpan. Menghapus sesi juga menghapus status, bukti, dan tautan absensi untuk pertemuan tersebut.</p>'+
    (attendanceList?'<ul>'+attendanceList+'</ul>':'<p class="empty">Belum ada sesi absensi aktif.</p>')+'</div>';
  if(ADMIN_NOTIFY_TAB==='attendance'){
    const chosenCourse=cl.find(c=>c.k===PLATFORM_FORM_COURSE)||cl[0]||null;
    const chosenMeeting=Math.max(1,Math.min(PERT,Number(PLATFORM_FORM_MEETING)||defaultPert(chosenCourse&&chosenCourse.k||'')));
    const config=chosenCourse&&S.pl[chosenCourse.k]||{};
    const currentLink=config.links&&config.links[chosenMeeting]||((Number(config.meeting_number)===chosenMeeting)?config.url:'')||'';
    h+='<div class="panel"><h3 class="ph3">Pengaturan tautan absensi</h3><p class="s">Atur tautan forum atau platform untuk setiap mata kuliah dan pertemuan. Tautan lama tetap disimpan saat pengaturan ruang kuliah diubah.</p>'+
      '<div class="cu-form"><div class="field"><label for="notify-platform-course">Mata kuliah</label><select id="notify-platform-course">'+cl.map(c=>'<option value="'+esc(c.k)+'"'+(chosenCourse&&chosenCourse.k===c.k?' selected':'')+'>'+esc(c.nama)+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="notify-platform-meeting">Pertemuan ke-</label><select id="notify-platform-meeting">'+Array.from({length:PERT},(_,i)=>i+1).map(n=>'<option value="'+n+'"'+(n===chosenMeeting?' selected':'')+'>Pertemuan '+n+'</option>').join('')+'</select></div>'+
      '<div class="field" style="grid-column:1/-1"><label for="notify-platform-url">Link absensi platform</label><input id="notify-platform-url" type="url" inputmode="url" maxlength="500" placeholder="https://..." value="'+esc(currentLink)+'"></div>'+
      '<div class="row2"><button type="button" class="btn" data-act="platform-load"'+(chosenCourse?'':' disabled')+'>Muat tautan pilihan</button><button type="button" class="btn pri" data-act="platform-save"'+(chosenCourse?'':' disabled')+'>Simpan tautan absensi</button></div></div>'+
      '<p class="s">Kosongkan tautan untuk menghapus hanya pertemuan yang sedang dipilih.</p></div>';
    const selectedSessionId=chosenCourse?chosenCourse.k+'_'+PAD(chosenMeeting):'';
    const selectedSession=selectedSessionId?S.se[selectedSessionId]:null;
    const deletePending=!!selectedSession&&ATTENDANCE_SESSION_DELETE===selectedSessionId;
    const attendanceEntries=selectedSession&&selectedSession.present?Object.values(selectedSession.present).filter(Boolean).length:0;
    const proofEntries=selectedSession&&selectedSession.bukti?Object.values(selectedSession.bukti).filter(x=>x&&x.id).length:0;
    h+='<div class="panel"><h3 class="ph3">Kelola sesi absensi</h3><p class="s">Hapus sesi absensi untuk mata kuliah dan pertemuan yang sedang dipilih. Semua status kehadiran dan bukti pada sesi tersebut akan ikut dihapus.</p>'+
      (selectedSession?'<p><b>'+esc(chosenCourse.nama)+'</b> · Pertemuan '+chosenMeeting+(selectedSession.tanggal?' · '+fmtDate(selectedSession.tanggal):'')+'</p><p class="s">'+attendanceEntries+' data status kehadiran · '+proofEntries+' bukti absensi</p>'+
        (deletePending?'<div class="tcard"><b>Yakin ingin menghapus sesi ini?</b><p class="s">Tindakan ini tidak dapat dibatalkan. Data sesi pertemuan lain tidak akan berubah.</p><div class="row2"><button type="button" class="btn sm pri" data-act="attendance-session-delete-confirm" data-k="'+esc(chosenCourse.k)+'" data-n="'+chosenMeeting+'">Ya, hapus sesi absensi</button><button type="button" class="btn sm" data-act="attendance-session-delete-cancel">Batal</button></div></div>':'<button type="button" class="btn sm" data-act="attendance-session-delete" data-k="'+esc(chosenCourse.k)+'" data-n="'+chosenMeeting+'">Hapus sesi absensi pertemuan '+chosenMeeting+'</button>'):'<p class="empty">Belum ada sesi absensi tersimpan untuk '+(chosenCourse?esc(chosenCourse.nama):'mata kuliah ini')+' · Pertemuan '+chosenMeeting+'.</p>')+'</div>';
    h+=attendancePanel;
  }
  if(ADMIN_NOTIFY_TAB==='seminar'){
    const seminars=Object.keys(S.pc).map(id=>Object.assign({id:id},S.pc[id])).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    h+='<div class="seminar-admin"><h3 class="ph3">Tambah seminar ke Paddock Club</h3><div class="field"><label for="pc-title">Judul seminar</label><input id="pc-title" data-dr="pc-title" type="text" maxlength="160" value="'+esc(dv('pc-title',''))+'" placeholder="Masukkan judul seminar"></div><div class="field"><label for="pc-link">Link pendaftaran</label><input id="pc-link" data-dr="pc-link" type="url" inputmode="url" value="'+esc(dv('pc-link',''))+'" placeholder="https://..."></div><div class="row2"><label class="btn sm pickfile">'+(PEND.seminar?'Ganti poster':'Pilih poster')+'<input type="file" accept="image/jpeg,image/png,image/webp" data-file="seminar"></label><span class="s">'+(PEND.seminar?esc(PEND.seminar.name||'Poster siap diunggah'):'Poster JPG, PNG, atau WebP · maksimal 20 MB')+'</span></div><div class="row2"><button type="button" class="btn pri" data-act="seminar-save"'+(ME&&AS?'':' disabled')+'>Terbitkan seminar</button></div></div>'+
      '<div class="panel"><h3 class="ph3">Seminar terdaftar</h3>'+(seminars.length?'<ul class="notification-link-list">'+seminars.map(x=>'<li><b>'+esc(x.title||'Seminar')+'</b> · '+(okHttps(x.registrationUrl)?'<a href="'+esc(x.registrationUrl)+'" target="_blank" rel="noopener">Link pendaftaran</a>':'Tanpa tautan')+' · <button type="button" class="btn sm" data-act="seminar-del" data-id="'+esc(x.id)+'">Hapus</button></li>').join('')+'</ul>':'<p class="empty">Belum ada seminar.</p>')+'</div>';
  }
  h+='<div class="panel whatsapp-notification-panel"><h3 class="ph3">Bagikan pembaruan ke WhatsApp</h3><p class="s">Susun pesan dari data Grid-Kelas, edit pratinjau, lalu buka WhatsApp untuk memilih grup kelas.</p>'+
    '<div class="cu-form"><div class="field"><label for="wa-category">Jenis pesan</label><select id="wa-category"><option value="tasks">Tugas</option><option value="attendance">Absensi</option><option value="seminar">Seminar</option></select></div>'+
    '<div class="field"><label for="wa-course">Mata kuliah</label><select id="wa-course"><option value="all">Semua mata kuliah</option>'+cl.map(c=>'<option value="'+esc(c.k)+'">'+esc(c.nama)+'</option>').join('')+'</select></div>'+
    '<div class="field"><label for="wa-meeting">Pertemuan absensi</label><select id="wa-meeting">'+Array.from({length:PERT},(_,i)=>'<option value="'+(i+1)+'">Pertemuan '+(i+1)+'</option>').join('')+'</select></div>'+
    '<div class="field"><label for="wa-date">Tanggal pembaruan</label><input id="wa-date" type="date" value="'+today()+'"></div>'+
    '<label class="notification-combine"><input type="checkbox" id="wa-combine"> Gabungkan pembaruan tugas dan absensi dalam satu pesan</label>'+
    '<div class="field" style="grid-column:1/-1"><label for="wa-preview">Template pesan (bisa diedit)</label><textarea id="wa-preview" data-dr="wa-preview" rows="10" maxlength="5000">'+esc(buildWhatsAppTemplate())+'</textarea></div>'+
    '<div class="row2"><button type="button" class="btn pri" data-act="wa-share">Buka WhatsApp</button></div></div>'+
    '<p class="s">Pesan otomatis disalin. Di WhatsApp, pilih grup kelas lalu tempel dengan Ctrl + V sebelum menekan Kirim. Grid-Kelas tidak dapat memastikan pesan sudah terkirim.</p></div></section>';
  h+='<div id="announcement-panel"><div class="stack"><div class="panel"><h3 class="ph3">Buat pengumuman</h3><button type="button" class="btn sm admin-back-top" data-act="admin-top">↑ Kembali ke atas</button><div class="stack">'+
    '<div class="field"><label for="an-judul">Judul</label><input id="an-judul" data-dr="an-judul" type="text" maxlength="120" value="'+esc(annEdit?annEdit.judul:dv('an-judul',''))+'" placeholder="Contoh: Kuis minggu depan"></div>'+
    '<div class="field"><label for="an-isi">Isi</label><textarea id="an-isi" data-dr="an-isi" maxlength="1000" placeholder="Tulis pengumuman untuk kelas">'+esc(annEdit?annEdit.isi:dv('an-isi',''))+'</textarea></div>'+
    '<div class="field"><label for="an-k">Perihal</label><select id="an-k" data-dr="an-k"><option value="general"'+((annEdit?annEdit.k:dv('an-k','general'))==='general'?' selected':'')+'>General</option>'+cl.map(c=>'<option value="'+esc(c.k)+'"'+((annEdit?annEdit.k:dv('an-k','general'))===c.k?' selected':'')+'>'+esc(c.nama)+'</option>').join('')+'</select></div>'+
    '<div class="row2"><button type="button" class="btn pri" data-act="ann-save">'+(annEdit?'Simpan perubahan':'Kirim pengumuman')+'</button>'+(annEdit?'<button type="button" class="btn" data-act="ann-edit-cancel">Batal edit</button>':'')+'</div></div>'+
    (al?'<div style="margin-top:18px">'+al+'</div>':'')+'</div></div>';
  h+='</div></div><div id="admin-students"'+(ADMIN_MAIN_TAB==='students'?'':' hidden')+'>';
  // akun
  let ar='';
  for(let n=1;n<=N;n++){
    const k=S.ak[PAD(n)]||{};
    ar+='<tr><td class="num">'+n+'</td><td>'+esc(nameOf(n))+(isAd(n)?' '+FLAG:'')+'</td>'+
      '<td><input class="nim" type="text" inputmode="numeric" maxlength="20" data-nim="'+n+'" value="'+esc(k.nim||'')+'" aria-label="NIM nomor absen '+n+'"></td>'+
      '<td><button type="button" class="btn sm" data-act="adm-toggle" data-no="'+n+'" aria-pressed="'+isAd(n)+'"'+(n===ME?' disabled':'')+'>'+(isAd(n)?'Admin · Cabut':'Jadikan admin')+'</button><button type="button" class="btn sm" data-act="archive-perm" data-no="'+n+'" aria-pressed="'+(k.archiveEdit===true)+'">'+(k.archiveEdit===true?'Izin arsip · Cabut':'Izin arsip')+'</button></td>'+
      ''+
      '<td>'+(k.hash?'Sudah diganti':'Bawaan')+(k.resetReq?' <span class="chip late">Minta reset '+fmtDate(new Date(k.resetReq).toISOString().slice(0,10))+'</span>':'')+' <button type="button" class="btn sm" data-act="pw-reset" data-no="'+n+'"'+(k.hash||k.resetReq?'':' disabled')+'>Reset</button></td></tr>';
  }
  h+='<div id="account-panel"><h3 class="ph3">Akun mahasiswa</h3><button type="button" class="btn sm admin-back-top" data-act="admin-top">↑ Kembali ke atas</button><p class="s" style="margin:0 0 10px">Atur NIM, akses admin, izin Class Archive, dan reset password langsung dari daftar ini.</p><div class="tblw"><table><thead><tr><th class="num">No</th><th>Nama</th><th>NIM</th><th>Admin / Class Archive</th><th>Password</th></tr></thead><tbody>'+ar+'</tbody></table></div></div>';
  h+='</div><div id="admin-academic-recap"'+(ADMIN_MAIN_TAB==='academic'?'':' hidden')+'><div id="recap-panel"><h3 class="ph3">Rekap mata kuliah</h3><p class="s">Lihat ringkasan absensi dan tugas dari tiap mata kuliah.</p><button type="button" class="btn sm admin-back-top" data-act="admin-top">↑ Kembali ke atas</button><div class="tblw"><table><thead><tr><th>Mata kuliah</th><th class="num">Pertemuan terisi</th><th class="num">Kehadiran</th><th class="num">Tugas</th><th class="num">Pengumpulan</th><th></th></tr></thead><tbody>'+
    perC.map(o=>'<tr><td>'+esc(o.c.nama)+'</td><td class="num">'+o.terisi+'/'+PERT+'</td><td class="num">'+(o.pa==null?'—':o.pa+'%')+'</td><td class="num">'+o.nt+'</td><td class="num">'+(o.pp==null?'—':o.pp+'%')+'</td><td><button type="button" class="btn sm" data-act="open-course" data-k="'+esc(o.c.k)+'">Buka</button></td></tr>').join('')+'</tbody></table></div></div>';
  h+='</div><div id="admin-student-recap"'+(ADMIN_MAIN_TAB==='students'?'':' hidden')+'>';
  const docsByStudent={};Object.values(S.be).forEach(x=>{const n=Number(x.no);if(!Number.isInteger(n)||n<1||n>N||!['ser','dok'].includes(x.jenis))return;(docsByStudent[n]||(docsByStudent[n]={ser:[],dok:[]}))[x.jenis].push(x);});
  let rows='';
  for(let n=1;n<=N;n++){
    const a=stats(n).tot,p=pct(a.h,a.t),t=tugasStat(n),docs=docsByStudent[n]||{ser:[],dok:[]};
    const recapFileButton=(kind,label)=>docs[kind].length?'<button type="button" class="btn sm" data-act="open-recap-files" data-no="'+n+'" data-kind="'+kind+'">Lihat '+label+' ('+docs[kind].length+')</button>':'';
    const docLinks='<div class="row2" style="gap:6px;flex-wrap:wrap">'+recapFileButton('ser','Sertifikat')+recapFileButton('dok','Dokumentasi')+(!docs.ser.length&&!docs.dok.length?'<span class="s">—</span>':'')+'</div>';
    rows+='<tr><td class="num">'+n+'</td><td><button type="button" class="lnk" data-act="open-student" data-no="'+n+'">'+esc(nameOf(n))+'</button></td><td class="num">'+(p==null?'—':p+'%')+'</td><td class="num">'+t.a+'/'+t.b+'</td><td>'+docLinks+'</td></tr>';
  }
  h+='<div id="recap-student-panel"><h3 class="ph3">Rekap mahasiswa</h3><p class="s">Cek progres tiap mahasiswa, mulai dari kehadiran sampai dokumen yang sudah terkumpul.</p><button type="button" class="btn sm admin-back-top" data-act="admin-top">↑ Kembali ke atas</button><div class="tblw"><table><thead><tr><th class="num">No</th><th>Nama</th><th class="num">Kehadiran</th><th class="num">Tugas dikumpulkan</th><th>Sertifikat &amp; Dokumentasi</th></tr></thead><tbody>'+rows+'</tbody></table></div></div></div>';
  $('admin').innerHTML=h;

}

function refreshAll(){
  cancelAnimationFrame(raf);
  raf=requestAnimationFrame(()=>{renderHeader();renderStrip();renderStudents();renderConstructor();renderCourses();renderHome();renderExhibition();renderAdmin();if(D)renderDialog(false);});
}

/* ---------- dialog ---------- */
function tabsHtml(list){
  return '<div class="tabs" role="tablist">'+list.map(t=>'<button type="button" role="tab" class="tab" data-course-tab="'+t[0]+'" aria-selected="'+(D.tab===t[0])+'">'+t[1]+'</button>').join('')+'</div>';
}
function defaultPert(k){
  // Nomor pertemuan ditentukan per mata kuliah, bukan dipaksa mengikuti kalender semester.
  let m=0;
  Object.values(S.se||{}).forEach(se=>{
    const n=Number(se&&se.n);
    if(se&&se.k===k&&Number.isInteger(n)&&n>=1&&n<=PERT&&
      (se.tanggal||se.topik||se.rec===true||Object.values(se.present||{}).some(Boolean)))m=Math.max(m,n);
  });
  // Pembaruan mata kuliah (termasuk tugas) menjadi petunjuk pertemuan terbaru mata kuliah tersebut.
  Object.values(S.cu||{}).forEach(update=>{
    const n=Number(update&&update.meeting_number);
    if(update&&update.course_code===k&&Number.isInteger(n)&&n>=1&&n<=PERT)m=Math.max(m,n);
  });
  // Untuk mata kuliah platform, tautan pertemuan yang tersimpan juga menentukan pertemuan aktif.
  const platform=S.pl&&S.pl[k];
  if(platform&&platform.links&&typeof platform.links==='object'){
    Object.keys(platform.links).forEach(key=>{
      const n=Number(key);
      if(Number.isInteger(n)&&n>=1&&n<=PERT&&platform.links[key])m=Math.max(m,n);
    });
  }
  return m||1;
}
function openD(kind,key,tab,pert){
  if(kind==='student')PROFILE_EDITING=false;
  D={kind:kind,key:key,tab:tab||(kind==='course'||kind==='attendance'?'absen':kind==='student'?'kehadiran':'main'),pert:(kind==='course'||kind==='attendance')?(pert||defaultPert(key)):null,confirmDel:null,newOpen:false,pending:{},smode:{}};
  renderDialog(true);
  if(!dlg.open)dlg.showModal();
}
function renderDialog(force){
  if(!D)return;
  if(!force){const a=document.activeElement;if(a&&dlg.contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))return;}
  const sc=box.scrollTop;
  if(D.kind==='course')box.innerHTML=courseDlg();
  else if(D.kind==='attendance')box.innerHTML=scheduleAttendanceDlg();
  else if(D.kind==='student')box.innerHTML=studentDlg();
  else if(D.kind==='pit')box.innerHTML=pitDlg();
  else if(D.kind==='sektor')box.innerHTML=sektorDlg();
  else if(D.kind==='hasil')box.innerHTML=hasilDlg();
  else if(D.kind==='group-hasil')box.innerHTML=groupHasilDlg();
  else if(D.kind==='recap-files')box.innerHTML=recapFilesDlg();
  else box.innerHTML=loginDlg();
  box.scrollTop=sc;
}

function scheduleAttendanceDlg(){
  const c=S.co[D.key];
  if(!c)return '<div class="db"><button type="button" class="btn" data-act="close">Tutup</button><p class="empty">Mata kuliah tidak ditemukan.</p></div>';
  return '<div class="dh" style="--tc:'+colr(c.warna)+'"><button type="button" class="x" data-act="close" aria-label="Tutup">&times;</button><div class="dk">'+esc(c.k)+' · ABSENSI</div><h2 id="dtitle">Isi Absen · '+esc(c.nama)+'</h2><p class="jadwal">'+esc(hariLabel(c))+' '+esc(c.jam)+' · '+esc(c.ruang)+'</p></div><div class="db">'+absenStudent(c,true)+'</div>';
}
function exportTools(segment){
  if(!ME&&!adm())return '';
  let opts='<option value="all">Seluruh pertemuan</option><option value="range">Rentang pertemuan</option>';
  for(let i=1;i<=PERT;i++)opts+='<option value="'+i+'">Pertemuan '+i+'</option>';
  let rangeOpts='';
  for(let i=1;i<=PERT;i++)rangeOpts+='<option value="'+i+'">Pertemuan '+i+'</option>';
  const title=segment==='absen'?'Rekap absensi':'Rekap pengumpulan tugas';
  const ownerScope=adm()&&ME?'<label class="export-scope">Data<select data-export-owner="'+segment+'"><option value="class">Seluruh kelas</option><option value="personal">Data pribadi saya</option></select></label>':'';
  return '<section class="export-tools" aria-label="'+title+'">'+
    '<div class="export-tools-head"><b>'+title+'</b><span class="s">'+(adm()?'Pengelola dapat memilih rekap kelas atau data pribadinya':'Ekspor data pribadi')+'</span></div>'+
    '<div class="export-tools-controls">'+ownerScope+'<label class="export-scope">Cakupan<select data-export-scope="'+segment+'">'+opts+'</select></label>'+
    '<div data-export-range="'+segment+'" hidden style="display:none;gap:12px;flex-wrap:wrap;align-items:end">'+
    '<label class="export-scope">Dari<select data-export-start="'+segment+'">'+rangeOpts+'</select></label>'+
    '<label class="export-scope">Sampai<select data-export-end="'+segment+'" selected>'+rangeOpts+'</select></label></div>'+
    '<div class="export-formats" aria-label="Format unduhan">'+
    '<button type="button" class="btn sm" data-export-segment="'+segment+'" data-export-format="xlsx">XLSX</button>'+
    '<button type="button" class="btn sm" data-export-segment="'+segment+'" data-export-format="csv">CSV</button>'+
    '<button type="button" class="btn sm" data-export-segment="'+segment+'" data-export-format="pdf">PDF</button></div></div>'+
    '<p class="s export-note">Pilih seluruh pertemuan, satu pertemuan, atau rentang pertemuan. Mahasiswa hanya dapat mengekspor datanya sendiri.</p></section>';
}
function buildCourseRecap(segment,format){
  if(!D||D.kind!=='course'||!['absen','tugas'].includes(segment))return;
  const c=S.co[D.key];
  if(!c){toast('Mata kuliah tidak ditemukan.');return;}
  const select=dlg.querySelector('[data-export-scope="'+segment+'"]');
  const scope=select?select.value:'all',admin=adm();
  const startSelect=dlg.querySelector('[data-export-start="'+segment+'"]');
  const endSelect=dlg.querySelector('[data-export-end="'+segment+'"]');
  const rangeStart=Number(startSelect&&startSelect.value||1);
  const rangeEnd=Number(endSelect&&endSelect.value||PERT);
  if(scope==='range'&&(!Number.isInteger(rangeStart)||!Number.isInteger(rangeEnd)||rangeStart<1||rangeEnd>PERT||rangeStart>rangeEnd)){
    toast('Rentang tidak valid. Pastikan pertemuan awal tidak lebih besar dari pertemuan akhir.');return;
  }
  const scopeLabel=scope==='all'?'Seluruh pertemuan':scope==='range'?'Pertemuan '+rangeStart+'–'+rangeEnd:'Pertemuan '+scope;
  const includesMeeting=meeting=>scope==='all'||(scope==='range'?meeting!==null&&meeting>=rangeStart&&meeting<=rangeEnd:meeting===Number(scope));
  const ownerSelect=admin?dlg.querySelector('[data-export-owner="'+segment+'"]'):null;
  const personalExport=!!(admin&&ME&&ownerSelect&&ownerSelect.value==='personal');
  const exportAll=admin&&!personalExport;
  const studentNos=exportAll?Array.from({length:N},(_,i)=>i+1):(ME?[Number(ME)]:[]);
  let headers=[],rows=[];
  if(segment==='absen'){
    headers=['Mata Kuliah','Pertemuan Ke-','Tanggal Pertemuan','No. Absen','Nama Mahasiswa','Status Kehadiran','Bukti Absensi'];
    const meetings=scope==='all'?Array.from({length:PERT},(_,i)=>i+1):scope==='range'?Array.from({length:rangeEnd-rangeStart+1},(_,i)=>rangeStart+i):[Number(scope)];
    meetings.forEach(meeting=>{
      const se=S.se[c.k+'_'+PAD(meeting)]||{},present=se.present||{},proof=se.bukti||{};
      studentNos.forEach(no=>{
        const status=present[no]||'',file=proof[no]||{};
        rows.push([c.nama,'Pertemuan '+meeting,se.tanggal||meetingDate(meeting),no,nameOf(no),status?(LBL[status]||status):attendanceMissingStatus(meeting,se,false,c.k),file.name||(file.id?'Bukti terlampir':'—')]);
      });
    });
  }else{
    headers=['Mata Kuliah','Pertemuan Ke-','Tanggal Pengumpulan','No. Absen','Nama Mahasiswa','Status Pengumpulan','Bukti Tugas'];
    const tasks=Object.keys(S.tu).map(id=>Object.assign({id:id},S.tu[id])).filter(t=>t.k===c.k);
    const meetingOf=t=>{
      const direct=Number(t.meeting_number||t.pertemuan||0);
      if(direct>=1&&direct<=PERT)return direct;
      const update=Object.values(S.cu).find(u=>u.course_code===c.k&&String(u.task_title||'').trim()===String(t.judul||'').trim());
      const n=Number(update&&update.meeting_number||0);
      return n>=1&&n<=PERT?n:null;
    };
    const pushTaskRow=(meeting,no,sub)=>{
      const proof=sub&&sub.berkas&&sub.berkas.name||sub&&sub.tautan||'—';
      rows.push([c.nama,meeting?'Pertemuan '+meeting:'—',sub&&sub.at?formatDateTime(sub.at):'—',no,nameOf(no),sub&&sub.at?'Sudah dikumpulkan':'Belum dikumpulkan',proof]);
    };
    tasks.forEach(t=>{
      const meeting=meetingOf(t);
      if(!includesMeeting(meeting))return;
      if(t.mode==='group'){
        constructorGroups(c.k).forEach(g=>{
          const sub=(t.groupSubs||{})[g.id]||null;
          const groupNos=Array.from(new Set((Array.isArray(g.members)?g.members:[]).concat(g.principal?[Number(g.principal)]:[]).map(Number))).filter(no=>Number.isInteger(no)&&no>=1&&no<=N);
          groupNos.filter(no=>exportAll||no===Number(ME)).forEach(no=>pushTaskRow(meeting,no,sub));
        });
      }else{
        studentNos.forEach(no=>pushTaskRow(meeting,no,(t.subs||{})[no]||null));
      }
    });
  }
  if(!rows.length){toast(scope==='all'?'Belum ada data untuk diekspor.':scope==='range'?'Tidak ada data pada rentang pertemuan yang dipilih.':'Tidak ada data pada pertemuan yang dipilih.');return;}
  const safe=s=>String(s||'').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'');
  const scopeFile=scope==='all'?'Seluruh-Pertemuan':scope==='range'?'Pertemuan-'+rangeStart+'-sampai-'+rangeEnd:'Pertemuan-'+scope;
  const filename='Rekap-'+(segment==='absen'?'Absensi':'Pengumpulan-Tugas')+'-'+safe(c.k)+'-'+scopeFile+(personalExport?'-Data-Pribadi':'');
  if(format==='csv'){
    const csv=[headers].concat(rows).map(row=>row.map(value=>'"'+String(value==null?'':value).replace(/"/g,'""')+'"').join(',')).join('\\r\\n');
    const blob=new Blob(['\\ufeff',csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }else if(format==='xlsx'){
    if(!window.XLSX){toast('Pustaka XLSX belum berhasil dimuat. Muat ulang halaman dan coba lagi.');return;}
    const data=[headers].concat(rows),sheet=XLSX.utils.aoa_to_sheet(data);
    sheet['!cols']=headers.map((h,i)=>({wch:Math.min(38,Math.max(12,...data.slice(0,100).map(r=>String(r[i]||'').length+2)))}));
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Rekap');
    XLSX.writeFile(book,filename+'.xlsx');
  }else if(format==='pdf'){
    const JsPDF=window.jspdf&&window.jspdf.jsPDF;
    if(!JsPDF){toast('Pustaka PDF belum berhasil dimuat. Muat ulang halaman dan coba lagi.');return;}
    const doc=new JsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    if(typeof doc.autoTable!=='function'){toast('Komponen tabel PDF belum berhasil dimuat. Muat ulang halaman dan coba lagi.');return;}
    doc.setFont('helvetica','bold');doc.setFontSize(13);
    doc.text(segment==='absen'?'Rekap Absensi':'Rekap Pengumpulan Tugas',14,13);
    doc.setFont('helvetica','normal');doc.setFontSize(8);
    doc.text('Mata kuliah: '+c.nama+' ('+c.k+') · '+scopeLabel+' · Diekspor '+formatDateTime(Date.now()),14,19);
    doc.autoTable({startY:23,head:[headers],body:rows,theme:'grid',styles:{font:'helvetica',fontSize:7,cellPadding:1.8,overflow:'linebreak'},headStyles:{fontSize:7},margin:{left:10,right:10,bottom:12},horizontalPageBreak:true,horizontalPageBreakRepeat:0});
    doc.save(filename+'.pdf');
  }
  toast('Rekap berhasil diunduh.');
}

// Library ekspor hanya dimuat ketika format terkait benar-benar digunakan.
const exportScriptPromises = new Map();

function loadExportScript(src, isReady) {
  if (isReady()) return Promise.resolve();
  if (exportScriptPromises.has(src)) return exportScriptPromises.get(src);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      if (isReady()) resolve();
      else {
        exportScriptPromises.delete(src);
        script.remove();
        reject(new Error('Library tidak terinisialisasi: ' + src));
      }
    };
    script.onerror = () => {
      exportScriptPromises.delete(src);
      script.remove();
      reject(new Error('Gagal memuat library: ' + src));
    };
    document.head.appendChild(script);
  });

  exportScriptPromises.set(src, promise);
  return promise;
}

async function loadExportLibrary(format) {
  if (format === 'xlsx') {
    await loadExportScript(
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      () => !!window.XLSX
    );
    return;
  }

  if (format === 'pdf') {
    await loadExportScript(
      'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
      () => !!window.jspdf?.jsPDF
    );
    await loadExportScript(
      'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
      () => !!window.jspdf?.jsPDF?.API?.autoTable
    );
  }
}

async function exportCourseRecap(segment,format){
  showLoading('Menyiapkan file rekap…');
  try{
    // Beri browser dua frame agar modal loading sempat tampil.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(format==='xlsx'||format==='pdf') await loadExportLibrary(format);
    buildCourseRecap(segment,format);
  }catch(e){
    console.error('Gagal mengekspor rekap:',e);
    toast('Gagal memuat pustaka atau membuat file rekap. Periksa koneksi dan coba lagi.');
  }finally{
    hideLoading();
  }
}

function courseDlg(){
  const c=S.co[D.key];
  if(!c)return '<div class="db"><button type="button" class="btn" data-act="close">Tutup</button><p class="empty">Mata kuliah tidak ditemukan.</p></div>';
  const head='<div class="dh" style="--tc:'+colr(c.warna)+'"><button type="button" class="x" data-act="close" aria-label="Tutup">&times;</button>'+
    '<div class="dk">'+esc(c.k)+' · '+esc(c.sks)+' SKS</div><h2 id="dtitle">'+esc(c.nama)+'</h2>'+
    '<ul class="dosen">'+dosenHtml(c)+'</ul><p class="jadwal">'+esc(hariLabel(c))+' '+esc(c.jam)+' · '+esc(c.ruang)+'</p>'+driveBtn(c.k)+'</div>';
  const tabs=[['absen','Absen'],['tugas','Tugas']];
  if(adm())tabs.push(['set','Pengaturan']);
  if(D.tab==='set'&&!adm())D.tab='absen';
  let body;
  if(D.tab==='tugas')body=adm()?tugasAdmin(c):tugasStudent(c);
  else if(D.tab==='set'&&adm())body=settingsHtml(c);
  else body=adm()?absenAdmin(c):absenStudent(c);
  if(D.tab==='absen'||D.tab==='tugas')body=adm()?exportTools(D.tab)+body:body+exportTools(D.tab);
  return head+tabsHtml(tabs)+'<div class="db">'+body+'</div>';
}
function pertPicker(c,mode){
  const n=D.pert;
  let h='<div><div class="lbl" style="margin-bottom:8px">Pertemuan</div><div class="pts" role="group" aria-label="Pilih pertemuan">';
  for(let i=1;i<=PERT;i++){
    const s2=S.se[c.k+'_'+PAD(i)],p=(s2&&s2.present)||{};
    let has=false,sv='';
    if(mode==='adm')has=!!(s2&&Object.values(p).some(Boolean));
    else if(ME&&p[ME]){has=true;sv=p[ME];}
    const phase=i<=7?'Pra-UTS':i===8?'UTS':'';
    h+='<button type="button" class="pt'+(has?' has':'')+(i<=8?' meeting-past':'')+(i===8?' meeting-uts':'')+'"'+(sv?' data-s="'+sv+'"':'')+' data-act="pert" data-n="'+i+'" aria-pressed="'+(i===n)+'" aria-label="Pertemuan '+i+', '+phase+', '+fmtDate(meetingDate(i))+(i<=8?', Pertemuan ini sudah terlewat':'')+'"><span>'+i+'</span>'+(phase?'<small>'+phase+'</small>':'')+'</button>';
  }
  return h+'</div></div>';
}

function absenStudent(c,scheduleMode){
  const n=D.pert,se=S.se[c.k+'_'+PAD(n)]||{},p=se.present||{},mine=ME?(p[ME]||''):'';
  let h=scheduleMode?'':pertPicker(c,'mhs');
  if(se.tanggal||se.topik||attendanceIsPast(n,se,c.k))h+='<p class="empty"><b>Pertemuan '+n+'</b> · '+fmtDate(se.tanggal||meetingDate(n))+(se.topik?' · '+esc(se.topik):'')+(attendanceIsPast(n,se,c.k)?' · <b>Pertemuan ini sudah terlewat</b>':'')+'</p>';
  if(!ME)return h+'<p class="empty">Masuk untuk melihat riwayat absensi pribadi.</p>';
  const bk=se.bukti&&se.bukti[ME],label=mine?(LBL[mine]||mine):attendanceMissingStatus(n,se,true,c.k);
  h+='<div class="tcard"><div><b>Riwayat absensi saya · Pertemuan '+n+'</b><br><span class="s">No. '+ME+' · '+esc(nameOf(ME))+'</span></div><p class="sum"><span>Status: <b>'+esc(label)+'</b></span></p>'+
    (se&&Object.keys(se).length&&!se.closed&&isPlatformCourse(c)&&inSession(c)&&platOf(c.k,n)?'<div class="drv"><p class="s"><b>Sudah Mengerjakan Forum Diskusi?</b></p><div class="row2"><button type="button" class="btn sm pri" data-act="forum-done" data-k="'+esc(c.k)+'">Sudah</button><button type="button" class="btn sm" data-act="forum-not-done" data-k="'+esc(c.k)+'">Belum</button></div></div>':'')+
    (bk&&bk.id?'<div><b class="s">Bukti absensi</b>'+fileHtml(bk)+'</div>':'<span class="s">Tidak ada bukti yang dilampirkan pada pertemuan ini.</span>')+'</div>';
  const a=stats(ME).by[c.k]||{h:0,t:0};
  h+='<p class="sum"><span>Hadir '+a.h+' dari '+a.t+' pertemuan terisi</span></p>';
  return h;
}
function absenAdmin(c){
  const n=D.pert,se=S.se[c.k+'_'+PAD(n)]||null,p=(se&&se.present)||{},bk=(se&&se.bukti)||{};
  const cnt={H:0,I:0,S:0,A:0,K:0};
  for(let i=1;i<=N;i++){if(cnt[p[i]]!==undefined)cnt[p[i]]++;}
  const rec=cnt.H+cnt.I+cnt.S+cnt.A+cnt.K;
  let h=pertPicker(c,'adm');
   h+='<div class="row2 manager-task-actions"><span class="s">'+(se&&se.closed?'Absensi ditutup pengelola':'Absensi terbuka')+'</span><button type="button" class="btn sm" data-act="attendance-close-toggle" data-k="'+esc(c.k)+'" data-n="'+n+'" data-closed="'+(se&&se.closed?'true':'false')+'">'+(se&&se.closed?'Buka kembali absensi':'Tutup Absensi')+'</button></div>';
  if((se&&(se.tanggal||se.topik))||attendanceIsPast(n,se,c.k))h+='<p class="empty"><b>Pertemuan '+n+'</b> · '+fmtDate(se&&se.tanggal||meetingDate(n))+(se&&se.topik?' · '+esc(se.topik):'')+(attendanceIsPast(n,se,c.k)?' · <b>Pertemuan ini sudah terlewat</b>':'')+'</p>';
  if(!se)h+='<p class="empty"><b>'+esc(attendanceMissingStatus(n,se,false,c.k))+'.</b> Data kehadiran untuk pertemuan ini belum dibuat.</p>';
  else h+='<p class="sum"><span>H · Hadir '+cnt.H+'</span><span>KB · Kelas Berjalan '+cnt.K+'</span><span>I · Izin '+cnt.I+'</span><span>S · Sakit '+cnt.S+'</span><span>A · Alpa '+cnt.A+'</span><span>Belum diisi '+(N-rec)+'</span></p>';
  if(ME&&se&&n===defaultPert(c.k)&&!se.closed&&isPlatformCourse(c)&&inSession(c)&&platOf(c.k,n)){
    const ownStatus=p[ME]?(LBL[p[ME]]||p[ME]):attendanceMissingStatus(n,se,true,c.k);
    h+='<div class="tcard manager-forum-check"><div><b>Sudah Mengerjakan Forum Diskusi?</b><br><span class="s">Konfirmasi forum diskusi untuk akun pengelola sendiri · '+esc(nameOf(ME))+'</span></div><p class="sum"><span>Status absensi saya: <b>'+esc(ownStatus)+'</b></span></p><div class="row2"><button type="button" class="btn sm pri" data-act="forum-done" data-k="'+esc(c.k)+'">Sudah</button><button type="button" class="btn sm" data-act="forum-not-done" data-k="'+esc(c.k)+'">Belum</button></div></div>';
  }
  const canConfirmPlatform=!!(se&&!se.closed&&isPlatformCourse(c)&&n===defaultPert(c.k)&&inSession(c)&&platOf(c.k,n));
  h+='<ol class="alist">';
  for(let i=1;i<=N;i++){
    const status=p[i]?(LBL[p[i]]||p[i]):attendanceMissingStatus(n,se,false,c.k);
    h+='<li class="arow'+(ME===i?' mine-row':'')+'"><span class="an">'+i+'</span><span class="aav">'+photo('s'+PAD(i))+'</span><span class="anm">'+esc(nameOf(i))+'<br><span class="s">'+esc(status)+'</span>'+(bk[i]&&bk[i].id?'<br>'+fileHtml(bk[i],true):'')+'</span>'+(canConfirmPlatform?'<div class="row2 manager-student-attendance"><button type="button" class="btn sm pri" data-act="manager-forum-student" data-k="'+esc(c.k)+'" data-n="'+n+'" data-student="'+i+'" data-status="done">Sudah</button><button type="button" class="btn sm" data-act="manager-forum-student" data-k="'+esc(c.k)+'" data-n="'+n+'" data-student="'+i+'" data-status="not-done">Belum</button></div>':'')+'</li>';
  }
  return h+'</ol>';
}

/* Tombol absensi pada jadwal menjadi satu-satunya pintu pengisian absensi. */
function scheduleAttendanceState(c,now){
  const currentSession=S.se[c.k+'_'+PAD(defaultPert(c.k))];if(currentSession&&currentSession.closed)return 'closed';
  now=now||new Date();
  if(!onDay(c,jakartaWeekday(now)))return 'future';
  const r=jamRange(c);if(!r)return 'open';
  const p=jakartaParts(now),t=Number(p.hour)*60+Number(p.minute);
  return t<r.s?'future':t>=r.e?'passed':'open';
}
let EXTERNAL_REDIRECT=null;
function openExternalRedirect(url,activity,courseCode,meeting,detail){
  if(!url||!okHttps(url)){toast('Link Mentari belum tersedia atau tidak valid.');return;}
  const course=S.co[courseCode];if(!course){toast('Data mata kuliah tidak ditemukan.');return;}
  const n=Number(meeting)||defaultPert(courseCode),title=detail?String(detail):'';
  EXTERNAL_REDIRECT={url:url};
  let modal=document.getElementById('externalRedirectDialog');
  if(!modal){
    modal=document.createElement('dialog');modal.id='externalRedirectDialog';
    modal.setAttribute('aria-labelledby','externalRedirectTitle');
    modal.style.cssText='width:min(460px,calc(100% - 32px));max-width:460px;border:1px solid var(--line);border-top:3px solid var(--accent);border-radius:14px;padding:0;color:var(--fg);background:var(--surface);box-shadow:0 24px 80px rgba(0,0,0,.48);';
    modal.addEventListener('click',e=>{if(e.target===modal){modal.close();EXTERNAL_REDIRECT=null;}});
    modal.addEventListener('cancel',()=>{EXTERNAL_REDIRECT=null;});
    document.body.appendChild(modal);
    const style=document.createElement('style');style.textContent='#externalRedirectDialog::backdrop{background:rgba(5,5,10,.76);backdrop-filter:blur(3px)}#externalRedirectDialog .erd-body{padding:24px}#externalRedirectDialog .erd-kicker{font-size:11px;letter-spacing:.12em;font-weight:800;color:var(--muted)}#externalRedirectDialog h2{font-size:21px;line-height:1.25;margin:8px 0 14px;color:var(--fg)}#externalRedirectDialog p{font-size:14px;line-height:1.6;margin:0 0 12px;color:var(--fg)}#externalRedirectDialog .erd-note{padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);color:var(--muted);font-size:13px}#externalRedirectDialog .erd-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap;margin-top:20px}#externalRedirectDialog .erd-actions button{min-height:42px}';document.head.appendChild(style);
  }
  modal.innerHTML='<div class="erd-body"><div class="erd-kicker">SEBELUM MELANJUTKAN</div><h2 id="externalRedirectTitle">Konfirmasi sebelum membuka Mentari</h2><p>Kamu akan diarahkan ke <b>Mentari</b> untuk '+esc(activity)+(title?' <b>'+esc(title)+'</b>':'')+' pada mata kuliah <b>'+esc(course.nama)+'</b> (Pertemuan ke-'+n+').</p><p class="erd-note">Jangan lupa kembali ke website ini untuk konfirmasi ulang pengerjaan kamu, ya. Agar data dan riwayat pengerjaan kamu memiliki bukti dan backup di sini.</p><div class="erd-actions"><button type="button" class="btn" data-act="external-redirect-cancel">Kembali</button><button type="button" class="btn pri" data-act="external-redirect-continue">Setuju dan lanjutkan ke Mentari</button></div></div>';
  if(!modal.open)modal.showModal();
}
function absenBtn(c){
  if(!ME)return '';
  const state=scheduleAttendanceState(c),n=defaultPert(c.k),session=S.se[c.k+'_'+PAD(n)],status=session&&session.present&&session.present[ME];
   const range=hariRange(c),weekdayPlatform=!!platConfigOf(c.k)&&range.a==='Senin'&&range.b==='Jumat';
   if(weekdayPlatform){const link=platOf(c.k,n);if(status)return '<div class="tcard attendance-done" role="status" style="margin:0;padding:10px 12px"><b>✓ Kamu sudah absen</b><span class="s">'+esc(c.nama)+' · Pertemuan ke-'+n+'</span></div>';if(!session||!Object.keys(session).length)return '<button type="button" class="btn sm" disabled>Absensi belum dibuka</button>';if(state==='future')return '<button type="button" class="btn sm" disabled>Absensi belum dibuka</button>';if(!link)return '<button type="button" class="btn sm" disabled>Absensi belum dibuka</button>';if(state==='closed')return '<button type="button" class="btn sm" disabled>Absensi ditutup pengelola</button>';if(state==='passed')return '<button type="button" class="btn sm" disabled>Absensi sudah terlewat</button>';return '<button type="button" class="btn sm pri" data-act="platform-attendance-open" data-k="'+esc(c.k)+'" data-n="'+n+'">Isi absen <span aria-hidden="true">&#8599;</span></button>';}
  if(status)return '<div class="tcard attendance-done" role="status" style="margin:0;padding:10px 12px"><b>✓ Kamu sudah absen</b><span class="s">'+esc(c.nama)+' · Pertemuan ke-'+n+'</span></div>';
  if(!session)return '<button type="button" class="btn sm" disabled>Absensi belum dibuka</button>';
  if(state==='future')return '<button type="button" class="btn sm" disabled>Absensi belum dibuka</button>';
  if(state==='closed')return '<button type="button" class="btn sm" disabled>Absensi ditutup pengelola</button>';
  if(state==='passed')return '<button type="button" class="btn sm" disabled>Absensi sudah terlewat</button>';
  return '<button type="button" class="btn sm pri" data-act="schedule-attendance" data-k="'+esc(c.k)+'">Isi absen</button>';
}
async function saveScheduleAttendance(k){
  const n=defaultPert(k),id=k+'_'+PAD(n);
  await writeSession(k,n,{present:{[ME]:'H'}});
  const current=S.se[id]||{k:k,n:n,tanggal:'',topik:'',present:{},bukti:{}};
  S.se[id]=Object.assign({},current,{present:Object.assign({},current.present||{},{[ME]:'H'})});
  refreshAll();
}
/* Folder Google Drive tiap mata kuliah (hanya terlihat setelah masuk). */
function driveBtn(k){
  const u=driveOf(k);
  return u&&(ME||adm())?'<p class="drv"><a class="btn sm" href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">Folder Drive mata kuliah <span aria-hidden="true">&#8599;</span></a></p>':'';
}
/* Cara mengumpulkan tugas: "file" (unggah langsung) atau "link" (Google Drive dll.). Bawaan: link, kecuali pengumpulan lama berupa file. */
function smodeOf(id,mine){
  const m=D&&D.smode&&D.smode[id];
  if(m==='file'&&!AS)return 'link';
  if(m)return m;
  return mine&&mine.berkas&&mine.berkas.id&&!mine.tautan&&AS?'file':'link';
}
/* Tombol tugas: "Kerjakan" membuka soal (LMS kampus / PDF / dll.), "Kumpulkan" mengirim file atau tautan hasil tugas. */
function taskActions(t,mine){
  const id=t.id,open=D.subOpen===id,locked=isLocked(t),can=ME&&canWrite&&!locked,platform=isPlatformCourse(S.co[t.k]);
  if(platform){
    let h='<div class="platform-task-check">';
    if(mine)h+='<p class="tdone"><b>&#10003; Tugas platform telah dikonfirmasi selesai.</b><br><span class="s">Dikonfirmasi '+fmtTime(mine.at)+'</span></p>';
    else if(can)h+='<p class="s"><b>Apakah kamu sudah mengerjakan pre-test sampai kuesioner Mentari?</b></p><div class="row2"><button type="button" class="btn sm pri" data-act="platform-task-done" data-id="'+esc(id)+'">Ya</button><button type="button" class="btn sm" data-act="platform-task-not-done" data-id="'+esc(id)+'">Belum</button></div>';
    return h+'</div>';
  }
  let h='<div class="row2 tact">'+(locked&&!mine?'<span class="dnfb">'+(t.closed?'DITUTUP':'DNF')+'</span><span class="s">'+(t.closed?'Tugas ditutup pengelola.':'Tenggat sudah lewat. Pengumpulan ditutup.')+'</span>':'');
  if((ME||adm())&&!locked)h+=(t.link&&okUrl(t.link)?'<a class="btn sm" href="'+esc(t.link)+'" target="_blank" rel="noopener noreferrer">Kerjakan <span aria-hidden="true">&#8599;</span></a>':'<span class="s">Soal belum ditautkan oleh dosen.</span>');
  if(can)h+='<button type="button" class="btn sm pri" data-act="tsub-open" data-id="'+esc(id)+'" aria-expanded="'+open+'">'+(mine?'Ubah pengumpulan':'Kumpulkan')+'</button>';
  h+='</div>';
  if(mine&&!open)h+='<div class="tdone"><span class="s">Terkumpul '+fmtTime(mine.at)+':</span> '+(okUrl(mine.tautan)?'<a class="lnk2" href="'+esc(mine.tautan)+'" target="_blank" rel="noopener noreferrer">'+(okDrive(mine.tautan)?'Buka file di Google Drive':'Buka tautan tugas')+'</a>':esc(mine.tautan||''))+(mine.berkas&&mine.berkas.id?' '+fileHtml(mine.berkas,true):'')+(mine.catatan?'<br><span class="s">'+esc(mine.catatan)+'</span>':'')+'</div>';
  if(open&&can){
    const mode=smodeOf(id,mine),pf=(D.pending&&D.pending[id])||(mine&&mine.berkas&&mine.berkas.id?mine.berkas:null);
    h+='<div class="tform"><div><div class="lbl" style="margin-bottom:8px">Cara mengumpulkan</div><div class="row2" role="group" aria-label="Cara mengumpulkan">'+
      '<button type="button" class="btn sm" data-act="smode" data-id="'+esc(id)+'" data-m="file" aria-pressed="'+(mode==='file')+'"'+(AS?'':' disabled')+'>Unggah file</button>'+
      '<button type="button" class="btn sm" data-act="smode" data-id="'+esc(id)+'" data-m="link" aria-pressed="'+(mode==='link')+'">Tautan (Drive dll.)</button></div></div>';
    if(mode==='file'){
      h+='<div class="field"><span class="lbl">Berkas tugas</span><div class="row2"><label class="btn sm pickfile">'+(pf?'Ganti berkas':'Pilih berkas')+'<input type="file" accept="image/*,application/pdf" data-file="tugas" data-id="'+esc(id)+'"></label><span class="s">'+(pf?esc(pf.name):'Belum ada berkas dipilih')+'</span></div><span class="s">Foto (JPG, PNG, WebP) atau PDF, maksimal 20 MB. Tekan Kirim setelah berkas siap.</span></div>';
    }else{
      h+=(driveOf(t.k)?'<div class="row2"><a class="btn sm" href="'+esc(driveOf(t.k))+'" target="_blank" rel="noopener noreferrer">Buka folder Drive '+esc(t.k)+' <span aria-hidden="true">&#8599;</span></a><span class="s">Unggah file tugas ke folder ini, lalu tempel tautannya di bawah.</span></div>':'')+
        '<div class="field"><label for="sl-'+esc(id)+'">Tautan tugas</label><input id="sl-'+esc(id)+'" data-dr="sl-'+esc(id)+'" type="url" inputmode="url" placeholder="https://drive.google.com/…" value="'+esc(dv('sl-'+id,mine&&mine.tautan||''))+'"><span class="s">Boleh Google Drive, Dropbox, GitHub, dan sebagainya, asalkan diawali https://. Untuk Google Drive: Bagikan, atur &quot;Siapa saja yang memiliki link&quot; (Viewer), lalu tempel tautannya di sini.</span></div>';
    }
    h+='<div class="field"><label for="sc-'+esc(id)+'">Catatan (opsional)</label><textarea id="sc-'+esc(id)+'" data-dr="sc-'+esc(id)+'" maxlength="500">'+esc(dv('sc-'+id,mine&&mine.catatan||''))+'</textarea></div>'+
      '<div class="row2"><button type="button" class="btn pri" data-act="tsub" data-id="'+esc(id)+'">'+(mine?'Perbarui':'Kirim')+'</button><button type="button" class="btn" data-act="tsub-open" data-id="'+esc(id)+'">Batal</button></div></div>';
  }
  return h;
}
function tugasStudent(c){
  const all=Object.keys(S.tu).map(id=>Object.assign({id:id},S.tu[id])).filter(t=>t.k===c.k),active=taskList().filter(t=>t.k===c.k),history=all.filter(t=>isLocked(t)).sort((x,y)=>(y.tenggat||'').localeCompare(x.tenggat||''));
  if(!active.length&&!history.length)return '<p class="empty">Belum ada tugas untuk mata kuliah ini.</p>';
  let h='';if(!ME)h+='<div class="mine"><div><b>Masuk untuk mengerjakan dan mengumpulkan tugas</b><span class="s">Pilih nomor absen Anda terlebih dahulu.</span></div><button type="button" class="btn pri" data-act="open-login">Masuk / Daftar</button></div>';
  const renderTask=t=>{const mine=ME&&t.subs?t.subs[ME]:null,late=isLocked(t);if(t.mode==='group'){const g=myConstructor(ME,t.k),sub=g&&t.groupSubs?t.groupSubs[g.id]:null,principal=g&&Number(g.principal)===Number(ME);return groupTaskCard(t,g,sub,principal);}return '<article class="tcard"><div class="row2" style="justify-content:space-between"><h3>'+esc(t.judul)+'</h3><span>'+(t.tenggat?'<span class="chip'+(late?' late':'')+'">'+(t.closed?'Ditutup pengelola · ':'')+(late&&!t.closed?'Lewat tenggat ':'Tenggat ')+fmtDate(t.tenggat)+'</span>':'<span class="chip">Tanpa tenggat</span>')+(mine?' <span class="chip done">Sudah dikumpulkan</span>':'')+'</span></div>'+(t.deskripsi?'<p>'+esc(t.deskripsi)+'</p>':'')+(late?'':taskActions(t,mine))+'</article>';};
  if(active.length)h+='<h3 class="ph3">Tugas aktif</h3>'+active.map(renderTask).join('');else h+='<p class="empty">Tidak ada tugas aktif.</p>';
  if(!ME)return h;
  if(history.length)h+='<details class="task-history"><summary>Riwayat tugas ('+history.length+')</summary>'+history.map(renderTask).join('')+'</details>';return h;
}
function tugasAdmin(c){
  const list=Object.keys(S.tu).map(id=>Object.assign({id:id},S.tu[id])).filter(t=>t.k===c.k).sort((a,b)=>(a.tenggat||'9999').localeCompare(b.tenggat||'9999'));
  const active=list.filter(t=>!isLocked(t)),history=list.filter(t=>isLocked(t));
  let h='';
  if(!list.length)return '<p class="empty">Belum ada tugas untuk mata kuliah ini.</p>';
  const renderTask=t=>{
    const subs=t.subs||{},cnt=Object.keys(subs).filter(no=>/^(?:[1-9]|[12]\d|3[0-2])$/.test(no)).length,late=isLocked(t),closeControl=(!late||t.closed)?'<button type="button" class="btn sm" data-act="task-close-toggle" data-id="'+esc(t.id)+'" data-closed="'+(t.closed?'true':'false')+'">'+(t.closed?'Buka kembali':'Tutup Tugas')+'</button>':'';
    const taskUrl=(t.link&&okUrl(t.link))?t.link:(isPlatformCourse(c)?platOf(c.k):'');
    const taskAction=taskUrl?'<a class="btn sm" href="'+esc(taskUrl)+'" target="_blank" rel="noopener noreferrer">Kerjakan <span aria-hidden="true">&#8599;</span></a>':'<span class="s">Tautan instruksi belum diatur.</span>';
    if(t.mode==='group'){
      const groups=constructorGroups(t.k),gc=groups.length,done=Object.keys(t.groupSubs||{}).filter(gid=>groups.some(g=>g.id===gid)).length;
      const managerCard='<article class="tcard"><div class="row2" style="justify-content:space-between"><h3>'+esc(t.judul)+'</h3><span class="chip">Kelompok</span></div>'+
        (late?'<span class="chip late">'+(t.closed?'Ditutup pengelola':'Masuk riwayat')+'</span>':'')+(t.tenggat?'<p class="s">Tenggat '+fmtDate(t.tenggat)+'</p>':'')+
        (t.deskripsi?'<p>'+esc(t.deskripsi)+'</p>':'')+
        '<div><div class="track"><i style="width:'+Math.round((gc?done/gc:0)*100)+'%"></i></div><span class="s">'+done+' dari '+gc+' Constructor sudah mengumpulkan</span></div>'+
        '<div class="row2 manager-task-actions">'+taskAction+closeControl+'</div>'+
        '<details><summary>Lihat pengumpulan kelompok ('+done+')</summary><ul class="subs">'+Object.keys(t.groupSubs||{}).filter(gid=>groups.some(g=>g.id===gid)).map(gid=>{const g=S.cs[gid]||{},principal=Number(g.principal)||null,sub=t.groupSubs[gid];return '<li><b>'+esc(g.name||gid)+'</b> · Team Principal: '+esc(principal?nameOf(principal):'—')+' · '+fmtTime(sub.at)+(okUrl(sub.tautan)?'<br><a href="'+esc(sub.tautan)+'" target="_blank" rel="noopener noreferrer">Buka pengumpulan</a>':(sub.berkas&&sub.berkas.id?'<br>'+fileHtml(sub.berkas):''))+(sub.catatan?'<br>'+esc(sub.catatan):'')+'</li>';}).join('')+'</ul></details></article>';
      const ownGroup=ME?myConstructor(ME,t.k):null,ownSub=ownGroup&&t.groupSubs?t.groupSubs[ownGroup.id]:null;
      return '<div class="admin-task-stack">'+managerCard+(ME?'<div class="admin-own-submission"><p class="s"><b>Pengumpulan akun mahasiswa · No. '+esc(ME)+'</b></p>'+groupTaskCard(t,ownGroup,ownSub,!!(ownGroup&&Number(ownGroup.principal)===Number(ME)))+'</div>':'')+'</div>';
    }
    const keys=Object.keys(subs).filter(no=>/^(?:[1-9]|[12]\d|3[0-2])$/.test(no)).map(Number).sort((a,b)=>a-b);
    const mine=ME&&subs[ME]?subs[ME]:null;
    const ownActions=ME?'<div class="admin-own-submission"><p class="s"><b>Pengumpulan akun mahasiswa · No. '+esc(ME)+'</b></p>'+taskActions(t,mine)+'</div>':'';
    return '<article class="tcard"><div class="row2" style="justify-content:space-between"><h3>'+esc(t.judul)+'</h3>'+
      (t.closed?'<span class="chip late">Ditutup pengelola</span>':t.tenggat?'<span class="chip'+(late?' late':'')+'">'+(late?'Riwayat · ':'Tenggat ')+fmtDate(t.tenggat)+'</span>':'<span class="chip">Tanpa tenggat</span>')+'</div>'+
      (t.deskripsi?'<p>'+esc(t.deskripsi)+'</p>':'')+
      '<div class="row2 manager-task-actions">'+taskAction+closeControl+'</div>'+
      '<div><div class="track" aria-hidden="true"><i style="width:'+Math.round(cnt/N*100)+'%"></i></div><span class="s">'+cnt+' dari '+N+' mahasiswa sudah mengumpulkan</span></div>'+
      ownActions+
      '<details><summary>Lihat pengumpulan ('+cnt+')</summary><ul class="subs" style="margin-top:8px">'+
      (keys.length?keys.map(no=>{const sub=subs[no];return '<li><b>No. '+no+' · '+esc(nameOf(no))+'</b> · '+fmtTime(sub.at)+(okUrl(sub.tautan)?'<br><a href="'+esc(sub.tautan)+'" target="_blank" rel="noopener noreferrer">'+esc(sub.tautan)+'</a>':(sub.tautan?'<br>'+esc(sub.tautan):''))+(sub.catatan?'<br>'+esc(sub.catatan):'')+(sub.berkas&&sub.berkas.id?'<br>'+fileHtml(sub.berkas):'')+'</li>';}).join(''):'<li>Belum ada yang mengumpulkan.</li>')+'</ul></details></article>';
  };
  if(active.length)h+='<h3 class="ph3">Tugas aktif</h3>'+active.map(renderTask).join('');
  else h+='<p class="empty">Tidak ada tugas aktif.</p>';
  if(history.length)h+='<details class="task-history"><summary>Riwayat tugas ('+history.length+')</summary>'+history.map(renderTask).join('')+'</details>';
  return h;
}
function settingsHtml(c){
  const plat=!!platConfigOf(c.k);
  return '<div class="fgrid">'+
    '<div class="field" style="grid-column:1/-1"><label for="f-nama">Nama mata kuliah</label><input id="f-nama" type="text" maxlength="80" value="'+esc(c.nama)+'"></div>'+
    '<div class="field" style="grid-column:1/-1"><label for="f-dosen">Dosen pengampu</label><input id="f-dosen" type="text" maxlength="60" value="'+esc(dn(c))+'"></div>'+
    '<div class="field"><label for="f-sks">SKS</label><input id="f-sks" type="number" min="1" max="6" value="'+esc(c.sks)+'"></div>'+
    '<div class="field"><label for="f-hari">Hari mulai</label><select id="f-hari">'+HARI.map(x=>'<option'+(x===hariRange(c).a?' selected':'')+'>'+x+'</option>').join('')+'</select></div>'+
    '<div class="field"><label for="f-hari2">Sampai hari (opsional)</label><select id="f-hari2"><option value="">Hanya satu hari</option>'+HARI.map(x=>'<option'+(x===hariRange(c).b?' selected':'')+'>'+x+'</option>').join('')+'</select><span class="s">Untuk mata kuliah yang berlangsung beberapa hari, misalnya Senin sampai Jumat.</span></div>'+
    '<div class="field"><label for="f-jam">Jam</label><input id="f-jam" type="text" maxlength="20" value="'+esc(c.jam)+'"></div>'+
    '<div class="field"><label for="f-tipe">Tipe ruang</label><select id="f-tipe"><option value="ruangan"'+(plat?'':' selected')+'>Ruangan</option><option value="platform"'+(plat?' selected':'')+'>Platform</option></select></div>'+
    '<div class="field"><label for="f-ruang" id="f-ruang-l">'+(plat?'Nama platform':'Nama ruangan')+'</label><input id="f-ruang" type="text" maxlength="20" value="'+esc(c.ruang)+'" placeholder="'+(plat?'Contoh: Zoom':'Contoh: R.301')+'"></div>'+
    '<div class="field" style="grid-column:1/-1"><label for="f-drive">Folder Google Drive mata kuliah</label><input id="f-drive" type="url" inputmode="url" maxlength="500" placeholder="https://drive.google.com/drive/folders/…" value="'+esc(driveOf(c.k))+'"><span class="s">Hanya terlihat oleh yang sudah masuk. Atur akses folder agar mahasiswa bisa menambah file (Editor) atau melihat (Viewer).</span></div>'+
    '<div class="field"><label for="f-warna">Warna kartu</label><input id="f-warna" type="color" value="'+colr(c.warna)+'"></div></div>'+
    '<div class="row2"><button type="button" class="btn pri" data-act="save-course">Simpan perubahan</button></div>'+
    '<div><div class="lbl" style="margin-bottom:8px">Gambar</div><div class="row2">'+
    '<label class="btn pickfile">Unggah logo mata kuliah<input type="file" accept="image/*" data-up="c_'+esc(c.k)+'" data-kind="logo"></label>'+
    (S.md['c_'+c.k]?'<button type="button" class="btn" data-act="img-del" data-key="c_'+esc(c.k)+'">Hapus logo</button>':'')+
    '<label class="btn pickfile">Foto dosen<input type="file" accept="image/*" data-up="d_'+esc(c.k)+'" data-kind="avatar"></label>'+
    (S.md['d_'+c.k]?'<button type="button" class="btn" data-act="img-del" data-key="d_'+esc(c.k)+'">Hapus foto dosen</button>':'')+
    '</div></div>';
}

function studentAttendanceTab(no){
  const st=stats(no),sx=sektorData(),row=sx.byNo[no],delta=attendanceDelta(sx,no),performance=sectorPerformance(sx,no);
  const best=performance[0],weak=performance[performance.length-1],overall=pct(st.tot.h,st.tot.t);
  let h='<div class="race-report-kicker">ATTENDANCE REPORT</div>'+
    '<div class="race-report-stats">'+
      '<article><small>KEHADIRAN</small><b>'+(overall==null?'—':overall+'%')+'</b><span>'+st.tot.h+' dari '+st.tot.t+' sesi</span></article>'+
      '<article><small>OVERALL POSITION</small><b>'+(sx.t?'P'+row.rank:'—')+'</b><span>'+(sx.t?'dari '+N+' mahasiswa':'Belum ada peringkat')+'</span></article>'+
      '<article><small>ATTENDANCE DELTA</small><b>'+(delta?delta.label:'—')+'</b><span>'+(delta?'di belakang P'+delta.ahead.rank+' : '+esc(nameOf(delta.ahead.no))+' · '+delta.points.toFixed(1)+' Poin':'Kamu berada di P1 / belum ada data')+'</span></article>'+
    '</div>';
  h+='<section class="race-sector-performance"><div class="race-section-heading"><div><span class="constructor-kicker">SECTOR PERFORMANCE</span><h3 class="ph3">Performa mata kuliah</h3></div></div>';
  if(best){
    h+='<div class="race-highlight-grid"><article class="race-highlight best"><small>SEKTOR TERBAIK</small><b>'+esc(best.k)+' · '+best.cell.p+'%</b><span>'+esc(best.name)+'</span></article>';
    if(weak&&weak.k!==best.k)h+='<article class="race-highlight focus"><small>PERLU DITINGKATKAN</small><b>'+esc(weak.k)+' · '+weak.cell.p+'%</b><span>'+esc(weak.name)+'</span></article>';
    else h+='<article class="race-highlight focus"><small>PERFORMA LAINNYA</small><b>—</b><span>Belum ada mata kuliah lain untuk dibandingkan</span></article>';
    h+='</div>';
  }else h+='<p class="empty">Belum ada sesi absensi tercatat untuk dibandingkan.</p>';
  h+='</section><section class="race-course-section"><h3 class="ph3">Rincian seluruh sektor</h3>';
  if(!performance.length)h+='<p class="empty">Belum ada data kehadiran per mata kuliah.</p>';
  h+='<ul class="rk student-attendance race-course-list">';
  performance.forEach(item=>{
    const cell=item.cell,tone=cell.c||'n';
    h+='<li><span class="c">'+esc(item.k)+'</span><span class="n">'+esc(item.name)+'</span><span class="b track sector-track sector-'+tone+'" aria-label="'+cell.p+' persen"><i style="width:'+cell.p+'%"></i></span><span class="v">'+cell.p+'%</span><small class="race-course-rank">'+(cell.rk?'P'+cell.rk:'—')+'</small></li>';
  });
  return h+'</ul><ul class="pleg student-sector-legend"><li><i class="sxc p"></i>Ungu · 5 teratas</li><li><i class="sxc g"></i>Hijau · 10 berikutnya</li><li><i class="sxc y"></i>Kuning · lainnya</li></ul></section>';
}
function studentResultsTab(no){
  const rows=[];
  Object.keys(S.tu).forEach(id=>{
    const t=S.tu[id],r=hasilData(id),entry=r&&r.done.find(x=>x.no===no);
    // Gunakan timestamp agregat dari /api/hasil; subs milik mahasiswa lain
    // sengaja tidak disertakan dalam data tugas reguler.
    if(!entry)return;
    rows.push({id:id,t:t,at:entry.at,pos:entry.pos});
  });
  rows.sort((x,y)=>(y.at||0)-(x.at||0));
  if(!rows.length)return '<p class="empty">Belum ada riwayat pengumpulan tugas.</p>';
  return '<ul class="student-history">'+rows.map(x=>'<li><span class="student-history-mark">P'+(x.pos||'—')+'</span><span class="student-history-copy"><b>'+esc(x.t.k)+' · '+esc(x.t.judul||'Tugas')+'</b><small>'+fmtTime(x.at)+'</small></span><span class="chip '+(x.pos===1?'done':'')+'">'+(x.pos?'P'+x.pos:'Terkumpul')+'</span></li>').join('')+'</ul>';
}
function studentAchievementsTab(no){
  const sx=sektorData(),row=sx.byNo[no],earlyBird=[],challenger=[];
  Object.keys(S.tu).forEach(id=>{
    const t=S.tu[id],r=hasilData(id),leader=r&&r.done[0];
    if(leader&&leader.no===no)earlyBird.push({t:t,at:leader.at});
    const podium=r&&r.done.find(x=>x.no===no&&((x.pos===2)||(x.pos===3)));
    if(podium)challenger.push({t:t,at:podium.at,pos:podium.pos});
  });
  earlyBird.sort((x,y)=>(y.at||0)-(x.at||0));
  challenger.sort((x,y)=>(y.at||0)-(x.at||0));
  const pole=courseList().filter(course=>row&&row.cells[course.k]&&row.cells[course.k].c==='p');
  let h='<div class="achievement-summary"><div><b>'+earlyBird.length+'</b><small>Early Bird</small></div><div><b>'+challenger.length+'</b><small>Challenger</small></div><div><b>'+pole.length+'</b><small>Pole Position</small></div></div>';
  h+='<h3 class="ph3">Early Bird</h3>';
  h+=earlyBird.length?'<ul class="achievement-list">'+earlyBird.map(x=>'<li><span class="achievement-icon gold">★</span><span><b>'+esc(cname(x.t.k))+' · '+esc(x.t.judul)+'</b><small>P1 · '+fmtTime(x.at)+'</small></span></li>').join('')+'</ul>':'<p class="empty">Belum meraih Early Bird. Jadilah yang pertama mengumpulkan tugas.</p>';
  h+='<h3 class="ph3" style="margin-top:22px">Challenger</h3>';
  h+=challenger.length?'<ul class="achievement-list">'+challenger.map(x=>'<li><span class="achievement-icon '+(x.pos===2?'silver':'bronze')+'">◆</span><span><b>'+esc(cname(x.t.k))+' · '+esc(x.t.judul)+'</b><small>P'+x.pos+' · '+fmtTime(x.at)+'</small></span></li>').join('')+'</ul>':'<p class="empty">Belum meraih Challenger. Selesaikan tugas di posisi P2 atau P3.</p>';
  h+='<h3 class="ph3" style="margin-top:22px">Pole Position</h3>';
  h+=pole.length?'<ul class="achievement-list">'+pole.map(course=>'<li><span class="achievement-icon purple">◆</span><span><b>'+esc(course.nama)+'</b><small>Sektor ungu · 5 besar absensi</small></span></li>').join('')+'</ul>':'<p class="empty">Belum meraih Pole Position. Raih sektor ungu di mata kuliah untuk mendapatkannya.</p>';
  return h;
}
function studentDlg(){
  const no=D.key,s=stu(no),own=ME===no,seeStats=true;
  const canPhoto=canWrite&&(adm()||own),canEditProfile=own&&canWrite,editing=canEditProfile&&PROFILE_EDITING,ac=S.ak[PAD(no)]||{},nim=ac.nim||'';
  let h='<div class="db"><div class="row2" style="justify-content:flex-end"><button type="button" class="btn sm" data-act="close">Tutup</button></div>'+
    '<div class="shead"><div class="student-photo-column"><div class="sbig">'+photo('s'+PAD(no))+fb(no)+'</div><div class="row2 student-photo-actions">'+
    (canPhoto?'<label class="btn sm pickfile">Ganti foto<input type="file" accept="image/*" data-up="s'+PAD(no)+'" data-kind="photo"></label>':'')+
    (canPhoto&&S.md['s'+PAD(no)]?'<button type="button" class="btn sm" data-act="img-del" data-key="s'+PAD(no)+'">Hapus foto</button>':'')+
    (own?'<button type="button" class="btn sm" data-act="me-clear">Keluar</button>':(ME?'':'<button type="button" class="btn sm pri" data-act="login-no" data-no="'+no+'">Masuk sebagai nomor ini</button>'))+
    '</div></div><div><div class="k">NO. '+no+(s&&s.kode?' · '+esc(s.kode):'')+(isAd(no)?' · ADMIN':'')+'</div><h2 id="dtitle">'+esc(nameOf(no))+(isAd(no)?' '+FLAG:'')+'</h2>'+
    ((ME!==null||adm())?'<section class="student-profile-editor"><div class="student-profile-details">'+(nim?'<div><span>NIM</span><i>:</i><b>'+esc(nim)+'</b></div>':'')+'<div><span>Tanggal Lahir</span><i>:</i><b>'+(ac.tanggalLahir?fmtDate(ac.tanggalLahir):'Belum diisi')+'</b></div><div><span>Nomor WhatsApp</span><i>:</i><b>'+(ac.whatsapp?esc(ac.whatsapp):'Belum diisi')+'</b></div></div>'+(editing?'<div class="student-profile-fields"><div class="field"><label for="profile-dob">Tanggal Lahir</label><input id="profile-dob" type="date" max="'+today()+'" value="'+esc(ac.tanggalLahir||'')+'"></div><div class="field"><label for="profile-whatsapp">Nomor WhatsApp</label><input id="profile-whatsapp" type="tel" inputmode="tel" maxlength="18" value="'+esc(ac.whatsapp||'')+'" placeholder="Contoh: 081234567890"></div></div><div class="row2"><button type="button" class="btn sm pri" data-act="profile-save">Simpan</button><button type="button" class="btn sm" data-act="profile-edit-cancel">Batal</button></div>':(canEditProfile?'<button type="button" class="btn sm" data-act="profile-edit">Edit Profil</button>':''))+'</section>':'')+'</div></div>';
  if(seeStats){
    const st=stats(no),ts=tugasStat(no),tabs=[['kehadiran','Kehadiran'],['hasil','Hasil'],['achievement','Achievement']];
    h+='<div class="student-overview"><div><b>'+(pct(st.tot.h,st.tot.t)==null?'—':pct(st.tot.h,st.tot.t)+'%')+'</b><small>Kehadiran</small></div><div><b>'+ts.a+'/'+ts.b+'</b><small>Tugas terkumpul</small></div><div><b>'+studentAchievementCounts(no).earlyBird+'</b><small>Early Bird</small></div></div>';
    h+=tabsHtml(tabs);
    h+='<section class="student-tab-panel">'+(D.tab==='hasil'?studentResultsTab(no):D.tab==='achievement'?studentAchievementsTab(no):studentAttendanceTab(no))+'</section>';
  }else{
    h+='<p class="empty">NIM hanya dapat dilihat oleh mahasiswa terkait dan pengelola.</p>';
  }
  if(adm()&&canWrite){
    h+='<div class="student-admin-edit"><div class="fgrid"><div class="field"><label for="s-depan">Nama depan</label><input id="s-depan" type="text" maxlength="40" value="'+esc(s&&s.depan||'')+'"></div>'+
      '<div class="field"><label for="s-belakang">Nama belakang</label><input id="s-belakang" type="text" maxlength="40" value="'+esc(s&&s.belakang||'')+'"></div>'+
      '<div class="field"><label for="s-kode">Kode 3 huruf</label><input id="s-kode" type="text" maxlength="3" value="'+esc(s&&s.kode||'')+'"></div></div>'+
      '<div class="row2"><button type="button" class="btn pri" data-act="save-student" data-no="'+no+'">Simpan nama</button></div></div>';
  }
  return h+'</div>';
}
function studentAchievementCounts(no){
  const earlyBird=Object.keys(S.tu).filter(id=>{const r=hasilData(id);return r&&r.done[0]&&r.done[0].no===no;}).length;
  const challenger=Object.keys(S.tu).filter(id=>{const r=hasilData(id);return r&&r.done.some(x=>x.no===no&&(x.pos===2||x.pos===3));}).length;
  const row=sektorData().byNo[no];
  const pole=courseList().filter(course=>row&&row.cells[course.k]&&row.cells[course.k].c==='p').length;
  return{earlyBird:earlyBird,challenger:challenger,pole:pole};
}
function passwordInput(id,autocomplete,extra){
  const eye='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  return '<div class="password-input-wrap"><input id="'+id+'" type="password" autocomplete="'+autocomplete+'" '+(extra||'')+'><button type="button" class="password-toggle" data-act="toggle-password" data-target="'+id+'" aria-label="Tampilkan password" aria-pressed="false">'+eye+'</button></div>';
}
function loginDlg(){
  let h='<div class="db"><div class="row2" style="justify-content:space-between"><h2 id="dtitle" style="margin:0;font-family:var(--f-disp);font-size:1.3rem;text-transform:uppercase">'+(ME?'Akun':'Masuk')+'</h2><button type="button" class="btn sm" data-act="close">Tutup</button></div>';
  if(isAdmin)h+='<div class="mine"><div><b>Pemilik halaman</b><span class="s">'+(ownerMode?'Mode pengelola aktif.':'Anda sedang melihat sebagai tamu.')+'</span></div><button type="button" class="btn" data-act="owner-toggle">'+(ownerMode?'Keluar dari mode pengelola':'Masuk sebagai pengelola')+'</button></div>';
  if(ME){
    h+='<div class="mine"><div><b>Masuk sebagai No. '+ME+(isAd(ME)?' '+FLAG:'')+'</b><span class="s">'+esc(nameOf(ME))+'</span></div><button type="button" class="btn" data-act="me-clear">Keluar</button></div>'+
      '<div class="tcard"><h3>Ganti password</h3>'+
      '<div class="field"><label for="pw-old">Password lama</label>'+passwordInput('pw-old','current-password')+'</div>'+
      '<div class="fgrid"><div class="field"><label for="pw-new">Password baru</label>'+passwordInput('pw-new','new-password','minlength="6"')+'</div>'+
      '<div class="field"><label for="pw-new2">Ulangi password baru</label>'+passwordInput('pw-new2','new-password')+'</div></div>'+
      '<div class="row2"><button type="button" class="btn pri" data-act="pw-change">Simpan password</button></div></div>';
  }else if(D.step==='form'){
    const no=D.no;
    h+='<div class="row2"><button type="button" class="btn sm" data-act="login-back">&#8249; Pilih nama lain</button></div>'+
      '<div class="shead"><div class="sbig" style="width:84px;height:84px">'+photo('s'+PAD(no))+fb(no)+'</div><div><div class="k" style="font-family:var(--f-disp);font-weight:700;font-size:.8rem;color:var(--accent);letter-spacing:.06em">NO. '+no+'</div><div style="font-family:var(--f-disp);font-weight:700;font-size:1.2rem;line-height:1.2;overflow-wrap:anywhere">'+esc(nameOf(no))+'</div></div></div>'+
      '<div class="field"><label for="lg-nim">NIM</label><input id="lg-nim" type="text" inputmode="numeric" autocomplete="username" maxlength="20" value="'+esc(D.nim||'')+'"></div>'+
      '<div class="field"><label for="lg-pw">Password</label>'+passwordInput('lg-pw','current-password')+'</div>'+
      (D.err?'<p class="empty" role="alert" style="color:var(--bad);font-weight:600">'+esc(D.err)+'</p>':'')+
      '<div class="row2"><button type="button" class="btn pri" data-act="login-go">Masuk</button><button type="button" class="btn" data-act="pw-forgot" aria-expanded="'+!!D.forgot+'">Lupa password?</button></div>'+
      '<p class="s" style="margin:0">Belum pernah mengganti password? Gunakan password bawaan dari pengelola.</p>';
    if(D.forgot)h+='<div class="tcard"><b>Lupa password</b><p>Pengelola dapat mereset password Anda ke password bawaan. Ajukan permintaan di bawah, lalu minta pengelola kelas untuk memprosesnya.</p>'+
      (D.sent?'<p class="chip done" style="width:max-content">Permintaan terkirim</p>':'<div class="row2"><button type="button" class="btn" data-act="pw-req">Ajukan reset password</button></div>')+'</div>';
  }else{
    h+='<p class="empty">Pilih nama Anda sesuai nomor absen, lalu masukkan NIM dan password.</p><ul class="lg">';
    for(let n=1;n<=N;n++)h+='<li><button type="button" data-act="login-no" data-no="'+n+'"><span class="an">'+n+'</span><span class="t">'+esc(nameOf(n))+(isAd(n)?' '+FLAG:'')+'</span></button></li>';
    h+='</ul>';
  }
  return h+'</div>';
}

/* ---------- writes ---------- */
async function writeSession(k,n,patch){
  const ref=db.doc('sessions/'+k+'_'+PAD(n));
  try{await ref.update(patch);}
  catch(e){
    const base={k:k,n:n,tanggal:'',topik:'',present:{},bukti:{},closed:false};
    const o=Object.assign({},base,patch);
    if(patch.present)o.present=Object.assign({},base.present,patch.present);
    if(patch.bukti)o.bukti=Object.assign({},base.bukti,patch.bukti);
    await ref.set(o);
  }
}
async function setMe(no){
  if(uid&&db){await db.doc('data/users/'+uid+'/profil').set({absen:no});}
  else{ME=no;try{localStorage.setItem('gk_me',String(no));}catch(e){}refreshAll();}
}
async function clearMe(){
  const oldNo=ME;
  if(presenceTimer){clearInterval(presenceTimer);presenceTimer=null;}
  if(oldNo&&db){try{await db.doc('presence/'+PAD(oldNo)).set({no:Number(oldNo),lastSeen:0});}catch(e){}}
  if(AUTH){await AUTH.logout();ME=null;SK=null;refreshAll();return;}
  if(uid&&db){await db.doc('data/users/'+uid+'/profil').delete();}
  else{ME=null;try{localStorage.removeItem('gk_me');}catch(e){}refreshAll();}
}
function loadImg(file){
  return new Promise((res,rej)=>{
    const u=URL.createObjectURL(file),im=new Image();
    im.onload=()=>{URL.revokeObjectURL(u);res(im);};
    im.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('Gambar tidak bisa dibaca. Pilih file JPG, PNG, atau WebP.'));};
    im.src=u;
  });
}
async function squareImg(file,size){
  const im=await loadImg(file),w=im.naturalWidth,h=im.naturalHeight,s=Math.min(w,h);
  const c=document.createElement('canvas');c.width=c.height=size;
  c.getContext('2d').drawImage(im,(w-s)/2,(h-s)*0.2,s,s,0,0,size,size);
  return c.toDataURL('image/jpeg',0.86);
}
async function logoImg(file){
  const im=await loadImg(file);
  let sc=Math.min(1,900/im.naturalWidth,420/im.naturalHeight);
  for(let i=0;i<5;i++){
    const c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(im.naturalWidth*sc));c.height=Math.max(1,Math.round(im.naturalHeight*sc));
    c.getContext('2d').drawImage(im,0,0,c.width,c.height);
    let u=c.toDataURL('image/webp',0.88);
    if(u.indexOf('data:image/webp')!==0)u=c.toDataURL('image/png');
    if(u.length<230000)return u;
    sc*=0.75;
  }
  throw new Error('Gambar terlalu besar. Pilih gambar yang lebih kecil.');
}
function toBlob(c,type,q){return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('Gambar tidak bisa diproses.')),type,q));}
async function sendFile(file,bucket){
  if(!AS)throw new Error('Kirim berkas belum tersedia untuk akun ini.');
  let blob=file;
  const t=file.type||'';
  if(t.indexOf('image/')===0&&t!=='image/gif'&&t!=='image/svg+xml'){
    const im=await loadImg(file),sc=Math.min(1,1600/Math.max(im.naturalWidth,im.naturalHeight));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.naturalWidth*sc));c.height=Math.max(1,Math.round(im.naturalHeight*sc));
    c.getContext('2d').drawImage(im,0,0,c.width,c.height);
    blob=await toBlob(c,'image/jpeg',0.85);
  }else if(t!=='application/pdf'&&t!=='image/gif')throw new Error('Format belum didukung. Kirim foto (JPG, PNG, WebP) atau PDF.');
  if(blob.size>20*1024*1024)throw new Error('Berkas terlalu besar. Maksimal 20 MB.');
  const r=await AS.upload(blob,bucket||'uploads');
  return{id:r.id,name:String(file.name||'berkas').slice(0,80),type:r.contentType||blob.type,bucket:bucket||'uploads',url:r.publicUrl||null};
}

/* ---------- accounts ---------- */
async function hashPw(pw,salt){
  if(!window.crypto||!crypto.subtle)throw new Error('Browser ini belum mendukung penyimpanan password aman.');
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:120000},key,256);
  return Array.from(new Uint8Array(bits)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function pwOk(ac,pw){
  if(ac&&ac.hash&&ac.salt)return (await hashPw(pw,ac.salt))===ac.hash;
  return pw==='12345678';
}
function rndSalt(){const a=new Uint8Array(12);crypto.getRandomValues(a);return Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function upsertAkun(no,patch){
  const r=db.doc('akun/'+PAD(no));
  try{await r.update(patch);}
  catch(e){await r.set(Object.assign({no:no,nim:'',admin:false,hash:null,salt:null,resetReq:null},patch));}
}
function openLogin(no){
  D={kind:'login',key:null,step:no?'form':'pick',no:no||null,err:'',forgot:false,sent:false,nim:'',pending:{}};
  renderDialog(true);
  if(!dlg.open)dlg.showModal();
  if(no)setTimeout(()=>{const el=$('lg-nim');if(el)el.focus();},60);
}
async function loginGo(){
  if(!D||D.kind!=='login'||D.step!=='form')return;
  const nim=$('lg-nim').value.trim(),pw=$('lg-pw').value;
  D.nim=nim;
  const now=Date.now();
  if(now<lockUntil){D.err='Terlalu banyak percobaan. Coba lagi dalam '+Math.ceil((lockUntil-now)/1000)+' detik.';renderDialog(true);return;}
  if(!nim||!pw){D.err='Isi NIM dan password.';renderDialog(true);return;}
  if(!db){D.err='Data akun tidak bisa dimuat di tampilan ini.';renderDialog(true);return;}
  if(AUTH){
    try{
      const r=await AUTH.login(D.no,nim,pw);
      fails=0;ME=r.no;loadSektor();dlg.close();setView('beranda',true);toast('Selamat datang, '+nameOf(r.no));refreshAll();setTimeout(startGridClassTour,650);
    }catch(e){
      if(D){D.err=(e&&e.message)||'Tidak bisa masuk. Coba lagi.';renderDialog(true);const el=$('lg-pw');if(el)el.focus();}
    }
    return;
  }
  const no=D.no;let ok=false,msg='';
  try{
    const ac=(await db.doc('akun/'+PAD(no)).get()).data();
    if(!ac||!ac.nim)msg='Akun belum disiapkan. Hubungi pengelola.';
    else ok=String(ac.nim).toLowerCase()===nim.toLowerCase()&&await pwOk(ac,pw);
  }catch(e){console.error(e);msg=(e&&e.message&&!e.code)?e.message:'Tidak bisa memeriksa akun. Coba lagi.';}
  if(ok){
    fails=0;
    const saved=await run(()=>setMe(no));
    if(saved){toast('Selamat datang, '+nameOf(no));dlg.close();setView('beranda',true);refreshAll();setTimeout(startGridClassTour,650);}
    return;
  }
  if(!msg){fails++;if(fails>=5){fails=0;lockUntil=Date.now()+30000;msg='Terlalu banyak percobaan. Tunggu 30 detik.';}else msg='NIM atau password salah.';}
  if(D){D.err=msg;renderDialog(true);const el=$('lg-pw');if(el)el.focus();}
}
async function pwChange(){
  if(!ME||!db)return;
  const o=$('pw-old').value,n1=$('pw-new').value,n2=$('pw-new2').value;
  if(!o||!n1){toast('Isi password lama dan password baru.');return;}
  if(n1.length<6){toast('Password baru minimal 6 karakter.');return;}
  if(n1==='12345678'){toast('Pilih password selain password bawaan.');return;}
  if(n1!==n2){toast('Konfirmasi password tidak sama.');return;}
  if(AUTH){
    const done=await run(()=>AUTH.changePassword(o,n1),'Password diganti');
    if(done){['pw-old','pw-new','pw-new2'].forEach(i=>{const el=$(i);if(el)el.value='';});}
    return;
  }
  const ok=await run(async()=>{
    const ac=(await db.doc('akun/'+PAD(ME)).get()).data();
    if(!ac||!(await pwOk(ac,o)))throw new Error('Password lama salah.');
    const salt=rndSalt();
    await upsertAkun(ME,{hash:await hashPw(n1,salt),salt:salt,resetReq:null});
  },'Password diganti');
  if(ok){['pw-old','pw-new','pw-new2'].forEach(i=>{const el=$(i);if(el)el.value='';});}
}

/* Swipe horizontal untuk berpindah transmisi Team Radio pada layar sentuh. */
document.addEventListener('touchstart',e=>{
  if(e.target.closest('.team-radio')&&e.touches&&e.touches.length===1)TEAM_RADIO_TOUCH_X=e.touches[0].clientX;
},{passive:true});
document.addEventListener('touchend',e=>{
  if(TEAM_RADIO_TOUCH_X===null)return;
  const end=e.changedTouches&&e.changedTouches[0]?e.changedTouches[0].clientX:TEAM_RADIO_TOUCH_X;
  const delta=end-TEAM_RADIO_TOUCH_X;TEAM_RADIO_TOUCH_X=null;
  if(Math.abs(delta)<48||!e.target.closest('.team-radio')||e.target.closest('.tr-nav,.tr-dot'))return;
  const total=Math.min(8,Object.keys(S.an).length);
  if(!total)return;
  TEAM_RADIO_INDEX=(TEAM_RADIO_INDEX+(delta<0?1:-1)+total)%total;
  renderHome(true);
},{passive:true});

/* ---------- events ---------- */
dlg.addEventListener('click',e=>{const b=e.target.closest('[data-export-format]');if(!b)return;exportCourseRecap(b.dataset.exportSegment,b.dataset.exportFormat);});
dlg.addEventListener('click',e=>{
  const b=e.target.closest('[data-course-tab]');
  if(!b||!D||!['course','student'].includes(D.kind))return;
  e.preventDefault();e.stopPropagation();
  const allowed=D.kind==='student'?['kehadiran','hasil','achievement']:['absen','tugas','set'];
  if(!allowed.includes(b.dataset.courseTab))return;
  D.tab=b.dataset.courseTab;
  D.confirmDel=null;
  renderDialog(true);
});

document.addEventListener('click',async e=>{
  const mobileToggle=e.target.closest('[data-mobile-nav-toggle]');
  if(mobileToggle&&window.matchMedia('(max-width: 600px)').matches){
    e.preventDefault();e.stopPropagation();toggleMobileNav();return;
  }
  const vb=e.target.closest('[data-view]');
  if(vb&&!e.target.closest('[data-act]')){
    e.preventDefault();
    if(dlg.open)dlg.close();
    setView(vb.dataset.view,true);return;
  }
  const b=e.target.closest('[data-act]');if(!b)return;
  const a=b.dataset.act,d=b.dataset;
  if(TOUR_DEMO_ACTIVE&&!TOUR_SAFE_ACTIONS.has(a)){e.preventDefault();e.stopPropagation();toast('Mode tutorial: aksi perubahan data dinonaktifkan.');return;}
  switch(a){
    case 'overview-subtab':{setOverviewSubtab(d.tab);break;}
    case 'admin-main-tab':{
      if(!adm()||!['academic','students'].includes(d.tab))break;
      ADMIN_MAIN_TAB=d.tab;renderAdmin(true);break;
    }
    case 'notify-tab':{
      if(!adm()||!['tasks','attendance','seminar'].includes(d.tab))break;
      ADMIN_NOTIFY_TAB=d.tab;renderAdmin();break;
    }
    case 'platform-load':{
      if(!adm())break;
      PLATFORM_FORM_COURSE=$('notify-platform-course').value;
      PLATFORM_FORM_MEETING=Number($('notify-platform-meeting').value)||defaultPert(PLATFORM_FORM_COURSE);
      renderAdmin();break;
    }
    case 'attendance-session-delete':{
      if(!adm())break;
      const k=d.k,n=Number(d.n),id=k+'_'+PAD(n);
      if(!S.co[k]||!Number.isInteger(n)||n<1||n>PERT||!S.se[id]){toast('Sesi absensi tidak ditemukan.');break;}
      PLATFORM_FORM_COURSE=k;PLATFORM_FORM_MEETING=n;ATTENDANCE_SESSION_DELETE=id;renderAdmin(true);break;
    }
    case 'attendance-session-delete-cancel':{
      if(!adm())break;ATTENDANCE_SESSION_DELETE=null;renderAdmin(true);break;
    }
    case 'attendance-session-delete-confirm':{
      if(!adm())break;
      const k=d.k,n=Number(d.n),id=k+'_'+PAD(n);
      if(!S.co[k]||!Number.isInteger(n)||n<1||n>PERT||!S.se[id]){ATTENDANCE_SESSION_DELETE=null;toast('Sesi absensi tidak ditemukan atau sudah dihapus.');renderAdmin(true);break;}
      const sessionSnapshot=Object.assign({},S.se[id]);
      const platformSnapshot=S.pl[k]?Object.assign({},S.pl[k],{links:Object.assign({},S.pl[k].links||{})}):null;
      const links=Object.assign({},platformSnapshot&&platformSnapshot.links||{});
      const legacyMeeting=Number(platformSnapshot&&platformSnapshot.meeting_number||0);
      // Jangan migrasikan URL legacy jika URL tersebut milik sesi yang sedang dihapus.
      if(platformSnapshot&&platformSnapshot.url&&legacyMeeting>0&&legacyMeeting!==n&&
         !Object.keys(links).some(key=>Number(key)===legacyMeeting)){
        links[String(legacyMeeting)]=platformSnapshot.url;
      }
      // Hapus semua variasi key untuk pertemuan yang sama, misalnya "9" dan "09".
      Object.keys(links).forEach(key=>{
        if(Number(key)===n)delete links[key];
      });
      const remaining=Object.keys(links).filter(key=>Number.isInteger(Number(key))&&Number(key)>0)
        .sort((a,b)=>Number(a)-Number(b));
      const latestKey=remaining.length?remaining[remaining.length-1]:'';
      const latest=latestKey?Number(latestKey):0;
      const nextPlatform=remaining.length
        ?Object.assign({},platformSnapshot||{},{links:links,enabled:true,meeting_number:latest,url:links[latestKey],updatedAt:Date.now()})
        :null;
      const ok=await run(async()=>{
        await db.doc('sessions/'+id).delete();
        try{
          if(nextPlatform)await db.doc('platform/'+k).set(nextPlatform);
          else if(platformSnapshot)await db.doc('platform/'+k).delete();
        }catch(error){
          try{await db.doc('sessions/'+id).set(sessionSnapshot);}catch(restoreError){console.error('Gagal memulihkan sesi absensi setelah penghapusan tautan gagal.',restoreError);}
          try{if(platformSnapshot)await db.doc('platform/'+k).set(platformSnapshot);else await db.doc('platform/'+k).delete();}catch(restoreError){console.error('Gagal memulihkan konfigurasi tautan absensi.',restoreError);}
          throw error;
        }
      },'Sesi dan tautan absensi pertemuan '+n+' berhasil dihapus');
      if(ok){
        delete S.se[id];
        if(nextPlatform)S.pl[k]=nextPlatform;else delete S.pl[k];
        ATTENDANCE_SESSION_DELETE=null;PLATFORM_FORM_COURSE=k;PLATFORM_FORM_MEETING=n;refreshAll();renderAdmin(true);
      }
      break;
    }
    case 'platform-save':{
      if(!adm())break;
      const course=$('notify-platform-course').value,meeting=Number($('notify-platform-meeting').value),url=$('notify-platform-url').value.trim();
      if(!S.co[course]||!Number.isInteger(meeting)||meeting<1||meeting>PERT){toast('Pilih mata kuliah dan pertemuan yang valid.');break;}
      if(url&&!okHttps(url)){toast('Tautan absensi harus menggunakan HTTPS.');break;}
      const old=S.pl[course]||{},links=Object.assign({},old.links||{});
      if(old.url&&Number(old.meeting_number)>0&&!links[old.meeting_number])links[old.meeting_number]=old.url;
      if(url)links[meeting]=url;else delete links[meeting];
      const remaining=Object.keys(links).sort((a,b)=>Number(a)-Number(b)),latest=remaining.length?Number(remaining[remaining.length-1]):0;
      const next=remaining.length?links[latest]:'';
      const ok=await run(async()=>{
        if(remaining.length)await db.doc('platform/'+course).set({links:links,enabled:true,meeting_number:latest,url:next,updatedAt:Date.now()});
        else await db.doc('platform/'+course).delete();
      },url?'Tautan absensi disimpan':'Tautan pertemuan dihapus');
      if(ok){PLATFORM_FORM_COURSE=course;PLATFORM_FORM_MEETING=meeting;refreshAll();}
      break;
    }
    case 'wa-generate':{if(!adm())break;const msg=buildWhatsAppTemplate();$('wa-preview').value=msg;DR['wa-preview']=msg;toast('Template pesan diperbarui.');break;}
    case 'wa-share':{
      if(!adm())break;
      const msg=String($('wa-preview').value||'').trim();
      if(!msg){toast('Susun atau isi pesan terlebih dahulu.');break;}
      const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const waUrl=isMobile?'https://wa.me/':'https://web.whatsapp.com/';
      let waTab=null;
      if(!isMobile){
        waTab=window.open(waUrl,'_blank');
        if(!waTab){toast('Izinkan pop-up browser untuk membuka WhatsApp.');break;}
      }
      let copied=false;
      try{
        if(!navigator.clipboard||!window.isSecureContext)throw new Error('Clipboard API tidak tersedia');
        await navigator.clipboard.writeText(msg);copied=true;
      }catch(_){
        const temp=document.createElement('textarea');
        temp.value=msg;temp.setAttribute('readonly','');
        temp.style.position='fixed';temp.style.opacity='0';temp.style.pointerEvents='none';
        document.body.appendChild(temp);temp.focus();temp.select();
        try{copied=document.execCommand('copy');}catch(__){copied=false;}
        temp.remove();
      }
      if(!copied){
        if(waTab)waTab.close();
        toast('Pesan belum berhasil disalin. Salin isi pratinjau secara manual, lalu buka WhatsApp.');
        break;
      }
      if(isMobile){
        toast('Pesan berhasil disalin. Membuka WhatsApp…');
        window.location.href=waUrl;
      }else{
        toast('Pesan disalin. Pilih grup WhatsApp, lalu tempel dengan Ctrl + V.');
      }
      break;
    }
   case 'forum-options':{
      if(!ME){toast('Masuk sebagai mahasiswa untuk membuka forum.');break;}
            if(!S.co[d.k]){toast('Data mata kuliah tidak ditemukan. Muat ulang halaman.');break;}
      openD('course',d.k,'absen');break;
    }
    case 'auto-attend':{
      if(!ME||!canWrite){toast('Masuk sebagai mahasiswa dan pastikan akun punya izin mengisi absen.');break;}
      const k=d.k;await run(()=>saveScheduleAttendance(k),'Absensi berhasil terisi.');break;
    }
    case 'platform-task-done':{
      if(!ME||!canWrite)break;
      const id=d.id,t=S.tu[id],mine=t&&t.subs?t.subs[ME]:null;
      if(!t||t.mode==='group'||!isPlatformCourse(S.co[t.k])){toast('Tugas platform tidak ditemukan.');break;}
      if(isLocked(t)){toast('Tenggat sudah lewat. Pengumpulan ditutup.');break;}
      if(mine){toast('Tugas ini sudah dikonfirmasi selesai.');break;}
      const payload={tautan:'',catatan:'Konfirmasi penyelesaian tugas platform: pre-test hingga kuesioner Mentari.',berkas:null,at:Date.now(),platformConfirmation:true};
      const ok=await run(()=>db.doc('tugas/'+id).update({subs:{[ME]:payload}}),'Tugas platform dikonfirmasi selesai');
      if(ok)renderDialog(true);
      break;
    }
    case 'platform-task-not-done':{
      if(!ME||!canWrite)break;
      const t=S.tu[d.id];
      if(!t||t.mode==='group'||!isPlatformCourse(S.co[t.k])){toast('Tugas platform tidak ditemukan.');break;}
      const url=(t.link&&okUrl(t.link))?t.link:platOf(t.k);
      const meeting=Number(t.meeting_number||t.pertemuan||t.meeting)||defaultPert(t.k);
      if(url)openExternalRedirect(url,'mengerjakan tugas',t.k,meeting,t.judul||t.title||'');
      else toast('Link tugas atau platform belum diatur oleh pengelola.');
      break;
    }
    case 'manager-forum-student':{
      if(!adm())break;
      const k=d.k,n=Number(d.n),student=Number(d.student),id=k+'_'+PAD(n),course=S.co[k],session=S.se[id]||{};
      if(!course||!isPlatformCourse(course)||n!==defaultPert(k)||n<1||n>PERT||!inSession(course)||!platOf(k,n)||!Number.isInteger(student)||student<1||student>N||!['done','not-done'].includes(d.status)){
        toast('Konfirmasi forum tidak tersedia atau sesi sudah berubah.');break;
      }
      const present=Object.assign({},session.present||{});
      if(d.status==='done')present[student]='H';else delete present[student];
      const ok=await run(()=>writeSession(k,n,{present}),d.status==='done'?'Absensi '+nameOf(student)+' ditandai Sudah':'Absensi '+nameOf(student)+' ditandai Belum');
      if(ok){
        S.se[id]=Object.assign({k:k,n:n,tanggal:'',topik:'',present:{},bukti:{}},session,{present});
        renderDialog(true);refreshAll();
      }
      break;
    }
    case 'forum-done':{
      if(!ME)break;
      if(!canWrite){toast('Absensi belum dapat disimpan. Periksa koneksi atau izin akun.');break;}
      const k=d.k;await run(()=>saveScheduleAttendance(k),'Konfirmasi forum tersimpan. Absensi berhasil terisi.');break;
    }
    case 'forum-not-done':{const u=platOf(d.k),n=defaultPert(d.k);if(u)openExternalRedirect(u,'mengerjakan forum diskusi',d.k,n);else toast('Link forum belum diatur oleh admin.');break;}
    case 'platform-attendance-open':{
      if(!ME||!canWrite)break;
      const k=d.k,n=Number(d.n)||defaultPert(k),u=platOf(k,n);
      if(!S.co[k]||n!==defaultPert(k)){toast('Pertemuan aktif berubah. Muat ulang halaman sebelum melanjutkan.');break;}
      if(u)openD('course',k,'absen',n);else toast('Link absensi Mentari belum diatur.');
      break;
    }
    case 'external-redirect-cancel':{
      const modal=document.getElementById('externalRedirectDialog');if(modal&&modal.open)modal.close();EXTERNAL_REDIRECT=null;break;
    }
    case 'external-redirect-continue':{
      const pending=EXTERNAL_REDIRECT,modal=document.getElementById('externalRedirectDialog');
      if(!pending||!pending.url){toast('Tautan tujuan tidak tersedia.');break;}
      if(modal&&modal.open)modal.close();EXTERNAL_REDIRECT=null;
      const tab=window.open(pending.url,'_blank','noopener,noreferrer');
      if(!tab)toast('Pop-up diblokir browser. Izinkan pop-up untuk membuka Mentari.');
      break;
    }
    case 'constructor-subtab':{CONSTRUCTOR_SUBTAB=d.tab==='standings'?'standings':'list';if(CONSTRUCTOR_SUBTAB==='standings')loadHasil(true);renderConstructor();break;}
    case 'student-subtab':{
      STUDENT_SUBTAB=d.tab==='constructor'?'constructor':'line-up';
      document.querySelectorAll('.student-subtab').forEach(x=>x.setAttribute('aria-selected',String(x.dataset.tab===STUDENT_SUBTAB)));
      $('lineUpPanel').hidden=STUDENT_SUBTAB!=='line-up';
      $('constructorPanel').hidden=STUDENT_SUBTAB!=='constructor';
      if(STUDENT_SUBTAB==='constructor'){renderConstructor();if(CONSTRUCTOR_SUBTAB==='standings')loadHasil(true);}
      break;
    }
    case 'constructor-course-toggle':{CONSTRUCTOR_COURSE_OPEN[d.course]=!CONSTRUCTOR_COURSE_OPEN[d.course];renderConstructor();break;}
    case 'constructor-create':{if(!adm())break;CONSTRUCTOR_CREATE_COURSE=d.course;CONSTRUCTOR_COURSE_OPEN[d.course]=true;renderConstructor();break;}
    case 'constructor-create-cancel':CONSTRUCTOR_CREATE_COURSE=null;renderConstructor();break;
    case 'constructor-create-save':{
      if(!adm())break;const courseCode=d.course,name=($('constructor-new-name')&&$('constructor-new-name').value||'').trim();
      if(!courseList().some(c=>c.k===courseCode)){toast('Mata kuliah tidak valid.');break;}
      if(!name){toast('Isi nama Constructor terlebih dahulu.');break;}
      const ok=await run(()=>db.collection('constructors').add({courseCode:courseCode,name:name.slice(0,80),members:[],principal:null,createdAt:Date.now()}),'Constructor dibuat');
      if(ok){CONSTRUCTOR_CREATE_COURSE=null;renderConstructor();}break;
    }
    case 'constructor-edit':{const group=S.cs[d.id],memberList=Array.isArray(group&&group.members)?group.members.map(Number):[];if(!group||!(adm()||(Number(group.principal)>0&&Number(group.principal)===Number(ME)&&!memberList.includes(Number(ME)))))break;CONSTRUCTOR_EDIT_ID=d.id;renderConstructor();break;}
    case 'constructor-edit-cancel':CONSTRUCTOR_EDIT_ID=null;renderConstructor();break;
    case 'constructor-save':{
      const id=d.id,group=S.cs[id];
      const memberList=Array.isArray(group&&group.members)?group.members.map(Number):[];
      if(!group||!(adm()||(Number(group.principal)>0&&Number(group.principal)===Number(ME)&&!memberList.includes(Number(ME)))))break;
      const name=document.querySelector('[data-constructor-name="'+id+'"]');
      const selectedMembers=Array.from(document.querySelectorAll('[data-constructor-member="'+id+'"]:checked')).map(x=>Number(x.value));
      if(!name||!name.value.trim()){toast('Nama kelompok tidak boleh kosong.');break;}
      const principalSelect=document.querySelector('[data-constructor-principal="'+id+'"]');
      const colorSelect=document.querySelector('[data-constructor-color="'+id+'"]');
      const selectedColor=CONSTRUCTOR_COLORS.some(c=>c.id===(colorSelect&&colorSelect.value))?colorSelect.value:(CONSTRUCTOR_COLORS.some(c=>c.id===group.color)?group.color:'red');
      const principalValue=principalSelect?Number(principalSelect.value)||null:undefined;
      const currentPrincipal=Number(group.principal)||null;
      const nextPrincipal=principalSelect?principalValue:currentPrincipal;
      const members=nextPrincipal?[nextPrincipal,...selectedMembers.filter(n=>n!==nextPrincipal)]:selectedMembers;
      const ok=await run(async()=>{
        const payload={name:name.value.trim().slice(0,80),members:members,color:selectedColor};
        if(principalSelect)payload.principal=nextPrincipal;
        await db.doc('constructors/'+id).update(payload);
      },'Constructor diperbarui');
      if(ok){CONSTRUCTOR_EDIT_ID=null;renderConstructor();}
      break;
    }
    case 'constructor-delete':{
      if(!adm())break;
      const id=d.id;
      if(Number((S.cs[id]||{}).principal)){toast('Cabut role Team Principal sebelum menghapus Constructor.');break;}
      if(!confirm('Hapus kelompok ini?'))break;
      await run(()=>db.doc('constructors/'+id).delete(),'Kelompok dihapus');
      break;
    }
    case 'course-subtab':{
      COURSE_SUBTAB=d.tab==='history'?'history':'grand-prix';
      document.querySelectorAll('.course-subtab').forEach(x=>x.setAttribute('aria-selected',String(x.dataset.tab===COURSE_SUBTAB)));
      renderCourses();break;
    }
    case 'open-course':openD('course',d.k,d.tab,d.pert?+d.pert:null);break;
    case 'attendance-history':{if(!S.co[d.k]){toast('Mata kuliah tidak ditemukan.');break;}openD('course',d.k,'absen',defaultPert(d.k));break;}
    case 'schedule-attendance':{const c=S.co[d.k];if(!ME||!canWrite){toast('Masuk sebagai mahasiswa dengan akses absensi.');break;}if(!c||scheduleAttendanceState(c)!=='open'){toast('Waktu pengisian absensi belum tersedia atau sudah lewat.');break;}openD('course',d.k,'absen',defaultPert(d.k));break;}
    case 'open-student':openD('student',+d.no);loadHasil(true);break;
    case 'open-pit':openD('pit');loadHasil(true);break;
    case 'hub-task-tab':D.taskTab=d.tab==='group'?'group':'individual';renderDialog(true);break;
    case 'pit-history-toggle':D.historyOpen=!D.historyOpen;renderDialog(true);break;
    case 'open-sektor':openD('sektor');break;
    case 'toggle-password':{
      const input=document.getElementById(d.target);
      if(!input||!b.isConnected)break;
      const visible=input.type==='password';
      input.type=visible?'text':'password';
      b.setAttribute('aria-label',visible?'Sembunyikan password':'Tampilkan password');
      b.setAttribute('aria-pressed',String(visible));
      b.innerHTML=visible
        ?'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"></path><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3.1 3.8M6.2 6.2C3.5 8.1 2 12 2 12s3.6 7 10 7c1.1 0 2.1-.2 3-.5"></path></svg>'
        :'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      break;
    }
    case 'close':PROFILE_EDITING=false;dlg.close();break;
    case 'profile-edit':{if(!D||D.kind!=='student'||Number(D.key)!==Number(ME)||!canWrite)break;PROFILE_EDITING=true;renderDialog(true);break;}
    case 'profile-edit-cancel':PROFILE_EDITING=false;renderDialog(true);break;
    case 'tab':D.tab=d.tab;D.confirmDel=null;renderDialog(true);break;
    case 'pert':D.pert=+d.n;renderDialog(true);break;
    case 'st':{
      if(D.kind==='attendance'&&(!ME||scheduleAttendanceState(S.co[D.key])!=='open'||(S.se[D.key+'_'+PAD(D.pert)]&&S.se[D.key+'_'+PAD(D.pert)].closed))){toast('Waktu pengisian absensi sudah ditutup.');break;}
      const no=+d.no,c=D.key,session=S.se[c+'_'+PAD(D.pert)]||{},cur=(session.present||{})[no]||'';
      if(!adm()&&no!==ME)break;
      if(d.st==='K'&&!(session.bukti&&session.bukti[no]&&session.bukti[no].id)){alert('Berkas bukti belum dikirim. Silakan unggah foto atau PDF bukti absensi terlebih dahulu sebelum memilih status Kelas Berjalan.');break;}
      await run(()=>writeSession(c,D.pert,{present:{[no]:cur===d.st?'':d.st}}));
      break;
    }
    case 'bukti-del':
      await run(()=>writeSession(D.key,D.pert,{bukti:{[ME]:null}}),'Bukti dihapus');
      break;
    case 'allpresent':{
      if(!adm())break;
      const p={};for(let i=1;i<=N;i++)p[i]='H';
      await run(()=>writeSession(D.key,D.pert,{present:p}),'Semua ditandai hadir');
      break;
    }
    case 'attendance-close-toggle':{
       if(!adm())break;
       const k=d.k||D.key,n=Number(d.n)||D.pert,se=S.se[k+'_'+PAD(n)]||{};
       const close=d.closed!=='true';
       if(close&&!confirm('Tutup absensi pertemuan '+n+' untuk mata kuliah '+k+'? Mahasiswa tidak dapat mengisi setelah ditutup.'))break;
       const ok=await run(()=>writeSession(k,n,{closed:close}),close?'Absensi ditutup':'Absensi dibuka kembali');
       if(ok){S.se[k+'_'+PAD(n)]=Object.assign({k:k,n:n,tanggal:'',topik:'',present:{},bukti:{}},se,{closed:close});renderDialog(true);refreshAll();}break;
     }
     case 'task-close-toggle':{
       if(!adm())break;
       const close=d.closed!=='true';
       if(close&&!confirm('Tutup tugas ini dan pindahkan ke History? Pengumpulan baru akan dihentikan.'))break;
       const ok=await run(()=>db.doc('tugas/'+d.id).update({closed:close}),close?'Tugas ditutup dan dipindahkan ke History':'Tugas dibuka kembali');
       if(ok){if(S.tu[d.id])S.tu[d.id].closed=close;renderDialog(true);renderCourses();refreshAll();}break;
     }
     case 'tnew-toggle':D.newOpen=!D.newOpen;renderDialog(true);break;
    case 'tnew-save':{
      if(!adm())break;
      const judul=$('tn-judul').value.trim();
      if(!judul){toast('Isi judul tugas dulu.');break;}
      if($('tn-link').value.trim()&&!okUrl($('tn-link').value.trim())){toast('Tautan kerjakan harus diawali http:// atau https://');break;}
      const ok=await run(()=>db.collection('tugas').add({k:D.key,judul:judul.slice(0,120),tenggat:$('tn-tenggat').value||'',deskripsi:$('tn-desk').value.trim().slice(0,1000),link:$('tn-link').value.trim(),mode:$('tn-mode').value==='group'?'group':'individual',subs:{},groupSubs:{},dibuat:Date.now()}),'Tugas disimpan');
      if(ok){['tn-judul','tn-tenggat','tn-mode','tn-desk','tn-link'].forEach(k=>{delete DR[k];});D.newOpen=false;renderDialog(true);}
      break;
    }
    case 'tdel':D.confirmDel=d.id;renderDialog(true);break;
    case 'tdel-no':D.confirmDel=null;renderDialog(true);break;
    case 'tdel-yes':{
      if(!adm())break;
      const ok=await run(()=>db.doc('tugas/'+d.id).delete(),'Tugas dihapus');
      D.confirmDel=null;if(ok)renderDialog(true);
      break;
    }
    case 'tfile-rm':D.pending[d.id]=null;renderDialog(true);break;
    case 'tsub-open':D.subOpen=D.subOpen===d.id?null:d.id;renderDialog(true);break;
    case 'tlink-save':{
      if(!adm())break;
      const v=$('tl-'+d.id).value.trim();
      if(v&&!okUrl(v)){toast('Tautan harus diawali http:// atau https://');break;}
      const ok=await run(()=>db.doc('tugas/'+d.id).update({link:v}),'Tautan disimpan');
      if(ok)delete DR['tl-'+d.id];
      break;
    }
    case 'tsub-group':{
      if(!ME)break;
      const id=d.id,gid=d.gid,t=S.tu[id],g=S.cs[gid],acc=S.ak[PAD(ME)]||{};
      if(!t||t.mode!=='group'||!g||Number(g.principal)!==Number(ME)||g.courseCode!==t.k){toast('Hanya Team Principal Constructor pada mata kuliah ini yang dapat mengumpulkan.');break;}
      if(isLocked(t)){toast('Tenggat sudah lewat. Pengumpulan ditutup.');break;}
      const cat=$('sc-'+id).value.trim();
      let link='',berkas=null;
      if(smodeOf(id,t.groupSubs&&t.groupSubs[gid])==='file'){
        const prev=t.groupSubs&&t.groupSubs[gid];
        berkas=(D.pending&&D.pending[id])||(prev&&prev.berkas&&prev.berkas.id?prev.berkas:null);
        if(!berkas){toast('Pilih berkas dulu, lalu tekan Kirim.');break;}
      }else{
        link=$('sl-'+id).value.trim();
        if(!okHttps(link)){toast('Tempel tautan pengumpulan yang diawali https://');break;}
      }
      const ok=await run(()=>db.doc('tugas/'+id).update({groupSubs:{[gid]:{tautan:link,catatan:cat.slice(0,500),berkas:berkas,at:Date.now()}}}),'Tugas kelompok dikumpulkan');
      if(ok){D.subOpen=null;delete DR['sl-'+id];delete DR['sc-'+id];if(D.pending)delete D.pending[id];if(D.smode)delete D.smode[id];renderDialog(true);loadHasil(true);}
      break;
    }
    case 'tsub-group-open':D.subOpen=D.subOpen===d.id?null:d.id;renderDialog(true);break;
    case 'tsub':{
      if(!ME)break;
      const id=d.id,cat=$('sc-'+id).value.trim();
      const t=S.tu[id],mine=t&&t.subs?t.subs[ME]:null;
      if(t&&isLocked(t)){toast('Tenggat sudah lewat. Pengumpulan ditutup.');break;}
      let link='',berkas=null;
      if(smodeOf(id,mine)==='file'){
        berkas=(D.pending&&D.pending[id])||(mine&&mine.berkas&&mine.berkas.id?mine.berkas:null);
        if(!berkas){toast('Pilih berkas dulu, lalu tekan Kirim.');break;}
      }else{
        link=$('sl-'+id).value.trim();
        if(!okHttps(link)){toast('Tempel tautan tugas yang diawali https:// (Google Drive, Dropbox, dll.).');break;}
      }
      const ok=await run(()=>db.doc('tugas/'+id).update({subs:{[ME]:{tautan:link,catatan:cat.slice(0,500),berkas:berkas,at:Date.now()}}}),'Tugas dikumpulkan');
      if(ok){D.subOpen=null;delete DR['sl-'+id];delete DR['sc-'+id];if(D.pending)delete D.pending[id];if(D.smode)delete D.smode[id];renderDialog(true);}
      break;
    }
    case 'smode':{
      if(!D)break;
      if(!D.smode)D.smode={};
      D.smode[d.id]=d.m==='file'?'file':'link';
      renderDialog(true);
      break;
    }
    case 'open-hasil':openD('hasil',d.id);loadHasil(true);break;
    case 'open-group-hasil':openD('group-hasil',d.id);loadHasil(true);break;
    case 'open-recap-files':{
      if(!adm())break;
      const no=Number(d.no),kind=d.kind==='dok'?'dok':'ser';
      if(!Number.isInteger(no)||no<1||no>N){toast('Mahasiswa tidak ditemukan.');break;}
      openD('recap-files',no);D.fileKind=kind;renderDialog(true);break;
    }
    case 'me-clear':{const ok=await run(clearMe,'Anda sudah keluar');if(ok){if(dlg.open)dlg.close();setView('beranda',true);}break;}
    case 'save-course':{
      if(!adm())break;
      const c=S.co[D.key];
      const sks=Math.max(1,Math.min(6,parseInt($('f-sks').value,10)||c.sks||2));
      const drv=$('f-drive').value.trim(),h1=$('f-hari').value,h2=$('f-hari2').value;
      if(drv&&!okDrive(drv)){toast('Tautan folder harus dari Google Drive (drive.google.com atau docs.google.com).');break;}
      const platform=$('f-tipe').value==='platform';
      await run(async()=>{
        await db.doc('courses/'+c.k).update({nama:$('f-nama').value.trim()||c.nama,sks:sks,hari:h1,hariSampai:(h2&&h2!==h1?h2:''),jam:$('f-jam').value.trim(),ruang:$('f-ruang').value.trim(),warna:$('f-warna').value,dosen:$('f-dosen').value.trim()});
        if(drv)await db.doc('drives/'+c.k).set({url:drv});else await db.doc('drives/'+c.k).delete();
        if(S.pl[c.k])await db.doc('platform/'+c.k).set(Object.assign({},S.pl[c.k],{enabled:platform}));
      },'Perubahan disimpan');
      break;
    }
    case 'save-student':{
      if(!adm())break;
      const no=+d.no;
      const o={no:no,depan:$('s-depan').value.trim(),belakang:$('s-belakang').value.trim(),kode:$('s-kode').value.trim().toUpperCase().slice(0,3)};
      await run(async()=>{const r=db.doc('students/'+PAD(no));try{await r.update(o);}catch(err){await r.set(o);}},'Nama disimpan');
      break;
    }
    case 'img-del':await run(()=>db.doc('media/'+d.key).delete(),'Gambar dihapus');break;
    case 'team-radio-prev':{
      const total=Math.min(8,Object.keys(S.an).length);
      TEAM_RADIO_INDEX=total?(TEAM_RADIO_INDEX-1+total)%total:0;renderHome(true);break;
    }
    case 'team-radio-next':{
      const total=Math.min(8,Object.keys(S.an).length);
      TEAM_RADIO_INDEX=total?(TEAM_RADIO_INDEX+1)%total:0;renderHome(true);break;
    }
    case 'team-radio-go':{
      const total=Math.min(8,Object.keys(S.an).length);
      if(Number.isInteger(+d.index)&&+d.index>=0&&+d.index<total){TEAM_RADIO_INDEX=+d.index;renderHome(true);}
      break;
    }
    case 'ann-save':{
      if(!adm())break;
      const judul=$('an-judul').value.trim();
      if(!judul){toast('Isi judul pengumuman dulu.');break;}
      const body={judul:judul.slice(0,120),isi:$('an-isi').value.trim().slice(0,1000),k:($('an-k').value||'general')};
      const editingId=ANN_EDIT;
      const ok=await run(()=>editingId?db.doc('pengumuman/'+editingId).update(body):db.collection('pengumuman').add(Object.assign({},body,{at:Date.now()})),editingId?'Pengumuman diperbarui':'Pengumuman terkirim');
      if(ok){ANN_EDIT=null;['an-judul','an-isi','an-k'].forEach(k=>{delete DR[k];});renderAdmin();}
      break;
    }
    case 'cu-save':{
      if(!adm())break;
      const body={course_code:$('cu-course').value,meeting_number:Number($('cu-meeting').value),task_title:$('cu-title').value.trim(),task_url:$('cu-task').value.trim(),submission_url:$('cu-submit').value.trim(),deadline:$('cu-deadline').value||null};
      body.task_mode=$('cu-mode').value==='group'?'group':'individual';
      body.task_description=$('cu-desc').value.trim().slice(0,1000);
      if(!body.course_code||!S.co[body.course_code]||!Number.isInteger(body.meeting_number)||body.meeting_number<1||body.meeting_number>PERT){toast('Pilih mata kuliah dan pertemuan yang valid.');break;}
      if([body.task_url,body.submission_url].some(u=>u&&!/^https:\/\//i.test(u))){toast('Semua tautan tugas harus diawali https://');break;}
      if(body.task_title&&!body.task_url&&!body.task_description){toast('Isi link materi/soal atau petunjuk tugas agar tugas memiliki instruksi.');break;}
      const duplicate=Object.keys(S.cu).find(id=>id!==CU_EDIT&&S.cu[id].course_code===body.course_code&&Number(S.cu[id].meeting_number)===body.meeting_number);
      if(duplicate){toast('Pembaruan untuk mata kuliah dan pertemuan ini sudah ada. Gunakan tombol Edit pada tabel.');break;}
      const ok=await run(async()=>{
        if(CU_EDIT)await db.doc('course_updates/'+CU_EDIT).update(body);
        else await db.collection('course_updates').add(body);
      },'Pembaruan mata kuliah dan tugas berhasil disimpan');
      if(ok)CU_EDIT=null;
      refreshAll();break;
    }
    case 'cu-edit':CU_EDIT=d.id;renderAdmin();$('course-update-panel').scrollIntoView({behavior:'smooth',block:'start'});break;
    case 'cu-cancel':CU_EDIT=null;renderAdmin();break;
    case 'cu-del':if(!adm())break;await run(()=>db.doc('course_updates/'+d.id).delete(),'Pembaruan dihapus');CU_EDIT=null;break;
    case 'admin-top':$('admin').scrollIntoView({behavior:'smooth',block:'start'});break;
    case 'open-login':openLogin();break;
    case 'login-no':openLogin(+d.no);break;
    case 'login-back':D.step='pick';D.err='';D.forgot=false;renderDialog(true);break;
    case 'login-go':await loginGo();break;
    case 'pw-forgot':D.forgot=!D.forgot;D.nim=($('lg-nim')||{}).value||D.nim;renderDialog(true);break;
    case 'pw-req':{
      const no=D.no;
      const ok=await run(()=>upsertAkun(no,{resetReq:Date.now()}),'Permintaan reset terkirim');
      if(ok&&D){D.sent=true;renderDialog(true);}
      break;
    }
    case 'pw-change':await pwChange();break;
    case 'owner-toggle':
      ownerMode=!ownerMode;
      try{localStorage.setItem('gk_owner',ownerMode?'1':'0');}catch(err){}
      refreshAll();if(D)renderDialog(true);
      toast(ownerMode?'Mode pengelola aktif':'Kembali sebagai tamu');
      break;
    case 'archive-perm':{
      if(!adm())break;
      const no=+d.no,k=S.ak[PAD(no)]||{};
      await run(()=>upsertAkun(no,{archiveEdit:k.archiveEdit!==true}),k.archiveEdit===true?'Izin Class Archive dicabut':'Izin Class Archive diberikan');
      break;
    }
    case 'adm-toggle':{
      if(!adm())break;
      const no=+d.no;
      if(no===ME){toast('Anda tidak bisa mencabut admin diri sendiri.');break;}
      await run(()=>upsertAkun(no,{admin:!isAd(no)}),isAd(no)?'Admin dicabut':'Admin ditambahkan');
      break;
    }
    case 'pw-reset':{
      if(!adm())break;
      const no=+d.no;
      await run(()=>upsertAkun(no,{hash:null,salt:null,resetReq:null}),'Password No. '+no+' kembali ke password bawaan');
      break;
    }
    case 'seminar-save':{
      if(!adm()||!ME||!PEND.seminar){toast('Masuk sebagai pengelola dan pilih poster seminar terlebih dahulu.');break;}
      const title=($('pc-title').value||'').trim(),link=($('pc-link').value||'').trim();
      if(!title){toast('Isi judul seminar terlebih dahulu.');break;}
      if(!okHttps(link)){toast('Link pendaftaran harus menggunakan https://');break;}
      const ok=await run(()=>db.collection('paddockClub').add({title:title.slice(0,160),registrationUrl:link,poster:PEND.seminar,createdAt:Date.now()}),'Seminar diterbitkan di Paddock Club');
      if(ok){PEND.seminar=null;delete DR['pc-title'];delete DR['pc-link'];renderAdmin();renderExhibition();}
      break;
    }
    case 'seminar-del':{
      if(!adm())break;
      const item=S.pc[d.id];if(!item)break;
      if(!confirm('Hapus seminar ini dari Paddock Club?'))break;
      const ok=await run(()=>db.doc('paddockClub/'+d.id).delete(),'Seminar dihapus');
      if(ok&&item.poster&&item.poster.id&&AS&&AS.delete)AS.delete(item.poster.id).catch(()=>{});
      break;
    }
    case 'archive-save':{
      if(!ME||!PEND.archive){toast('Masuk dan pilih foto terlebih dahulu.');break;}
      if(!(adm()||(S.ak[PAD(ME)]&&S.ak[PAD(ME)].archiveEdit===true))){toast('Anda belum diberi izin mengunggah ke Class Archive.');break;}
      const judul=($('archive-judul').value||'').trim(),caption=($('archive-caption').value||'').trim();
      if(!judul){toast('Isi judul dokumentasi terlebih dahulu.');break;}
      const key='archive_'+Array.from({length:12},()=>Math.floor(Math.random()*36).toString(36)).join('');
      const ok=await run(async()=>{
        await db.doc('media/'+key).set({url:PEND.archive.url});
        try{await db.collection('classArchive').add({judul:judul.slice(0,100),caption:caption.slice(0,300),photoKey:key,no:ME,at:Date.now()});}
        catch(err){try{await db.doc('media/'+key).delete();}catch(ignore){}throw err;}
      },'Foto ditambahkan ke Class Archive');
      if(ok){PEND.archive=null;delete DR['archive-judul'];delete DR['archive-caption'];renderExhibition();}
      break;
    }
    case 'archive-react':{
      if(!ME){toast('Masuk terlebih dahulu untuk memberi reaction.');break;}
      const item=S.ca[d.id],emoji=d.emoji,allowed=['👍','❤️','😂','🔥'];
      if(!item||!allowed.includes(emoji))break;
      const current=item.reactions&&item.reactions[String(ME)]===emoji;
      await run(()=>db.doc('classArchive/'+d.id).update({reaction:current?null:emoji}),'Reaction diperbarui');
      break;
    }
    case 'archive-comment':{
      if(!ME){toast('Masuk terlebih dahulu untuk berkomentar.');break;}
      const field=$('archive-comment-'+d.id),comment=(field&&field.value||'').trim();
      if(!comment){toast('Tulis komentar terlebih dahulu.');break;}
      if(comment.length>280){toast('Komentar maksimal 280 karakter.');break;}
      const ok=await run(()=>db.doc('classArchive/'+d.id).update({comment:comment}),'Komentar dikirim');
      if(ok&&field)field.value='';
      break;
    }
    case 'profile-save':{
      if(!ME||!D||D.kind!=='student'||Number(D.key)!==Number(ME))break;
      const tanggalLahir=$('profile-dob').value,whatsapp=$('profile-whatsapp').value.trim().replace(/[\s()-]/g,'');
      if(tanggalLahir&&(tanggalLahir>today()||!/^(\d{4})-(\d{2})-(\d{2})$/.test(tanggalLahir))){toast('Tanggal lahir tidak valid.');break;}
      if(whatsapp&&!/^\+?[0-9]{8,16}$/.test(whatsapp)){toast('Nomor WhatsApp harus berisi 8–16 digit, boleh diawali +.');break;}
      const saved=await run(()=>db.doc('akun/'+PAD(ME)).update({tanggalLahir:tanggalLahir,whatsapp:whatsapp}),'Profil diperbarui');
      if(saved){PROFILE_EDITING=false;renderDialog(true);}
      break;
    }
    case 'archive-del':{
      if(!adm())break;
      if(!confirm('Hapus dokumentasi ini dari Class Archive?'))break;
      const x=S.ca[d.id];if(!x)break;
      const ok=await run(()=>db.doc('classArchive/'+d.id).delete(),'Dokumentasi dihapus');
      if(ok&&x.photoKey){try{await db.doc('media/'+x.photoKey).delete();}catch(err){}}
      renderExhibition();break;
    }
    case 'ber-save':{
      if(!ME)break;
      const j=d.j,jenis=$('ser-jenis').value==='dok'?'dok':'ser',judul=($('ser-judul').value||'').trim();
      if(!PEND[jenis]){toast('Pilih berkas dulu.');break;}
      if(!judul){toast('Isi nama sertifikat atau dokumen dulu.');break;}
      const ok=await run(()=>db.collection('berkas').add({no:ME,jenis:jenis,judul:judul.slice(0,100),file:PEND[jenis],at:Date.now()}),jenis==='ser'?'Sertifikat disimpan':'Dokumentasi disimpan');
      if(ok){PEND[jenis]=null;delete DR['ser-judul'];renderExhibition();}
      break;
    }
    case 'ber-del':berDel=d.id;renderExhibition();break;
    case 'ber-del-no':berDel=null;renderExhibition();break;
    case 'ber-del-yes':{
      const x=S.be[d.id];
      if(!x||(!adm()&&x.no!==ME))break;
      const ok=await run(()=>db.doc('berkas/'+d.id).delete(),'Berkas dihapus');
      if(ok&&AS&&x.file&&x.file.id){try{await AS.delete(x.file.id);}catch(err){}}
      berDel=null;renderExhibition();
      break;
    }
    case 'tk-del':tkDel=d.id;renderAdmin();break;
    case 'tk-del-no':tkDel=null;renderAdmin();break;
    case 'tk-del-yes':{
      if(!adm())break;
      await run(()=>db.doc('tugas/'+d.id).delete(),'Tugas dihapus');
      tkDel=null;renderAdmin();
      break;
    }
    case 'ann-edit':{
      if(!adm()||!S.an[d.id])break;
      ANN_EDIT=d.id;annDel=null;
      ['an-judul','an-isi','an-k'].forEach(k=>{delete DR[k];});
      renderAdmin();
      $('admin').scrollIntoView({behavior:'smooth',block:'start'});
      break;
    }
    case 'ann-edit-cancel':{
      ANN_EDIT=null;['an-judul','an-isi','an-k'].forEach(k=>{delete DR[k];});renderAdmin();break;
    }
    case 'ann-del':annDel=d.id;renderAdmin();break;
    case 'ann-del-no':annDel=null;renderAdmin();break;
    case 'ann-del-yes':{
      if(!adm())break;
      await run(()=>db.doc('pengumuman/'+d.id).delete(),'Pengumuman dihapus');
      annDel=null;renderAdmin();
      break;
    }
  }
});
document.addEventListener('input',e=>{const t=e.target;if(t.dataset&&t.dataset.dr)DR[t.dataset.dr]=t.value;});
document.addEventListener('change',async e=>{
  const t=e.target;
  if(t.matches&&t.matches('select[data-export-scope]')){
    const range=dlg&&dlg.querySelector('[data-export-range="'+t.dataset.exportScope+'"]');
    if(range){range.hidden=t.value!=='range';range.style.display=t.value==='range'?'flex':'none';}
    return;
  }
  if(t.dataset&&t.dataset.dr)DR[t.dataset.dr]=t.value;
  if(['wa-category','wa-course','wa-meeting','wa-date','wa-combine'].includes(t.id)){const p=$('wa-preview');if(p){p.value=buildWhatsAppTemplate();DR['wa-preview']=p.value;}return;}
  if(t.id==='f-tipe'){
    const p=t.value==='platform';
    $('f-ruang-l').textContent=p?'Nama platform':'Nama ruangan';
    $('f-ruang').placeholder=p?'Contoh: Zoom':'Contoh: R.301';
    return;
  }
  if(t.dataset&&t.dataset.nim&&adm()){await run(()=>upsertAkun(+t.dataset.nim,{nim:t.value.trim()}),'NIM disimpan');return;}
  if(t.matches&&t.matches('select[data-constructor-principal]')){
    const id=t.dataset.constructorPrincipal,selected=Number(t.value)||null;
    document.querySelectorAll('[data-constructor-member="'+id+'"]').forEach(input=>{
      const label=input.closest('label');
      if(label)label.hidden=selected===Number(input.value);
      if(selected===Number(input.value))input.checked=false;
    });
    return;
  }
  
  if(t.matches&&t.matches('input[type=file][data-up]')){
    const f=t.files&&t.files[0],key=t.dataset.up,kind=t.dataset.kind;
    t.value='';
    if(!f)return;
    await run(async()=>{
      const visual=await sendFile(f,'media');
      await db.doc('media/'+key).set({url:visual.url});
    },'Gambar disimpan');
    return;
  }
  if(t.matches&&t.matches('input[type=file][data-file]')){
    const f=t.files&&t.files[0],kind=t.dataset.file,tid=t.dataset.id;
    t.value='';
    if(!f||!ME)return;
    if(kind==='seminar'){
      if(!adm()){toast('Hanya pengelola yang dapat menambahkan poster seminar.');return;}
      if(!/^image\/(jpeg|png|webp)$/.test(f.type||'')){toast('Pilih poster JPG, PNG, atau WebP.');return;}
      await run(async()=>{PEND.seminar=await sendFile(f,'uploads');if(document.activeElement)document.activeElement.blur();renderAdmin();},'Poster siap diterbitkan ke Paddock Club.');
      return;
    }
    if(kind==='archive'){
      if(!(adm()||(S.ak[PAD(ME)]&&S.ak[PAD(ME)].archiveEdit===true))){toast('Anda belum diberi izin mengunggah ke Class Archive.');return;}
      if(!/^image\/(jpeg|png|webp)$/.test(f.type||'')){toast('Pilih foto JPG, PNG, atau WebP.');return;}
      await run(async()=>{PEND.archive=await sendFile(f,'media');renderExhibition();},'Foto siap ditambahkan ke Class Archive.');
      return;
    }
    if((kind==='bukti'||kind==='tugas')&&!D)return;
    toast('Mengirim berkas…');
    if(kind==='bukti'){
      const k=D.key,n=D.pert;
      await run(async()=>{const fo=await sendFile(f,'attendance');await writeSession(k,n,{bukti:{[ME]:fo}});},'Bukti terkirim');
    }else if(kind==='ser'||kind==='dok'){
      await run(async()=>{const targetKind=kind==='ser'&&$('ser-jenis')&&$('ser-jenis').value==='dok'?'dok':kind;PEND[targetKind]=await sendFile(f,targetKind==='ser'?'certificates':'uploads');renderExhibition();},'Berkas siap. Tekan Simpan.');
    }else if(kind==='tugas'){
      await run(async()=>{const fo=await sendFile(f,'uploads');D.pending[tid]=fo;renderDialog(true);},'Berkas siap. Tekan Kirim untuk mengumpulkan.');
    }
    return;
  }
  if(D&&D.kind==='course'&&adm()&&(t.id==='ab-tgl'||t.id==='ab-top')){
    const patch=t.id==='ab-tgl'?{tanggal:t.value}:{topik:t.value.trim().slice(0,120)};
    await run(()=>writeSession(D.key,D.pert,patch),'Tersimpan');
  }
});
dlg.addEventListener('keydown',e=>{if(e.key==='Enter'&&D&&D.kind==='login'&&D.step==='form'&&(e.target.id==='lg-nim'||e.target.id==='lg-pw')){e.preventDefault();loginGo();}});
dlg.addEventListener('close',()=>{D=null;});
dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close();});

/* student strip: arrows both ways and mouse drag */
const rail=$('rail');
$('railNext').addEventListener('click',()=>{
  if(rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-4)rail.scrollTo({left:0});
  else rail.scrollBy({left:Math.round(rail.clientWidth*0.8)});
});
$('railPrev').addEventListener('click',()=>{
  if(rail.scrollLeft<=4)rail.scrollTo({left:rail.scrollWidth});
  else rail.scrollBy({left:-Math.round(rail.clientWidth*0.8)});
});
(function(){
  let down=false,sx=0,sl=0,moved=false;
  rail.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;down=true;moved=false;sx=e.clientX;sl=rail.scrollLeft;});
  window.addEventListener('pointermove',e=>{
    if(!down)return;
    const dx=e.clientX-sx;
    if(Math.abs(dx)>5){moved=true;rail.classList.add('drag');}
    if(moved)rail.scrollLeft=sl-dx;
  });
  window.addEventListener('pointerup',()=>{if(!down)return;down=false;rail.classList.remove('drag');});
  rail.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false;}},true);
})();

window.addEventListener('gk-expired',()=>{if(AUTH&&ME!=null){ME=null;toast('Sesi berakhir. Silakan masuk lagi.');refreshAll();}});

/* ---------- start ---------- */
try{ownerMode=localStorage.getItem('gk_owner')==='1';}catch(e){}
(function(){const h=(location.hash||'').replace('#','');if(VIEWS.indexOf(h)>-1&&h!=='pengelola')view=h;})();
setView(view);
refreshAll();

/* Tombol Isi absen bergantung pada jam: periksa tiap 30 detik, tampilkan ulang hanya bila ada kuliah yang mulai/selesai. */
updateLiveClock();
setInterval(updateLiveClock,1000);
setInterval(()=>{if(D&&D.kind==='hasil')loadHasil(true);},20000);
setInterval(()=>{renderStrip();renderStudents();},30000); // time tower tetap segar selama dibuka
let liveSig='';
setInterval(()=>{const s=today()+'|'+courseList().filter(c=>inSession(c)).map(c=>c.k).join();if(s!==liveSig){liveSig=s;refreshAll();}},30000);

(async function init(){
  const use=n=>(window.claude&&window.claude.use)?window.claude.use(n).catch(()=>null):Promise.resolve(null);
  try{const cfg=await fetch('/api/public-config').then(r=>r.ok?r.json():null);if(cfg&&cfg.superLicenseDriveUrl&&okDrive(cfg.superLicenseDriveUrl))superLicenseDriveUrl=cfg.superLicenseDriveUrl;}catch(e){}
  const got=await Promise.all([use('db'),use('user'),use('assets')]);
  db=got[0];user=got[1];AS=got[2];
  AUTH=window.claude&&window.claude.auth||null;
  if(user){
    try{uid=await user.id();}catch(e){}
    try{isAdmin=!!(await user.canEdit());}catch(e){}
    try{const w=await user.can('data.write');canWrite=w!==false;}catch(e){}
  }
  if(!db){
    dbState='none';
    try{const v=localStorage.getItem('gk_me');ME=v?(parseInt(v,10)||null):null;}catch(e){}
    refreshAll();if(ME)setTimeout(startGridClassTour,1100);return;
  }
  dbState='ok';
  const onErr=err=>{console.error(err);dbState='err';refreshAll();};
  const sub=(path,key,onSnapshotError)=>db.collection(path).onSnapshot(snap=>{
    const o={};snap.docs.forEach(x=>{o[x.id]=x.data();});
    if(TOUR_DEMO_ACTIVE&&TOUR_DEMO_SNAPSHOT&&['tu','se','cs'].includes(key)){TOUR_DEMO_SNAPSHOT.live[key]=o;return;}
    S[key]=o;if(key in loaded)loaded[key]=true;if(key==='se')loadSektor();if(key==='tu'&&D&&D.kind==='hasil')loadHasil();refreshAll();
  },onSnapshotError||onErr);
  sub('students','st');sub('courses','co');sub('constructors','cs');sub('media','md');sub('sessions','se');sub('tugas','tu');sub('pengumuman','an');sub('akun','ak');sub('berkas','be');sub('classArchive','ca');sub('paddockClub','pc');sub('drives','dr');sub('platform','pl');sub('course_updates','cu');
  db.collection('presence').onSnapshot(snap=>{const o={};snap.docs.forEach(x=>{o[x.id]=x.data();});S.pr=o;refreshAll();},()=>{});
  if(AUTH){
    AUTH.me().then(m=>{ME=m&&m.no||null;if(ME){startPresence();loadSektor();refreshAll();setTimeout(startGridClassTour,1100);}else refreshAll();});
  }else if(uid){
    db.doc('data/users/'+uid+'/profil').onSnapshot(s=>{
      const x=s.data();ME=x&&Number.isInteger(x.absen)?x.absen:null;if(ME)startPresence();refreshAll();if(ME)setTimeout(startGridClassTour,1100);
    },()=>{});
  }else{
    try{const v=localStorage.getItem('gk_me');ME=v?(parseInt(v,10)||null):null;}catch(e){}
    refreshAll();
  }
})();
})();