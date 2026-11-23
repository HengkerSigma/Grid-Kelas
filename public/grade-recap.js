(function(){
'use strict';
const nav=document.getElementById('mainNav');
const adminNav=document.getElementById('navAdmin');
if(!nav||document.getElementById('v-rekap-nilai'))return;
const link=document.createElement('button');
link.type='button';link.className='nl';link.dataset.view='rekap-nilai';link.textContent='Rekap Nilai';
nav.insertBefore(link,adminNav||null);
const view=document.createElement('section');
view.className='view';view.id='v-rekap-nilai';view.hidden=true;
view.innerHTML='<div class="inner gut"><h2 class="title">Personal Grade Recap</h2><p class="lede">Rekap nilai Pre-test dan Post-test dari Mentari. Data ini terpisah dari nilai tugas dan absensi.</p><div id="gradeRecapContent" aria-live="polite"></div></div>';
document.querySelector('main').appendChild(view);
const style=document.createElement('style');
style.textContent='.grade-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin:18px 0}.grade-card{border:1px solid var(--line,#333);border-radius:14px;padding:16px;background:var(--panel,rgba(128,128,128,.08))}.grade-card h3{margin:0 0 8px;font-size:1rem}.grade-card p{margin:4px 0;color:var(--muted,#888)}.grade-score{font:700 1.7rem/1.2 sans-serif;margin-top:10px}.grade-tools{padding:16px;border:1px solid var(--line,#444);border-radius:14px;margin:18px 0}.grade-tools input{display:block;margin:12px 0}.grade-actions{display:flex;gap:8px;flex-wrap:wrap}.grade-actions button{border:1px solid var(--line,#777);border-radius:9px;padding:9px 13px;background:var(--panel,#222);color:inherit;cursor:pointer}.grade-actions button:disabled{opacity:.45;cursor:not-allowed}.grade-warning{color:#b87918}.grade-error{color:#d45b5b}.grade-history-item{border:1px solid var(--line,#444);border-radius:12px;padding:12px;margin:10px 0}.grade-history-open{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;padding:4px}.grade-history-open:hover{text-decoration:underline}.grade-history-detail{margin-top:12px;padding-top:12px;border-top:1px solid var(--line,#444)}.grade-history-detail[hidden]{display:none}.grade-muted{color:var(--muted,#888)}';
document.head.appendChild(style);
const root=view.querySelector('#gradeRecapContent');
let me=null,pendingBatch=null;
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function request(url,options){
 const response=await fetch(url,Object.assign({credentials:'same-origin',headers:{'X-Requested-With':'gk'}},options||{}));
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.message||data.error||'Permintaan gagal ('+response.status+').');
 return data;
}
function button(label,action,disabled){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=!!disabled;b.addEventListener('click',action);return b;}
function renderMessage(text,kind){root.innerHTML='<p class="'+(kind==='error'?'grade-error':'grade-muted')+'">'+esc(text)+'</p>';}
function renderResults(items){
 const groups=new Map();
 items.forEach(item=>{const a=item.activity||{},key=[a.course_code||'?',a.meeting_number||'?',a.quiz_type||'?'].join('|');if(!groups.has(key))groups.set(key,{activity:a,grade:item.grade,status:item.status,updated:item.updatedAt});});
 if(!groups.size){root.innerHTML='<p class="grade-muted">Belum ada rekap nilai yang tersedia untuk akun ini.</p>';return;}
 root.innerHTML='<div class="grade-grid">'+Array.from(groups.values()).map(x=>'<article class="grade-card"><h3>'+esc(x.activity.course_code)+' · Pertemuan '+esc(x.activity.meeting_number)+'</h3><p>'+esc(x.activity.title||x.activity.quiz_type)+'</p><p>'+esc(x.activity.quiz_type==='PRE_TEST'?'Pre-test':'Post-test')+'</p><div class="grade-score">'+(x.status==='graded'&&x.grade!==null?esc(Number(x.grade).toLocaleString('id-ID')):'—')+'</div><p>'+(x.status==='graded'?'Nilai':'Belum ada rekaman nilai')+'</p></article>').join('')+'</div>';
}
function renderAdminTools(){
 const box=document.createElement('section');box.className='grade-tools';
 box.innerHTML='<h3>Impor nilai Mentari</h3><p class="grade-muted">Unggah file JSON hasil ekspor Collector v2. Data akan divalidasi dan ditampilkan sebelum disimpan.</p><input id="gradeImportFile" type="file" accept=".json,application/json"><div class="grade-actions" id="gradeImportActions"></div><div id="gradeImportStatus" aria-live="polite"></div>';
 root.prepend(box);
 const history=document.createElement('section');history.className='grade-tools';history.innerHTML='<h3>Riwayat impor</h3><div class="grade-history"><p class="grade-muted">Memuat riwayat…</p></div>';root.appendChild(history);
 request('/api/mentari/grades/history').then(data=>{
  const target=history.querySelector('.grade-history'),batches=data.batches||[];
  target.innerHTML=batches.length?batches.map(x=>'<article class="grade-history-item"><button type="button" class="grade-history-open" data-batch-id="'+esc(x.batch_id)+'"><span><b>'+esc(x.status)+'</b> · '+esc(x.semester)+'<br><span class="grade-muted">'+esc(x.created_at)+'</span></span><span>'+esc((x.summary||{}).rows||0)+' baris　⌄</span></button><div class="grade-history-detail" hidden aria-live="polite"></div></article>').join(''):'<p class="grade-muted">Belum ada riwayat impor.</p>';
  target.querySelectorAll('[data-batch-id]').forEach(openButton=>openButton.addEventListener('click',async()=>{
   const detail=openButton.parentElement.querySelector('.grade-history-detail');
   if(!detail.hidden){detail.hidden=true;openButton.setAttribute('aria-expanded','false');return;}
   detail.hidden=false;openButton.setAttribute('aria-expanded','true');detail.innerHTML='<p class="grade-muted">Memuat detail batch…</p>';
   try{
    const result=await request('/api/mentari/grades/history/'+encodeURIComponent(openButton.dataset.batchId));
    const batch=result.batch||{},activities=result.activities||[],warnings=result.warnings||[];
    const warningCounts=new Map();
    warnings.forEach(w=>{const key=String(w.activity||''),code=String(w.code||'W_UNKNOWN'),bucket=warningCounts.get(key)||{};bucket[code]=(bucket[code]||0)+1;warningCounts.set(key,bucket);});
    const labels={W_PARTIAL_EXPORT:'Ekspor parsial',W_NO_RECORD:'Peserta tanpa rekaman nilai',W_OLD_CAPTURE:'Ekspor berusia lebih dari 7 hari'};
    const cards=activities.map(a=>{
      const id=String(a.external_activity_id||''),counts=warningCounts.get(id)||{};
      if(Number(a.no_record_rows)>0)counts.W_NO_RECORD=counts.W_NO_RECORD||Number(a.no_record_rows);
      const warningHtml=Object.keys(counts).length?'<div class="grade-warning">'+Object.keys(counts).map(code=>esc(labels[code]||code)+' ('+esc(counts[code])+')').join(' · ')+'</div>':'<p class="grade-muted">Peringatan historis tidak tersedia pada batch ini.</p>';
      const captureHtml=Object.prototype.hasOwnProperty.call(a,'data_complete')
        ? (a.data_complete===true?'<p class="grade-muted">Snapshot lengkap tersimpan · '+esc(a.captured_at||'waktu tidak tersedia')+'</p>':'<p class="grade-warning">Belum ada snapshot lengkap tersimpan dari Collector.</p>')
        : '<p class="grade-muted">Status pengambilan tidak tercatat pada batch lama.</p>';
      const statusCounts = ['graded_rows','no_record_rows','unresolved_rows'].every(key=>Number.isFinite(Number(a[key])))
        ? '<p><b>Status nilai:</b> '+esc(a.graded_rows)+' graded · '+esc(a.no_record_rows)+' no_record · '+esc(a.unresolved_rows)+' unresolved</p>'
        : '<p class="grade-muted">Rincian status nilai tidak tercatat pada batch lama.</p>';
      return '<article class="grade-card"><h3>'+esc(a.course_code||'?')+' · Pertemuan '+esc(a.meeting_number||'?')+'</h3><p><b>'+esc(a.title||a.quiz_type||'Aktivitas kuis')+'</b></p><p>'+esc(a.quiz_type||'')+'</p><p>'+esc(a.staged_rows||0)+' baris staging · '+esc(a.total_rows||0)+' hasil ekspor</p>'+statusCounts+captureHtml+warningHtml+'</article>';
    }).join('');
    const summary=batch.summary||{};
    const hasStatusSummary=['graded_rows','no_record_rows','unresolved_rows'].every(key=>Number.isFinite(Number(summary[key])));
    const statusSummary=hasStatusSummary
      ? '<p><b>Rincian status:</b> '+esc(summary.graded_rows)+' graded · '+esc(summary.no_record_rows)+' no_record · '+esc(summary.unresolved_rows)+' unresolved</p>'
      : '<p class="grade-muted">Rincian status nilai tidak tercatat pada batch lama.</p>';
    detail.innerHTML='<p><b>Status:</b> '+esc(batch.status)+' · <b>Semester:</b> '+esc(batch.semester)+'</p><p><b>Dibuat:</b> '+esc(batch.created_at)+'</p><p><b>Baris:</b> '+esc(summary.rows||0)+' · <b>Aktivitas:</b> '+esc(summary.activities_count||activities.length)+'</p>'+statusSummary+(batch.committed_at?'<p><b>Disimpan:</b> '+esc(batch.committed_at)+'</p>':'')+'<h4>Rincian aktivitas</h4>'+(cards?'<div class="grade-grid">'+cards+'</div>':'<p class="grade-muted">Rincian aktivitas tidak tersedia pada batch ini.</p>');
   }catch(error){detail.innerHTML='<p class="grade-error">'+esc(error.message)+'</p>';}
  }));
 }).catch(e=>{history.querySelector('.grade-history').textContent=e.message;});
 const file=box.querySelector('#gradeImportFile'),actions=box.querySelector('#gradeImportActions'),status=box.querySelector('#gradeImportStatus');
 actions.appendChild(button('Sinkronkan Mentari',()=>{
    pendingBatch=null;
    status.innerHTML='<p>Meminta tiket sinkronisasi. Pastikan Tampermonkey aktif di Grid Kelas dan tab Mentari sudah login.</p><p class="grade-muted">Collector mengirim snapshot lengkap yang sudah tersimpan lokal; kuis yang belum dimuat harus dibuka melalui navigasi Mentari.</p>';
    document.dispatchEvent(new CustomEvent('gk:mentari-sync-request'));
  }));
  document.addEventListener('gk:mentari-sync-status',event=>{
    const result=event.detail||{};
    if(!box.isConnected)return;
    if(!result.ok){status.innerHTML='<p class="grade-error">'+esc(result.message||'Sinkronisasi gagal.')+'</p>';return;}
    pendingBatch=result.batchId;
    const activityList = Array.isArray(result.summary && result.summary.activities) ? result.summary.activities : [];
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const warningCounts = new Map();
    warnings.forEach(w => {
      const key = w && w.activity ? String(w.activity) : '';
      const code = w && w.code ? String(w.code) : 'W_UNKNOWN';
      const bucket = warningCounts.get(key) || {};
      bucket[code] = (bucket[code] || 0) + 1;
      warningCounts.set(key, bucket);
    });
    const warningLabel = code => ({
      W_PARTIAL_EXPORT:'Ekspor parsial — data peserta belum lengkap',
      W_NO_RECORD:'Ada peserta tanpa rekaman nilai',
      W_GRADE_MISSING:'Status nilai perlu diperiksa',
      W_OLD_CAPTURE:'Data ekspor berusia lebih dari 7 hari'
    })[code] || code;
    const activityMarkup = activityList.length ? activityList.map(a => {
      const id = String(a.external_activity_id || '');
      const counts = warningCounts.get(id) || {};
      const labels = Object.keys(counts).map(code => '<span class="grade-warning">'+esc(warningLabel(code))+' ('+esc(counts[code])+')</span>');
      const type = a.quiz_type === 'PRE_TEST' ? 'Pre-test' : a.quiz_type === 'POST_TEST' ? 'Post-test' : String(a.quiz_type || 'Jenis kuis tidak diketahui');
      return '<article class="grade-card"><h3>'+esc(a.course_code || 'Mata kuliah?')+' · Pertemuan '+esc(a.meeting_number || '?')+'</h3>'+
        '<p><b>'+esc(a.title || type)+'</b></p><p>'+esc(type)+'</p><p>'+esc(a.accepted_rows || 0)+' baris diterima dari '+esc(a.total_rows || 0)+' hasil Mentari</p>'+
        '<p>'+esc(a.graded_rows||0)+' graded · '+esc(a.no_record_rows||0)+' no_record · '+esc(a.unresolved_rows||0)+' nilai belum terpetakan</p>'+
        (labels.length ? '<div>'+labels.join('<br>')+'</div>' : '<p class="grade-muted">Tidak ada peringatan khusus</p>')+
        '<details><summary>Detail ID aktivitas</summary><code>'+esc(id || 'Tidak tersedia')+'</code></details></article>';
    }).join('') : '<p class="grade-warning">Rincian aktivitas tidak dikirim oleh server. Perlu pemeriksaan lebih lanjut.</p>';
    const globalWarnings = warningCounts.get('') || {};
    const syncSummary=result.summary||{};
    status.innerHTML='<p><b>Preview sinkronisasi siap.</b> '+esc(Number(syncSummary.activities)||activityList.length)+' aktivitas · '+esc(syncSummary.rows||0)+' baris diterima.</p>'+
      '<p><b>Rincian status:</b> '+esc(syncSummary.graded_rows||0)+' graded · '+esc(syncSummary.no_record_rows||0)+' no_record · '+esc(syncSummary.unresolved_rows||0)+' nilai belum terpetakan.</p>'+
      (Object.keys(globalWarnings).length ? '<div class="grade-warning">'+Object.keys(globalWarnings).map(code=>esc(warningLabel(code))+' ('+esc(globalWarnings[code])+')').join(' · ')+'</div>' : '')+
      '<h4>Daftar aktivitas</h4><div class="grade-grid">'+activityMarkup+'</div>'+
      '<p class="grade-muted">Batch berlaku selama 30 menit. Periksa setiap aktivitas sebelum menyimpan. Penyimpanan belum dilakukan.</p>';
    actions.querySelectorAll('[data-confirm-import]').forEach(x=>x.remove());
    const confirmButton=button('Konfirmasi & Simpan',async()=>{
      if(!pendingBatch)return;
      confirmButton.disabled=true;
      try{
        const saved=await request('/api/mentari/grades/import/confirm',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'gk'},body:JSON.stringify({batchId:pendingBatch})});
        status.textContent='Sinkronisasi berhasil disimpan: '+JSON.stringify(saved.result);
        pendingBatch=null;await load();
      }catch(error){confirmButton.disabled=false;status.textContent=error.message;}
    });
    confirmButton.dataset.confirmImport='1';actions.appendChild(confirmButton);
  });
  actions.appendChild(button('Validasi & Preview',async()=>{
   if(!file.files||!file.files[0]){status.textContent='Pilih file JSON terlebih dahulu.';return;}
   try{
    const payload=JSON.parse(await file.files[0].text());
    const result=await request('/api/mentari/grades/import/preview',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'gk'},body:JSON.stringify(payload)});
    pendingBatch=result.batchId;
    actions.querySelectorAll('[data-confirm-import]').forEach(x=>x.remove());
    const summary=result.summary||{},activities=Array.isArray(result.activities)?result.activities:[];
    const activityCount=Number.isFinite(Number(summary.activities))?Number(summary.activities):activities.length;
    const graded=Number(summary.graded_rows)||0,noRecord=Number(summary.no_record_rows)||0,unresolved=Number(summary.unresolved_rows)||0;
    const warnings=Array.isArray(result.warnings)?result.warnings:[];
    status.innerHTML='<p><b>Preview siap.</b> '+esc(activityCount)+' aktivitas · '+esc(summary.rows||0)+' baris diterima.</p>'+
      '<p><b>Rincian status:</b> '+esc(graded)+' graded · '+esc(noRecord)+' no_record · '+esc(unresolved)+' nilai belum terpetakan.</p>'+
      (warnings.length?'<div>'+warnings.map(w=>'<p class="grade-warning">'+esc(w.code)+(w.activity?' · aktivitas '+esc(w.activity):'')+'</p>').join('')+'</div>':'<p class="grade-muted">Tidak ada peringatan.</p>')+
      '<p class="grade-muted">Batch berlaku selama 30 menit. Periksa rincian sebelum konfirmasi.</p>';
    const confirmButton=button('Konfirmasi & Simpan',async()=>{
      if(!pendingBatch)return;
      try{const saved=await request('/api/mentari/grades/import/confirm',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'gk'},body:JSON.stringify({batchId:pendingBatch})});
        status.textContent='Impor berhasil: '+JSON.stringify(saved.result);pendingBatch=null;await load();
      }catch(e){status.textContent=e.message;}
    });confirmButton.dataset.confirmImport='1';actions.appendChild(confirmButton);
   }catch(e){pendingBatch=null;status.innerHTML='<p class="grade-error">'+esc(e.message)+'</p>';}
 }),false);
}
async function load(){
 root.innerHTML='<p class="grade-muted">Memuat rekap nilai…</p>';
 try{
  me=await request('/api/me');
  if(!me.no){renderMessage('Silakan masuk untuk melihat rekap nilai.');return;}
  const data=await request('/api/mentari/grades/mine');
  renderResults(data.results||[]);
  if(me.admin)renderAdminTools();
 }catch(e){renderMessage(e.message,'error');}
}
link.addEventListener('click',()=>{load();});
document.addEventListener('click',e=>{const b=e.target.closest('[data-view="rekap-nilai"]');if(b)setTimeout(load,0);});
load();
})();
