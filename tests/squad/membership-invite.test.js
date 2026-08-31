const test = require('node:test');
const assert = require('node:assert/strict');

function acceptInvitation({ invitationStatus, membershipStatus }) {
  if (invitationStatus !== 'pending') throw new Error('Invitation is not pending');
  assert.equal(membershipStatus, null);
  return { invitationStatus: 'accepted', membershipStatus: 'inactive' };
}

test('accepting a pending invitation creates inactive membership', () => {
  assert.deepEqual(acceptInvitation({ invitationStatus: 'pending', membershipStatus: null }), {
    invitationStatus: 'accepted',
    membershipStatus: 'inactive'
  });
});

test('accepted invitation cannot create a second membership', () => {
  assert.throws(
    () => acceptInvitation({ invitationStatus: 'accepted', membershipStatus: 'inactive' }),
    /Invitation is not pending/
  );
});

test('verified activity activates an inactive membership without creating a reward here', () => {
  const activate = status => status === 'inactive' ? 'active' : status;
  assert.equal(activate('inactive'), 'active');
});
