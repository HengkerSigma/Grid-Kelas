(function(){
'use strict';
const N=32,PERT=16,LBL={H:'Hadir',I:'Izin',S:'Sakit',A:'Alpa'};
const $=id=>document.getElementById(id);
const PAD=n=>String(n).padStart(2,'0');
const ESC={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>ESC[c]);
const okImg=u=>typeof u==='string'&&/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(u);
const okUrl=u=>/^https?:\/\//i.test(u||'');
const okId=i=>/^[0-9a-f]{32}$/.test(i||'');
const colr=c=>/^#[0-9a-f]{6}$/i.test(c||'')?c:'#6b6b80';
const SIL='<svg class="sil" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="34" r="18"/><path d="M12 100c2-27 18-42 38-42s36 15 38 42z"/></svg>';
const FLAG=(function(){let r='';for(let y=0;y<3;y++)for(let x=0;x<4;x++)if((x+y)%2===0)r+='<rect x="'+(6+x*4)+'" y="'+(3+y*4)+'" width="4" height="4" fill="#111"/>';return '<svg class="flag" viewBox="0 0 24 24" role="img" aria-label="Admin"><title>Admin</title><path d="M4.5 2v20" stroke="#8a8a99" stroke-width="2" stroke-linecap="round"/><rect x="6" y="3" width="16" height="12" fill="#fff" stroke="#8a8a99" stroke-width="1"/>'+r+'</svg>';})();
const HARI=['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const VIEWS=['beranda','mahasiswa','mata-kuliah','pengelola'];

let db=null,user=null,AS=null,uid=null,isAdmin=false,canWrite=true,dbState='loading';
let AUTH=null; // diisi db.js saat berjalan lewat server.js: login diperiksa server
let ownerMode=false,view='beranda',annDel=null,berDel=null,fails=0,lockUntil=0;
const PEND={ser:null,dok:null};
const S={st:{},co:{},md:{},se:{},tu:{},an:{},ak:{},be:{}};
const loaded={st:false,co:false};
const DR={};
let ME=null,D=null,raf=0,toastT=0;

const dlg=$('dlg'),box=$('dbox');
const isAd=no=>!!(S.ak[PAD(no)]&&S.ak[PAD(no)].admin===true);
const adm=()=>(isAdmin&&ownerMode)||(ME!=null&&isAd(ME));
const dv=(k,def)=>DR[k]!==undefined?DR[k]:def;

function today(){const d=new Date();return d.getFullYear()+'-'+PAD(d.getMonth()+1)+'-'+PAD(d.getDate());}
function fmtDate(s){if(!s)return '';const p=String(s).split('-');if(p.length!==3)return esc(s);try{return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short'}).format(new Date(+p[0],+p[1]-1,+p[2]));}catch(e){return esc(s);}}
function fmtTime(ms){try{return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(ms));}catch(e){return '';}}
const photo=key=>{const m=S.md[key];return m&&okImg(m.data)?'<img src="'+m.data+'" alt="">':SIL;};
const stu=n=>S.st[PAD(n)]||null;
const nameOf=n=>{const s=stu(n);return s?((s.depan||'')+' '+(s.belakang||'')).trim():'Mahasiswa '+n;};
const courseList=()=>Object.values(S.co).sort((a,b)=>(a.urut||0)-(b.urut||0));
const dn=c=>Array.isArray(c.dosen)?(c.dosen[0]||''):(c.dosen||'');
const taskList=()=>Object.keys(S.tu).map(id=>Object.assign({id:id},S.tu[id])).sort((a,b)=>(a.tenggat||'9999').localeCompare(b.tenggat||'9999'));
const cname=k=>S.co[k]?S.co[k].nama:k;

function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true;},4200);}
const ERRMAP={unauthenticated:'Sesi berakhir. Silakan masuk lagi.',too_large:'Berkas terlalu besar. Maksimal 20 MB.',unsupported_type:'Format belum didukung. Kirim foto (JPG, PNG, WebP) atau PDF.',quota_or_state:'Penyimpanan berkas penuh. Hubungi pengelola.',rate_limited:'Terlalu sering. Coba lagi sebentar lagi.',not_granted:'Akun ini belum boleh mengunggah berkas.',invalid_argument:'Tidak bisa menyimpan. Akun ini belum punya akses mengubah data kelas.'};
async function run(fn,okMsg){
  try{await fn();if(okMsg)toast(okMsg);return true;}
  catch(e){console.error(e);toast((e&&ERRMAP[e.code])||(e&&e.message&&!e.code?e.message:'Gagal menyimpan. Coba lagi.'));return false;}
}

/* ---------- statistics ---------- */
function stats(no){
  const by={},tot={h:0,t:0};
  Object.values(S.se).forEach(se=>{
    const p=se.present||{};
    if(!(se.rec===true||Object.values(p).some(Boolean)))return;
    const b=by[se.k]||(by[se.k]={h:0,t:0});
    b.t++;tot.t++;
    if(p[no]==='H'){b.h++;tot.h++;}
  });
  return{by:by,tot:tot};
}
function tugasStat(no){let a=0,b=0;Object.values(S.tu).forEach(t=>{b++;if(t.subs&&t.subs[no])a++;});return{a:a,b:b};}
const pct=(h,t)=>t?Math.round(h/t*100):null;
function fileHtml(f,sm){
  if(!f||!okId(f.id))return '';
  const img=/^image\//.test(f.type||'');
  return '<a class="fl'+(sm?' sm':'')+'" href="/_blob/'+f.id+'" target="_blank" rel="noopener noreferrer">'+(img&&!sm?'<img class="thumb" src="/_blob/'+f.id+'" alt="">':'')+'<span>'+esc(f.name||'Berkas')+'</span></a>';
}

/* ---------- strip, students, courses ---------- */
function fb(no){return isAd(no)?'<span class="fbadge" title="Admin">'+FLAG+'</span>':'';}
function renderStrip(){
  let h='';
  for(let n=1;n<=N;n++){
    const s=stu(n);
    h+='<button type="button" class="rs" role="listitem" data-act="open-student" data-no="'+n+'"'+(ME===n?' aria-current="true"':'')+' aria-label="'+esc(nameOf(n))+', absen '+n+(isAd(n)?', admin':'')+'"><span class="sw"><span class="sav">'+photo('s'+PAD(n))+'</span>'+fb(n)+'</span><span class="rl"><b>'+n+'</b> '+esc(s?s.kode:'')+'</span></button>';
  }
  const r=$('rail'),x=r.scrollLeft;
  r.innerHTML=h;r.scrollLeft=x;
}
function renderStudents(){
  const note=$('snote');
  if(dbState==='none'){note.hidden=false;note.textContent='Data kelas tidak bisa dimuat di tampilan ini. Buka halaman dengan akun yang punya akses.';}
  else if(dbState==='err'){note.hidden=false;note.textContent='Data kelas gagal dimuat. Muat ulang halaman.';}
  else if(loaded.st&&!Object.keys(S.st).length){note.hidden=false;note.textContent='Belum ada data mahasiswa.';}
  else note.hidden=true;
  let h='';
  for(let n=1;n<=N;n++){
    const s=stu(n),showMeta=adm()||ME===n;
    let meta='';
    if(showMeta){const a=stats(n).tot,p=pct(a.h,a.t),t=tugasStat(n);meta='<span class="smeta"><span>Hadir '+(p==null?'—':p+'%')+'</span><span>Tugas '+t.a+'/'+t.b+'</span></span>';}
    h+='<li><button type="button" class="scard'+(s?'':' skel')+'" data-act="open-student" data-no="'+n+'"><span class="sph">'+photo('s'+PAD(n))+'<span class="sno">'+n+'</span>'+fb(n)+'</span>'+
      '<span class="snm"><span class="f">'+(s?esc(s.depan):'&nbsp;')+'</span><b>'+(s?esc(s.belakang):'&nbsp;')+'</b></span>'+meta+'</button></li>';
  }
  $('sgrid').innerHTML=h;
  $('sgrid').setAttribute('aria-busy',String(!loaded.st));
}
function aktifCount(k){const td=today();let c=0;Object.values(S.tu).forEach(t=>{if(t.k===k&&(!t.tenggat||t.tenggat>=td))c++;});return c;}
function dosenHtml(c){
  const nm=dn(c).trim();if(!nm)return '';
  const p=nm.split(/\s+/);let txt;
  if(p.length>1){const last=p.pop();txt=esc(p.join(' '))+' <b>'+esc(last)+'</b>';}else txt='<b>'+esc(nm)+'</b>';
  return '<li><span class="dav">'+photo('d_'+c.k)+'</span><span>'+txt+'</span></li>';
}
function renderCourses(){
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
      '<p class="jadwal">'+esc(c.sks)+' SKS · '+esc(c.hari)+' '+esc(c.jam)+' · '+esc(c.ruang)+'</p>'+
      '<button type="button" class="pic" data-act="open-course" data-k="'+esc(c.k)+'" aria-label="Buka absen dan tugas '+esc(c.nama)+'">'+
      (logo&&okImg(logo.data)?'<img class="logo" src="'+logo.data+'" alt="">':'<span class="ph" aria-hidden="true">'+esc(c.k)+'</span>')+
      (ak?'<span class="aktif">'+ak+' tugas aktif</span>':'')+
      '<span class="cta">Absen &amp; Tugas<i>&#8250;</i></span></button></li>';
  });
  $('cgrid').innerHTML=h;
  $('cgrid').setAttribute('aria-busy',String(!loaded.co));
}

/* ---------- header, views ---------- */
function renderHeader(){
  const lb=$('loginBtn'),chip=$('meChip'),na=$('navAdmin');
  lb.textContent=ME?('No. '+ME):'Masuk / Daftar';
  chip.innerHTML=ME?photo('s'+PAD(ME)):SIL;
  chip.classList.toggle('adm',adm());
  chip.setAttribute('aria-label',ME?('Akun '+nameOf(ME)):'Masuk atau daftar');
  na.hidden=!adm();
  if(view==='pengelola'&&!adm())setView('beranda');
  document.querySelectorAll('.nl[data-view]').forEach(b=>{if(b.dataset.view===view)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');});
}
function setView(v,scroll){
  if(VIEWS.indexOf(v)<0||(v==='pengelola'&&!adm()))v='beranda';
  view=v;
  VIEWS.forEach(x=>{$('v-'+x).hidden=x!==v;});
  document.querySelectorAll('.nl[data-view]').forEach(b=>{if(b.dataset.view===v)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');});
  if(scroll)window.scrollTo(0,0);
}

function renderHome(force){
  const a0=document.activeElement;
  if(!force&&a0&&$('home').contains(a0)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a0.tagName))return;
  const td=today(),dayN=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][new Date().getDay()];
  const tasks=taskList();
  const anns=Object.keys(S.an).map(id=>Object.assign({id:id},S.an[id])).sort((a,b)=>(b.at||0)-(a.at||0)).slice(0,8);
  const cl=courseList(),sched=cl.filter(c=>c.hari===dayN);
  let h='';
  if(ME){
    const st=stats(ME),a=st.tot,p=pct(a.h,a.t),ts=tugasStat(ME),belum=ts.b-ts.a;
    const missing=[];
    Object.values(S.se).forEach(se=>{if(se.tanggal&&se.tanggal<=td&&!(se.present&&se.present[ME]))missing.push(se);});
    missing.sort((a2,b2)=>(a2.tanggal||'').localeCompare(b2.tanggal||''));
    const s0=stu(ME),ak=S.ak[PAD(ME)];
    $('homeLede').textContent='Ringkasan tugas, absensi, dan pengumuman kelas untuk Anda.';
    h+='<div class="greet"><span class="gav">'+photo('s'+PAD(ME))+'</span><div><div class="kk">NO. '+ME+(s0&&s0.kode?' · '+esc(s0.kode):'')+'</div><div class="gname">Halo, '+esc(s0&&s0.depan?s0.depan:'Mahasiswa')+(isAd(ME)?' '+FLAG:'')+'</div></div></div>';
    if(ak&&!ak.hash)h+='<div class="panel welcome" style="margin-bottom:14px"><p>Password Anda masih password bawaan. Ganti sekarang agar akun lebih aman.</p><button type="button" class="btn pri" data-act="open-login">Ganti password</button></div>';
    h+='<div class="tiles">'+
      '<div class="tile"><div class="v">'+(p==null?'—':p+'%')+'</div><div class="l">Kehadiran saya</div><div class="d">'+a.h+' hadir dari '+a.t+' pertemuan terisi</div></div>'+
      '<div class="tile"><div class="v">'+ts.a+'/'+ts.b+'</div><div class="l">Tugas dikumpulkan</div><div class="d">'+(belum>0?belum+' belum dikumpulkan':'Semua sudah dikumpulkan')+'</div></div>'+
      '<div class="tile'+(missing.length?' warn':'')+'"><div class="v">'+missing.length+'</div><div class="l">Absen belum diisi</div><div class="d">Pertemuan yang sudah lewat</div></div></div>';
    const left=[],right=[];
    const todo=tasks.filter(t=>!(t.subs&&t.subs[ME]));
    let li='';
    todo.forEach(t=>{
      const late=t.tenggat&&t.tenggat<td;
      li+='<li class="it"><div><b>'+esc(t.judul)+'</b><span class="s">'+esc(cname(t.k))+' · '+(t.tenggat?(late?'Lewat tenggat ':'Tenggat ')+fmtDate(t.tenggat):'Tanpa tenggat')+'</span></div><button type="button" class="btn sm'+(late?' pri':'')+'" data-act="open-course" data-k="'+esc(t.k)+'" data-tab="tugas">Kumpulkan</button></li>';
    });
    left.push('<div class="panel"><h3 class="ph3">Tugas belum dikumpulkan</h3>'+(li?'<ul>'+li+'</ul>':'<p class="empty">'+(ts.b?'Semua tugas sudah Anda kumpulkan.':'Belum ada tugas dari dosen.')+'</p>')+'</div>');
    let ml='';
    missing.slice(0,8).forEach(se=>{
      ml+='<li class="it"><div><b>'+esc(cname(se.k))+' · Pertemuan '+se.n+'</b><span class="s">'+fmtDate(se.tanggal)+(se.topik?' · '+esc(se.topik):'')+'</span></div><button type="button" class="btn sm" data-act="open-course" data-k="'+esc(se.k)+'" data-tab="absen" data-pert="'+se.n+'">Isi absen</button></li>';
    });
    left.push('<div class="panel"><h3 class="ph3">Absen belum diisi</h3>'+(ml?'<ul>'+ml+'</ul>':'<p class="empty">Tidak ada absen yang tertinggal.</p>')+'</div>');
    left.push(schedPanel(sched,dayN));
    right.push(annPanel(anns));
    let rk='';
    cl.forEach(c=>{const b=st.by[c.k]||{h:0,t:0},pp=pct(b.h,b.t);rk+='<li><span class="c">'+esc(c.k)+'</span><span class="n">'+esc(c.nama)+'</span><span class="b track" aria-hidden="true"><i style="width:'+(pp||0)+'%"></i></span><span class="v">'+b.h+'/'+b.t+'</span></li>';});
    right.push('<div class="panel"><h3 class="ph3">Absensi saya per mata kuliah</h3>'+(rk?'<ul class="rk">'+rk+'</ul>':'<p class="empty">Belum ada mata kuliah.</p>')+'</div>');
    h+='<div class="cols"><div class="col">'+left.join('')+'</div><div class="col">'+right.join('')+'</div></div>';
    h+='<div class="cols" style="margin-top:14px"><div class="col">'+berPanel('ser')+'</div><div class="col">'+berPanel('dok')+'</div></div>';
  }else if(adm()){
    $('homeLede').textContent='Anda sedang dalam mode pengelola.';
    h+='<div class="panel welcome"><p>Mode pengelola aktif. Buka tab Pengelola untuk membuat pengumuman, mengelola akun, dan melihat rekap. Masuk sebagai mahasiswa untuk mencoba tampilan pribadi.</p><div class="row2"><button type="button" class="btn pri" data-view="pengelola">Buka Pengelola</button><button type="button" class="btn" data-act="open-login">Masuk</button></div></div>';
    const act=tasks.filter(t=>!t.tenggat||t.tenggat>=td);
    let li='';
    act.slice(0,6).forEach(t=>{li+='<li class="it"><div><b>'+esc(t.judul)+'</b><span class="s">'+esc(cname(t.k))+' · '+(t.tenggat?'Tenggat '+fmtDate(t.tenggat):'Tanpa tenggat')+'</span></div></li>';});
    h+='<div class="cols"><div class="col"><div class="panel"><h3 class="ph3">Tugas aktif kelas</h3>'+(li?'<ul>'+li+'</ul>':'<p class="empty">Belum ada tugas aktif.</p>')+'</div>'+schedPanel(sched,dayN)+'</div><div class="col">'+annPanel(anns)+'</div></div>';
  }else{
    $('homeLede').textContent='Anda masuk sebagai tamu. Tamu hanya bisa melihat pengumuman.';
    h+='<div class="panel welcome"><p>Masuk dengan nomor absen, NIM, dan password untuk mengisi absen, mengumpulkan tugas, serta menyimpan sertifikat dan dokumentasi.</p><button type="button" class="btn pri" data-act="open-login">Masuk / Daftar</button></div>'+annPanel(anns);
  }
  $('home').innerHTML=h;
}
function berPanel(j){
  const ser=j==='ser';
  const mine=Object.keys(S.be).map(id=>Object.assign({id:id},S.be[id])).filter(x=>x.no===ME&&x.jenis===j).sort((a,b)=>(b.at||0)-(a.at||0));
  let h='<div class="panel"><h3 class="ph3">'+(ser?'Sertifikat saya':'Dokumentasi saya')+'</h3>';
  if(canWrite&&AS){
    const pf=PEND[j];
    h+='<div class="stack" style="margin-bottom:16px"><div class="field"><label for="'+j+'-judul">'+(ser?'Nama sertifikat':'Keterangan')+'</label><input id="'+j+'-judul" data-dr="'+j+'-judul" type="text" maxlength="100" value="'+esc(dv(j+'-judul',''))+'" placeholder="'+(ser?'Contoh: Sertifikat Workshop Web':'Contoh: Kerja kelompok RPL')+'"></div>'+
      '<div class="row2"><label class="btn sm pickfile">'+(pf?'Ganti berkas':'Pilih berkas')+'<input type="file" accept="image/*,application/pdf" data-file="'+j+'"></label><span class="s">'+(pf?esc(pf.name):'Foto atau PDF, maksimal 20 MB')+'</span></div>'+
      '<div class="row2"><button type="button" class="btn pri" data-act="ber-save" data-j="'+j+'">Simpan</button></div></div>';
  }else h+='<p class="empty" style="margin-bottom:12px">'+(AS?'Akun ini hanya bisa melihat.':'Unggah berkas belum tersedia untuk akun ini.')+'</p>';
  const delBtn=x=>berDel===x.id
    ?'<span class="row2" style="flex-wrap:nowrap"><button type="button" class="btn sm pri" data-act="ber-del-yes" data-id="'+esc(x.id)+'">Hapus</button><button type="button" class="btn sm" data-act="ber-del-no">Batal</button></span>'
    :'<button type="button" class="btn sm" data-act="ber-del" data-id="'+esc(x.id)+'">Hapus</button>';
  if(!mine.length)return h+'<p class="empty">Belum ada '+(ser?'sertifikat':'dokumentasi')+'.</p></div>';
  if(ser){
    h+='<ul>';
    mine.forEach(x=>{h+='<li class="it"><div><b>'+esc(x.judul||'Sertifikat')+'</b>'+fileHtml(x.file,true)+'<span class="s">'+fmtTime(x.at)+'</span></div>'+delBtn(x)+'</li>';});
    return h+'</ul></div>';
  }
  h+='<ul class="gal">';
  mine.forEach(x=>{
    const f=x.file,img=f&&/^image\//.test(f.type||'')&&okId(f.id);
    h+='<li class="gi">'+(img?'<a href="/_blob/'+f.id+'" target="_blank" rel="noopener noreferrer"><img src="/_blob/'+f.id+'" alt="'+esc(x.judul||'Dokumentasi')+'" loading="lazy"></a>':'<div class="gf">'+fileHtml(f,true)+'</div>')+
      '<div class="gc"><span>'+esc(x.judul||'Tanpa keterangan')+'</span><span class="s">'+fmtTime(x.at)+'</span>'+delBtn(x)+'</div></li>';
  });
  return h+'</ul></div>';
}
function schedPanel(sched,dayN){
  let li='';
  sched.forEach(c=>{li+='<li class="it"><div><b>'+esc(c.nama)+'</b><span class="s">'+esc(c.jam)+' · '+esc(c.ruang)+'</span></div>'+(ME?'<button type="button" class="btn sm" data-act="open-course" data-k="'+esc(c.k)+'" data-tab="absen">Isi absen</button>':'')+'</li>';});
  return '<div class="panel"><h3 class="ph3">Jadwal hari ini · '+dayN+'</h3>'+(li?'<ul>'+li+'</ul>':'<p class="empty">Tidak ada kuliah hari ini.</p>')+'</div>';
}
function annPanel(anns){
  let a='';
  anns.forEach(x=>{a+='<div class="ann"><b>'+esc(x.judul)+'</b>'+(x.isi?'<p>'+esc(x.isi)+'</p>':'')+'<span class="s">'+fmtTime(x.at)+(x.k?' · '+esc(cname(x.k)):'')+'</span></div>';});
  return '<div class="panel"><h3 class="ph3">Pengumuman</h3>'+(a||'<p class="empty">Belum ada pengumuman.</p>')+'</div>';
}

function renderAdmin(){
  if(!adm()){$('admin').innerHTML='';return;}
  const a0=document.activeElement;
  if(a0&&$('v-pengelola').contains(a0)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a0.tagName))return;
  const td=today(),cl=courseList(),tasks=taskList();
  let totH=0,totT=0;
  const perC=cl.map(c=>{
    let terisi=0,h=0,cells=0;
    Object.values(S.se).forEach(se=>{if(se.k!==c.k)return;const p=se.present||{};if(!Object.values(p).some(Boolean))return;terisi++;for(let i=1;i<=N;i++){if(p[i]==='H')h++;}});
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
  const anns=Object.keys(S.an).map(id=>Object.assign({id:id},S.an[id])).sort((a,b)=>(b.at||0)-(a.at||0));
  let al='';
  anns.forEach(x=>{
    al+='<div class="ann"><div class="row2" style="justify-content:space-between;flex-wrap:nowrap"><b>'+esc(x.judul)+'</b>'+
      (annDel===x.id?'<span class="row2" style="flex-wrap:nowrap"><button type="button" class="btn sm pri" data-act="ann-del-yes" data-id="'+esc(x.id)+'">Hapus</button><button type="button" class="btn sm" data-act="ann-del-no">Batal</button></span>':'<button type="button" class="btn sm" data-act="ann-del" data-id="'+esc(x.id)+'">Hapus</button>')+'</div>'+
      (x.isi?'<p>'+esc(x.isi)+'</p>':'')+'<span class="s">'+fmtTime(x.at)+(x.k?' · '+esc(cname(x.k)):' · Semua mata kuliah')+'</span></div>';
  });
  h+='<div class="stack"><div class="panel"><h3 class="ph3">Buat pengumuman</h3><div class="stack">'+
    '<div class="field"><label for="an-judul">Judul</label><input id="an-judul" data-dr="an-judul" type="text" maxlength="120" value="'+esc(dv('an-judul',''))+'" placeholder="Contoh: Kuis minggu depan"></div>'+
    '<div class="field"><label for="an-isi">Isi</label><textarea id="an-isi" data-dr="an-isi" maxlength="1000" placeholder="Tulis pengumuman untuk kelas">'+esc(dv('an-isi',''))+'</textarea></div>'+
    '<div class="field"><label for="an-k">Untuk</label><select id="an-k" data-dr="an-k"><option value="">Semua mata kuliah</option>'+cl.map(c=>'<option value="'+esc(c.k)+'"'+(dv('an-k','')===c.k?' selected':'')+'>'+esc(c.nama)+'</option>').join('')+'</select></div>'+
    '<div class="row2"><button type="button" class="btn pri" data-act="ann-save">Kirim pengumuman</button></div></div>'+
    (al?'<div style="margin-top:18px">'+al+'</div>':'')+'</div>';
  // akun
  let ar='';
  for(let n=1;n<=N;n++){
    const k=S.ak[PAD(n)]||{};
    ar+='<tr><td class="num">'+n+'</td><td>'+esc(nameOf(n))+(isAd(n)?' '+FLAG:'')+'</td>'+
      '<td><input class="nim" type="text" inputmode="numeric" maxlength="20" data-nim="'+n+'" value="'+esc(k.nim||'')+'" aria-label="NIM nomor absen '+n+'"></td>'+
      '<td><button type="button" class="btn sm" data-act="adm-toggle" data-no="'+n+'" aria-pressed="'+isAd(n)+'"'+(n===ME?' disabled':'')+'>'+(isAd(n)?'Admin · Cabut':'Jadikan admin')+'</button></td>'+
      '<td>'+(k.hash?'Sudah diganti':'Bawaan')+(k.resetReq?' <span class="chip late">Minta reset '+fmtDate(new Date(k.resetReq).toISOString().slice(0,10))+'</span>':'')+' <button type="button" class="btn sm" data-act="pw-reset" data-no="'+n+'"'+(k.hash||k.resetReq?'':' disabled')+'>Reset</button></td></tr>';
  }
  h+='<div><h3 class="ph3">Akun mahasiswa</h3><p class="s" style="margin:0 0 10px">Ubah NIM langsung di kolomnya. Reset mengembalikan password ke password bawaan. Admin bisa mengelola kelas lewat tab ini.</p><div class="tblw"><table><thead><tr><th class="num">No</th><th>Nama</th><th>NIM</th><th>Admin</th><th>Password</th></tr></thead><tbody>'+ar+'</tbody></table></div></div>';
  h+='<div><h3 class="ph3">Rekap mata kuliah</h3><div class="tblw"><table><thead><tr><th>Mata kuliah</th><th class="num">Pertemuan terisi</th><th class="num">Kehadiran</th><th class="num">Tugas</th><th class="num">Pengumpulan</th><th></th></tr></thead><tbody>'+
    perC.map(o=>'<tr><td>'+esc(o.c.nama)+'</td><td class="num">'+o.terisi+'/'+PERT+'</td><td class="num">'+(o.pa==null?'—':o.pa+'%')+'</td><td class="num">'+o.nt+'</td><td class="num">'+(o.pp==null?'—':o.pp+'%')+'</td><td><button type="button" class="btn sm" data-act="open-course" data-k="'+esc(o.c.k)+'">Buka</button></td></tr>').join('')+'</tbody></table></div></div>';
  const cs={},cd={};Object.values(S.be).forEach(x=>{if(x.jenis==='ser')cs[x.no]=(cs[x.no]||0)+1;else if(x.jenis==='dok')cd[x.no]=(cd[x.no]||0)+1;});
  let rows='';
  for(let n=1;n<=N;n++){const a=stats(n).tot,p=pct(a.h,a.t),t=tugasStat(n);rows+='<tr><td class="num">'+n+'</td><td><button type="button" class="lnk" data-act="open-student" data-no="'+n+'">'+esc(nameOf(n))+'</button></td><td class="num">'+(p==null?'—':p+'%')+'</td><td class="num">'+t.a+'/'+t.b+'</td><td class="num">'+(t.b-t.a)+'</td><td class="num">'+(cs[n]||0)+'</td><td class="num">'+(cd[n]||0)+'</td></tr>';}
  h+='<div><h3 class="ph3">Rekap mahasiswa</h3><div class="tblw"><table><thead><tr><th class="num">No</th><th>Nama</th><th class="num">Kehadiran</th><th class="num">Tugas dikumpulkan</th><th class="num">Belum</th><th class="num">Sertifikat</th><th class="num">Dokumentasi</th></tr></thead><tbody>'+rows+'</tbody></table></div></div></div>';
  $('admin').innerHTML=h;
}

function refreshAll(){
  cancelAnimationFrame(raf);
  raf=requestAnimationFrame(()=>{renderHeader();renderStrip();renderStudents();renderCourses();renderHome();renderAdmin();if(D)renderDialog(false);});
}

/* ---------- dialog ---------- */
function tabsHtml(list){
  return '<div class="tabs" role="tablist">'+list.map(t=>'<button type="button" role="tab" class="tab" data-act="tab" data-tab="'+t[0]+'" aria-selected="'+(D.tab===t[0])+'">'+t[1]+'</button>').join('')+'</div>';
}
function defaultPert(k){
  let m=0;
  Object.values(S.se).forEach(se=>{if(se.k===k&&(se.rec===true||Object.values(se.present||{}).some(Boolean))&&se.n>m)m=se.n;});
  return m||1;
}
function openD(kind,key,tab,pert){
  D={kind:kind,key:key,tab:tab||(kind==='course'?'absen':'main'),pert:kind==='course'?(pert||defaultPert(key)):null,confirmDel:null,newOpen:false,pending:{}};
  renderDialog(true);
  if(!dlg.open)dlg.showModal();
}
function renderDialog(force){
  if(!D)return;
  if(!force){const a=document.activeElement;if(a&&dlg.contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))return;}
  const sc=box.scrollTop;
  if(D.kind==='course')box.innerHTML=courseDlg();
  else if(D.kind==='student')box.innerHTML=studentDlg();
  else box.innerHTML=loginDlg();
  box.scrollTop=sc;
}

function courseDlg(){
  const c=S.co[D.key];
  if(!c)return '<div class="db"><button type="button" class="btn" data-act="close">Tutup</button><p class="empty">Mata kuliah tidak ditemukan.</p></div>';
  const head='<div class="dh" style="--tc:'+colr(c.warna)+'"><button type="button" class="x" data-act="close" aria-label="Tutup">&times;</button>'+
    '<div class="dk">'+esc(c.k)+' · '+esc(c.sks)+' SKS</div><h2 id="dtitle">'+esc(c.nama)+'</h2>'+
    '<ul class="dosen">'+dosenHtml(c)+'</ul><p class="jadwal">'+esc(c.hari)+' '+esc(c.jam)+' · '+esc(c.ruang)+'</p></div>';
  const tabs=[['absen','Absen'],['tugas','Tugas']];
  if(adm())tabs.push(['set','Pengaturan']);
  if(D.tab==='set'&&!adm())D.tab='absen';
  let body;
  if(D.tab==='tugas')body=adm()?tugasAdmin(c):tugasStudent(c);
  else if(D.tab==='set'&&adm())body=settingsHtml(c);
  else body=adm()?absenAdmin(c):absenStudent(c);
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
    h+='<button type="button" class="pt'+(has?' has':'')+'"'+(sv?' data-s="'+sv+'"':'')+' data-act="pert" data-n="'+i+'" aria-pressed="'+(i===n)+'" aria-label="Pertemuan '+i+(has?', sudah ada absen':'')+'">'+i+'</button>';
  }
  return h+'</div></div>';
}

function absenStudent(c){
  const n=D.pert,se=S.se[c.k+'_'+PAD(n)]||{},p=se.present||{},mine=ME?(p[ME]||''):'';
  let h=pertPicker(c,'mhs');
  if(se.tanggal||se.topik)h+='<p class="empty"><b>Pertemuan '+n+'</b>'+(se.tanggal?' · '+fmtDate(se.tanggal):'')+(se.topik?' · '+esc(se.topik):'')+'</p>';
  if(!ME){
    return h+'<div class="mine"><div><b>Masuk untuk mengisi absen</b><span class="s">Pilih nomor absen Anda terlebih dahulu.</span></div><button type="button" class="btn pri" data-act="open-login">Masuk / Daftar</button></div>';
  }
  if(!canWrite)h+='<p class="empty">Akun ini hanya bisa melihat. Minta pengelola memberi akses Kontributor untuk mengisi absen.</p>';
  const bk=se.bukti&&se.bukti[ME];
  h+='<div class="tcard"><div><b>Absen saya · Pertemuan '+n+'</b><br><span class="s">No. '+ME+' · '+esc(nameOf(ME))+'</span></div>'+
    '<div class="ast" role="group" aria-label="Status absen saya">'+
    ['H','I','S'].map(s=>'<button type="button" class="sb big" data-act="st" data-no="'+ME+'" data-st="'+s+'" aria-pressed="'+(mine===s)+'"'+(canWrite?'':' disabled')+'>'+LBL[s]+'</button>').join('')+'</div>';
  if(AS&&canWrite){
    h+='<div class="row2"><label class="btn sm pickfile">'+(bk&&bk.id?'Ganti bukti':'Kirim bukti absen')+'<input type="file" accept="image/*,application/pdf" data-file="bukti"></label>'+(bk&&bk.id?'<button type="button" class="btn sm" data-act="bukti-del">Hapus bukti</button>':'')+'</div>'+
      (bk&&bk.id?'<div>'+fileHtml(bk)+'</div>':'<span class="s">Foto atau PDF, misalnya surat izin atau foto kehadiran.</span>');
  }else if(bk&&bk.id)h+='<div>'+fileHtml(bk)+'</div>';
  else if(!AS)h+='<span class="s">Kirim berkas belum tersedia untuk akun ini.</span>';
  h+='</div>';
  const a=stats(ME).by[c.k]||{h:0,t:0};
  h+='<p class="sum"><span>Hadir '+a.h+' dari '+a.t+' pertemuan terisi</span></p>';
  return h;
}

function absenAdmin(c){
  const n=D.pert,se=S.se[c.k+'_'+PAD(n)]||null,p=(se&&se.present)||{},bk=(se&&se.bukti)||{};
  const cnt={H:0,I:0,S:0,A:0};
  for(let i=1;i<=N;i++){if(cnt[p[i]]!==undefined)cnt[p[i]]++;}
  const rec=cnt.H+cnt.I+cnt.S+cnt.A;
  let h=pertPicker(c,'adm');
  const w=canWrite;
  if(w){
    h+='<div class="meta"><div class="field"><label for="ab-tgl">Tanggal</label><input id="ab-tgl" type="date" value="'+esc(se&&se.tanggal||'')+'"></div>'+
       '<div class="field"><label for="ab-top">Topik pertemuan '+n+'</label><input id="ab-top" type="text" maxlength="120" value="'+esc(se&&se.topik||'')+'" placeholder="Contoh: Pengantar dan kontrak kuliah"></div></div>';
  }else if(se&&(se.tanggal||se.topik)){
    h+='<p class="empty"><b>Pertemuan '+n+'</b>'+(se.tanggal?' · '+fmtDate(se.tanggal):'')+(se.topik?' · '+esc(se.topik):'')+'</p>';
  }
  h+='<p class="sum"><span>H · Hadir '+cnt.H+'</span><span>I · Izin '+cnt.I+'</span><span>S · Sakit '+cnt.S+'</span><span>A · Alpa '+cnt.A+'</span><span>Belum diisi '+(N-rec)+'</span></p>';
  if(w)h+='<div class="row2"><button type="button" class="btn sm" data-act="allpresent">Tandai semua hadir</button></div>';
  h+='<ol class="alist">';
  for(let i=1;i<=N;i++){
    h+='<li class="arow'+(ME===i?' mine-row':'')+'"><span class="an">'+i+'</span><span class="aav">'+photo('s'+PAD(i))+'</span><span class="anm">'+esc(nameOf(i))+(bk[i]&&bk[i].id?'<br>'+fileHtml(bk[i],true):'')+'</span>'+
      '<span class="ast" role="group" aria-label="Status absen '+esc(nameOf(i))+'">'+
      ['H','I','S','A'].map(s=>'<button type="button" class="sb" data-act="st" data-no="'+i+'" data-st="'+s+'" aria-pressed="'+(p[i]===s)+'" title="'+LBL[s]+'" aria-label="'+LBL[s]+'"'+(w?'':' disabled')+'>'+s+'</button>').join('')+'</span></li>';
  }
  return h+'</ol>';
}

function tugasStudent(c){
  const list=taskList().filter(t=>t.k===c.k),td=today();
  if(!list.length)return '<p class="empty">Belum ada tugas untuk mata kuliah ini.</p>';
  let h='';
  if(!ME)h+='<div class="mine"><div><b>Masuk untuk mengumpulkan tugas</b><span class="s">Pilih nomor absen Anda terlebih dahulu.</span></div><button type="button" class="btn pri" data-act="open-login">Masuk / Daftar</button></div>';
  list.forEach(t=>{
    const mine=ME&&t.subs?t.subs[ME]:null,late=t.tenggat&&t.tenggat<td;
    h+='<article class="tcard"><div class="row2" style="justify-content:space-between"><h3>'+esc(t.judul)+'</h3><span>'+
      (t.tenggat?'<span class="chip'+(late?' late':'')+'">'+(late?'Lewat tenggat ':'Tenggat ')+fmtDate(t.tenggat)+'</span>':'<span class="chip">Tanpa tenggat</span>')+
      (mine?' <span class="chip done">Sudah dikumpulkan</span>':'')+'</span></div>'+
      (t.deskripsi?'<p>'+esc(t.deskripsi)+'</p>':'');
    if(ME&&canWrite){
      const pend=D.pending[t.id],cur=pend!==undefined?pend:(mine&&mine.berkas||null);
      h+='<div class="field"><label for="sl-'+esc(t.id)+'">Tautan hasil tugas</label><input id="sl-'+esc(t.id)+'" data-dr="sl-'+esc(t.id)+'" type="url" inputmode="url" placeholder="https://" value="'+esc(dv('sl-'+t.id,mine&&mine.tautan||''))+'"></div>'+
        '<div class="field"><label for="sc-'+esc(t.id)+'">Catatan</label><textarea id="sc-'+esc(t.id)+'" data-dr="sc-'+esc(t.id)+'" maxlength="500">'+esc(dv('sc-'+t.id,mine&&mine.catatan||''))+'</textarea></div>';
      if(AS){
        h+='<div class="row2"><label class="btn sm pickfile">'+(cur?'Ganti berkas':'Kirim berkas')+'<input type="file" accept="image/*,application/pdf" data-file="tugas" data-id="'+esc(t.id)+'"></label>'+(cur?'<button type="button" class="btn sm" data-act="tfile-rm" data-id="'+esc(t.id)+'">Hapus berkas</button>':'')+'</div>'+(cur?'<div>'+fileHtml(cur)+'</div>':'<span class="s">Foto atau PDF, maksimal 20 MB.</span>');
      }else h+='<span class="s">Kirim berkas belum tersedia untuk akun ini. Gunakan tautan.</span>';
      h+='<div class="row2"><button type="button" class="btn pri" data-act="tsub" data-id="'+esc(t.id)+'">'+(mine?'Perbarui pengumpulan':'Kumpulkan')+'</button>'+(mine&&mine.at?'<span class="s">Terakhir '+fmtTime(mine.at)+'</span>':'')+'</div>';
    }else if(mine){
      h+='<div>'+(okUrl(mine.tautan)?'<a class="lnk2" href="'+esc(mine.tautan)+'" target="_blank" rel="noopener noreferrer">'+esc(mine.tautan)+'</a>':esc(mine.tautan||''))+'</div>'+(mine.berkas?'<div>'+fileHtml(mine.berkas)+'</div>':'');
    }
    h+='</article>';
  });
  return h;
}

function tugasAdmin(c){
  const list=taskList().filter(t=>t.k===c.k),td=today();
  let h='';
  if(canWrite){
    if(D.newOpen){
      h+='<div class="tcard"><div class="field"><label for="tn-judul">Judul tugas</label><input id="tn-judul" data-dr="tn-judul" type="text" maxlength="120" value="'+esc(dv('tn-judul',''))+'" placeholder="Contoh: Tugas 1 – Flowchart"></div>'+
         '<div class="fgrid"><div class="field"><label for="tn-tenggat">Tenggat</label><input id="tn-tenggat" data-dr="tn-tenggat" type="date" value="'+esc(dv('tn-tenggat',''))+'"></div></div>'+
         '<div class="field"><label for="tn-desk">Petunjuk</label><textarea id="tn-desk" data-dr="tn-desk" maxlength="1000" placeholder="Jelaskan apa yang harus dikumpulkan">'+esc(dv('tn-desk',''))+'</textarea></div>'+
         '<div class="row2"><button type="button" class="btn pri" data-act="tnew-save">Simpan tugas</button><button type="button" class="btn" data-act="tnew-toggle">Batal</button></div></div>';
    }else h+='<div class="row2"><button type="button" class="btn pri" data-act="tnew-toggle">+ Tugas baru</button></div>';
  }
  if(!list.length)h+='<p class="empty">Belum ada tugas untuk mata kuliah ini.</p>';
  list.forEach(t=>{
    const subs=t.subs||{},cnt=Object.keys(subs).length,late=t.tenggat&&t.tenggat<td;
    h+='<article class="tcard"><div class="row2" style="justify-content:space-between"><h3>'+esc(t.judul)+'</h3>'+
      (t.tenggat?'<span class="chip'+(late?' late':'')+'">'+(late?'Lewat tenggat ':'Tenggat ')+fmtDate(t.tenggat)+'</span>':'<span class="chip">Tanpa tenggat</span>')+'</div>'+
      (t.deskripsi?'<p>'+esc(t.deskripsi)+'</p>':'')+
      '<div><div class="track" aria-hidden="true"><i style="width:'+Math.round(cnt/N*100)+'%"></i></div><span class="s">'+cnt+' dari '+N+' mahasiswa sudah mengumpulkan</span></div>';
    if(ME&&canWrite)h+=subForm(t,subs[ME]);
    const keys=Object.keys(subs).map(Number).sort((a,b)=>a-b);
    h+='<details><summary>Lihat pengumpulan ('+cnt+')</summary><ul class="subs" style="margin-top:8px">'+
      (keys.length?keys.map(no=>{const s=subs[no];return '<li><b>No. '+no+' · '+esc(nameOf(no))+'</b> · '+fmtTime(s.at)+(okUrl(s.tautan)?'<br><a href="'+esc(s.tautan)+'" target="_blank" rel="noopener noreferrer">'+esc(s.tautan)+'</a>':(s.tautan?'<br>'+esc(s.tautan):''))+(s.catatan?'<br>'+esc(s.catatan):'')+(s.berkas&&s.berkas.id?'<br>'+fileHtml(s.berkas):'')+'</li>';}).join(''):'<li>Belum ada yang mengumpulkan.</li>')+'</ul></details>';
    if(canWrite)h+=D.confirmDel===t.id
      ?'<div class="row2"><span>Hapus tugas ini beserta pengumpulannya?</span><button type="button" class="btn sm pri" data-act="tdel-yes" data-id="'+esc(t.id)+'">Ya, hapus</button><button type="button" class="btn sm" data-act="tdel-no">Batal</button></div>'
      :'<div class="row2"><button type="button" class="btn sm" data-act="tdel" data-id="'+esc(t.id)+'">Hapus tugas</button></div>';
    h+='</article>';
  });
  return h;
}

function settingsHtml(c){
  return '<div class="fgrid">'+
    '<div class="field" style="grid-column:1/-1"><label for="f-nama">Nama mata kuliah</label><input id="f-nama" type="text" maxlength="80" value="'+esc(c.nama)+'"></div>'+
    '<div class="field" style="grid-column:1/-1"><label for="f-dosen">Dosen pengampu</label><input id="f-dosen" type="text" maxlength="60" value="'+esc(dn(c))+'"></div>'+
    '<div class="field"><label for="f-sks">SKS</label><input id="f-sks" type="number" min="1" max="6" value="'+esc(c.sks)+'"></div>'+
    '<div class="field"><label for="f-hari">Hari</label><select id="f-hari">'+HARI.map(x=>'<option'+(x===c.hari?' selected':'')+'>'+x+'</option>').join('')+'</select></div>'+
    '<div class="field"><label for="f-jam">Jam</label><input id="f-jam" type="text" maxlength="20" value="'+esc(c.jam)+'"></div>'+
    '<div class="field"><label for="f-ruang">Ruang</label><input id="f-ruang" type="text" maxlength="20" value="'+esc(c.ruang)+'"></div>'+
    '<div class="field"><label for="f-warna">Warna kartu</label><input id="f-warna" type="color" value="'+colr(c.warna)+'"></div></div>'+
    '<div class="row2"><button type="button" class="btn pri" data-act="save-course">Simpan perubahan</button></div>'+
    '<div><div class="lbl" style="margin-bottom:8px">Gambar</div><div class="row2">'+
    '<label class="btn pickfile">Unggah logo mata kuliah<input type="file" accept="image/*" data-up="c_'+esc(c.k)+'" data-kind="logo"></label>'+
    (S.md['c_'+c.k]?'<button type="button" class="btn" data-act="img-del" data-key="c_'+esc(c.k)+'">Hapus logo</button>':'')+
    '<label class="btn pickfile">Foto dosen<input type="file" accept="image/*" data-up="d_'+esc(c.k)+'" data-kind="avatar"></label>'+
    (S.md['d_'+c.k]?'<button type="button" class="btn" data-act="img-del" data-key="d_'+esc(c.k)+'">Hapus foto dosen</button>':'')+
    '</div></div>';
}

function studentDlg(){
  const no=D.key,s=stu(no);
  const own=ME===no,seeStats=adm()||own;
  const canPhoto=canWrite&&(adm()||own);
  let h='<div class="db"><div class="row2" style="justify-content:flex-end"><button type="button" class="btn sm" data-act="close">Tutup</button></div>'+
    '<div class="shead"><div class="sbig">'+photo('s'+PAD(no))+fb(no)+'</div><div><div class="k">NO. '+no+(s&&s.kode?' · '+esc(s.kode):'')+(isAd(no)?' · ADMIN':'')+'</div><h2 id="dtitle">'+esc(nameOf(no))+(isAd(no)?' '+FLAG:'')+'</h2>'+
    '<div class="row2" style="margin-top:12px">'+
    (canPhoto?'<label class="btn sm pickfile">Ganti foto<input type="file" accept="image/*" data-up="s'+PAD(no)+'" data-kind="photo"></label>':'')+
    (canPhoto&&S.md['s'+PAD(no)]?'<button type="button" class="btn sm" data-act="img-del" data-key="s'+PAD(no)+'">Hapus foto</button>':'')+
    (own?'<button type="button" class="btn sm" data-act="me-clear">Keluar</button>':(ME?'':'<button type="button" class="btn sm pri" data-act="login-no" data-no="'+no+'">Masuk sebagai nomor ini</button>'))+
    '</div></div></div>';
  if(seeStats){
    const st=stats(no),ts=tugasStat(no);
    h+='<div><div class="lbl" style="margin-bottom:10px">Kehadiran per mata kuliah</div><ul class="rk">';
    const cl=courseList();
    if(!cl.length)h+='<li class="empty">Belum ada mata kuliah.</li>';
    cl.forEach(c=>{const b=st.by[c.k]||{h:0,t:0},p=pct(b.h,b.t);h+='<li><span class="c">'+esc(c.k)+'</span><span class="n">'+esc(c.nama)+'</span><span class="b track" aria-hidden="true"><i style="width:'+(p||0)+'%"></i></span><span class="v">'+b.h+'/'+b.t+'</span></li>';});
    h+='</ul></div><p class="empty">Tugas dikumpulkan: <b>'+ts.a+'</b> dari '+ts.b+'. Total hadir: <b>'+st.tot.h+'</b> dari '+st.tot.t+' pertemuan yang sudah diabsen.</p>';
  }
  if(adm()&&canWrite){
    h+='<div class="fgrid"><div class="field"><label for="s-depan">Nama depan</label><input id="s-depan" type="text" maxlength="40" value="'+esc(s&&s.depan||'')+'"></div>'+
      '<div class="field"><label for="s-belakang">Nama belakang</label><input id="s-belakang" type="text" maxlength="40" value="'+esc(s&&s.belakang||'')+'"></div>'+
      '<div class="field"><label for="s-kode">Kode 3 huruf</label><input id="s-kode" type="text" maxlength="3" value="'+esc(s&&s.kode||'')+'"></div></div>'+
      '<div class="row2"><button type="button" class="btn pri" data-act="save-student" data-no="'+no+'">Simpan nama</button></div>';
  }
  return h+'</div>';
}

function loginDlg(){
  let h='<div class="db"><div class="row2" style="justify-content:space-between"><h2 id="dtitle" style="margin:0;font-family:var(--f-disp);font-size:1.3rem;text-transform:uppercase">'+(ME?'Akun':'Masuk')+'</h2><button type="button" class="btn sm" data-act="close">Tutup</button></div>';
  if(isAdmin)h+='<div class="mine"><div><b>Pemilik halaman</b><span class="s">'+(ownerMode?'Mode pengelola aktif.':'Anda sedang melihat sebagai tamu.')+'</span></div><button type="button" class="btn" data-act="owner-toggle">'+(ownerMode?'Keluar dari mode pengelola':'Masuk sebagai pengelola')+'</button></div>';
  if(ME){
    h+='<div class="mine"><div><b>Masuk sebagai No. '+ME+(isAd(ME)?' '+FLAG:'')+'</b><span class="s">'+esc(nameOf(ME))+'</span></div><button type="button" class="btn" data-act="me-clear">Keluar</button></div>'+
      '<div class="tcard"><h3>Ganti password</h3>'+
      '<div class="field"><label for="pw-old">Password lama</label><input id="pw-old" type="password" autocomplete="current-password"></div>'+
      '<div class="fgrid"><div class="field"><label for="pw-new">Password baru</label><input id="pw-new" type="password" autocomplete="new-password" minlength="6"></div>'+
      '<div class="field"><label for="pw-new2">Ulangi password baru</label><input id="pw-new2" type="password" autocomplete="new-password"></div></div>'+
      '<div class="row2"><button type="button" class="btn pri" data-act="pw-change">Simpan password</button></div></div>';
  }else if(D.step==='form'){
    const no=D.no;
    h+='<div class="row2"><button type="button" class="btn sm" data-act="login-back">&#8249; Pilih nama lain</button></div>'+
      '<div class="shead"><div class="sbig" style="width:84px;height:84px">'+photo('s'+PAD(no))+fb(no)+'</div><div><div class="k" style="font-family:var(--f-disp);font-weight:700;font-size:.8rem;color:var(--accent);letter-spacing:.06em">NO. '+no+'</div><div style="font-family:var(--f-disp);font-weight:700;font-size:1.2rem;line-height:1.2;overflow-wrap:anywhere">'+esc(nameOf(no))+'</div></div></div>'+
      '<div class="field"><label for="lg-nim">NIM</label><input id="lg-nim" type="text" inputmode="numeric" autocomplete="username" maxlength="20" value="'+esc(D.nim||'')+'"></div>'+
      '<div class="field"><label for="lg-pw">Password</label><input id="lg-pw" type="password" autocomplete="current-password"></div>'+
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
    const base={k:k,n:n,tanggal:'',topik:'',present:{},bukti:{}};
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
  if(AUTH){await AUTH.logout();ME=null;refreshAll();return;}
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
async function sendFile(file){
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
  const r=await AS.upload(blob);
  return{id:r.id,name:String(file.name||'berkas').slice(0,80),type:r.contentType||blob.type};
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
      fails=0;ME=r.no;dlg.close();setView('beranda',true);toast('Selamat datang, '+nameOf(r.no));refreshAll();
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
    if(saved){toast('Selamat datang, '+nameOf(no));dlg.close();setView('beranda',true);}
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
function subForm(t,mine){
  if(!ME||!canWrite)return '';
  const id=t.id,pend=D.pending[id],cur=pend!==undefined?pend:(mine&&mine.berkas||null);
  let h='<div class="field"><label for="sl-'+esc(id)+'">Tautan hasil tugas saya</label><input id="sl-'+esc(id)+'" data-dr="sl-'+esc(id)+'" type="url" inputmode="url" placeholder="https://" value="'+esc(dv('sl-'+id,mine&&mine.tautan||''))+'"></div>'+
    '<div class="field"><label for="sc-'+esc(id)+'">Catatan</label><textarea id="sc-'+esc(id)+'" data-dr="sc-'+esc(id)+'" maxlength="500">'+esc(dv('sc-'+id,mine&&mine.catatan||''))+'</textarea></div>';
  if(AS)h+='<div class="row2"><label class="btn sm pickfile">'+(cur?'Ganti berkas':'Kirim berkas')+'<input type="file" accept="image/*,application/pdf" data-file="tugas" data-id="'+esc(id)+'"></label>'+(cur?'<button type="button" class="btn sm" data-act="tfile-rm" data-id="'+esc(id)+'">Hapus berkas</button>':'')+'</div>'+(cur?'<div>'+fileHtml(cur)+'</div>':'<span class="s">Foto atau PDF, maksimal 20 MB.</span>');
  h+='<div class="row2"><button type="button" class="btn pri" data-act="tsub" data-id="'+esc(id)+'">'+(mine?'Perbarui pengumpulan':'Kumpulkan')+'</button>'+(mine&&mine.at?'<span class="s">Terakhir '+fmtTime(mine.at)+'</span>':'')+'</div>';
  return h;
}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
  const vb=e.target.closest('[data-view]');
  if(vb&&!e.target.closest('[data-act]')){
    e.preventDefault();
    if(dlg.open)dlg.close();
    setView(vb.dataset.view,true);return;
  }
  const b=e.target.closest('[data-act]');if(!b)return;
  const a=b.dataset.act,d=b.dataset;
  switch(a){
    case 'open-course':openD('course',d.k,d.tab,d.pert?+d.pert:null);break;
    case 'open-student':openD('student',+d.no);break;
    case 'close':dlg.close();break;
    case 'tab':D.tab=d.tab;D.confirmDel=null;renderDialog(true);break;
    case 'pert':D.pert=+d.n;renderDialog(true);break;
    case 'st':{
      const no=+d.no,c=D.key,cur=((S.se[c+'_'+PAD(D.pert)]||{}).present||{})[no]||'';
      if(!adm()&&no!==ME)break;
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
    case 'tnew-toggle':D.newOpen=!D.newOpen;renderDialog(true);break;
    case 'tnew-save':{
      if(!adm())break;
      const judul=$('tn-judul').value.trim();
      if(!judul){toast('Isi judul tugas dulu.');break;}
      const ok=await run(()=>db.collection('tugas').add({k:D.key,judul:judul.slice(0,120),tenggat:$('tn-tenggat').value||'',deskripsi:$('tn-desk').value.trim().slice(0,1000),subs:{},dibuat:Date.now()}),'Tugas disimpan');
      if(ok){['tn-judul','tn-tenggat','tn-desk'].forEach(k=>{delete DR[k];});D.newOpen=false;renderDialog(true);}
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
    case 'tsub':{
      if(!ME)break;
      const id=d.id,link=$('sl-'+id).value.trim(),cat=$('sc-'+id).value.trim();
      const t=S.tu[id],mine=t&&t.subs?t.subs[ME]:null;
      const pend=D.pending[id],cur=pend!==undefined?pend:(mine&&mine.berkas||null);
      if(!link&&!cat&&!cur){toast('Isi tautan, catatan, atau kirim berkas dulu.');break;}
      if(link&&!okUrl(link)){toast('Tautan harus diawali http:// atau https://');break;}
      const ok=await run(()=>db.doc('tugas/'+id).update({subs:{[ME]:{tautan:link,catatan:cat.slice(0,500),berkas:cur,at:Date.now()}}}),'Tugas dikumpulkan');
      if(ok){delete D.pending[id];delete DR['sl-'+id];delete DR['sc-'+id];}
      break;
    }
    case 'me-clear':{const ok=await run(clearMe,'Anda sudah keluar');if(ok){if(dlg.open)dlg.close();setView('beranda',true);}break;}
    case 'save-course':{
      if(!adm())break;
      const c=S.co[D.key];
      const sks=Math.max(1,Math.min(6,parseInt($('f-sks').value,10)||c.sks||2));
      await run(()=>db.doc('courses/'+c.k).update({nama:$('f-nama').value.trim()||c.nama,sks:sks,hari:$('f-hari').value,jam:$('f-jam').value.trim(),ruang:$('f-ruang').value.trim(),warna:$('f-warna').value,dosen:$('f-dosen').value.trim()}),'Perubahan disimpan');
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
    case 'ann-save':{
      if(!adm())break;
      const judul=$('an-judul').value.trim();
      if(!judul){toast('Isi judul pengumuman dulu.');break;}
      const ok=await run(()=>db.collection('pengumuman').add({judul:judul.slice(0,120),isi:$('an-isi').value.trim().slice(0,1000),k:$('an-k').value,at:Date.now()}),'Pengumuman terkirim');
      if(ok){['an-judul','an-isi','an-k'].forEach(k=>{delete DR[k];});$('an-judul').value='';$('an-isi').value='';$('an-k').value='';}
      break;
    }
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
    case 'ber-save':{
      if(!ME)break;
      const j=d.j,judul=($(j+'-judul').value||'').trim();
      if(!PEND[j]){toast('Pilih berkas dulu.');break;}
      if(j==='ser'&&!judul){toast('Isi nama sertifikat dulu.');break;}
      const ok=await run(()=>db.collection('berkas').add({no:ME,jenis:j,judul:judul.slice(0,100),file:PEND[j],at:Date.now()}),j==='ser'?'Sertifikat disimpan':'Dokumentasi disimpan');
      if(ok){PEND[j]=null;delete DR[j+'-judul'];renderHome(true);}
      break;
    }
    case 'ber-del':berDel=d.id;renderHome(true);break;
    case 'ber-del-no':berDel=null;renderHome(true);break;
    case 'ber-del-yes':{
      const x=S.be[d.id];
      if(!x||x.no!==ME)break;
      const ok=await run(()=>db.doc('berkas/'+d.id).delete(),'Berkas dihapus');
      if(ok&&AS&&x.file&&x.file.id){try{await AS.delete(x.file.id);}catch(err){}}
      berDel=null;renderHome(true);
      break;
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
  if(t.dataset&&t.dataset.dr)DR[t.dataset.dr]=t.value;
  if(t.dataset&&t.dataset.nim&&adm()){await run(()=>upsertAkun(+t.dataset.nim,{nim:t.value.trim()}),'NIM disimpan');return;}
  if(t.matches&&t.matches('input[type=file][data-up]')){
    const f=t.files&&t.files[0],key=t.dataset.up,kind=t.dataset.kind;
    t.value='';
    if(!f)return;
    await run(async()=>{
      const data=kind==='logo'?await logoImg(f):await squareImg(f,kind==='avatar'?120:280);
      await db.doc('media/'+key).set({data:data});
    },'Gambar disimpan');
    return;
  }
  if(t.matches&&t.matches('input[type=file][data-file]')){
    const f=t.files&&t.files[0],kind=t.dataset.file,tid=t.dataset.id;
    t.value='';
    if(!f||!ME)return;
    if((kind==='bukti'||kind==='tugas')&&!D)return;
    toast('Mengirim berkas…');
    if(kind==='bukti'){
      const k=D.key,n=D.pert;
      await run(async()=>{const fo=await sendFile(f);await writeSession(k,n,{bukti:{[ME]:fo}});},'Bukti terkirim');
    }else if(kind==='ser'||kind==='dok'){
      await run(async()=>{PEND[kind]=await sendFile(f);renderHome(true);},'Berkas siap. Tekan Simpan.');
    }else if(kind==='tugas'){
      await run(async()=>{const fo=await sendFile(f);D.pending[tid]=fo;renderDialog(true);},'Berkas siap. Tekan Kumpulkan untuk menyimpan.');
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

(async function init(){
  const use=n=>(window.claude&&window.claude.use)?window.claude.use(n).catch(()=>null):Promise.resolve(null);
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
    refreshAll();return;
  }
  dbState='ok';
  const onErr=err=>{console.error(err);dbState='err';refreshAll();};
  const sub=(path,key)=>db.collection(path).onSnapshot(snap=>{
    const o={};snap.docs.forEach(x=>{o[x.id]=x.data();});
    S[key]=o;if(key in loaded)loaded[key]=true;refreshAll();
  },onErr);
  sub('students','st');sub('courses','co');sub('media','md');sub('sessions','se');sub('tugas','tu');sub('pengumuman','an');sub('akun','ak');sub('berkas','be');
  if(AUTH){
    AUTH.me().then(m=>{ME=m&&m.no||null;refreshAll();});
  }else if(uid){
    db.doc('data/users/'+uid+'/profil').onSnapshot(s=>{
      const x=s.data();ME=x&&Number.isInteger(x.absen)?x.absen:null;refreshAll();
    },()=>{});
  }else{
    try{const v=localStorage.getItem('gk_me');ME=v?(parseInt(v,10)||null):null;}catch(e){}
    refreshAll();
  }
})();
})();