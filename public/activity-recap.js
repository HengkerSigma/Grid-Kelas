(function(){
'use strict';
const nav=document.getElementById('mainNav');if(!nav||document.getElementById('v-mentari-aktivitas'))return;
const link=document.createElement('button');link.type='button';link.className='nl';link.dataset.view='mentari-aktivitas';link.textContent='Aktivitas Mentari';link.hidden=true;nav.insertBefore(link,document.getElementById('navAdmin')||null);
const view=document.createElement('section');view.className='view';view.id='v-mentari-aktivitas';view.hidden=true;view.innerHTML='<div class="inner gut"><h2 class="title">Aktivitas Mentari</h2><p class="lede">Rekap Pre-test, Forum Diskusi, Post-test, dan Kuesioner per mata kuliah dan pertemuan.</p><div id="mentariActivityRoot" aria-live="polite"></div></div>';document.querySelector('main').appendChild(view);
const style=document.createElement('style');style.textContent='.ma-tools,.ma-card{border:1px solid var(--line,#444);border-radius:14px;padding:16px;margin:14px 0;background:var(--panel,rgba(128,128,128,.06))}.ma-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.ma-card h3{margin:0 0 8px}.ma-muted{color:var(--muted,#888)}.ma-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.ma-actions button{border:1px solid var(--line,#777);border-radius:9px;padding:9px 13px;background:var(--panel,#222);color:inherit;cursor:pointer}.ma-error{color:#d45b5b}.ma-status{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.ma-status span{border:1px solid var(--line,#555);border-radius:20px;padding:4px 9px;font-size:.85rem}.ma-course{margin:22px 0}.ma-table{width:100%;border-collapse:collapse}.ma-table th,.ma-table td{padding:8px;border-bottom:1px solid var(--line,#444);text-align:left;font-size:.9rem}.ma-table-wrap{overflow:auto}';document.head.appendChild(style);
const root=view.querySelector('#mentariActivityRoot');let me=null,pending=null;
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function req(url,options){const r=await fetch(url,Object.assign({credentials:'same-origin',headers:{'X-Requested-With':'gk'}},options||{}));const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||'Permintaan gagal ('+r.status+').');return d;}
function renderActivities(data){
 const items=data.activities||[];
 if(!items.length){root.innerHTML='<p class="ma-muted">Belum ada data aktivitas Mentari yang disinkronkan.</p>';return;}
 const groups=new Map();
 items.forEach(a=>{if(!groups.has(a.course_code))groups.set(a.course_code,[]);groups.get(a.course_code).push(a);});
 const labels={participated:'Sudah berpartisipasi',not_started:'Belum mulai',unknown:'Belum teridentifikasi'};
 root.innerHTML=Array.from(groups.entries()).sort().map(([course,list])=>
  '<section class="ma-course"><h3>'+esc(course)+'</h3><div class="ma-grid">'+
  list.sort((a,b)=>a.meeting_number-b.meeting_number||a.activity_type.localeCompare(b.activity_type)).map(a=>{
   const rows=a.participants||[];
   const mine=rows.find(x=>Number(x.account_no)===Number(me.no));
   const counts={participated:a.participated_count||0,not_started:a.not_started_count||0,unknown:a.unknown_count||0};
   let detail='';
   if(me.admin){
    const byNo=new Map(rows.map(x=>[Number(x.account_no),x]));
    const tableRows=Array.from({length:32},(_,i)=>{
     const no=i+1,x=byNo.get(no),status=x&&labels[x.status]?x.status:'unknown';
     return '<tr><td>'+esc('No. '+no)+'</td><td>'+esc(labels[status])+'</td><td>'+esc(x?x.reply_count||0:0)+'</td></tr>';
    }).join('');
    detail='<div class="ma-table-wrap"><table class="ma-table"><thead><tr><th>Mahasiswa</th><th>Status</th><th>Balasan</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>'+
     (rows.length!==32?'<p class="ma-muted">Detail peserta dari server baru tersedia '+esc(rows.length)+'/32 baris. Baris yang tidak tersedia ditandai Belum teridentifikasi.</p>':'');
   }else if(mine){
    detail='<div class="ma-table-wrap"><table class="ma-table"><thead><tr><th>Mahasiswa</th><th>Status</th><th>Balasan</th></tr></thead><tbody><tr><td>Status kamu</td><td>'+esc(labels[mine.status]||mine.status)+'</td><td>'+esc(mine.reply_count||0)+'</td></tr></tbody></table></div>';
   }
   return '<article class="ma-card"><h3>Pertemuan '+esc(a.meeting_number)+' · '+esc(a.activity_type)+'</h3><p>'+esc(a.title)+'</p>'+
    '<div class="ma-status"><span>'+counts.participated+' berpartisipasi</span><span>'+counts.not_started+' belum mulai</span><span>'+counts.unknown+' belum teridentifikasi</span></div>'+
    (a.activity_type==='FORUM'?'<p class="ma-muted">Minimal 2 komentar/balasan · '+(a.data_complete?'snapshot terverifikasi':'data belum lengkap')+'</p>':'')+detail+'</article>';
  }).join('')+'</div></section>').join('');
}
async function load(){root.innerHTML='<p class="ma-muted">Memuat aktivitas…</p>';try{me=await req('/api/me');if(!me.no){root.textContent='Silakan masuk untuk melihat aktivitas.';return;}renderActivities(await req('/api/mentari/activities'));if(me.admin)renderAdmin();}catch(e){root.innerHTML='<p class="ma-error">'+esc(e.message)+'</p>';}}
function renderAdmin(){const box=document.createElement('section');box.className='ma-tools';box.innerHTML='<h3>Sinkronkan data Mentari</h3><p class="ma-muted">Unggah JSON hasil ekspor Collector v2.3.7 atau lebih baru. Sistem memvalidasi 32 mahasiswa per aktivitas sebelum preview.</p><input type="file" id="ma-file" accept=".json,application/json"><div class="ma-actions"><button type="button" id="ma-preview">Validasi & Preview</button></div><div id="ma-result" aria-live="polite"></div>';root.prepend(box);const file=box.querySelector('#ma-file'),result=box.querySelector('#ma-result'),actions=box.querySelector('.ma-actions');box.querySelector('#ma-preview').addEventListener('click',async()=>{if(!file.files||!file.files[0]){result.textContent='Pilih file JSON terlebih dahulu.';return;}try{const payload=JSON.parse(await file.files[0].text()),d=await req('/api/mentari/activities/import/preview',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'gk'},body:JSON.stringify(payload)});pending=d.batchId;const s=d.summary||{};result.innerHTML='<p><b>Preview siap.</b> '+esc(s.courses)+' mata kuliah · '+esc(s.activities)+' aktivitas · '+esc(s.participants)+' status mahasiswa.</p><div class="ma-status"><span>'+esc(s.participated)+' berpartisipasi</span><span>'+esc(s.not_started)+' belum mulai</span><span>'+esc(s.unknown)+' belum teridentifikasi</span></div><p class="ma-muted">Batch berlaku 30 menit. Data belum masuk rekap aktif.</p>'+(d.warnings||[]).map(w=>'<p class="ma-muted">'+esc(w.code)+' · '+esc(w.activity||'')+'</p>').join('');actions.querySelectorAll('[data-confirm]').forEach(x=>x.remove());const confirm=document.createElement('button');confirm.dataset.confirm='1';confirm.textContent='Konfirmasi & Simpan';confirm.addEventListener('click',async()=>{confirm.disabled=true;try{const saved=await req('/api/mentari/activities/import/confirm',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'gk'},body:JSON.stringify({batchId:pending})});pending=null;result.textContent='Integrasi tersimpan: '+saved.result.activities+' aktivitas dan '+saved.result.participant_rows+' status mahasiswa.';await load();}catch(e){confirm.disabled=false;result.textContent=e.message;}});actions.appendChild(confirm);}catch(e){pending=null;result.innerHTML='<p class="ma-error">'+esc(e.message)+'</p>';}});}
async function init(){try{me=await req('/api/me');link.hidden=!me.admin;await load();}catch(e){root.textContent=e.message;}}
link.addEventListener('click',()=>load());document.addEventListener('click',e=>{if(e.target.closest('[data-view="mentari-aktivitas"]'))setTimeout(load,0);});init();
})();