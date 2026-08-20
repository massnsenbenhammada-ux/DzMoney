"use strict";

// Final runtime authority for Admin Settings.
// This is deliberately installed after the legacy compatibility layers and
// before server.listen() so /api/admin/settings has one deterministic writer.
const express = require("express");
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for admin settings runtime.");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

const EDITABLE = new Set([
  "daily_reward_coins","daily_reward_bux","minimum_withdraw_bux","withdrawal_fee_bux",
  "daily_ads_limit","daily_reward_ad_separate","referral_percentage","system_enabled",
  "dzp_default_activity","dzp_ad_reward","dzp_referral_reward",
  "dzx_per_ton","coins_per_dzx","coins_per_ton"
]);
const RATE_KEYS = new Set(["dzx_per_ton","coins_per_dzx","coins_per_ton"]);
const DZP_MAP = {
  dzp_default_activity: "default_activity_dzp",
  dzp_ad_reward: "ad_dzp_reward",
  dzp_referral_reward: "referral_dzp_reward"
};
const MIRRORS = {
  daily_ads_limit: "daily_ad_task_count",
  referral_percentage: "referral_percentage",
  daily_reward_coins: "daily_task_reward_coins",
  daily_reward_bux: "daily_task_reward_bux",
  daily_reward_ad_separate: "daily_reward_ad_separate"
};

function adminId(req) {
  const cookie = String(req.headers.cookie || "");
  const token = cookie.split(";").map(x => x.trim()).find(x => x.startsWith("dz_admin="))?.slice(9) || "";
  return pool.query("SELECT admin_id FROM admin_sessions WHERE token=$1 AND expires_at>$2 LIMIT 1", [token, Date.now()])
    .then(r => r.rowCount ? String(r.rows[0].admin_id) : null);
}
function validInt(v, positive=false) { return /^\d+$/.test(String(v)) && Number.isSafeInteger(Number(v)) && Number(v) >= (positive ? 1 : 0); }
function validNum(v) { const s=String(v), n=Number(s); return /^\d+(\.\d+)?$/.test(s) && Number.isFinite(n) && n>=0; }

async function save(req,res) {
  const id = await adminId(req);
  if (!id) return res.status(401).json({success:false,message:"Admin session expired."});
  const body=req.body?.settings;
  if (!body || typeof body !== "object" || Array.isArray(body)) return res.status(400).json({success:false,message:"settings object is required."});
  const values={};
  for (const [key,raw] of Object.entries(body)) {
    if (!EDITABLE.has(key)) return res.status(400).json({success:false,message:`Unknown or protected setting: ${key}`});
    const v=String(raw).trim(); if(!v) return res.status(400).json({success:false,message:`${key} cannot be empty.`});
    if (["daily_reward_coins","daily_reward_bux","minimum_withdraw_bux","withdrawal_fee_bux","daily_ads_limit"].includes(key) && !validInt(v,key==="minimum_withdraw_bux")) return res.status(400).json({success:false,message:`Invalid ${key}.`});
    if (["referral_percentage","dzp_default_activity","dzp_ad_reward","dzp_referral_reward"].includes(key) && !validNum(v)) return res.status(400).json({success:false,message:`Invalid ${key}.`});
    if (key==="referral_percentage" && Number(v)>100) return res.status(400).json({success:false,message:"Referral percentage must be between 0 and 100."});
    if (["daily_reward_ad_separate","system_enabled"].includes(key) && !["true","false"].includes(v.toLowerCase())) return res.status(400).json({success:false,message:`Invalid ${key}.`});
    if (RATE_KEYS.has(key) && !validNum(v)) return res.status(400).json({success:false,message:`Invalid ${key}.`});
    values[key]=v;
  }

  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const now=Date.now();
    if (Object.keys(values).some(k=>RATE_KEYS.has(k))) {
      const q=await client.query("SELECT key,value FROM economy_settings WHERE key IN ('dzx_per_ton','coins_per_dzx')");
      const old=Object.fromEntries(q.rows.map(r=>[r.key,r.value]));
      const dzx=values.dzx_per_ton ?? old.dzx_per_ton ?? "10000";
      const coins=values.coins_per_dzx ?? old.coins_per_dzx ?? "100";
      const derived=Number(dzx)*Number(coins);
      if(!Number.isFinite(derived)||derived<=0) throw new Error("Invalid economy rate combination.");
      values.dzx_per_ton=String(dzx); values.coins_per_dzx=String(coins); values.coins_per_ton=String(derived);
    }
    for (const [key,value] of Object.entries(values)) {
      await client.query(`INSERT INTO settings(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,[key,value,now]);
      if (DZP_MAP[key]) await client.query(`INSERT INTO dzp_settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[DZP_MAP[key],value]);
      if (RATE_KEYS.has(key)) await client.query(`INSERT INTO economy_settings(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,[key,value,now]);
      if (MIRRORS[key]) await client.query(`INSERT INTO economy_settings(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,[MIRRORS[key],value,now]);
    }
    await client.query(`INSERT INTO admin_audit(admin_id,action,target_id,details,created_at) VALUES($1,'update_settings','',$2,$3)`,[id,Object.entries(values).map(([k,v])=>`${k}=${v}`).join(';'),now]);
    await client.query("COMMIT");
    const out=await pool.query("SELECT key,value FROM settings ORDER BY key");
    return res.json({success:true,settings:Object.fromEntries(out.rows.map(r=>[r.key,r.value]))});
  } catch(e) { await client.query("ROLLBACK").catch(()=>{}); console.error("Admin settings runtime error:",e); return res.status(500).json({success:false,message:e.message||"Unable to save settings."}); }
  finally { client.release(); }
}

const previousListen=express.application.listen;
if (!express.application.__dzmoneyAdminSettingsRuntime) {
  express.application.__dzmoneyAdminSettingsRuntime=true;
  express.application.listen=function(...args){
    if(!this.__dzmoneyAdminSettingsRuntimeInstalled){
      const router=express.Router();
      router.put("/api/admin/settings",save);
      const stack=this.router?.stack || this._router?.stack;
      if(!Array.isArray(stack)) throw new Error("Express router stack unavailable for Admin Settings runtime.");
      stack.unshift(...router.stack);
      this.__dzmoneyAdminSettingsRuntimeInstalled=true;
      console.log("Admin Settings runtime: authoritative route mounted");
    }
    return previousListen.apply(this,args);
  };
}

process.once("SIGTERM",()=>pool.end().catch(()=>{}));
process.once("SIGINT",()=>pool.end().catch(()=>{}));
