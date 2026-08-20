"use strict";
const express = require("express");
const { Pool } = require("pg");

// Single authoritative Admin settings handler.
// Every editable Admin value is persisted in settings. Runtime modules that
// use the newer economy_settings table are mirrored here as well, so changing
// a value in Admin immediately affects the same database source used by the
// corresponding runtime service.
const originalPut = express.application.put;
const originalPost = express.application.post;
const originalGet = express.application.get;
const originalDelete = express.application.delete;

const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
}) : null;

const EDITABLE_SETTINGS = new Set([
  "daily_reward_coins", "daily_reward_bux", "minimum_withdraw_bux",
  "withdrawal_fee_bux", "daily_ads_limit", "daily_reward_ad_separate",
  "referral_percentage", "system_enabled", "dzp_default_activity",
  "dzp_ad_reward", "dzp_referral_reward",
  "dzx_per_ton", "coins_per_dzx", "coins_per_ton"
]);

const ECONOMY_RATE_KEYS = new Set(["dzx_per_ton", "coins_per_dzx", "coins_per_ton"]);
const DZP_MAP = {
  dzp_default_activity: "default_activity_dzp",
  dzp_ad_reward: "ad_dzp_reward",
  dzp_referral_reward: "referral_dzp_reward"
};

// Keys consumed by the newer task/economy services. Keep their aliases in
// economy_settings synchronized with the Admin names instead of leaving two
// independent configuration stores.
const ECONOMY_MIRRORS = {
  daily_ads_limit: "daily_ad_task_count",
  referral_percentage: "referral_percentage",
  daily_reward_coins: "daily_task_reward_coins",
  daily_reward_bux: "daily_task_reward_bux",
  daily_reward_ad_separate: "daily_reward_ad_separate"
};

function validWhole(value, min = 0) {
  return /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) >= min;
}
function validDecimal(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const text = String(value);
  const n = Number(text);
  return /^\d+(\.\d+)?$/.test(text) && Number.isFinite(n) && n >= min && n <= max;
}
async function writeAudit(adminId, action, targetId, details = "") {
  try {
    await pool.query(
      `INSERT INTO admin_audit(admin_id,action,target_id,details,created_at) VALUES($1,$2,$3,$4,$5)`,
      [String(adminId || "admin"), action, String(targetId || ""), String(details), Date.now()]
    );
  } catch (e) { console.error("Admin settings audit error:", e.message); }
}

async function saveSettings(req, res) {
  const values = req.body?.settings;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return res.status(400).json({ success:false, message:"settings object is required." });
  }

  const normalized = {};
  for (const [rawKey, rawValue] of Object.entries(values)) {
    const key = String(rawKey);
    if (!EDITABLE_SETTINGS.has(key)) {
      return res.status(400).json({ success:false, message:`Unknown or protected setting: ${key}` });
    }
    const value = String(rawValue).trim();
    if (!value) return res.status(400).json({ success:false, message:`${key} cannot be empty.` });

    if (["daily_reward_coins","daily_reward_bux","minimum_withdraw_bux","withdrawal_fee_bux","daily_ads_limit"].includes(key) && !validWhole(value)) {
      return res.status(400).json({ success:false, message:`${key} must be a non-negative whole number.` });
    }
    if (key === "minimum_withdraw_bux" && !validWhole(value, 1)) {
      return res.status(400).json({ success:false, message:"Minimum withdrawal must be a positive whole number of BUX." });
    }
    if (key === "referral_percentage" && !validDecimal(value, 0, 100)) {
      return res.status(400).json({ success:false, message:"Referral percentage must be between 0 and 100." });
    }
    if (["dzp_default_activity","dzp_ad_reward","dzp_referral_reward"].includes(key) && !validDecimal(value, 0)) {
      return res.status(400).json({ success:false, message:`${key} must be a non-negative number.` });
    }
    if (ECONOMY_RATE_KEYS.has(key) && !validDecimal(value, 0)) {
      return res.status(400).json({ success:false, message:`${key} must be a positive number.` });
    }
    if (["daily_reward_ad_separate","system_enabled"].includes(key) && !["true","false"].includes(value.toLowerCase())) {
      return res.status(400).json({ success:false, message:`${key} must be true or false.` });
    }
    normalized[key] = value;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = Date.now();

    // Economy rates are a single source of truth. coins_per_ton is always
    // derived from DZX-per-TON × COIN-per-DZX and cannot drift independently.
    if (Object.keys(normalized).some(key => ECONOMY_RATE_KEYS.has(key))) {
      const current = await client.query(
        `SELECT key,value FROM economy_settings
         WHERE key IN ('dzx_per_ton','coins_per_dzx','coins_per_ton')`
      );
      const existing = Object.fromEntries(current.rows.map(r => [r.key, r.value]));
      const dzxPerTon = normalized.dzx_per_ton ?? existing.dzx_per_ton ?? "10000";
      const coinsPerDZX = normalized.coins_per_dzx ?? existing.coins_per_dzx ?? "100";
      if (!validDecimal(dzxPerTon, 0) || !validDecimal(coinsPerDZX, 0)) {
        throw new Error("Invalid economy rate combination.");
      }
      const derived = Number(dzxPerTon) * Number(coinsPerDZX);
      if (!Number.isFinite(derived) || derived <= 0) throw new Error("Invalid economy rate combination.");
      normalized.dzx_per_ton = dzxPerTon;
      normalized.coins_per_dzx = coinsPerDZX;
      normalized.coins_per_ton = String(derived);
    }

    for (const [key,value] of Object.entries(normalized)) {
      await client.query(
        `INSERT INTO settings(key,value,updated_at) VALUES($1,$2,$3)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
        [key,value,now]
      );

      if (DZP_MAP[key]) {
        await client.query(
          `INSERT INTO dzp_settings(key,value,updated_at) VALUES($1,$2,NOW())
           ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,
          [DZP_MAP[key],value]
        );
      }

      if (ECONOMY_RATE_KEYS.has(key)) {
        await client.query(
          `INSERT INTO economy_settings(key,value,updated_at) VALUES($1,$2,$3)
           ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
          [key,value,now]
        );
      }

      const mirror = ECONOMY_MIRRORS[key];
      if (mirror) {
        await client.query(
          `INSERT INTO economy_settings(key,value,updated_at) VALUES($1,$2,$3)
           ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
          [mirror,value,now]
        );
      }
    }

    await client.query("COMMIT");
    await writeAudit(req.admin?.adminId,"update_settings","",Object.entries(normalized).map(([k,v])=>`${k}=${v}`).join(";"));
    const result = await pool.query("SELECT key,value FROM settings ORDER BY key");
    return res.json({success:true,settings:Object.fromEntries(result.rows.map(r=>[r.key,r.value]))});
  } catch (error) {
    await client.query("ROLLBACK").catch(()=>{});
    console.error("Admin settings error:",error);
    return res.status(500).json({success:false,message:error.message||"Unable to save settings."});
  } finally { client.release(); }
}

function patchedPut(path, ...handlers) {
  if (path === "/api/admin/settings" && handlers.length >= 1) {
    return originalPut.call(this, path, handlers[0], saveSettings);
  }
  if (typeof path === "string" && path.startsWith("/api/admin/tasks/") && handlers.length >= 2) {
    return originalPut.call(this, path, handlers[0], adminTaskUpdate);
  }
  return originalPut.call(this, path, ...handlers);
}
express.application.put = patchedPut;

async function adminTasksGet(req,res){
  try{
    const result=await pool.query(`SELECT id,type,title,description,reward_coins,reward_dzp,reward_dzx,verification_method,required_count,cadence_seconds,active,metadata,created_at,updated_at FROM tasks ORDER BY created_at ASC`);
    return res.json({success:true,tasks:result.rows.map(t=>({id:t.id,type:t.type,title:t.title,description:t.description,rewardCoins:Number(t.reward_coins||0),rewardDZP:Number(t.reward_dzp||0),rewardDZX:Number(t.reward_dzx||0),reward:Number(t.reward_coins||0),duration:Number(t.cadence_seconds||0),active:Boolean(t.active),repeatable:Boolean(t.cadence_seconds),requiredCount:Number(t.required_count||1),verificationMethod:t.verification_method,metadata:t.metadata||{}}))});
  }catch(e){console.error("Admin catalog tasks error:",e);return res.status(500).json({success:false,message:"Unable to load tasks."});}
}
async function adminTasksPost(req,res){
  const b=req.body||{}; const id=String(b.id||"").trim(), title=String(b.title||"").trim();
  if(!id||!title)return res.status(400).json({success:false,message:"Task id and title are required."});
  const rewardCoins=Number.isSafeInteger(Number(b.rewardCoins))?Number(b.rewardCoins):Number(b.reward||0);
  const rewardDZP=Number(b.rewardDZP??b.reward_dzp??0), rewardDZX=Number(b.rewardDZX??b.reward_dzx??0);
  if(!Number.isSafeInteger(rewardCoins)||rewardCoins<0||!Number.isFinite(rewardDZP)||rewardDZP<0||!Number.isFinite(rewardDZX)||rewardDZX<0)return res.status(400).json({success:false,message:"Task rewards must be valid non-negative numbers."});
  const now=Date.now();
  try{
    const result=await pool.query(`INSERT INTO tasks (id,type,title,description,reward_coins,reward_dzp,reward_dzx,economic_budget_dzx,verification_method,required_count,cadence_seconds,active,admin_created,metadata,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,TRUE,TRUE,$11,$12,$12) RETURNING *`,[id,String(b.type||"daily"),title,String(b.description||""),rewardCoins,rewardDZP,rewardDZX,String(b.verificationMethod||b.verification_method||"server_checkin"),Math.max(1,Number(b.requiredCount||b.required_count||1)),b.duration==null?null:Number(b.duration),JSON.stringify(b.metadata||{}),now]);
    await writeAudit(req.admin?.adminId,"create_task",id,JSON.stringify({rewardCoins,rewardDZP,rewardDZX})); const t=result.rows[0];
    return res.json({success:true,task:{id:t.id,title:t.title,rewardCoins:Number(t.reward_coins),rewardDZP:Number(t.reward_dzp),rewardDZX:Number(t.reward_dzx)}});
  }catch(e){console.error("Admin catalog task create error:",e);return res.status(500).json({success:false,message:"Unable to create task."});}
}
async function adminTaskUpdate(req,res){
  const id=String(req.params.id||"").trim(); if(!id)return res.status(400).json({success:false,message:"Task id is required."});
  const b=req.body||{}, title=String(b.title||"").trim(), description=String(b.description||"");
  const rewardCoins=Number.isSafeInteger(Number(b.rewardCoins))?Number(b.rewardCoins):Number(b.reward||0), rewardDZP=Number(b.rewardDZP??b.reward_dzp??0), rewardDZX=Number(b.rewardDZX??b.reward_dzx??0), duration=b.duration==null?null:Number(b.duration);
  if(!title||!Number.isSafeInteger(rewardCoins)||rewardCoins<0||!Number.isFinite(rewardDZP)||rewardDZP<0||!Number.isFinite(rewardDZX)||rewardDZX<0||duration!==null&&(!Number.isFinite(duration)||duration<0))return res.status(400).json({success:false,message:"Invalid task settings."});
  try{
    const result=await pool.query(`UPDATE tasks SET title=$1,description=$2,reward_coins=$3,reward_dzp=$4,reward_dzx=$5,economic_budget_dzx=$5,cadence_seconds=$6,active=$7,updated_at=$8 WHERE id=$9 RETURNING *`,[title,description,rewardCoins,rewardDZP,rewardDZX,duration,b.active===undefined?true:Boolean(b.active),Date.now(),id]);
    if(!result.rowCount)return res.status(404).json({success:false,message:"Task not found."});
    await writeAudit(req.admin?.adminId,"update_task",id,JSON.stringify({rewardCoins,rewardDZP,rewardDZX})); const t=result.rows[0];
    return res.json({success:true,task:{id:t.id,title:t.title,rewardCoins:Number(t.reward_coins),rewardDZP:Number(t.reward_dzp),rewardDZX:Number(t.reward_dzx)}});
  }catch(e){console.error("Admin catalog task update error:",e);return res.status(500).json({success:false,message:"Unable to update task."});}
}
async function adminTaskDelete(req,res){
  const id=String(req.params.id||"").trim(), client=await pool.connect();
  try{await client.query("BEGIN");await client.query("DELETE FROM task_completions WHERE task_id=$1",[id]);await client.query("DELETE FROM task_claims WHERE task_id=$1",[id]);const result=await client.query("DELETE FROM tasks WHERE id=$1 RETURNING id",[id]);if(!result.rowCount){await client.query("ROLLBACK");return res.status(404).json({success:false,message:"Task not found."});}await client.query("COMMIT");await writeAudit(req.admin?.adminId,"delete_task",id,"");return res.json({success:true});}
  catch(e){await client.query("ROLLBACK");console.error("Admin catalog task delete error:",e);return res.status(500).json({success:false,message:"Unable to delete task."});}finally{client.release();}
}
express.application.get=function(path,...handlers){if(path==="/api/admin/tasks"&&handlers.length>=1)return originalGet.call(this,path,handlers[0],adminTasksGet);return originalGet.call(this,path,...handlers);};
express.application.post=function(path,...handlers){if(path==="/api/admin/tasks"&&handlers.length>=1)return originalPost.call(this,path,handlers[0],adminTasksPost);return originalPost.call(this,path,...handlers);};
express.application.delete=function(path,...handlers){if(typeof path==="string"&&path.startsWith("/api/admin/tasks/")&&handlers.length>=1)return originalDelete.call(this,path,handlers[0],adminTaskDelete);return originalDelete.call(this,path,...handlers);};

process.on("exit",()=>{if(pool)pool.end().catch(()=>{});});
