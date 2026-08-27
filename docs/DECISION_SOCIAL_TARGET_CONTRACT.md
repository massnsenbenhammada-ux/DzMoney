# Social Creator Task Target Contract

This document records the single approved contract for Social Creator Tasks.

## Open Link
- Telegram Target is required.
- Completion proof is Click Proof only.
- No membership verification is performed.
- Initial CPM is 5000 DZX.

## Server Verified
- Provider is Telegram Bot API.
- Telegram Target is required.
- Completion is server-verified.
- Initial CPM is 9000 DZX.

## Target rules
- New campaign target: minimum 1000, maximum unlimited, step 1.
- Add Target is a separate operation for an existing active campaign and may be used before the current target is exhausted.
- Additional Target minimum is 1, maximum unlimited, step 1.
- Add Target charges only the newly added target quantity using the campaign's existing CPM.
- The additional amount is deducted immediately through the existing Economy/Ledger.

## Single source of truth
- `config.target` is the canonical Telegram target for Social Creator Tasks.
- Provider requirements may be derived from the canonical target for runtime compatibility, but they must not define a different target.
