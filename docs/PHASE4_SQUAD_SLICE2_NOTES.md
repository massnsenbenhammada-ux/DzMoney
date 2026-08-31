# Phase 4 — Squad Slice 2

## Scope
Free Squad invitation membership only.

## Contract
- Owner may invite a user.
- Invitation is free.
- Accepted invitation creates `inactive` membership.
- The first qualifying Verified Activity activates that membership.
- Activation occurs inside the existing Verified Activity/Economy transaction.
- Existing Economy/Ledger remains the only economic source of truth.
- A user can have only one non-cancelled Squad membership.
- No voluntary leave operation is introduced.

## API
- `GET /api/squad`
- `GET /api/squad/invitations`
- `POST /api/squad/invitations`
- `POST /api/squad/invitations/:id/accept`

The invitee is identified server-side by the existing Telegram user identity (`telegram_user_id`).

## Non-goals
Paid membership, DZP burn, challenge accounting, daily modifiers, and Squad rewards remain separate slices.
