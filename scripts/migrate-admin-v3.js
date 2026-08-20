"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const corePath = path.join(root, "admin-panel-core-v2.js");
const uiPath = path.join(root, "public", "admin.html");

function patch(file, replacements, label) {
  let source = fs.readFileSync(file, "utf8");
  let changed = false;
  for (const [from, to] of replacements) {
    if (source.includes(to)) continue;
    const count = source.split(from).length - 1;
    if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
    source = source.replace(from, to);
    changed = true;
  }
  if (changed) fs.writeFileSync(file, source);
}

patch(corePath, [
  [
    'const input=req.body?.settings;if(!input||typeof input!=="object"||Array.isArray(input))return res.status(400).json({success:false,message:"settings object is required."});const n={};try{for(const[k,v]of Object.entries(input))n[k]=normalize(k,v);}',
    'const input=req.body?.settings;if(!input||typeof input!=="object"||Array.isArray(input))return res.status(400).json({success:false,message:"settings object is required."});const n={};try{const currentResult=await pool.query("SELECT key,value FROM settings");const current=Object.fromEntries(currentResult.rows.map(x=>[x.key,x.value]));for(const[k,v]of Object.entries(input)){const raw=(String(v??"").trim()===""&&!STRINGS.has(k))?current[k]:v;if(raw===undefined)throw Error(`${k} has no stored value; enter a value before saving.`);n[k]=normalize(k,raw);}}',
  ],
  [
    'async function dzp(req,res,delta){',
    'async function adjustEconomy(req,res){const body=req.body||{},asset=String(body.asset||"").toLowerCase(),mode=String(body.mode||"delta").toLowerCase();if(!["coins","dzx"].includes(asset))return res.status(400).json({success:false,message:"Asset must be Coins or DZX."});const value=Number(mode==="set"?body.value:body.delta);if(!Number.isFinite(value)||!Number.isSafeInteger(value)||value<0&&mode==="set")return res.status(400).json({success:false,message:"Balance value must be a valid non-negative whole number."});const c=await pool.connect();try{await c.query("BEGIN");const r=await c.query(`SELECT ${asset} FROM users WHERE id=$1 FOR UPDATE`,[req.params.id]);if(!r.rowCount){await c.query("ROLLBACK");return res.status(404).json({success:false,message:"User not found."});}const before=Number(r.rows[0][asset]||0),after=mode==="set"?value:before+value;if(after<0||!Number.isSafeInteger(after)){await c.query("ROLLBACK");return res.status(400).json({success:false,message:"Balance cannot be negative or exceed the safe integer range."});}const u=await c.query(`UPDATE users SET ${asset}=$1 WHERE id=$2 RETURNING id,coins,dzx,dzp,withdrawable_dzx,locked_dzx`,[after,req.params.id]);const difference=after-before;if(difference!==0){await c.query("INSERT INTO economy_ledger(user_id,asset,direction,amount,balance_bucket,source_type,source_id,metadata,created_at) VALUES($1,$2,$3,$4,'available','ADMIN_ADJUSTMENT',$5,$6,$7)",[req.params.id,asset.toUpperCase(),difference>0?"CREDIT":"DEBIT",Math.abs(difference),`ADMIN:${req.admin.admin_id}:${Date.now()}`,JSON.stringify({before,after,mode}),Date.now()]);}await c.query("COMMIT");await audit(req,`admin_${asset}_${mode}`,req.params.id,`before=${before};after=${after}`);res.json({success:true,user:u.rows[0]});}catch(e){await c.query("ROLLBACK").catch(()=>{});console.error("Admin economy error",e);res.status(500).json({success:false,message:e.message||"Unable to update balance."});}finally{c.release();}}
async function dzp(req,res,delta){'
  ],
  [
    'r.get("/api/admin/users/:id/economy",auth,userEconomy);r.put("/api/admin/users/:id/balance",auth,(q,s)=>dzp(q,s,false));',
    'r.get("/api/admin/users/:id/economy",auth,userEconomy);r.put("/api/admin/users/:id/balance",auth,(q,s)=>dzp(q,s,false));r.put("/api/admin/users/:id/economy",auth,adjustEconomy);'
  ]
], "Admin backend v3 migration");

patch(uiPath, [
  [
    'async function saveKeys(keys){const payload={};keys.forEach(k=>payload[k]=document.querySelector(`[data-s="${k}"]`)?.value??settings[k]);await api(\'/api/admin/settings\',{method:\'PUT\',body:JSON.stringify({settings:payload})});toast(\'Saved to PostgreSQL\');await loadSettings()}',
    'async function saveKeys(keys){const payload={};keys.forEach(k=>{const el=document.querySelector(`[data-s="${k}"]`);payload[k]=el?el.value:settings[k]});const buttons=[document.activeElement].filter(Boolean);try{buttons.forEach(b=>{if(b.tagName===\'BUTTON\'){b.disabled=true;b.dataset.oldText=b.textContent;b.textContent=\'Saving…\'}});const result=await api(\'/api/admin/settings\',{method:\'PUT\',body:JSON.stringify({settings:payload})});await loadSettings();toast(`Saved ${Object.keys(result.settings||payload).length} setting(s) to PostgreSQL`);await go(page)}catch(e){toast(`Save failed: ${e.message}`)}finally{buttons.forEach(b=>{if(b.tagName===\'BUTTON\'){b.disabled=false;if(b.dataset.oldText)b.textContent=b.dataset.oldText}})}}'
  ],
  [
    '<div class="section"><h3>DZP control</h3><div class="form"><div class="field"><label>Exact DZP</label><input id="dzpExact" type="number" min="0" step="1" value="${Number(z.dzp||0)}"></div>',
    '<div class="section"><h3>Balance control</h3><div class="form"><div class="field"><label>Coins — exact</label><input id="coinsExact" type="number" min="0" step="1" value="${Number(z.coins||u.coins||0)}"></div><div class="field"><label>DZX — exact</label><input id="dzxExact" type="number" min="0" step="1" value="${Number(z.dzx||0)}"></div><div class="field"><label>Coins — adjustment (+/-)</label><input id="coinsDelta" type="number" step="1" value="0"></div><div class="field"><label>DZX — adjustment (+/-)</label><input id="dzxDelta" type="number" step="1" value="0"></div></div><div class="actions" style="margin-top:10px"><button class="btn primary" id="setCoins">Set Coins</button><button class="btn primary" id="setDzx">Set DZX</button><button class="btn" id="addCoins">Adjust Coins</button><button class="btn" id="addDzx">Adjust DZX</button></div></div><div class="section"><h3>DZP control</h3><div class="form"><div class="field"><label>Exact DZP</label><input id="dzpExact" type="number" min="0" step="1" value="${Number(z.dzp||0)}"></div>'
  ],
  [
    "$('modal').classList.remove('hidden');$('setD').onclick=async()=>",
    "$('modal').classList.remove('hidden');$('setCoins').onclick=async()=>{const n=Number($('coinsExact').value);if(!Number.isSafeInteger(n)||n<0)return toast('Invalid Coins');try{await api(`/api/admin/users/${encodeURIComponent(id)}/economy`,{method:'PUT',body:JSON.stringify({asset:'coins',mode:'set',value:n})});toast('Coins updated');await window.manageUser(id)}catch(e){toast(e.message)}};$('setDzx').onclick=async()=>{const n=Number($('dzxExact').value);if(!Number.isSafeInteger(n)||n<0)return toast('Invalid DZX');try{await api(`/api/admin/users/${encodeURIComponent(id)}/economy`,{method:'PUT',body:JSON.stringify({asset:'dzx',mode:'set',value:n})});toast('DZX updated');await window.manageUser(id)}catch(e){toast(e.message)}};$('addCoins').onclick=async()=>{const n=Number($('coinsDelta').value);if(!Number.isSafeInteger(n))return toast('Invalid Coins adjustment');try{await api(`/api/admin/users/${encodeURIComponent(id)}/economy`,{method:'PUT',body:JSON.stringify({asset:'coins',mode:'delta',delta:n})});toast('Coins adjusted');await window.manageUser(id)}catch(e){toast(e.message)}};$('addDzx').onclick=async()=>{const n=Number($('dzxDelta').value);if(!Number.isSafeInteger(n))return toast('Invalid DZX adjustment');try{await api(`/api/admin/users/${encodeURIComponent(id)}/economy`,{method:'PUT',body:JSON.stringify({asset:'dzx',mode:'delta',delta:n})});toast('DZX adjusted');await window.manageUser(id)}catch(e){toast(e.message)}};$('setD').onclick=async()=>"
  ]
], "Admin UI v3 migration");

console.log("Admin v3 migration: OK");
