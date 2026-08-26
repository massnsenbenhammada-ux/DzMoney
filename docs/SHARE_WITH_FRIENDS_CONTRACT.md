# Share with Friends Contract

Status: Accepted for implementation.

## Purpose

`Share with Friends` is a DzMoney Daily system task. It uses the existing Task Catalog, Task Execution, Task Verification, Referral, Economy and Ledger boundaries.

## Completion evidence

Telegram does not provide DzMoney with a trusted server callback proving that a user actually completed the share. Therefore DzMoney does not claim to verify the external share itself.

The accepted proof is **server-recorded Click Proof**:

```text
Authenticated DzMoney user
        ↓
Open Telegram Share UI with the user's canonical referral link
        ↓
DzMoney records the Share action click against the existing task attempt
        ↓
Existing verification boundary
        ↓
Existing Economy/Ledger reward
```

The click is evidence that the user invoked the DzMoney Share action. It is not represented as proof that Telegram completed the share.

No `shared=true` client flag, Telegram dialog-open signal, or frontend-only state is an economic authority.

## Daily eligibility

The task may be completed **once per user per UTC+1 calendar day**.

The boundary is the calendar transition at `00:00 UTC+1`, not a rolling 24-hour period.

Server-side task-attempt state is authoritative. Client clocks and client cooldowns cannot grant an additional completion.

## Referral link

The share action uses the authenticated user's existing canonical `referralLink` returned by `/api/me`.

No second referral-code source or client-generated referral code is allowed.

## Verification advertisement

The existing DzMoney verification-ad gate remains part of the non-ad Daily task verification flow. The ad provider controls the actual advertisement presentation/duration. The Share task does not define a Creator-controlled or provider-task-controlled advertisement duration.

The verification advertisement is evidence for the existing verification gate and is not an additional reward source.

## Reward

The reward uses the existing configured standard Daily activity reward and the existing Economy/Ledger path. No new reward store or Share-specific ledger is introduced.

## Idempotency and ownership

The existing task attempt and verification idempotency controls remain authoritative. The click endpoint must bind the attempt to the authenticated user through the existing task boundary.

Repeated clicks or replays must not create a second verified attempt or a second economic reward.

## Architectural constraints

- No second referral system.
- No Share tracking table.
- No new Economy or Ledger.
- No Telegram Share verifier is invented.
- No reward is granted from frontend state alone.
- Reuse the existing Daily task and Task Verification paths.
