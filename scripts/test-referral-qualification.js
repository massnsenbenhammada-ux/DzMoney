const assert = require('assert');
const walletService = require('../src/services/wallet-service');
const referralService = require('../src/services/referral-service');
const { pool } = require('../src/db/pool');

async function createAttributionPair() {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const referrer = await walletService.createUser({ telegramUserId: `8${suffix}01` });
  const referred = await walletService.createUser({ telegramUserId: `8${suffix}02` });
  await referralService.createAttribution({ referrerUserId: referrer.id, referredUserId: referred.id });
  return { referrer, referred };
}

async function main() {
  const { referrer, referred } = await createAttributionPair();
  const task = await pool.query(
    `INSERT INTO activity_tasks(task_type,title,reward_coin) VALUES('game','Referral qualification test',1) RETURNING id`
  );
  const attempt = await pool.query(
    `INSERT INTO task_attempts(task_id,user_id,status,execute_idempotency_key,verified_at)
     VALUES($1,$2,'verified',$3,NOW()) RETURNING id`,
    [task.rows[0].id, referred.id, `qualification-task-${Date.now()}`]
  );

  const qualified = await referralService.qualifyReferral({
    referredUserId: referred.id,
    source: 'task',
    referenceId: attempt.rows[0].id,
    idempotencyKey: `qualification-${Date.now()}`
  });
  assert.strictEqual(qualified.duplicate, false);
  assert.strictEqual(qualified.attribution.status, 'qualified');
  assert.strictEqual(qualified.attribution.qualification_source, 'task');
  assert.strictEqual(String(qualified.attribution.qualification_reference_id), String(attempt.rows[0].id));
  assert.strictEqual(Number(qualified.attribution.referred_user_id), Number(referred.id));

  const duplicate = await referralService.qualifyReferral({
    referredUserId: referred.id,
    source: 'task',
    referenceId: attempt.rows[0].id,
    idempotencyKey: `qualification-duplicate-${Date.now()}`
  });
  assert.strictEqual(duplicate.duplicate, true);

  const otherPair = await createAttributionPair();
  await assert.rejects(
    referralService.qualifyReferral({
      referredUserId: otherPair.referred.id,
      source: 'task',
      referenceId: attempt.rows[0].id,
      idempotencyKey: `qualification-invalid-user-${Date.now()}`
    }),
    /Verified task evidence not found/
  );

  const adPair = await createAttributionPair();
  const unverifiedAd = await pool.query(
    `INSERT INTO activity_ad_events(user_id,context,idempotency_key) VALUES($1,'task',$2) RETURNING id`,
    [adPair.referred.id, `qualification-ad-unverified-${Date.now()}`]
  );
  await assert.rejects(
    referralService.qualifyReferral({
      referredUserId: adPair.referred.id,
      source: 'advertisement',
      referenceId: unverifiedAd.rows[0].id,
      idempotencyKey: `qualification-ad-invalid-${Date.now()}`
    }),
    /Verified advertisement evidence not found/
  );

  const verificationAd = await pool.query(
    `INSERT INTO activity_ad_events(user_id,context,idempotency_key,verified,completed_at)
     VALUES($1,'verification',$2,TRUE,NOW()) RETURNING id`,
    [adPair.referred.id, `qualification-verification-ad-${Date.now()}`]
  );
  await assert.rejects(
    referralService.qualifyReferral({
      referredUserId: adPair.referred.id,
      source: 'advertisement',
      referenceId: verificationAd.rows[0].id,
      idempotencyKey: `qualification-verification-invalid-${Date.now()}`
    }),
    /Verified advertisement evidence not found/
  );

  const verifiedAd = await pool.query(
    `INSERT INTO activity_ad_events(user_id,context,idempotency_key,verified,completed_at)
     VALUES($1,'task',$2,TRUE,NOW()) RETURNING id`,
    [adPair.referred.id, `qualification-ad-valid-${Date.now()}`]
  );
  const results = await Promise.all([
    referralService.qualifyReferral({
      referredUserId: adPair.referred.id,
      source: 'advertisement',
      referenceId: verifiedAd.rows[0].id,
      idempotencyKey: `qualification-ad-race-a-${Date.now()}`
    }),
    referralService.qualifyReferral({
      referredUserId: adPair.referred.id,
      source: 'advertisement',
      referenceId: verifiedAd.rows[0].id,
      idempotencyKey: `qualification-ad-race-b-${Date.now()}`
    })
  ]);
  assert.strictEqual(results.filter(result => result.duplicate === false).length, 1);
  assert.strictEqual(results.filter(result => result.duplicate === true).length, 1);
  assert.strictEqual(results[0].attribution.status, 'qualified');
  assert.strictEqual(results[1].attribution.status, 'qualified');

  console.log('Referral qualification invariants: PASS');
}

main()
  .catch(error => {
    console.error('Referral qualification invariants: FAIL');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
