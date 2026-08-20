(()=>{
  'use strict';

  // Admin data refresh must never rebuild the current section.
  // The old implementation clicked the active navigation button every 15s,
  // which re-rendered the section and could send the owner back to Dashboard.
  const SESSION_KEY='dzmoney.admin.activeSection';
  const LOCAL_KEY='dzmoney.admin.activeSection.v2';
  const REFRESH_MS=15000;
  let restoring=false;
  let dashboardTimer=0;

  const getSaved=()=>{
    try{return sessionStorage.getItem(SESSION_KEY)||localStorage.getItem(LOCAL_KEY)||''}catch(_){return ''}
  };
  const save=section=>{
    if(!section)return;
    try{sessionStorage.setItem(SESSION_KEY,section);localStorage.setItem(LOCAL_KEY,section)}catch(_){ }
  };
  const navButtons=()=>Array.from(document.querySelectorAll('#nav button[data-p]'));
  const activeSection=()=>document.querySelector('#nav button.active')?.dataset?.p||getSaved()||'dash';

  function installNavigationMemory(){
    if(document.documentElement.dataset.adminNavMemory==='1')return;
    document.documentElement.dataset.adminNavMemory='1';
    document.addEventListener('click',event=>{
      const button=event.target.closest?.('#nav button[data-p]');
      if(button)save(button.dataset.p);
    },true);
  }

  function restore(){
    if(restoring)return;
    const section=getSaved();
    if(!section||section==='dash')return;
    const button=navButtons().find(x=>x.dataset.p===section);
    if(!button)return;
    restoring=true;
    setTimeout(()=>{
      try{
        // Restore the navigation state once after a real document reload.
        // This is the only time we intentionally invoke a navigation action.
        button.click();
      }catch(e){console.warn('Admin navigation restore failed',e)}
      finally{restoring=false}
    },120);
  }

  function dashboardRefresh(){
    if(document.hidden||restoring)return;
    if(activeSection()!=='dash')return;

    // admin-dashboard.js exposes a Refresh now button which updates only the
    // dashboard DOM. Never click the sidebar navigation for live refresh.
    const button=document.getElementById('dzRefresh');
    if(button){
      try{button.click()}catch(e){console.warn('Admin dashboard refresh failed',e)}
    }
  }

  function schedule(){
    clearInterval(dashboardTimer);
    dashboardTimer=setInterval(dashboardRefresh,REFRESH_MS);
  }

  function waitForShell(){
    const nav=document.querySelector('#nav button[data-p]');
    if(nav){
      installNavigationMemory();
      restore();
      schedule();
      return;
    }
    setTimeout(waitForShell,100);
  }

  // Restore after browser/Railway/Telegram performs a real document reload.
  window.addEventListener('pageshow',()=>setTimeout(restore,180));
  waitForShell();
})();
