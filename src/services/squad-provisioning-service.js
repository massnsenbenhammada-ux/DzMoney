async function provisionSquadForUsers(db) {
  return db.transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('dzmoney:squad-provisioning'))");
    const users = await client.query(`
      SELECT u.id
      FROM users u
      LEFT JOIN squad_memberships sm ON sm.user_id = u.id
      WHERE sm.user_id IS NULL
      ORDER BY u.created_at ASC, u.id ASC
      LIMIT 10
      FOR UPDATE OF u
    `);
    if (users.rows.length < 10) return null;
    const ownerUserId = users.rows[0].id;
    const squad = await client.query(
      'INSERT INTO squads (owner_user_id) VALUES ($1) RETURNING id, owner_user_id',
      [ownerUserId]
    );
    const squadId = squad.rows[0].id;
    for (const user of users.rows) {
      await client.query(
        'INSERT INTO squad_memberships (squad_id, user_id) VALUES ($1, $2)',
        [squadId, user.id]
      );
    }
    return { squadId, ownerUserId: squad.rows[0].owner_user_id };
  });
}

module.exports = { provisionSquadForUsers };
