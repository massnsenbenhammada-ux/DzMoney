(()=>{
  'use strict';

  const SECTION_KEY='dzmoney.admin.activeSection';
  const REFRESH_MS=15000;
  let restoring=false;
  let lastRefresh=0;

  const navButtons=()=>Array.from(document.querySelectorAll('#nav button[data-p]'));
  const activeSection=()=>document.querySelector('#nav button.active')?.dataset?.p||sessionStorage.getItem(SECTION_KEY)||'dash';
  const remember=section=>{try{sessionStorage.setItem(SECTION_KEY,section)}catch(_) {}};

  function installNavigationMemory(){
    document.addEventListener('click',event=>{
      const button=event.target.closest?.('#nav button[data-p]');
      if(button) remember(button.dataset.p);
    },true);
  }

  function safeToRefresh(section){
    // Never overwrite an admin form while the owner is typing/selecting a value.
    const focused=document.activeElement;
    if(focused && ['INPUT','TEXTAREA','SELECT'].includes(focused.tagName)) return false;
    if(document.querySelector('.modal:not(.hidden)')) return false;
    if(document.querySelector('[contenteditable="true"]')) return false;
    return section==='dash' || section==='users' || section==='tasks' || section==='activity' || section==='referral' || section==='audit';
  }

  function restore(){
    if(restoring) return;
    const section=sessionStorage.getItem(SECTION_KEY);
    if(!section || section==='dash') return;
    const button=navButtons().find(x=>x.dataset.p===section);
    if(!button) return;
    restoring=true;
    setTimeout(()=>{
      try{button.click()}catch(e){console.warn('Admin navigation restore failed',e)}
      finally{restoring=false}
    },80);
  }

  function refreshActive(){
    if(document.hidden || restoring) return;
    const section=activeSection();
    if(!safeToRefresh(section)) return;
    if(Date.now()-lastRefresh<REFRESH_MS) return;

    const button=navButtons().find(x=>x.dataset.p===section);
    if(!button) return;
    lastRefresh=Date.now();
    try{button.click()}catch(e){console.warn('Admin live refresh failed',e)}
  }

  function waitForShell(){
    if(document.querySelector('#nav button[data-p]')){
      installNavigationMemory();
      restore();
      setInterval(refreshActive,REFRESH_MS);
      return;
    }
    setTimeout(waitForShell,100);
  }

  waitForShell();
})();
