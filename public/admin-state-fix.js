(()=>{
  'use strict';
  const KEY='dz_admin_active_page';
  function install(){
    const nav=document.getElementById('nav');
    if(!nav) return setTimeout(install,50);
    if(nav.dataset.stateFix==='1') return;
    nav.dataset.stateFix='1';
    nav.addEventListener('click',event=>{
      const b=event.target.closest('button[data-p]');
      if(b) localStorage.setItem(KEY,b.dataset.p);
    },true);
    const saved=localStorage.getItem(KEY);
    if(saved){
      const b=nav.querySelector(`button[data-p="${CSS.escape(saved)}"]`);
      if(b) setTimeout(()=>b.click(),0);
    }
  }
  install();
})();
