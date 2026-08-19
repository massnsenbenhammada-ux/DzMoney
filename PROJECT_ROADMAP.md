# DzMoney — Master Project Roadmap

> **Purpose:** This file is the single source of truth for the planned DzMoney product and economic architecture. Review it before making substantial changes. Do not delete or replace working project components without a migration plan.

## 0. Core Safety Rules

- Preserve the currently working application wherever possible.
- No mass deletion or rewrite of the project.
- Prefer small, reversible changes.
- Review existing code before modifying it.
- Keep financial/accounting logic server-side; never trust frontend balances.
- Every financial movement must be recorded in an immutable ledger/audit trail.
- Admin-controlled economic parameters must be stored centrally and versioned where appropriate.
- Test each subsystem before moving to the next.

## 1. Currency Model

### Coins
- Internal activity/engagement currency.
- Used as part of selected rewards and withdrawal requirements.
- Current example withdrawal requirement: 2,000,000 Coins for a 0.2 TON withdrawal.
- Exact rules remain Admin-configurable.

### DZX
- Replaces the former Bux currency.
- Main internal economic balance used for withdrawals and internal spending.
- Initial conversion: **1 TON = 10,000 DZX**.
- Conversion rate is Admin-configurable.

### DZP
- Contribution/participation points used by the internal reward-distribution system.
- Must remain distinct from DZX and Coins.

## 2. Deposit System

Flow:

TON deposit → blockchain confirmation → automatic TON→DZX conversion → DZX credit.

Initial rules:
- Minimum deposit: **1 TON**.
- Minimum deposit is Admin-configurable.
- Conversion rate initially: 1 TON = 10,000 DZX.
- Deposited DZX is intended for internal use and **cannot be withdrawn directly**.
- Deposited DZX may be used for eligible internal activities such as creating tasks, packages, boosters, and other future services.
- Deposit transactions must be uniquely identified and protected against double-crediting.

## 3. Withdrawal System

Initial rules:
- Minimum withdrawal: **0.2 TON**.
- Minimum withdrawal is Admin-configurable.
- At the initial rate, 0.2 TON = 2,000 DZX.
- Withdrawal fee is fully Admin-controlled.
- A withdrawal also requires the configured Coins requirement. Initial example: **2,000 DZX + 2,000,000 Coins** for a 0.2 TON withdrawal.
- Coins required for withdrawal are deducted/consumed when the withdrawal is processed, according to the final approved rule.
- Only eligible/withdrawable DZX may be withdrawn; deposited DZX is not directly withdrawable.

## 4. Referral System

- One referral level only.
- Referral reward = **20% of the referred user's base activity reward only**.
- Squad Bonus is excluded from the referral calculation.
- A referral becomes eligible once the referred user:
  1. enters through the referral link, and
  2. completes at least one qualifying activity (ad view or task).
- Referral reward continues for the lifetime of the eligible referral, subject to anti-fraud and system rules.
- Referral earnings are independent from Squad earnings and Squad Bonus.

## 5. Squad System

### Structure
- Hierarchical Squad structure.
- Squad is separate from Referral economics.
- No artificial fixed maximum number of members.

### Levels
- 10 Squad levels.
- Bonus range: **0% to 100%**.
- Exact member thresholds and level mapping must be stored as Admin-configurable parameters.
- Initial design target: higher active Squad size unlocks higher levels.

### Daily activation rule
- A Squad's unlocked Bonus is a **potential Bonus**, not automatically active forever.
- At the end of each day, calculate Squad activity.
- At least **50% of eligible Squad members** must complete at least one qualifying activity during that day:
  - one verified task, OR
  - one verified ad view.
- If the 50% threshold is met, the Squad Bonus is activated **for the following day**.
- If it is not met, the Bonus is not active for the following day.
- The calculation must be deterministic and auditable.

### Squad Bonus vs Squad Earnings
- **Squad Bonus:** increases the user's direct reward for eligible activities according to Squad level.
- **Squad Earnings:** a separate Squad distribution mechanism; it must never be confused with the direct activity bonus.
- Referral earnings are also separate.
- Do not stack the Squad percentage onto Referral Earnings or Squad Earnings.

### Economic safety
- Squad Bonus may reach 100% only where the underlying activity economics can support it.
- Each activity has an economic budget.
- Total distributions from an activity cannot exceed its available economic budget.
- If an activity cannot support a given Squad Bonus, the activity must be configured as ineligible or its reward/budget must be adjusted before publication.

## 6. Rewards / Economic Engine

Every revenue-generating activity should have an Economic Budget derived from real revenue.

Example:
- Revenue available for an activity = 3 DZX.
- The system can allocate the budget among base activity rewards, Squad Bonus, Squad distribution, platform/treasury allocation, and other approved allocations.
- The system must never create unlimited DZX merely because a multiplier exists.
- Referral reward is calculated from base activity reward only.
- The sum of all allocations must remain within the configured economic budget.

## 7. Rewards Pool & Packages

- Rewards Pool distribution percentages are controlled by Admin Panel.
- Packages do **not** promise a fixed/guaranteed return.
- Returns/distributions depend on actual project revenues.
- A package gives its holder a higher **Weight** in the Rewards Pool.
- The package weight belongs only to the participating user.
- When the package expires, the user's weight returns to the normal/default membership weight.
- Initial package durations:
  - 30 days
  - 60 days
  - 90 days
  - 180 days
  - 360 days
  - Lifetime
- Package weights, prices, availability, and distribution rules are Admin-controlled.
- The product copy must clearly state that rewards depend on actual revenue and are not a fixed guaranteed return.
- The economic model must avoid Ponzi/pyramid mechanics and must be designed to comply with the project's stated Islamic-finance requirements; legal/religious review should be obtained before launch.

## 8. Task System

### Daily Tasks
1. Daily Check-in → Daily Reward.
2. Check for Update → visit the independent updates channel.
3. Share with Friends → share referral link and satisfy verification.
4. View X Ads → X is Admin-configurable, not hardcoded.
5. Invite 1 Friend.
6. Invite 10 Friends.

Initial rewards:
- Tasks 1–4: **1,000 Coins + 1 DZX**.
- Task 5: **10,000 Coins + 10 DZX**.
- Task 6: **100,000 Coins + 100 DZX**.
- Tasks 5 and 6 must clearly explain the lifetime 20% referral earning benefit.

### Game Tasks
- Tasks for other Telegram Mini Apps.
- Initial standard reward target: 1,000 Coins + 1 DZX.

### Social Tasks
- Telegram channel/community actions: subscribe, engage, share, etc.
- Initial standard reward target: 1,000 Coins + 1 DZX.

### Web Tasks
- Visiting external websites/links.
- Initial standard reward target: 1,000 Coins + 1 DZX.

### Special Tasks
- High-value/sensitive tasks requiring special conditions such as screenshots or manual verification.
- Initial target reward: 10,000 Coins + 10 DZX.
- User should contact DzMoney to arrange these campaigns rather than freely creating them.

### Partner Tasks
- Tasks supplied by approved DzMoney partners.
- Reward depends on difficulty, duration, and commercial agreement.
- Reward is set by Admin and/or approved partner within economic limits.

## 9. User-Created Tasks

- All users may create eligible tasks if they have sufficient DZX.
- User deposits TON if necessary; TON is automatically converted to DZX.
- Task creator reserves the required campaign budget before publication.
- User-created tasks should pass Admin/automated review before becoming active.

### Pricing
- The user-facing campaign price is the **final total price including DzMoney fees**.
- Core calculation: reward/cost per valid execution × number of executions = campaign budget.
- Platform fees are included in the final displayed total rather than added as a surprise after the quoted campaign price.
- Example: 0.001 TON × 1,000 executions = 1 TON total campaign cost, inclusive of the configured fee structure.

### Budget lifecycle
Draft → Pending Review → Active → Paused → Completed/Expired → Refund/Close.

- Reserve the campaign budget before activation.
- Deduct only valid rewards.
- Return unused campaign budget according to the final refund policy.
- Platform/service fees follow the configured policy and are not automatically treated as refundable reward budget.

## 10. Task Verification Engine

Each task type must define its verification method before publication.

Examples:
- Telegram membership/action → Telegram/API verification where technically available.
- Ads → trusted ad-network callback/verification.
- Web → tracking/timer/callback where appropriate.
- Game → partner/API callback.
- Screenshot → manual review or approved verification flow.
- Invite → referral system + qualifying activity requirement.

Task completion states:
- Available
- Started
- Pending
- Approved
- Rejected
- Rewarded

Never trust a frontend-only completion signal for financial rewards.

## 11. Anti-Fraud

Protect against:
- multi-account abuse
- repeated task execution
- fake referrals
- fake screenshots
- automated/bot activity
- ad fraud
- Squad manipulation
- self-referrals
- duplicate blockchain deposits
- replayed callbacks/webhooks

Suspicious rewards should be held in Pending status until verified where necessary.

## 12. Admin Panel

Admin must be able to configure, monitor, and audit at minimum:
- TON→DZX conversion rate
- minimum deposit
- minimum withdrawal
- withdrawal fees
- Coins withdrawal requirement
- Rewards Pool allocation
- Squad levels and percentages
- Squad activity threshold
- task reward defaults
- daily ad task count
- task fees and campaign pricing
- minimum task reward/budget
- package prices/durations/weights
- task approval/rejection/pause
- special/partner campaigns
- user/account restrictions
- deposits, withdrawals, transactions, and reward ledgers

All sensitive economic settings should be validated server-side.

## 13. Ledger / Accounting Requirements

Maintain separate balances/ledger categories at minimum:
- Earned DZX
- Deposited DZX
- Withdrawable DZX
- Locked DZX
- Coins
- DZP
- Referral earnings
- Squad earnings
- Activity rewards
- Rewards Pool distributions

Every credit/debit must have:
- unique transaction ID
- user ID
- source/type
- amount
- timestamp
- status
- related task/deposit/withdrawal/package where applicable
- audit metadata

## 14. Implementation Order

### Phase 1 — Protect and understand current project
- Inventory current files, APIs, DB schema, wallet/deposit/withdrawal flows, and frontend.
- Do not delete working components.
- Establish a safe rollback point.

### Phase 2 — Economic foundation
- Introduce DZX/DZP terminology and data model without breaking existing flows.
- Add ledger/accounting primitives.
- Add Admin economic settings.
- Implement TON→DZX deposit conversion safely.

### Phase 3 — Withdrawal rules
- Implement withdrawable vs deposited DZX separation.
- Add minimum DZX/TON rules, Coins requirement, and Admin-configurable fees.
- Preserve existing working withdrawal behavior until the new rules are verified.

### Phase 4 — Referral engine
- One level.
- 20% of base activity reward only.
- Qualification after referral link entry + one qualifying activity.
- Lifetime eligibility with anti-fraud.

### Phase 5 — Squad engine
- 10 levels, 0–100% bonus.
- Hierarchical membership.
- Daily 50% activity test.
- Activate the earned level's Bonus for the following day.
- Separate Squad Earnings from direct Squad Bonus.
- Economic-budget enforcement.

### Phase 6 — Rewards Pool & Packages
- Revenue-based pool.
- Admin-configured allocation.
- Weight-based packages.
- Expiration returns user to normal weight.

### Phase 7 — Task Engine
- Daily, Game, Social, Web, Special, Partner.
- User-created tasks.
- Verification states.
- Budget reservation/refunds.
- Pricing and fee calculation.

### Phase 8 — Anti-fraud & audit
- Verification hardening.
- Fraud/risk controls.
- Ledger auditability.
- Webhook/idempotency protections.

### Phase 9 — Admin Panel
- Complete economic and task controls.
- Monitoring dashboards.
- Audit logs.

### Phase 10 — Frontend/UI polish
- DZX/DZP terminology.
- User wallet/deposit/withdrawal presentation.
- Tasks interface.
- Squad levels/progress.
- Referral presentation.
- Coming Soon packages.
- Preserve stable existing UI functionality.

### Phase 11 — Testing & launch
- Unit/integration tests for financial logic.
- Deposit/withdrawal tests.
- Task reward tests.
- Referral/Squad edge cases.
- Economic stress tests.
- Final security review.

## 15. Current Status

- [x] Core economic/product direction agreed.
- [x] DZX replaces Bux.
- [x] DZP replaces contribution points.
- [x] Referral rules agreed.
- [x] Squad daily activation rule agreed.
- [x] 10-level Squad concept agreed.
- [x] Initial TON/DZX rate agreed.
- [x] Deposit/withdrawal initial thresholds agreed.
- [x] Revenue-based package model agreed.
- [x] Task categories agreed.
- [x] User-created task concept agreed.
- [ ] Final Squad Earnings formula.
- [ ] Final Rewards Pool allocation formula.
- [ ] Final task verification matrix.
- [ ] Final anti-fraud rules.
- [ ] Final package prices/weights.
- [ ] Full database migration plan.
- [ ] Full implementation and testing.

## 16. Change Control

Before introducing a new major feature or changing an economic rule:
1. Review this roadmap.
2. Check dependencies and current implementation.
3. Update this file if the specification changes.
4. Make the smallest safe code change.
5. Test the affected subsystem.
6. Record important migrations/config changes.

**This roadmap is the authoritative project reference and should be reviewed before major DzMoney changes.**
