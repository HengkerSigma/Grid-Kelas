(function(){
  'use strict';
  function report(message){
    var box=document.getElementById('gk-diagnostic');
    if(!box){
      box=document.createElement('pre');
      box.id='gk-diagnostic';
      box.style.cssText='margin:16px;padding:14px;border:1px solid #e10600;border-radius:10px;background:#241719;color:#fff;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.5 monospace;position:relative;z-index:10000';
      var main=document.querySelector('main');
      if(main)main.insertBefore(box,main.firstChild);else document.body.appendChild(box);
    }
    box.textContent='DIAGNOSTIK JAVASCRIPT\\n'+String(message||'Kesalahan tidak diketahui');
  }
  window.addEventListener('error',function(e){
    report((e.message||'Gagal memuat script')+(e.filename?'\\nFile: '+e.filename.split('/').pop():'')+(e.lineno?'\\nBaris: '+e.lineno:''));
  });
  window.addEventListener('unhandledrejection',function(e){
    var reason=e.reason;
    report('Promise gagal: '+(reason&&reason.message?reason.message:String(reason||'Tidak diketahui')));
  });
  window.__gkReport=report;
})();