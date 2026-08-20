"use strict";

const express = require("express");
const { Pool } = require("pg");
const path = require("path");

/**
 * Canonical DzMoney Admin backend.
 *
 * Migration strategy:
 * 1. server.js and the legacy APIs remain untouched in phase one.
 * 2. This module is mounted once, before the legacy admin routes, so the new
 *    Admin UI has one authoritative API contract.
 * 3. All writes are transactional and go directly to PostgreSQL.
 * 4. No SQL monkey-patching, no multiple Express prototype wrappers, and no
 *    UI bridges are used here.
 *
 * Once this branch is verified in Railway, these routes can be moved into
 * server.js in a second migration without changing the database contract.
 */

const originalListen = express.application.listen;
let installed = false;

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
    })
  : null;

const SETTINGS = {
  integer: new Set([
    "daily_reward_coins", "daily_reward_bux", "minimum_withdraw_bux",
    "withdrawal_fee_bux", "daily_ads_limit", "daily_task_reward_coins",
    "daily_ad_task_count", "minimum_withdrawal_coins"
  ]),
  decimal: new Set([
    "referral_percentage", "dzp_default_activity", "dzp_ad_reward",
    "dzp_referral_reward", "dzx_per_ton", "coins_per_dzx", "coins_per_ton",
    "minimum_deposit_ton", "minimum_withdrawal_ton", "withdrawal_fee_dzx",
    "squad_activity_threshold_percent", "squad_max_bonus_percent",
    "daily_task_reward_dzx"
  ]),
  boolean: new Set(["daily_reward_ad_separate", "system_enabled"]),
  string: new Set(["adsgram_block_id", "updates_channel_url"]),
  compatibility: new Set(["coins_per_bux", "bux_per_ton"])
};

const DZP_MAP = {
  dzp_default_activity: "default_activity_dzp",
  dzp_ad_reward: "ad_dzp_reward",
  dzp_referral_reward: "referral_dzp_reward"
};

const ECONOMY_MIRRORS = new Set([
  "dzx_per_ton", "coins_per_dzx", "coins_per_ton", "minimum_deposit_ton",
  "minimum_withdrawal_ton", "minimum_withdrawal_coins", "withdrawal_fee_dzx",
  "referral_percentage", "squad_activity_threshold_percent",
  "squad_max_bonus_percent", "daily_ad_task_count", "daily_task_reward_coins",
  "daily_task_reward_dzx", "adsgram_block_id", "updates_channel_url"
]);

function cookie(req, name) {
  const prefix = `${name}=`;
  return String(req.headers.cookie || "")
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith(prefix))
    ?.slice(prefix.length) || "";
}

async function adminAuth(req, res, next) {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ success: false, message: "Admin panel is disabled. Set ADMIN_PASSWORD in Railway Variables." });
  }
  if (req.method !== "GET" && req.headers["x-dzmoney-admin-request"] !== "1") {
    return res.status(403).json({ success: false, message: "Invalid admin request." });
  }
  const token = cookie(req, "dz_admin");
  if (!token) return res.status(401).json({ success: false, message: "Admin authentication required." });
  try {
    const result = await pool.query(
      `SELECT token,admin_id,created_at,expires_at FROM admin_sessions WHERE token=$1 AND expires_at>$2 LIMIT 1`,
      [token, Date.now()]
    );
    if (!result.rowCount) return res.status(401).json({ success: false, message: "Admin authentication required." });
    req.admin = {
      token: result.rows[0].token,
      adminId: result.rows[0].admin_id,
      createdAt: Number(result.rows[0].created_at),
      expiresAt: Number(result.rows[0].expires_at)
    };
    next();
  } catch (error) {
    console.error("Canonical admin auth error:", error);
    res.status(500).json({ success: false, message: "Unable to verify admin session." });
  }
}

async function audit(adminId, action, targetId = "", details = "") {
  await pool.query(
    `INSERT INTO admin_audit(admin_id,action,target_id,details,created_at) VALUES($1,$2,$3,$4,$5)`,
    [String(adminId || "owner"), action, String(targetId || ""), String(details || ""), Date.now()]
  );
}

function isDecimal(value) {
  const text = String(value).trim();
  const n = Number(text);
  return /^\d+(\.\d+)?$/.test(text) && Number.isFinite(n);
}

function normalizeSetting(key, raw) {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error(`${key} cannot be empty.`);

  if (SETTINGS.compatibility.has(key)) {
    if (!/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0) throw new Error(`${key} must be a positive number.`);
    return value;
  }
  if (SETTINGS.integer.has(key)) {
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`${key} must be a non-negative whole number.`);
    if (key === "minimum_withdraw_bux" && Number(value) < 1) throw new Error("Minimum withdrawal must be greater than 0.");
    return String(Number(value));
  }
  if (SETTINGS.decimal.has(key)) {
    if (!isDecimal(value)) throw new Error(`${key} must be a non-negative number.`);
    const n = Number(value);
    if (["referral_percentage", "squad_activity_threshold_percent", "squad_max_bonus_percent"].includes(key) && n > 100) {
      throw new Error(`${key} must be between 0 and 100.`);
    }
    if (["dzx_per_ton", "coins_per_dzx", "coins_per_ton", "minimum_deposit_ton", "minimum_withdrawal_ton", "daily_task_reward_dzx"].includes(key) && n <= 0) {
      throw new Error(`${key} must be greater than 0.`);
    }
    return value;
  }
  if (SETTINGS.boolean.has(key)) {
    if (!["true", "false"].includes(value.toLowerCase())) throw new Error(`${key} must be true or false.`);
    return value.toLowerCase();
  }
  if (SETTINGS.string.has(key)) {
    if (key === "updates_channel_url" && value && !/^https?:\/\//i.test(value)) throw new Error("updates_channel_url must be a valid http(s) URL or empty.");
    return value;
  }
  throw new Error(`Unknown or protected setting: ${key}`);
}

async function saveSettings(req, res) {
  const input = req.body?.settings;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return res.status(400).json({ success: false, message: "settings object is required." });
  }

  const normalized = {};
  try {
    for (const [key, rawValue] of Object.entries(input)) normalized[key] = normalizeSetting(key, rawValue);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  // Compatibility names are accepted, but the canonical economy names win.
  if (normalized.bux_per_ton && !normalized.dzx_per_ton) normalized.dzx_per_ton = normalized.bux_per_ton;
  if (normalized.coins_per_bux && !normalized.coins_per_dzx) normalized.coins_per_dzx = normalized.coins_per_bux;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = Date.now();

    const rateResult = await client.query(
      `SELECT key,value FROM settings WHERE key IN ('dzx_per_ton','coins_per_dzx')`
    );
    const existing = Object.fromEntries(rateResult.rows.map(r => [r.key, r.value]));
    const dzxPerTon = normalized.dzx_per_ton || existing.dzx_per_ton || "10000";
    const coinsPerDZX = normalized.coins_per_dzx || existing.coins_per_dzx || "100";
    const derivedCoinsPerTon = Number(dzxPerTon) * Number(coinsPerDZX);
    if (!Number.isFinite(derivedCoinsPerTon) || derivedCoinsPerTon <= 0) throw new Error("Invalid DZX/COIN economy rates.");
    normalized.dzx_per_ton = String(dzxPerTon);
    normalized.coins_per_dzx = String(coinsPerDZX);
    normalized.coins_per_ton = String(derivedCoinsPerTon);
    normalized.bux_per_ton = normalized.dzx_per_ton;
    normalized.coins_per_bux = normalized.coins_per_dzx;

    for (const [key, value] of Object.entries(normalized)) {
      await client.query(
        `INSERT INTO settings(key,value,updated_at) VALUES($1,$2,$3)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
        [key, value, now]
      );

      if (ECONOMY_MIRRORS.has(key)) {
        await client.query(
          `INSERT INTO economy_settings(key,value,updated_at) VALUES($1,$2,$3)
           ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
          [key, value, now]
        );
      }

      if (DZP_MAP[key]) {
        await client.query(
          `INSERT INTO dzp_settings(key,value,updated_at) VALUES($1,$2,NOW())
           ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,
          [DZP_MAP[key], value]
        );
      }
    }

    await client.query("COMMIT");
    await audit(req.admin.adminId, "update_settings", "", Object.keys(normalized).join(","));
    const result = await pool.query("SELECT key,value,updated_at FROM settings ORDER BY key");
    res.json({ success: true, settings: Object.fromEntries(result.rows.map(r => [r.key, r.value])) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Canonical settings save error:", error);
    res.status(500).json({ success: false, message: error.message || "Unable to save settings." });
  } finally {
    client.release();
  }
}

async function getSettings(req, res) {
  try {
    const result = await pool.query("SELECT key,value,updated_at FROM settings ORDER BY key");
    const settings = Object.fromEntries(result.rows.map(r => [r.key, r.value]));
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, settings, generatedAt: Date.now() });
  } catch (error) {
    console.error("Canonical settings load error:", error);
    res.status(500).json({ success: false, message: "Unable to load settings." });
  }
}

async function safeScalar(sql, params = [], fallback = 0) {
  try {
    const result = await pool.query(sql, params);
    const value = Object.values(result.rows[0] || {})[0];
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  } catch (error) {
    console.error("Admin metric query failed:", error.message);
    return fallback;
  }
}

async function dashboard(req, res) {
  const [users,banned,bux,coins,dzp,dzx,withdrawable,activeTasks,claims,referrals,pendingLegacy,pendingDZX,ads] = await Promise.all([
    safeScalar("SELECT COUNT(*) FROM users"),
    safeScalar("SELECT COUNT(*) FROM users WHERE COALESCE(is_banned,FALSE)=TRUE"),
    safeScalar("SELECT COALESCE(SUM(bux),0) FROM users"),
    safeScalar("SELECT COALESCE(SUM(coins),0) FROM users"),
    safeScalar("SELECT COALESCE(SUM(dzp),0) FROM users"),
    safeScalar("SELECT COALESCE(SUM(dzx),0) FROM users"),
    safeScalar("SELECT COALESCE(SUM(withdrawable_dzx),0) FROM users"),
    safeScalar("SELECT COUNT(*) FROM tasks WHERE active=TRUE"),
    safeScalar("SELECT COUNT(*) FROM task_completions WHERE status IN ('verified','rewarded')") || await safeScalar("SELECT COUNT(*) FROM task_claims WHERE claimed_at>0"),
    safeScalar("SELECT COUNT(*) FROM users WHERE referred_by IS NOT NULL"),
    safeScalar("SELECT COUNT(*) FROM withdrawals WHERE status IN ('pending','approved')"),
    safeScalar("SELECT COUNT(*) FROM economy_withdrawals WHERE UPPER(status)='PENDING'"),
    safeScalar("SELECT COUNT(*) FROM adsgram_ad_views WHERE status='confirmed'")
  ]);
  const system = await pool.query("SELECT value FROM settings WHERE key='system_enabled' LIMIT 1").catch(() => ({rows:[]}));
  const systemEnabled = system.rows.length ? String(system.rows[0].value).toLowerCase() === "true" : true;
  const pendingWithdrawals = pendingLegacy + pendingDZX;
  res.setHeader("Cache-Control", "no-store");
  res.json({
    success:true,
    generatedAt:Date.now(),
    metrics:{members:users,bannedUsers:banned,totalBUX:bux,totalCoins:coins,totalDZP:dzp,totalDZX:dzx,withdrawableDZX:withdrawable,activeTasks,totalClaims:claims,referrals,pendingWithdrawals,adsWatched:ads,systemEnabled},
    stats:{users,bannedUsers:banned,totalBux:bux,totalCoins:coins,activeTasks,totalClaims:claims,pendingWithdrawals,referrals,systemEnabled},
    charts:{members:[],ads:[],tasks:[]},topActive:[],topReferrers:[]
  });
}

function taskInput(body, partial = false) {
  const id = String(body.id || "").trim().toLowerCase();
  if (!partial && !/^[a-z0-9_-]{2,80}$/.test(id)) throw new Error("Task ID must use 2-80 lowercase letters, numbers, _ or -.");
  const title = String(body.title || "").trim();
  if (!partial && !title) throw new Error("Task title is required.");
  if (title.length > 120) throw new Error("Task title is too long.");
  const type = String(body.type || "daily");
  const methods = new Set(["server_checkin","adsgram_reward","telegram_channel","referral_count","external_url","manual_review","timer","none"]);
  const types = new Set(["daily","game","social","web","special","partner"]);
  if (!types.has(type)) throw new Error("Invalid task category.");
  const verificationMethod = String(body.verificationMethod || body.verification_method || "server_checkin");
  if (!methods.has(verificationMethod)) throw new Error("Invalid verification method.");
  const rewardCoins = Number(body.rewardCoins ?? 0);
  const rewardDZP = Number(body.rewardDZP ?? 0);
  const rewardDZX = Number(body.rewardDZX ?? 0);
  const budget = Number(body.economicBudgetDZX ?? rewardDZX);
  const requiredCount = Math.max(1, Math.floor(Number(body.requiredCount ?? 1)));
  const cadenceSeconds = body.cadenceSeconds === null || body.cadenceSeconds === "" ? null : Math.max(0, Math.floor(Number(body.cadenceSeconds ?? 0)));
  if (![rewardCoins,rewardDZP,rewardDZX,budget].every(Number.isFinite) || [rewardCoins,rewardDZP,rewardDZX,budget].some(n => n < 0)) throw new Error("Task rewards must be non-negative numbers.");
  return {id,title,description:String(body.description||"").trim().slice(0,1000),type,verificationMethod,rewardCoins,rewardDZP,rewardDZX,budget,requiredCount,cadenceSeconds,active:body.active!==false,metadata:body.metadata&&typeof body.metadata==="object"?body.metadata:{}};
}

async function tasksList(req,res){
  try{
    const result=await pool.query(`SELECT id,type,title,description,reward_coins,reward_dzp,reward_dzx,economic_budget_dzx,verification_method,required_count,cadence_seconds,active,admin_created,metadata,created_at,updated_at FROM tasks ORDER BY CASE type WHEN 'daily' THEN 1 WHEN 'game' THEN 2 WHEN 'social' THEN 3 WHEN 'web' THEN 4 WHEN 'special' THEN 5 WHEN 'partner' THEN 6 ELSE 99 END,created_at`);
    res.json({success:true,tasks:result.rows.map(t=>({id:t.id,type:t.type,title:t.title,description:t.description,rewardCoins:String(t.reward_coins||0),rewardDZP:String(t.reward_dzp||0),rewardDZX:String(t.reward_dzx||0),economicBudgetDZX:String(t.economic_budget_dzx||0),verificationMethod:t.verification_method,requiredCount:Number(t.required_count||1),cadenceSeconds:t.cadence_seconds==null?null:Number(t.cadence_seconds),active:Boolean(t.active),adminCreated:Boolean(t.admin_created),metadata:t.metadata||{},createdAt:Number(t.created_at||0),updatedAt:Number(t.updated_at||0)}))});
  }catch(error){console.error("Canonical task list error:",error);res.status(500).json({success:false,message:"Unable to load task catalog."});}
}

async function tasksCreate(req,res){
  try{
    const v=taskInput(req.body||{}); const now=Date.now();
    const result=await pool.query(`INSERT INTO tasks(id,type,title,description,reward_coins,reward_dzp,reward_dzx,economic_budget_dzx,verification_method,required_count,cadence_seconds,active,admin_created,metadata,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,$13,$14,$15,$15) RETURNING *`,[v.id,v.type,v.title,v.description,v.rewardCoins,v.rewardDZP,v.rewardDZX,v.budget,v.verificationMethod,v.requiredCount,v.cadenceSeconds,v.active,JSON.stringify(v.metadata),now]);
    await audit(req.admin.adminId,"create_task",v.id,`${v.type};${v.verificationMethod}`);
    res.json({success:true,task:result.rows[0]});
  }catch(error){console.error("Canonical task create error:",error);res.status(error.code==="23505"?409:400).json({success:false,message:error.code==="23505"?"Task ID already exists.":error.message||"Unable to create task."});}
}

async function tasksUpdate(req,res){
  try{
    const id=String(req.params.id); const v=taskInput({...req.body,id},true);
    const result=await pool.query(`UPDATE tasks SET type=$1,title=$2,description=$3,reward_coins=$4,reward_dzp=$5,reward_dzx=$6,economic_budget_dzx=$7,verification_method=$8,required_count=$9,cadence_seconds=$10,active=$11,metadata=$12,updated_at=$13 WHERE id=$14 RETURNING *`,[v.type,v.title,v.description,v.rewardCoins,v.rewardDZP,v.rewardDZX,v.budget,v.verificationMethod,v.requiredCount,v.cadenceSeconds,v.active,JSON.stringify(v.metadata),Date.now(),id]);
    if(!result.rowCount)return res.status(404).json({success:false,message:"Task not found."});
    await audit(req.admin.adminId,"update_task",id,`${v.type};${v.verificationMethod};coins=${v.rewardCoins};dzp=${v.rewardDZP};dzx=${v.rewardDZX}`);
    res.json({success:true,task:result.rows[0]});
  }catch(error){console.error("Canonical task update error:",error);res.status(400).json({success:false,message:error.message||"Unable to update task."});}
}

async function tasksDelete(req,res){
  const id=String(req.params.id); const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("DELETE FROM task_reward_events WHERE task_id=$1",[id]).catch(()=>{});
    await client.query("DELETE FROM task_completions WHERE task_id=$1",[id]).catch(()=>{});
    await client.query("DELETE FROM task_claims WHERE task_id=$1",[id]).catch(()=>{});
    const result=await client.query("DELETE FROM tasks WHERE id=$1 RETURNING id",[id]);
    if(!result.rowCount){await client.query("ROLLBACK");return res.status(404).json({success:false,message:"Task not found."});}
    await client.query("COMMIT");
    await audit(req.admin.adminId,"delete_task",id,"task_deleted");
    res.json({success:true});
  }catch(error){await client.query("ROLLBACK").catch(()=>{});console.error("Canonical task delete error:",error);res.status(500).json({success:false,message:"Unable to delete task."});}finally{client.release();}
}

async function userEconomy(req,res){
  try{
    const result=await pool.query(`SELECT id,dzp,dzx,coins,bux,deposited_dzx,withdrawable_dzx,locked_dzx FROM users WHERE id=$1 LIMIT 1`,[String(req.params.id)]);
    if(!result.rowCount)return res.status(404).json({success:false,message:"User not found."});
    res.json({success:true,user:result.rows[0]});
  }catch(error){console.error("Canonical user economy error:",error);res.status(500).json({success:false,message:"Unable to load user economy."});}
}

async function dzpBalance(req,res,deltaMode){
  const id=String(req.params.id); const raw=deltaMode?req.body?.dzpDelta:req.body?.dzp; const value=Number(raw);
  if(!Number.isSafeInteger(value))return res.status(400).json({success:false,message:"DZP must be a whole number."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const current=await client.query("SELECT id,dzp FROM users WHERE id=$1 FOR UPDATE",[id]);
    if(!current.rowCount){await client.query("ROLLBACK");return res.status(404).json({success:false,message:"User not found."});}
    const before=Number(current.rows[0].dzp||0); const after=deltaMode?before+value:value;
    if(!Number.isSafeInteger(after)||after<0){await client.query("ROLLBACK");return res.status(400).json({success:false,message:"DZP balance cannot be negative."});}
    const updated=await client.query("UPDATE users SET dzp=$1 WHERE id=$2 RETURNING *",[after,id]);
    const change=after-before;
    if(change!==0){
      const direction=change>0?"CREDIT":"DEBIT";
      await client.query(`INSERT INTO economy_ledger(user_id,asset,direction,amount,balance_bucket,source_type,source_id,metadata,created_at) VALUES($1,'DZP',$2,$3,'available','ADMIN_ADJUSTMENT',$4,$5::jsonb,$6)`,[id,direction,Math.abs(change),`ADMIN:${req.admin.adminId}:${Date.now()}`,JSON.stringify({before,after}),Date.now()]).catch(()=>{});
    }
    await client.query("COMMIT");
    await audit(req.admin.adminId,deltaMode?"dzp_balance_delta":"set_dzp_balance",id,`before=${before};after=${after}`);
    res.json({success:true,user:updated.rows[0]});
  }catch(error){await client.query("ROLLBACK").catch(()=>{});console.error("Canonical DZP balance error:",error);res.status(500).json({success:false,message:"Unable to update DZP balance."});}finally{client.release();}
}

function install(app){
  if(installed||!pool)return;
  installed=true;
  const router=express.Router();

  router.get("/admin",(req,res)=>{res.setHeader("Cache-Control","no-store");res.sendFile(path.join(__dirname,"public","admin.html"));});
  router.get("/admin.html",(req,res)=>{res.setHeader("Cache-Control","no-store");res.sendFile(path.join(__dirname,"public","admin.html"));});

  router.get("/api/admin/stats",adminAuth,dashboard);
  router.get("/api/admin/settings",adminAuth,getSettings);
  router.put("/api/admin/settings",adminAuth,saveSettings);
  router.get("/api/admin/tasks",adminAuth,tasksList);
  router.post("/api/admin/tasks",adminAuth,tasksCreate);
  router.put("/api/admin/tasks/:id",adminAuth,tasksUpdate);
  router.delete("/api/admin/tasks/:id",adminAuth,tasksDelete);
  router.get("/api/admin/users/:id/economy",adminAuth,userEconomy);
  router.put("/api/admin/users/:id/balance",adminAuth,(req,res)=>dzpBalance(req,res,false));
  router.post("/api/admin/users/:id/balance",adminAuth,(req,res)=>dzpBalance(req,res,true));

  const originalRouter=app.router&&Array.isArray(app.router.stack)?app.router.stack:null;
  const legacyRouter=originalRouter||(app._router&&Array.isArray(app._router.stack)?app._router.stack:null);
  if(!legacyRouter)throw new Error("Express router stack unavailable; canonical Admin was not mounted.");
  legacyRouter.unshift(...router.stack);
  console.log("DzMoney canonical Admin backend: ENABLED");
}

express.application.listen=function(...args){
  install(this);
  return originalListen.apply(this,args);
};

process.once("SIGTERM",()=>pool?.end().catch(()=>{}));
process.once("SIGINT",()=>pool?.end().catch(()=>{}));
