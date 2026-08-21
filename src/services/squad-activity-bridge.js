async function getSquadModifierOnClient(client,userId,occurredAt=new Date()){
 const result=await client.query(`SELECT m.squad_id,b.bonus_date,b.bonus_rate FROM squad_memberships m JOIN squad_daily_bonus_days b ON b.squad_id=m.squad_id WHERE m.user_id=$1 AND m.status='active' AND b.bonus_date=($2::date-INTERVAL '1 day')::date AND b.qualified=TRUE LIMIT 1`,[userId,occurredAt]);
 if(!result.rowCount)return{type:'squad',rate:0,eligible:false};
 return{type:'squad',rate:Number(result.rows[0].bonus_rate),eligible:true,squadId:result.rows[0].squad_id,sourceDate:result.rows[0].bonus_date};
}
async function recordSquadActivityOnClient(client,{userId,activityType,activityId=null,quantity=1,occurredAt=new Date(),idempotencyKey,metadata={}}){
 const membership=await client.query(`SELECT * FROM squad_memberships WHERE user_id=$1 AND status<>'removed' FOR UPDATE`,[userId]);if(!membership.rowCount)return{recorded:false,reason:'not_in_squad'};const row=membership.rows[0];const existing=await client.query('SELECT * FROM squad_activity_events WHERE idempotency_key=$1',[idempotencyKey]);if(existing.rowCount)return{recorded:true,duplicate:true,event:existing.rows[0]};
 const event=await client.query(`INSERT INTO squad_activity_events(squad_id,user_id,activity_type,activity_id,quantity,occurred_at,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[row.squad_id,userId,activityType,activityId,quantity,occurredAt,idempotencyKey,metadata]);
 await client.query(`UPDATE squad_memberships SET last_activity_at=$1,active_since=CASE WHEN status='inactive' THEN $1 ELSE active_since END,status=CASE WHEN status='inactive' THEN 'active' ELSE status END,updated_at=NOW() WHERE id=$2`,[occurredAt,row.id]);
 await client.query(`INSERT INTO squad_goal_contributions(goal_id,user_id,activity_event_id,contribution_quantity,weight) SELECT g.id,$2,$3,$4,$4 FROM squad_goals g WHERE g.squad_id=$1 AND g.status='active' AND g.target_type=$5 AND g.starts_at<=$6 AND (g.expires_at IS NULL OR g.expires_at>$6) ON CONFLICT(goal_id,activity_event_id) DO NOTHING`,[row.squad_id,userId,event.rows[0].id,quantity,activityType,occurredAt]);
 return{recorded:true,duplicate:false,reactivated:row.status==='inactive',event:event.rows[0]};
}
module.exports={getSquadModifierOnClient,recordSquadActivityOnClient};
