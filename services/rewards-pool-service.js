"use strict";

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Rewards Pool weight model agreed for DzMoney:
 * - activity weight comes from the user's accumulated DZP;
 * - package weight comes only from currently active packages;
 * - package weight expires with the package;
 * - referral and squad bonuses are not included in this weight.
 */
async function getUserWeight(pool, userId, now = Date.now()) {
  const userResult = await pool.query(
    `SELECT COALESCE(dzp,0) AS activity_dzp
     FROM users WHERE id=$1 LIMIT 1`,
    [String(userId)]
  );
  if (!userResult.rowCount) {
    throw Object.assign(new Error("User not found."), { code: "USER_NOT_FOUND" });
  }

  const packageResult = await pool.query(
    `SELECT COALESCE(SUM(COALESCE(up.dzp_weight, p.dzp_weight, 0)),0) AS package_dzp
     FROM user_packages up
     JOIN packages p ON p.id=up.package_id
     WHERE up.user_id=$1
       AND up.status='ACTIVE'
       AND up.starts_at <= $2
       AND (up.expires_at IS NULL OR up.expires_at > $2)
       AND p.active=TRUE`,
    [String(userId), now]
  );

  const activityDzp = asNumber(userResult.rows[0].activity_dzp);
  const packageDzp = asNumber(packageResult.rows[0]?.package_dzp);
  const totalWeight = activityDzp + packageDzp;

  return { activityDzp, packageDzp, totalWeight };
}

async function getPoolTotalWeight(pool, now = Date.now()) {
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(COALESCE(u.dzp,0)),0) AS activity_dzp,
       COALESCE((
         SELECT SUM(COALESCE(up.dzp_weight,p.dzp_weight,0))
         FROM user_packages up
         JOIN packages p ON p.id=up.package_id
         WHERE up.status='ACTIVE'
           AND up.starts_at <= $1
           AND (up.expires_at IS NULL OR up.expires_at > $1)
           AND p.active=TRUE
       ),0) AS package_dzp
     FROM users u`,
    [now]
  );

  const activityDzp = asNumber(result.rows[0]?.activity_dzp);
  const packageDzp = asNumber(result.rows[0]?.package_dzp);
  return { activityDzp, packageDzp, totalWeight: activityDzp + packageDzp };
}

async function calculateUserShare(pool, periodId, userId, now = Date.now()) {
  const periodResult = await pool.query(
    `SELECT id,pool_dzx,status FROM rewards_pool_periods WHERE id=$1 LIMIT 1`,
    [String(periodId)]
  );
  if (!periodResult.rowCount) {
    throw Object.assign(new Error("Rewards Pool period not found."), { code: "POOL_PERIOD_NOT_FOUND" });
  }

  const weight = await getUserWeight(pool, userId, now);
  const total = await getPoolTotalWeight(pool, now);
  const poolDZX = asNumber(periodResult.rows[0].pool_dzx);
  const ratio = total.totalWeight > 0 ? weight.totalWeight / total.totalWeight : 0;
  const rewardDZX = poolDZX * ratio;

  return {
    periodId: String(periodId),
    userId: String(userId),
    activityDzp: weight.activityDzp,
    packageDzp: weight.packageDzp,
    totalWeight: weight.totalWeight,
    totalPoolWeight: total.totalWeight,
    shareRatio: ratio,
    rewardDZX
  };
}

async function calculatePeriod(pool, periodId, now = Date.now()) {
  const periodResult = await pool.query(
    `SELECT id,pool_dzx,status FROM rewards_pool_periods WHERE id=$1 FOR UPDATE`,
    [String(periodId)]
  );
  if (!periodResult.rowCount) {
    throw Object.assign(new Error("Rewards Pool period not found."), { code: "POOL_PERIOD_NOT_FOUND" });
  }

  const period = periodResult.rows[0];
  const total = await getPoolTotalWeight(pool, now);
  const totalWeight = total.totalWeight;
  const poolDZX = asNumber(period.pool_dzx);

  await pool.query(`DELETE FROM rewards_pool_distributions WHERE period_id=$1`, [String(periodId)]);

  if (totalWeight > 0 && poolDZX > 0) {
    await pool.query(
      `INSERT INTO rewards_pool_distributions(
         period_id,user_id,activity_dzp,package_dzp,total_weight,total_pool_weight,
         share_ratio,reward_dzx,status,created_at
       )
       SELECT
         $1,u.id,COALESCE(u.dzp,0),
         COALESCE((
           SELECT SUM(COALESCE(up.dzp_weight,p.dzp_weight,0))
           FROM user_packages up
           JOIN packages p ON p.id=up.package_id
           WHERE up.user_id=u.id
             AND up.status='ACTIVE'
             AND up.starts_at <= $2
             AND (up.expires_at IS NULL OR up.expires_at > $2)
             AND p.active=TRUE
         ),0),
         COALESCE(u.dzp,0)+COALESCE((
           SELECT SUM(COALESCE(up.dzp_weight,p.dzp_weight,0))
           FROM user_packages up
           JOIN packages p ON p.id=up.package_id
           WHERE up.user_id=u.id
             AND up.status='ACTIVE'
             AND up.starts_at <= $2
             AND (up.expires_at IS NULL OR up.expires_at > $2)
             AND p.active=TRUE
         ),0),
         $3,
         (COALESCE(u.dzp,0)+COALESCE((
           SELECT SUM(COALESCE(up.dzp_weight,p.dzp_weight,0))
           FROM user_packages up
           JOIN packages p ON p.id=up.package_id
           WHERE up.user_id=u.id
             AND up.status='ACTIVE'
             AND up.starts_at <= $2
             AND (up.expires_at IS NULL OR up.expires_at > $2)
             AND p.active=TRUE
         ),0))/$3,
         $4*((COALESCE(u.dzp,0)+COALESCE((
           SELECT SUM(COALESCE(up.dzp_weight,p.dzp_weight,0))
           FROM user_packages up
           JOIN packages p ON p.id=up.package_id
           WHERE up.user_id=u.id
             AND up.status='ACTIVE'
             AND up.starts_at <= $2
             AND (up.expires_at IS NULL OR up.expires_at > $2)
             AND p.active=TRUE
         ),0))/$3),
         'CALCULATED',$2
       FROM users u
       WHERE COALESCE(u.dzp,0)>0
          OR EXISTS (
            SELECT 1 FROM user_packages up
            JOIN packages p ON p.id=up.package_id
            WHERE up.user_id=u.id
              AND up.status='ACTIVE'
              AND up.starts_at <= $2
              AND (up.expires_at IS NULL OR up.expires_at > $2)
              AND p.active=TRUE
          )`,
      [String(periodId), now, totalWeight, poolDZX]
    );
  }

  await pool.query(
    `UPDATE rewards_pool_periods SET status='CALCULATED',calculated_at=$1 WHERE id=$2`,
    [now, String(periodId)]
  );

  return { periodId: String(periodId), poolDZX, totalWeight, distributionRows: await pool.query("SELECT COUNT(*)::int AS count FROM rewards_pool_distributions WHERE period_id=$1", [String(periodId)]).then(r => r.rows[0].count) };
}

module.exports = { getUserWeight, getPoolTotalWeight, calculateUserShare, calculatePeriod };
