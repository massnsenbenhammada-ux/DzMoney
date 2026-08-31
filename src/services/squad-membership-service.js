const { withTransaction } = require('../db/pool');

async function createInvitation({ squadId, inviterUserId, inviteeUserId }) {
  return withTransaction(async client => {
    const owner = await client.query(
      'SELECT 1 FROM squads WHERE id = $1 AND owner_user_id = $2 FOR UPDATE',
      [squadId, inviterUserId]
    );
    if (!owner.rows[0]) throw new Error('Only the squad owner can invite');

    const existing = await client.query(
      `SELECT 1 FROM squad_memberships WHERE user_id = $1 AND status <> 'cancelled'
       UNION ALL
       SELECT 1 FROM squad_invitations WHERE invitee_user_id = $1 AND status = 'pending'
       LIMIT 1`,
      [inviteeUserId]
    );
    if (existing.rows[0]) throw new Error('User is already assigned to a squad or has a pending invitation');

    const result = await client.query(
      `INSERT INTO squad_invitations (squad_id, inviter_user_id, invitee_user_id)
       VALUES ($1, $2, $3)
       RETURNING id, squad_id, invitee_user_id, status, created_at`,
      [squadId, inviterUserId, inviteeUserId]
    );
    return result.rows[0];
  });
}

async function acceptInvitation({ invitationId, inviteeUserId }) {
  return withTransaction(async client => {
    const invitation = await client.query(
      `SELECT id, squad_id FROM squad_invitations
       WHERE id = $1 AND invitee_user_id = $2 AND status = 'pending' FOR UPDATE`,
      [invitationId, inviteeUserId]
    );
    if (!invitation.rows[0]) throw new Error('Invitation is not pending');

    const existingMembership = await client.query(
      `SELECT 1 FROM squad_memberships WHERE user_id = $1 AND status <> 'cancelled' FOR UPDATE`,
      [inviteeUserId]
    );
    if (existingMembership.rows[0]) throw new Error('User already has a squad membership');

    const member = await client.query(
      `INSERT INTO squad_memberships (squad_id, user_id, status)
       VALUES ($1, $2, 'inactive')
       RETURNING id, squad_id, user_id, status`,
      [invitation.rows[0].squad_id, inviteeUserId]
    );
    await client.query(
      `UPDATE squad_invitations SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
      [invitationId]
    );
    return member.rows[0];
  });
}

async function activateOnVerifiedActivity(client, userId) {
  const result = await client.query(
    `UPDATE squad_memberships SET status = 'active'
     WHERE user_id = $1 AND status = 'inactive'
     RETURNING id, squad_id, user_id, status`,
    [userId]
  );
  return result.rows[0] || null;
}

module.exports = { createInvitation, acceptInvitation, activateOnVerifiedActivity };
