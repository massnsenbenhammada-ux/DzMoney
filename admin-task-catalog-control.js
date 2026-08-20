"use strict";

const express = require("express");
const { Pool } = require("pg");

// Authoritative Admin Task Catalog API. The Admin Panel writes directly to the
// canonical `tasks` table used by /api/v2/tasks; it does not write UI-only data.
const oldGet = express.application.get;
const oldPost = express.application.post;
const oldPut = express.application.put;
const oldDelete = express.application.delete;

const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
}) : null;

const TYPES = new Set(["daily", "game", "social", "web", "special", "partner"]);
const METHODS = new Set(["server_checkin", "adsgram_reward", "telegram_channel", "referral_count", "external_url", "manual_review", "timer", "none"]);

function token(req) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const v = part.trim();
    if (v.startsWith("dz_admin=")) return v.slice(9);
  }
  return "";
}

async function auth(req, res, next) {
  if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ success: false, message: "Admin panel is disabled." });
  if (req.method !== "GET" && req.headers["x-dzmoney-admin-request"] !== "1") return res.status(403).json({ success: false, message: "Invalid admin request." });
  const t = token(req);
  if (!t) return res.status(401).json({ success: false, message: "Admin authentication required." });
  const r = await pool.query("SELECT admin_id FROM admin_sessions WHERE token=$1 AND expires_at>$2 LIMIT 1", [t, Date.now()]);
  if (!r.rowCount) return res.status(401).json({ success: false, message: "Admin authentication required." });
  req.admin = r.rows[0];
  next();
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function validate(body, partial = false) {
  const type = String(body.type || "daily");
  const method = String(body.verificationMethod || body.verification_method || "server_checkin");
  if (!TYPES.has(type)) throw new Error("Invalid task category.");
  if (!METHODS.has(method)) throw new Error("Invalid verification method.");
  const title = String(body.title || "").trim();
  if (!partial && !title) throw new Error("Task title is required.");
  if (title.length > 120) throw new Error("Task title is too long.");
  const rewardCoins = number(body.rewardCoins, 0);
  const rewardDzp = number(body.rewardDZP, 0);
  const rewardDzx = number(body.rewardDZX, 0);
  const budget = number(body.economicBudgetDZX, 0);
  const requiredCount = Math.max(1, Math.floor(number(body.requiredCount, 1)));
  const cadence = body.cadenceSeconds === null || body.cadenceSeconds === "" ? null : Math.max(0, Math.floor(number(body.cadenceSeconds, 0)));
  if (![rewardCoins, rewardDzp, rewardDzx, budget].every(Number.isFinite) || [rewardCoins, rewardDzp, rewardDzx, budget].some(x => x < 0)) throw new Error("Rewards must be non-negative numbers.");
  return {
    type, method, title, description: String(body.description || "").trim().slice(0, 1000),
    rewardCoins, rewardDzp, rewardDzx, budget, requiredCount, cadence,
    active: body.active !== false,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {}
  };
}

async function audit(adminId, action, target, details) {
  try { await pool.query("INSERT INTO admin_audit(admin_id,action,target_id,details,created_at) VALUES($1,$2,$3,$4,$5)", [adminId || "owner", action, target || "", details || "", Date.now()]); } catch (e) { console.error("Task admin audit error:", e.message); }
}

async function list(req, res) {
  const r = await pool.query(`SELECT id,type,title,description,reward_coins,reward_dzp,reward_dzx,economic_budget_dzx,verification_method,required_count,cadence_seconds,active,admin_created,metadata,created_at,updated_at FROM tasks ORDER BY CASE type WHEN 'daily' THEN 1 WHEN 'game' THEN 2 WHEN 'social' THEN 3 WHEN 'web' THEN 4 WHEN 'special' THEN 5 WHEN 'partner' THEN 6 ELSE 99 END, created_at`);
  res.json({ success: true, tasks: r.rows.map(t => ({
    id:t.id,type:t.type,title:t.title,description:t.description,rewardCoins:String(t.reward_coins||0),rewardDZP:String(t.reward_dzp||0),rewardDZX:String(t.reward_dzx||0),economicBudgetDZX:String(t.economic_budget_dzx||0),verificationMethod:t.verification_method,requiredCount:Number(t.required_count||1),cadenceSeconds:t.cadence_seconds==null?null:Number(t.cadence_seconds),active:Boolean(t.active),adminCreated:Boolean(t.admin_created),metadata:t.metadata||{},createdAt:Number(t.created_at||0),updatedAt:Number(t.updated_at||0)
  })) });
}

async function create(req, res) {
  try {
    const id = String(req.body?.id || "").trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,80}$/.test(id)) return res.status(400).json({success:false,message:"Task ID must use 2-80 lowercase letters, numbers, _ or -."});
    const v = validate(req.body);
    const now = Date.now();
    const r = await pool.query(`INSERT INTO tasks(id,type,title,description,reward_coins,reward_dzp,reward_dzx,economic_budget_dzx,verification_method,required_count,cadence_seconds,active,admin_created,metadata,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,$13,$14,$14,$14) RETURNING *`, [id,v.type,v.title,v.description,v.rewardCoins,v.rewardDzp,v.rewardDzx,v.budget,v.method,v.requiredCount,v.cadence,v.active,JSON.stringify(v.metadata),now]);
    await audit(req.admin.admin_id,"create_task",id,`${v.type};${v.method}`);
    res.json({success:true,task:r.rows[0]});
  } catch(e) { if(e.code === "23505") return res.status(409).json({success:false,message:"Task ID already exists."}); res.status(400).json({success:false,message:e.message||"Unable to create task."}); }
}

async function update(req, res) {
  try {
    const id=String(req.params.id); const v=validate(req.body,true);
    const r=await pool.query(`UPDATE tasks SET type=$1,title=$2,description=$3,reward_coins=$4,reward_dzp=$5,reward_dzx=$6,economic_budget_dzx=$7,verification_method=$8,required_count=$9,cadence_seconds=$10,active=$11,metadata=$12,updated_at=$13 WHERE id=$14 RETURNING *`, [v.type,v.title,v.description,v.rewardCoins,v.rewardDzp,v.rewardDzx,v.budget,v.method,v.requiredCount,v.cadence,v.active,JSON.stringify(v.metadata),Date.now(),id]);
    if(!r.rowCount) return res.status(404).json({success:false,message:"Task not found."});
    await audit(req.admin.admin_id,"update_task",id,`${v.type};${v.method};dzp=${v.rewardDzp}`);
    res.json({success:true,task:r.rows[0]});
  } catch(e) { res.status(400).json({success:false,message:e.message||"Unable to update task."}); }
}

async function remove(req,res){
  const id=String(req.params.id); const r=await pool.query("DELETE FROM tasks WHERE id=$1 RETURNING id",[id]);
  if(!r.rowCount) return res.status(404).json({success:false,message:"Task not found."});
  await audit(req.admin.admin_id,"delete_task",id,"task_deleted"); res.json({success:true});
}

express.application.get = function(pathname,...handlers){
  if(pathname === "/api/admin/tasks") return oldGet.call(this,pathname,auth,list);
  return oldGet.call(this,pathname,...handlers);
};
express.application.post = function(pathname,...handlers){
  if(pathname === "/api/admin/tasks") return oldPost.call(this,pathname,auth,create);
  return oldPost.call(this,pathname,...handlers);
};
express.application.put = function(pathname,...handlers){
  if(pathname === "/api/admin/tasks/:id") return oldPut.call(this,pathname,auth,update);
  return oldPut.call(this,pathname,...handlers);
};
express.application.delete = function(pathname,...handlers){
  if(pathname === "/api/admin/tasks/:id") return oldDelete.call(this,pathname,auth,remove);
  return oldDelete.call(this,pathname,...handlers);
};

process.on("exit",()=>{ if(pool) pool.end().catch(()=>{}); });
