const test = require('node:test');
const assert = require('node:assert/strict');
const { query, withTransaction, pool } = require('../src/db/pool');
const { createInvitation, acceptInvitation, activateOnVerifiedActivity } = require('../src/services/squad-membership-service');

test('free invitation flow persists inactive membership and activates it once', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = `${Date.now() % 1000000000}${Math.floor(Math.random() * 1000)}`;
  const ownerTelegramId = `91${suffix}`;
  const inviteeTelegramId = `92${suffix}`;
  let ownerId;
  let inviteeId;
  let squadId;
  try {
    const users = await query(
      `INSERT INTO users (telegram_user_id, username) VALUES ($1, $2), ($3, $4)
       RETURNING id, telegram_user_id`,
      [ownerTelegramId, `squad_owner_${suffix}`, inviteeTelegramId, `squad_invitee_${suffix}`]
    );
    ownerId = users.rows.find(row => String(row.telegram_user_id) === ownerTelegramId).id;
    inviteeId = users.rows.find(row => String(row.telegram_user_id) === inviteeTelegramId).id;

    const squad = await query('INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id', [ownerId]);
    squadId = squad.rows[0].id;

    const invitation = await createInvitation({ squadId, inviterUserId: ownerId, inviteeUserId: inviteeId });
    assert.equal(invitation.status, 'pending');

    const membership = await acceptInvitation({ invitationId: invitation.id, inviteeUserId: inviteeId });
    assert.equal(membership.status, 'inactive');

    const firstActivation = await withTransaction(client => activateOnVerifiedActivity(client, inviteeId));
    assert.equal(firstActivation.status, 'active');
    const active = await query('SELECT status FROM squad_memberships WHERE user_id = $1', [inviteeId]);
    assert.equal(active.rows[0].status, 'active');

    const secondActivation = await withTransaction(client => activateOnVerifiedActivity(client, inviteeId));
    assert.equal(secondActivation, null);
    const count = await query('SELECT COUNT(*)::int AS count FROM squad_memberships WHERE user_id = $1', [inviteeId]);
    assert.equal(count.rows[0].count, 1);
  } finally {
    if (squadId) await query('DELETE FROM squads WHERE id = $1', [squadId]);
    if (ownerId || inviteeId) await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [[ownerId, inviteeId].filter(Boolean)]);
  }
  await pool.end();
});
