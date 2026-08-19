"use strict";

(() => {
  if (!document.querySelector('link[data-dz-task-fix]')) { const link=document.createElement('link'); link.rel='stylesheet'; link.href='/task-v2-fix.css?v=6'; link.dataset.dzTaskFix='1'; document.head.appendChild(link); }
  const tg=window.Telegram?.WebApp;
  const CATEGORIES=[{id:"daily",title:"Daily Activity",subtitle:"Complete daily activities and earn rewards",icon:"☀️"},{id:"game",title:"Game Tasks",subtitle:"Play partner Mini Apps and earn rewards",icon:"🎮"},{id:"social",title:"Social Tasks",subtitle:"Follow, join and engage",icon:"👥"},{id:"web",title:"Web Tasks",subtitle:"Visit websites and complete actions",icon:"◎"},{id:"special",title:"Special Tasks",subtitle:"Higher-value verified tasks",icon:"✦"},{id:"partner",title:"Partner Tasks",subtitle:"Exclusive partner campaigns",icon:"🤝"}];
  const DAILY_ORDER=["daily_checkin","check_updates","share_friends","view_ads","invite_1","invite_10"];
  let allTasks=[],currentCategory=null,adsgramScriptPromise=null,adsgramController=null;
  async function api(url,options={}){const headers={"Content-Type":"application/json",...(options.headers||{})};if(tg?.initData)headers["X-Telegram-Init-Data"]=tg.initData;const r=await fetch(url,{...options,headers}),raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch(_){}if(!r.ok){const e=new Error(d.message||d.error||raw||`HTTP ${r.status}`);e.status=r.status;throw e}return d}
  const esc=v=>String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const main=()=>document.querySelector("main"),cat=id=>CATEGORIES.find(x=>x.id===id)||CATEGORIES[0];
  const int=v=>{const n=Number(v||0);return Number.isFinite(n)?Math.round(n).toLocaleString("en-US"):"0"};
  const dzx=v=>{const n=Number(v);if(!Number.isFinite(n))return"0";return Number.isInteger(n)?n.toLocaleString("en-US"):n.toLocaleString("en-US",{maximumFractionDigits:4})};
  const reward=t=>`<div class="dz-task-reward"><b>+${int(t.rewardCoins)}</b> Coins <i>•</i> <b>💎 +${dzx(t.rewardDZX)}</b> DZX</div>`;

  function renderShell(category=null){const m=main();if(!m)return;currentCategory=category;if(!category){m.innerHTML=`<section class="dz-tasks-page"><div class="dz-tasks-hero"><div class="dz-tasks-eyebrow">DZMONEY EARN</div><h1>Tasks</h1><p>Choose a category and complete tasks to earn <strong>Coins</strong> + <strong>DZX</strong> rewards.</p></div><div class="dz-category-list">${CATEGORIES.map((x,i)=>`<button class="dz-category-card" data-category="${x.id}" type="button"><span class="dz-category-number">0${i+1}</span><span class="dz-category-icon">${x.icon}</span><span class="dz-category-copy"><strong>${esc(x.title)}</strong><small>${esc(x.subtitle)}</small></span><span class="dz-category-arrow">›</span></button>`).join("")}</div></section>`;m.querySelectorAll("[data-category]").forEach(b=>b.onclick=()=>renderShell(b.dataset.category));return}const h=cat(category);m.innerHTML=`<section class="dz-tasks-page"><button class="dz-task-back" id="dz-task-back" type="button"><span>‹</span> Tasks</button><div class="dz-tasks-hero"><div class="dz-tasks-eyebrow">CATEGORY 0${CATEGORIES.findIndex(x=>x.id===category)+1}</div><h1>${esc(h.title)}</h1><p>${esc(h.subtitle)}</p></div><section class="dz-task-section-head"><div class="dz-category-mark">${h.icon}</div><div><span>${category==="daily"?"Daily reset":"Available tasks"}</span><h2>${esc(h.title)}</h2></div><button class="dz-task-refresh-icon" id="dz-task-refresh" type="button">↻</button></section><div id="dz-task-list" class="dz-task-list"></div></section>`;document.getElementById("dz-task-back").onclick=()=>renderShell();document.getElementById("dz-task-refresh").onclick=loadTasks;loadTasks()}

  function renderTasks(){const list=document.getElementById("dz-task-list");if(!list)return;const visible=[...allTasks.filter(t=>String(t.type).toLowerCase()===currentCategory)].sort((a,b)=>{if(currentCategory!=="daily")return 0;const o=new Map(DAILY_ORDER.map((id,i)=>[id,i]));return(o.get(a.id)??999)-(o.get(b.id)??999)});if(!visible.length){list.innerHTML=`<div class="dz-empty-state"><div class="dz-empty-icon">${cat(currentCategory).icon}</div><h3>No tasks available yet</h3><p>New tasks will appear here when published.</p></div>`;return}list.innerHTML=visible.map((t,i)=>{const locked=!t.available,isAds=t.id==="view_ads",p=t.progress||{},count=Number(p.completedCount||0),required=Number(p.requiredCount||0),hasProgress=isAds&&required>0,pct=hasProgress?Math.min(100,Math.round(count/required*100)):0;const icons=["✓","↻","↗","▶","＋","＋"],action=locked?"Locked":t.id==="daily_checkin"?"Claim":t.id==="check_updates"?"Go ↗":t.id==="share_friends"?"Share":t.id==="invite_1"||t.id==="invite_10"?"Invite":"Start";return `<article class="dz-task-row ${isAds?"dz-ad-task":""}"><div class="dz-task-index">${String(i+1).padStart(2,"0")}</div><div class="dz-task-icon">${currentCategory==="daily"?(icons[i]||"•"):cat(currentCategory).icon}</div><div class="dz-task-content"><div class="dz-task-title-line"><h3>${esc(t.title)}</h3>${locked?'<span class="dz-task-status">Locked</span>':""}</div><p>${esc(t.description||"Complete this task to earn your reward.")}</p>${isAds&&hasProgress?`<div class="dz-ad-progress"><div class="dz-ad-progress-top"><strong>Ads watched</strong><b>${count} / ${required}</b></div><div class="dz-ad-progress-track"><span style="width:${pct}%"></span></div></div>`:""}${reward(t)}${t.id==="invite_1"||t.id==="invite_10"?'<small class="dz-task-cooldown">Lifetime 20% from eligible referred activity</small>':""}</div><button class="dz-task-action" type="button" data-task-id="${esc(t.id)}" ${locked?"disabled":""}>${action}</button></article>`}).join("");list.querySelectorAll("[data-task-id]").forEach(b=>b.onclick=()=>startTask(b.dataset.taskId,b))}

  async function loadTasks(){const list=document.getElementById("dz-task-list");if(!list)return;list.innerHTML='<div class="dz-loading"><span></span><span></span><span></span><p>Loading tasks</p></div>';try{const r=await api("/api/v2/tasks");allTasks=Array.isArray(r.tasks)?r.tasks:[];renderTasks()}catch(e){list.innerHTML=`<div class="dz-error-state"><strong>Unable to load tasks</strong><p>${esc(e.message)}</p><button id="dz-task-retry">Try again</button></div>`;document.getElementById("dz-task-retry").onclick=loadTasks}}

  function loadAdsGramSdk(){
    if(window.Adsgram)return Promise.resolve(window.Adsgram);
    if(adsgramScriptPromise)return adsgramScriptPromise;
    adsgramScriptPromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-dz-adsgram]');
      if(existing){
        existing.addEventListener("load",()=>window.Adsgram?resolve(window.Adsgram):reject(new Error("AdsGram SDK is unavailable.")),{once:true});
        existing.addEventListener("error",()=>reject(new Error("AdsGram SDK failed to load.")),{once:true});
        return;
      }
      const script=document.createElement("script");
      script.src="https://sad.adsgram.ai/js/sad.min.js";
      script.async=true;
      script.dataset.dzAdsgram="1";
      script.onload=()=>window.Adsgram?resolve(window.Adsgram):reject(new Error("AdsGram SDK is unavailable."));
      script.onerror=()=>reject(new Error("AdsGram SDK failed to load."));
      document.head.appendChild(script);
    });
    return adsgramScriptPromise;
  }

  async function showAdsGramAd({blockId,onReward,onError}={}){
    const id=String(blockId||"").trim();
    if(!id)throw new Error("AdsGram is not configured yet.");
    const Adsgram=await loadAdsGramSdk();
    if(!adsgramController||adsgramController.__dzBlockId!==id){
      adsgramController=Adsgram.init({blockId:id});
      adsgramController.__dzBlockId=id;
    }
    return new Promise(async (resolve,reject)=>{
      let settled=false;
      const cleanup=()=>{
        try{adsgramController.removeEventListener("onReward",rewardHandler)}catch(_){ }
        try{adsgramController.removeEventListener("onSkip",skipHandler)}catch(_){ }
        try{adsgramController.removeEventListener("onError",errorHandler)}catch(_){ }
        try{adsgramController.removeEventListener("onBannerNotFound",errorHandler)}catch(_){ }
      };
      const finishReward=async()=>{
        if(settled)return;
        settled=true;
        cleanup();
        try{await onReward?.();resolve({done:true})}catch(error){onError?.(error);reject(error)}
      };
      const rewardHandler=()=>{void finishReward()};
      const skipHandler=()=>{
        if(settled)return;
        settled=true;cleanup();
        const error=new Error("The ad was not completed.");
        onError?.(error);reject(error);
      };
      const errorHandler=()=>{
        if(settled)return;
        settled=true;cleanup();
        const error=new Error("AdsGram could not complete the ad.");
        onError?.(error);reject(error);
      };
      adsgramController.addEventListener("onReward",rewardHandler);
      adsgramController.addEventListener("onSkip",skipHandler);
      adsgramController.addEventListener("onError",errorHandler);
      adsgramController.addEventListener("onBannerNotFound",errorHandler);
      try{
        await adsgramController.show();
        if(!settled){
          // Rewarded ads must be credited from AdsGram's real onReward event.
          // A resolved show() promise alone is intentionally not treated as proof.
        }
      }catch(error){
        if(settled)return;
        settled=true;cleanup();onError?.(error);reject(error);
      }
    });
  }

  window.showAdsGramAd=showAdsGramAd;

  async function startTask(id,b){const original=b.textContent;b.disabled=true;b.textContent=id==="daily_checkin"?"Claiming":id==="view_ads"?"Watch":"Starting";try{const r=await api(`/api/v2/tasks/${encodeURIComponent(id)}/start`,{method:"POST",body:"{}"});if(id==="view_ads"){const task=allTasks.find(t=>t.id==="view_ads");const blockId=task?.metadata?.adsgramBlockId||"";if(!blockId)throw new Error("Ads are not configured yet. Please try again later.");b.textContent="Watching…";await window.showAdsGramAd({blockId,onReward:()=>onAdComplete("AdsGram")});b.disabled=false;b.textContent=original;return}if(id==="daily_checkin"){const x=await api(`/api/v2/tasks/${id}/verify`,{method:"POST",body:JSON.stringify({source:"daily_checkin"})});alert(`Daily Check-in complete!\n+${int(x.reward?.coins)} Coins • +${dzx(x.reward?.dzx)} DZX`);await loadTasks();return}if(id==="check_updates"&&r.task?.metadata?.channelUrl)window.open(r.task.metadata.channelUrl,"_blank");b.textContent=id==="check_updates"?"Opened":id==="share_friends"?"Shared":id==="invite_1"||id==="invite_10"?"Invited":"Started";b.classList.add("is-started")}catch(e){b.disabled=false;b.textContent=original;alert(e.message||"Unable to start task.")}}
  async function onAdComplete(provider){try{const r=await api("/api/v2/tasks/view_ads/ad-complete",{method:"POST",body:JSON.stringify({provider,confirmed:true})});await loadTasks();if(r.completed)alert(`Daily ads complete!\n+${int(r.reward?.coins)} Coins • +${dzx(r.reward?.dzx)} DZX`)}catch(e){alert(e.message||"Unable to record ad view.")}}
  window.dzMoneyAdCompleted=onAdComplete;
  const originalOpenSection=window.openSection;window.openSection=function(page){if(page==="tasks"){renderShell();if(typeof window.setActiveNav==="function")window.setActiveNav("tasks");return}if(typeof originalOpenSection==="function")return originalOpenSection.apply(this,arguments)};
})();
